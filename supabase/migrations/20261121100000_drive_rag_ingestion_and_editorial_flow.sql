-- Sesión 4: ingesta desde Google Drive, flujo editorial con registro y sincronización incremental.
-- Pendiente de revisión: se aplica en el proyecto de pruebas solo con confirmación del usuario.

-- 1) Metadatos del documento (tabla inicial de cada política) y enlace real de Drive.
alter table public.documents
  add column if not exists document_code text,
  add column if not exists web_view_link text,
  add column if not exists folder_path text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists archived_reason text;

create unique index if not exists documents_document_code_active_idx
  on public.documents (document_code) where document_code is not null and deleted_at is null;

alter table public.document_versions
  add column if not exists doc_version text,          -- versión declarada en el documento (p. ej. "1.0")
  add column if not exists effective_from date,       -- fecha de vigencia
  add column if not exists owner text,                -- responsable
  add column if not exists document_title text,       -- título declarado en el documento
  add column if not exists embedding_model text;

alter table public.document_chunks
  add column if not exists document_code text,
  add column if not exists doc_version text,
  add column if not exists source_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- 2) Historial editorial: quién movió cada documento entre estados y cuándo.
create table if not exists public.document_status_history (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  document_version_id uuid references public.document_versions(id) on delete set null,
  from_status text not null,
  to_status text not null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  note text
);
create index if not exists document_status_history_document_idx on public.document_status_history (document_id, changed_at desc);
alter table public.document_status_history enable row level security;
create policy document_status_history_read_staff on public.document_status_history
  for select to authenticated using (public.has_permission('documents.manage'));
revoke all on table public.document_status_history from public, anon, authenticated;
grant select on table public.document_status_history to authenticated; -- escrituras solo vía funciones

-- 3) Estado de la sincronización incremental (changes.list) y métricas por ejecución.
create table if not exists public.drive_sync_state (
  source_provider text primary key check (source_provider in ('google_drive')),
  folder_id text not null,
  start_page_token text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.drive_sync_state enable row level security;
create policy drive_sync_state_read_staff on public.drive_sync_state
  for select to authenticated using (public.has_permission('documents.manage'));
revoke all on table public.drive_sync_state from public, anon, authenticated;
grant select on table public.drive_sync_state to authenticated; -- escrituras solo vía save_drive_sync_token

create or replace function public.save_drive_sync_token(p_folder_id text, p_start_page_token text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.has_permission('documents.manage') then
    raise exception using errcode = '42501', message = 'Insufficient permissions to save sync state.';
  end if;
  if coalesce(trim(p_folder_id), '') = '' or coalesce(trim(p_start_page_token), '') = '' then
    raise exception using errcode = '22023', message = 'Folder id and start page token are required.';
  end if;
  insert into public.drive_sync_state (source_provider, folder_id, start_page_token, updated_at, updated_by)
  values ('google_drive', p_folder_id, p_start_page_token, now(), v_uid)
  on conflict (source_provider) do update
    set folder_id = excluded.folder_id, start_page_token = excluded.start_page_token, updated_at = now(), updated_by = v_uid;
end;
$$;

alter table public.document_sync_runs
  add column if not exists run_kind text not null default 'full' check (run_kind in ('full', 'incremental')),
  add column if not exists documents_created integer not null default 0 check (documents_created >= 0),
  add column if not exists documents_updated integer not null default 0 check (documents_updated >= 0),
  add column if not exists documents_archived integer not null default 0 check (documents_archived >= 0),
  add column if not exists documents_failed integer not null default 0 check (documents_failed >= 0),
  add column if not exists start_page_token_before text,
  add column if not exists start_page_token_after text,
  add column if not exists details jsonb not null default '[]'::jsonb;

-- 4) Índice vectorial: con pocos cientos de fragmentos, ivfflat(lists=100) deja listas vacías y pierde
-- resultados. HNSW no necesita entrenamiento y da recall alto con cualquier volumen.
drop index if exists public.document_chunk_embeddings_embedding_idx;
create index document_chunk_embeddings_embedding_hnsw_idx
  on public.document_chunk_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- 5) Funciones del flujo editorial. SECURITY DEFINER para escribir el historial; cada una valida
-- permisos y transición, y registra auth.uid(). Nunca se publica con un UPDATE manual.
create or replace function public.document_editorial_actor(p_require_policies boolean)
returns uuid
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Authenticated user required.';
  end if;
  if not public.has_permission('documents.manage') or (p_require_policies and not public.has_permission('policies.manage')) then
    raise exception using errcode = '42501', message = 'Insufficient permissions for editorial action.';
  end if;
  return v_uid;
end;
$$;

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
  update public.documents set document_status = 'in_review' where id = p_document_id;
  insert into public.document_status_history (document_id, from_status, to_status, changed_by, note)
  values (p_document_id, v_status, 'in_review', v_uid, p_note);
end;
$$;

-- in_review -> published (primera publicación) o published -> published (nueva versión del documento).
-- Crea o actualiza hr_policies y una nueva policy_versions vinculada a la versión del documento, y la
-- marca como vigente en la misma transacción.
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

  update public.policy_versions set is_current = false where policy_id = v_policy_id and is_current;
  select coalesce(max(version_number), 0) + 1 into v_next from public.policy_versions where policy_id = v_policy_id;
  insert into public.policy_versions (policy_id, version_number, content, is_current, published_at, created_by, source_document_version_id)
  values (v_policy_id, v_next, coalesce(v_content, ''), true, now(), v_uid, v_ver.id)
  returning id into v_policy_version_id;

  update public.documents set document_status = 'published', archived_reason = null where id = v_doc.id;
  insert into public.document_status_history (document_id, document_version_id, from_status, to_status, changed_by, note)
  values (v_doc.id, v_ver.id, v_doc.document_status, 'published', v_uid, p_note);
  return v_policy_version_id;
end;
$$;

-- Cualquier estado -> archived. No borra nada: el documento y su política dejan de aparecer en el RAG.
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

  update public.documents set document_status = 'archived', deleted_at = now(), archived_reason = p_reason where id = v_doc.id;
  update public.hr_policies policy set status = 'archived', archived_at = now(), updated_by = v_uid
    where policy.archived_at is null and exists (
      select 1 from public.policy_versions pv join public.document_versions dv on dv.id = pv.source_document_version_id
      where pv.policy_id = policy.id and pv.is_current and dv.document_id = v_doc.id);
  insert into public.document_status_history (document_id, from_status, to_status, changed_by, note)
  values (v_doc.id, v_doc.document_status, 'archived', v_uid, p_reason);
end;
$$;

-- 6) match_policy_chunks devuelve también código, versión declarada y el webViewLink real.
drop function if exists public.match_policy_chunks(extensions.vector(768), integer, real);
create function public.match_policy_chunks(
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
language plpgsql stable security definer
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

-- 7) Privilegios: solo usuarios autenticados; la autorización fina está dentro de cada función.
revoke all on function public.document_editorial_actor(boolean) from public, anon, authenticated, service_role;
revoke all on function public.submit_document_for_review(uuid, text) from public, anon, service_role;
revoke all on function public.publish_document_version(uuid, text) from public, anon, service_role;
revoke all on function public.archive_document(uuid, text) from public, anon, service_role;
revoke all on function public.match_policy_chunks(extensions.vector(768), integer, real) from public, anon, service_role;
grant execute on function public.submit_document_for_review(uuid, text) to authenticated;
grant execute on function public.publish_document_version(uuid, text) to authenticated;
grant execute on function public.archive_document(uuid, text) to authenticated;
grant execute on function public.match_policy_chunks(extensions.vector(768), integer, real) to authenticated;
revoke all on function public.save_drive_sync_token(text, text) from public, anon, service_role;
grant execute on function public.save_drive_sync_token(text, text) to authenticated;

-- Mismo patrón que 20261117170800: service_role conserva acceso completo a las tablas nuevas.
grant all privileges on table public.document_status_history, public.drive_sync_state to service_role;
