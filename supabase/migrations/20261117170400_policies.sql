create table public.hr_policies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  category text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  summary text,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'archived') = (archived_at is not null))
);

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.hr_policies(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  content text not null,
  is_current boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (policy_id, version_number)
);

create unique index policy_versions_one_current_idx on public.policy_versions (policy_id) where is_current;
create index hr_policies_status_category_idx on public.hr_policies (status, category) where archived_at is null;
create trigger hr_policies_set_updated_at before update on public.hr_policies for each row execute procedure public.set_updated_at();
