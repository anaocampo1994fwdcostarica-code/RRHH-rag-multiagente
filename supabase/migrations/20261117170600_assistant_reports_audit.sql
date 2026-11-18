create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  title text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete restrict,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(trim(content)) > 0),
  model_name text,
  created_at timestamptz not null default now()
);

create table public.assistant_message_sources (
  assistant_message_id uuid not null references public.assistant_messages(id) on delete cascade,
  chunk_id uuid not null references public.document_chunks(id) on delete restrict,
  rank integer not null check (rank > 0),
  similarity numeric(6,5) check (similarity is null or similarity between 0 and 1),
  primary key (assistant_message_id, chunk_id),
  unique (assistant_message_id, rank)
);

create table public.daily_hr_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  status text not null default 'draft' check (status in ('draft', 'generated', 'published', 'failed')),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  narrative text,
  generated_at timestamptz,
  generated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index assistant_messages_conversation_created_idx on public.assistant_messages (conversation_id, created_at);
create index assistant_sources_chunk_idx on public.assistant_message_sources (chunk_id);
create index conversations_owner_updated_idx on public.assistant_conversations (owner_profile_id, updated_at desc) where deleted_at is null;
create index reports_status_date_idx on public.daily_hr_reports (status, report_date desc);
create index audit_entity_created_idx on public.admin_audit_log (entity_type, entity_id, created_at desc);
create trigger conversations_set_updated_at before update on public.assistant_conversations for each row execute procedure public.set_updated_at();
create trigger reports_set_updated_at before update on public.daily_hr_reports for each row execute procedure public.set_updated_at();
