-- Local proposal only: apply manually after security review in the Supabase SQL Editor.
-- It extends the existing documents/document_versions/document_chunks model.

create extension if not exists vector with schema extensions;

alter table public.document_chunks
  add column if not exists section text;

create table public.document_chunk_embeddings (
  document_chunk_id uuid primary key references public.document_chunks(id) on delete restrict,
  embedding extensions.vector(768) not null,
  model_name text not null check (char_length(trim(model_name)) > 0),
  embedded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index document_chunk_embeddings_embedding_idx
  on public.document_chunk_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.document_chunk_embeddings enable row level security;

create policy document_chunk_embeddings_manage_staff
  on public.document_chunk_embeddings
  for all to authenticated
  using (public.has_permission('documents.manage'))
  with check (public.has_permission('documents.manage'));

revoke all on table public.document_chunk_embeddings from public, anon, authenticated;
grant select, insert, update on table public.document_chunk_embeddings to authenticated;

-- SECURITY DEFINER is deliberate: employees may search only current, published policy
-- sources without receiving direct read permissions over operational document tables.
create or replace function public.match_policy_chunks(
  query_embedding extensions.vector(768),
  match_limit integer default 5,
  similarity_threshold real default 0.7
)
returns table (
  content text,
  document_id uuid,
  document_title text,
  section text,
  version text,
  document_url text,
  similarity real
)
language plpgsql
stable
security definer
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
    document.title,
    chunk.section,
    document_version.version_label,
    case
      when document.source_provider = 'google_drive'
        and document.external_id ~ '^[A-Za-z0-9_-]+$'
      then 'https://drive.google.com/open?id=' || document.external_id
      else null
    end as document_url,
    (1 - (embedding.embedding <=> query_embedding))::real as similarity
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

revoke all on function public.match_policy_chunks(extensions.vector(768), integer, real)
  from public, anon, service_role;
grant execute on function public.match_policy_chunks(extensions.vector(768), integer, real)
  to authenticated;
