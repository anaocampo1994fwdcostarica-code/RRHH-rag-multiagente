-- Correcciones de la revisión de código sobre 20261121100000 (pendiente de confirmación para aplicarla).
--  1. (crítico) Si cambia el código de un documento, la política del código anterior queda archivada:
--     publish_document_version retira cualquier otra política vigente del MISMO documento.
--  2. Bloqueo por documento al publicar (dos sincronizaciones simultáneas no crean versiones duplicadas) y
--     una sola ejecución de sincronización activa a la vez (start_document_sync_run).
--  3. match_policy_chunks recorre el índice HNSW de forma iterativa: los vecinos de versiones antiguas
--     ya no desplazan a los fragmentos vigentes tras varias ediciones.
--  4. document_status solo cambia mediante las funciones editoriales (trigger), y la reapertura de un
--     documento archivado o fallido (reopen_document) queda en el historial.

-- 4a. Guardia del estado editorial. Las funciones activan app.editorial_transition solo durante su transacción.
create or replace function public.guard_document_status_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and new.document_status <> 'pending' and coalesce(current_setting('app.editorial_transition', true), '') <> 'on' then
    raise exception using errcode = '42501', message = 'New documents must start as pending.';
  end if;
  if tg_op = 'UPDATE' and new.document_status is distinct from old.document_status
     and coalesce(current_setting('app.editorial_transition', true), '') <> 'on' then
    raise exception using errcode = '42501', message = 'document_status changes only through the editorial functions.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_document_status_change() from public, anon, authenticated, service_role;

drop trigger if exists documents_guard_status_change on public.documents;
create trigger documents_guard_status_change
  before insert or update of document_status on public.documents
  for each row execute procedure public.guard_document_status_change();

create or replace function public.begin_editorial_transition()
returns void
language sql
set search_path = pg_catalog, pg_temp
as $$ select set_config('app.editorial_transition', 'on', true) $$;
revoke all on function public.begin_editorial_transition() from public, anon, authenticated, service_role;

-- pending -> in_review
create or replace function public.submit_document_for_review(p_document_id uuid, p_note text default null)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_uid uuid := public.document_editorial_actor(false); v_status text;
begin
  select document_status into v_status from public.documents where id = p_document_id for update;
  if v_status is null then raise exception using errcode = 'P0002', message = 'Document not found.'; end if;
  if v_status <> 'pending' then
    raise exception using errcode = '22023', message = format('Cannot submit for review from status %s.', v_status);
  end if;
  perform public.begin_editorial_transition();
  update public.documents set document_status = 'in_review' where id = p_document_id;
  insert into public.document_status_history (document_id, from_status, to_status, changed_by, note)
  values (p_document_id, v_status, 'in_review', v_uid, p_note);
end;
$$;

-- archived | failed -> pending (el documento volvió a la carpeta de Drive).
create or replace function public.reopen_document(p_document_id uuid, p_note text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_uid uuid := public.document_editorial_actor(false); v_status text;
begin
  select document_status into v_status from public.documents where id = p_document_id for update;
  if v_status is null then raise exception using errcode = 'P0002', message = 'Document not found.'; end if;
  if v_status not in ('archived', 'failed') then
    raise exception using errcode = '22023', message = format('Cannot reopen from status %s.', v_status);
  end if;
  perform public.begin_editorial_transition();
  update public.documents set document_status = 'pending', deleted_at = null, archived_reason = null where id = p_document_id;
  insert into public.document_status_history (document_id, from_status, to_status, changed_by, note)
  values (p_document_id, v_status, 'pending', v_uid, p_note);
end;
$$;

-- in_review -> published (primera publicación) o published -> published (versión nueva).
create or replace function public.publish_document_version(p_document_version_id uuid, p_note text default null)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := public.document_editorial_actor(true);
  v_doc public.documents%rowtype;
  v_ver public.document_versions%rowtype;
  v_policy_id uuid;
  v_policy_version_id uuid;
  v_next integer;
  v_slug text;
  v_content text;
begin
  select * into v_ver from public.document_versions where id = p_document_version_id;
  if v_ver.id is null then raise exception using errcode = 'P0002', message = 'Document version not found.'; end if;
  -- Un solo publicador por documento a la vez (se libera al terminar la transacción).
  perform pg_advisory_xact_lock(hashtextextended('publish_document:' || v_ver.document_id::text, 0));
  if v_ver.processing_status <> 'processed' then
    raise exception using errcode = '22023', message = 'Only processed versions can be published.';
  end if;
  select * into v_doc from public.documents where id = v_ver.document_id for update;
  if v_doc.document_status not in ('in_review', 'published') or v_doc.deleted_at is not null then
    raise exception using errcode = '22023', message = format('Cannot publish from status %s.', v_doc.document_status);
  end if;
  if v_doc.document_code is null then
    raise exception using errcode = '22023', message = 'Document code is required to publish.';
  end if;
  -- Idempotente: si esta versión ya es la vigente, no se crea otra policy_version.
  select pv.id into v_policy_version_id from public.policy_versions pv
    where pv.source_document_version_id = v_ver.id and pv.is_current;
  if v_policy_version_id is not null and v_doc.document_status = 'published' then
    return v_policy_version_id;
  end if;

  v_slug := lower(regexp_replace(v_doc.document_code, '[^A-Za-z0-9]+', '-', 'g'));
  select string_agg(content, E'\n\n' order by chunk_index) into v_content
    from public.document_chunks where document_version_id = v_ver.id;

  insert into public.hr_policies (slug, title, category, status, summary, created_by, updated_by)
  values (v_slug, coalesce(v_ver.document_title, v_doc.title),
          case when v_doc.document_code like 'CAL-%' then 'calendario' else 'politica' end,
          'published', null, v_uid, v_uid)
  on conflict (slug) do update
    set title = excluded.title, status = 'published', archived_at = null, updated_by = v_uid
  returning id into v_policy_id;

  -- (1) Si el documento tenía otra política vigente (cambió su código), esa política se archiva.
  update public.policy_versions pv set is_current = false
    where pv.is_current and pv.policy_id <> v_policy_id
      and exists (select 1 from public.document_versions dv where dv.id = pv.source_document_version_id and dv.document_id = v_doc.id);
  update public.hr_policies policy set status = 'archived', archived_at = now(), updated_by = v_uid
    where policy.id <> v_policy_id and policy.archived_at is null
      and exists (select 1 from public.policy_versions pv join public.document_versions dv on dv.id = pv.source_document_version_id
                  where pv.policy_id = policy.id and dv.document_id = v_doc.id)
      and not exists (select 1 from public.policy_versions pv where pv.policy_id = policy.id and pv.is_current);

  update public.policy_versions set is_current = false where policy_id = v_policy_id and is_current;
  select coalesce(max(version_number), 0) + 1 into v_next from public.policy_versions where policy_id = v_policy_id;
  insert into public.policy_versions (policy_id, version_number, content, is_current, published_at, created_by, source_document_version_id)
  values (v_policy_id, v_next, coalesce(v_content, ''), true, now(), v_uid, v_ver.id)
  returning id into v_policy_version_id;

  perform public.begin_editorial_transition();
  update public.documents set document_status = 'published', archived_reason = null where id = v_doc.id;
  insert into public.document_status_history (document_id, document_version_id, from_status, to_status, changed_by, note)
  values (v_doc.id, v_ver.id, v_doc.document_status, 'published', v_uid, p_note);
  return v_policy_version_id;
end;
$$;

create or replace function public.archive_document(p_document_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_uid uuid := public.document_editorial_actor(true); v_doc public.documents%rowtype;
begin
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'An archive reason is required.';
  end if;
  select * into v_doc from public.documents where id = p_document_id for update;
  if v_doc.id is null then raise exception using errcode = 'P0002', message = 'Document not found.'; end if;
  if v_doc.document_status = 'archived' then return; end if;

  perform public.begin_editorial_transition();
  update public.documents set document_status = 'archived', deleted_at = now(), archived_reason = p_reason where id = v_doc.id;
  update public.hr_policies policy set status = 'archived', archived_at = now(), updated_by = v_uid
    where policy.archived_at is null and exists (
      select 1 from public.policy_versions pv join public.document_versions dv on dv.id = pv.source_document_version_id
      where pv.policy_id = policy.id and pv.is_current and dv.document_id = v_doc.id);
  insert into public.document_status_history (document_id, from_status, to_status, changed_by, note)
  values (v_doc.id, v_doc.document_status, 'archived', v_uid, p_reason);
end;
$$;

-- 2b. Una sola sincronización activa: las ejecuciones 'started' de más de 2 horas se cierran como fallidas
-- (proceso caído) y, si hay otra en curso, la nueva se rechaza.
create unique index if not exists document_sync_runs_one_started_idx
  on public.document_sync_runs (source_provider) where status = 'started';

create or replace function public.start_document_sync_run(p_kind text, p_token_before text default null)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null or not public.has_permission('documents.manage') then
    raise exception using errcode = '42501', message = 'Insufficient permissions to start a sync run.';
  end if;
  if p_kind not in ('full', 'incremental') then
    raise exception using errcode = '22023', message = 'Invalid sync run kind.';
  end if;
  update public.document_sync_runs set status = 'failed', finished_at = now(),
      error_message = 'Ejecución abandonada (más de 2 horas sin terminar).'
    where source_provider = 'google_drive' and status = 'started' and started_at < now() - interval '2 hours';
  insert into public.document_sync_runs (source_provider, status, run_kind, triggered_by, start_page_token_before)
  values ('google_drive', 'started', p_kind, v_uid, p_token_before)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception using errcode = '55P03', message = 'Ya hay una sincronización de Google Drive en curso.';
end;
$$;

-- 3. Búsqueda vectorial con recorrido iterativo del índice (pgvector >= 0.8).
create or replace function public.match_policy_chunks(
  query_embedding extensions.vector(768),
  match_limit integer default 5,
  similarity_threshold real default 0.7
)
returns table (
  content text,
  document_id uuid,
  document_title text,
  document_code text,
  section text,
  version text,
  document_url text,
  similarity real
)
language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authenticated user required.';
  end if;
  if match_limit is null or match_limit < 1 or match_limit > 10 then
    raise exception using errcode = '22023', message = 'match_limit must be between 1 and 10.';
  end if;
  if similarity_threshold is null or similarity_threshold < 0 or similarity_threshold > 1 then
    raise exception using errcode = '22023', message = 'similarity_threshold must be between 0 and 1.';
  end if;
  -- Sin esto, HNSW entrega ef_search candidatos ANTES de filtrar por versión vigente y publicada.
  perform set_config('hnsw.iterative_scan', 'strict_order', true);

  return query
  select
    chunk.content,
    document.id,
    coalesce(document_version.document_title, document.title),
    document.document_code,
    chunk.section,
    coalesce(document_version.doc_version, document_version.version_label),
    case
      when document.web_view_link ~ '^https://(docs|drive)\.google\.com/' then document.web_view_link
      when document.source_provider = 'google_drive' and document.external_id ~ '^[A-Za-z0-9_-]+$'
        then 'https://drive.google.com/open?id=' || document.external_id
      else null
    end,
    (1 - (embedding.embedding <=> query_embedding))::real
  from public.document_chunk_embeddings embedding
  join public.document_chunks chunk on chunk.id = embedding.document_chunk_id
  join public.document_versions document_version on document_version.id = chunk.document_version_id
  join public.documents document on document.id = document_version.document_id
  join public.policy_versions policy_version on policy_version.source_document_version_id = document_version.id
  join public.hr_policies policy on policy.id = policy_version.policy_id
  where document.document_status = 'published'
    and document.deleted_at is null
    and document_version.processing_status = 'processed'
    and policy_version.is_current
    and policy.status = 'published'
    and policy.archived_at is null
    and (1 - (embedding.embedding <=> query_embedding)) >= similarity_threshold
  order by embedding.embedding <=> query_embedding
  limit match_limit;
end;
$$;

-- Privilegios (mismo patrón que 20261117170800 y 20261121100000).
revoke all on function public.reopen_document(uuid, text) from public, anon, service_role;
revoke all on function public.start_document_sync_run(text, text) from public, anon, service_role;
revoke all on function public.submit_document_for_review(uuid, text) from public, anon, service_role;
revoke all on function public.publish_document_version(uuid, text) from public, anon, service_role;
revoke all on function public.archive_document(uuid, text) from public, anon, service_role;
revoke all on function public.match_policy_chunks(extensions.vector(768), integer, real) from public, anon, service_role;
grant execute on function public.reopen_document(uuid, text) to authenticated;
grant execute on function public.start_document_sync_run(text, text) to authenticated;
grant execute on function public.submit_document_for_review(uuid, text) to authenticated;
grant execute on function public.publish_document_version(uuid, text) to authenticated;
grant execute on function public.archive_document(uuid, text) to authenticated;
grant execute on function public.match_policy_chunks(extensions.vector(768), integer, real) to authenticated;
