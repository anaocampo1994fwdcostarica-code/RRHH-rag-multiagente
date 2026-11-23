create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+$'),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, role_id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Usuario'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

insert into public.roles (code, name, description) values
  ('employee', 'Empleado', 'Acceso personal a consultas y solicitudes.'),
  ('hr', 'Recursos Humanos', 'Gestión operativa autorizada de RRHH.'),
  ('admin', 'Administrador', 'Administración integral del portal.'),
  ('auditor', 'Auditor', 'Acceso de lectura a registros de auditoría.')
on conflict (code) do nothing;

insert into public.permissions (code, description) values
  ('employees.read', 'Consultar empleados.'), ('employees.manage', 'Gestionar empleados.'),
  ('requests.manage', 'Gestionar solicitudes.'), ('policies.manage', 'Gestionar políticas.'),
  ('documents.manage', 'Gestionar documentos y sincronizaciones.'),
  ('reports.read', 'Consultar reportes.'), ('reports.manage', 'Gestionar reportes.'),
  ('audit.read', 'Consultar auditoría.'), ('access.manage', 'Gestionar roles y permisos.')
on conflict (code) do nothing;
