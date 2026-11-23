create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+$'),
  name text not null unique,
  requires_attachment boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled')),
  submitted_at timestamptz,
  resolved_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check ((status = 'draft' and submitted_at is null) or (status <> 'draft' and submitted_at is not null)),
  check ((status in ('approved', 'rejected', 'cancelled') and resolved_at is not null) or (status not in ('approved', 'rejected', 'cancelled')))
);

create table public.leave_request_status_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.leave_requests(id) on delete restrict,
  previous_status text check (previous_status in ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled')),
  new_status text not null check (new_status in ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled')),
  changed_by_profile_id uuid references public.profiles(id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);

create index leave_requests_employee_status_idx on public.leave_requests (employee_id, status, submitted_at desc) where deleted_at is null;
create index leave_history_request_created_idx on public.leave_request_status_history (request_id, created_at desc);

create or replace function public.record_leave_request_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.leave_request_status_history (request_id, previous_status, new_status, changed_by_profile_id)
    values (new.id, null, new.status, auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.leave_request_status_history (request_id, previous_status, new_status, changed_by_profile_id)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger leave_requests_status_history after insert or update of status on public.leave_requests
  for each row execute procedure public.record_leave_request_status();
create trigger leave_types_set_updated_at before update on public.leave_types for each row execute procedure public.set_updated_at();
create trigger leave_requests_set_updated_at before update on public.leave_requests for each row execute procedure public.set_updated_at();
