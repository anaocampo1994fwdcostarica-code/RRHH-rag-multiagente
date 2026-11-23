create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]+$'),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9_-]+$'),
  name text not null,
  description text,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, department_id),
  unique (department_id, name)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  employee_code text not null unique check (employee_code ~ '^[A-Z0-9-]+$'),
  department_id uuid not null references public.departments(id) on delete restrict,
  position_id uuid not null,
  manager_employee_id uuid references public.employees(id) on delete set null,
  employment_status text not null default 'active' check (employment_status in ('active', 'inactive', 'on_leave')),
  hired_on date,
  ended_on date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (position_id, department_id) references public.positions(id, department_id) on delete restrict,
  check (ended_on is null or hired_on is null or ended_on >= hired_on),
  check (manager_employee_id is null or manager_employee_id <> id)
);

create index employees_department_status_idx on public.employees (department_id, employment_status) where deleted_at is null;
create index employees_manager_idx on public.employees (manager_employee_id) where deleted_at is null;

create trigger departments_set_updated_at before update on public.departments for each row execute procedure public.set_updated_at();
create trigger positions_set_updated_at before update on public.positions for each row execute procedure public.set_updated_at();
create trigger employees_set_updated_at before update on public.employees for each row execute procedure public.set_updated_at();
