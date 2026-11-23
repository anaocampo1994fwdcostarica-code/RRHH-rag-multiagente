create table public.documents (
  id uuid primary key default gen_random_uuid(),
  source_provider text not null check (source_provider in ('google_drive', 'manual', 'other')),
  external_id text,
  title text not null,
  mime_type text,
  document_status text not null default 'pending' check (document_status in ('pending', 'active', 'archived', 'failed')),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (source_provider, external_id)
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  version_label text not null,
  content_hash text not null,
  source_modified_at timestamptz,
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processing', 'processed', 'failed')),
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  unique (document_id, version_label),
  unique (document_id, content_hash)
);

create table public.document_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_provider text not null check (source_provider in ('google_drive', 'manual', 'other')),
  status text not null check (status in ('started', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  documents_examined integer not null default 0 check (documents_examined >= 0),
  documents_changed integer not null default 0 check (documents_changed >= 0),
  error_message text,
  triggered_by uuid references public.profiles(id) on delete set null,
  check ((status in ('completed', 'failed')) = (finished_at is not null))
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(trim(content)) > 0),
  token_count integer check (token_count is null or token_count >= 0),
  created_at timestamptz not null default now(),
  unique (document_version_id, chunk_index)
);

alter table public.policy_versions
  add column source_document_version_id uuid references public.document_versions(id) on delete set null;

create index document_versions_document_modified_idx on public.document_versions (document_id, source_modified_at desc);
create index document_chunks_version_index_idx on public.document_chunks (document_version_id, chunk_index);
create index document_sync_runs_started_idx on public.document_sync_runs (started_at desc);
create trigger documents_set_updated_at before update on public.documents for each row execute procedure public.set_updated_at();
