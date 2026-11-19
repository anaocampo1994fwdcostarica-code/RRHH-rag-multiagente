-- Propuesta local: aplicar manualmente en el SQL Editor del proyecto Supabase de PRUEBAS tras revisión.
-- Requiere 20261118090000_create_rrhh_api_application_role.sql (rol rrhh_api) ya aplicada.
--
-- Agrega los datos operativos que consultan el agente de datos y el agente analista:
-- saldos de vacaciones, incapacidades, movimientos de personal, calendario de pagos,
-- evaluaciones de desempeño y el registro de consultas del chat. No modifica migraciones previas.
--
-- Reglas de negocio que deben respetar el reporte diario y el agente de datos:
--   * "Hoy" es la fecha de Costa Rica: (now() at time zone 'America/Costa_Rica')::date, nunca current_date.
--   * Días de vacaciones = días hábiles lunes a viernes entre start_date y end_date (inclusive),
--     sin descontar feriados; el periodo es el año de start_date.
--   * vacation_balances.taken_days = suma de días de solicitudes de vacaciones aprobadas del periodo.
--   * Una solicitud pendiente (submitted / in_review) "tiene más de 3 días" si submitted_at < now() - interval '3 days'.

begin;

-- 1. Nombre visible de colaboradores sin cuenta (datos de demostración, reportes).
alter table public.employees
  add column if not exists full_name text
  check (full_name is null or char_length(trim(full_name)) between 2 and 120);

-- 2. Saldos de vacaciones por periodo (año).
create table public.vacation_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  period integer not null check (period between 2000 and 2100),
  assigned_days integer not null check (assigned_days between 0 and 60),
  taken_days integer not null default 0 check (taken_days >= 0),
  available_days integer generated always as (assigned_days - taken_days) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, period),
  check (taken_days <= assigned_days)
);

-- 3. Incapacidades.
create table public.sick_leaves (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  type text not null check (type in ('enfermedad', 'accidente_laboral', 'maternidad')),
  start_date date not null,
  days integer not null check (days between 1 and 365),
  end_date date generated always as (start_date + (days - 1)) stored,
  entity text not null check (entity in ('CCSS', 'INS', 'empresa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Los riesgos del trabajo los cubre el INS.
  check (type <> 'accidente_laboral' or entity = 'INS')
);

-- 4. Movimientos de personal. ("date" es palabra clave de SQL; la columna se llama movement_date.)
create table public.personnel_movements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  type text not null check (type in ('ingreso', 'salida', 'ascenso')),
  movement_date date not null,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

-- 5. Calendario de pagos (pregunta 9). No contiene datos personales.
create table public.payroll_calendar (
  id uuid primary key default gen_random_uuid(),
  pay_date date not null,
  period_label text not null check (char_length(trim(period_label)) between 2 and 80),
  type text not null check (type in ('quincenal', 'aguinaldo')),
  created_at timestamptz not null default now(),
  unique (pay_date, type)
);

-- 6. Evaluaciones de desempeño (pregunta 17).
create table public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  scheduled_date date not null,
  status text not null default 'programada' check (status in ('programada', 'completada', 'cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. Registro de consultas del chat (alimenta el reporte diario; solo lo escribe el backend).
create table public.chat_query_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  question text not null check (char_length(trim(question)) between 1 and 1000),
  intent text not null check (intent in ('policy', 'personal_data', 'mixed', 'restricted', 'aggregate', 'out_of_scope')),
  agent text check (agent is null or agent in ('policy_rag', 'data', 'data+policy_rag')),
  cited_documents jsonb not null default '[]'::jsonb check (jsonb_typeof(cited_documents) = 'array'),
  resolved boolean not null,
  escalated boolean not null,
  latency_ms integer not null check (latency_ms between 0 and 600000),
  prompt_version text check (prompt_version is null or char_length(prompt_version) <= 40),
  created_at timestamptz not null default now()
);

create index vacation_balances_employee_period_idx on public.vacation_balances (employee_id, period desc);
create index sick_leaves_employee_start_idx on public.sick_leaves (employee_id, start_date desc);
create index sick_leaves_active_range_idx on public.sick_leaves (start_date, end_date);
create index personnel_movements_date_idx on public.personnel_movements (movement_date desc, type);
create index personnel_movements_employee_idx on public.personnel_movements (employee_id, movement_date desc);
create index performance_reviews_employee_date_idx on public.performance_reviews (employee_id, scheduled_date);
create index chat_query_logs_created_idx on public.chat_query_logs (created_at desc);
create index chat_query_logs_profile_created_idx on public.chat_query_logs (profile_id, created_at desc);

create trigger vacation_balances_set_updated_at before update on public.vacation_balances for each row execute procedure public.set_updated_at();
create trigger sick_leaves_set_updated_at before update on public.sick_leaves for each row execute procedure public.set_updated_at();
create trigger performance_reviews_set_updated_at before update on public.performance_reviews for each row execute procedure public.set_updated_at();

-- 8. RLS: cada colaborador ve solo sus filas; employees.read o reports.read ven todo.
alter table public.vacation_balances enable row level security;
alter table public.sick_leaves enable row level security;
alter table public.personnel_movements enable row level security;
alter table public.payroll_calendar enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.chat_query_logs enable row level security;

create policy vacation_balances_read_own_or_staff on public.vacation_balances for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_permission('employees.read') or public.has_permission('reports.read'));
create policy sick_leaves_read_own_or_staff on public.sick_leaves for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_permission('employees.read') or public.has_permission('reports.read'));
create policy personnel_movements_read_own_or_staff on public.personnel_movements for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_permission('employees.read') or public.has_permission('reports.read'));
create policy performance_reviews_read_own_or_staff on public.performance_reviews for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_permission('employees.read') or public.has_permission('reports.read'));
create policy payroll_calendar_read_authenticated on public.payroll_calendar for select to authenticated
  using (true);
create policy chat_query_logs_read_own_or_staff on public.chat_query_logs for select to authenticated
  using (profile_id = auth.uid() or public.has_permission('employees.read') or public.has_permission('reports.read'));

-- 9. Privilegios (patrón de 20261117170800): sin escritura directa desde el cliente.
revoke all on table public.vacation_balances, public.sick_leaves, public.personnel_movements,
  public.payroll_calendar, public.performance_reviews, public.chat_query_logs
  from public, anon, authenticated;
grant select on table public.vacation_balances, public.sick_leaves, public.personnel_movements,
  public.payroll_calendar, public.performance_reviews, public.chat_query_logs
  to authenticated;
grant all privileges on table public.vacation_balances, public.sick_leaves, public.personnel_movements,
  public.payroll_calendar, public.performance_reviews, public.chat_query_logs
  to service_role;

-- 10. Respuestas del asistente en assistant_messages (la RLS directa solo permite role = 'user').
create or replace function public.append_assistant_message(p_conversation_id uuid, p_content text, p_model_name text default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_message_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if p_conversation_id is null or not public.owns_conversation(p_conversation_id) then
    raise exception using errcode = '42501', message = 'Conversation is not accessible.';
  end if;
  if p_content is null or char_length(trim(p_content)) = 0 or char_length(p_content) > 8000 then
    raise exception using errcode = '22023', message = 'Invalid assistant message content.';
  end if;
  if p_model_name is not null and char_length(p_model_name) > 80 then
    raise exception using errcode = '22023', message = 'Invalid model name.';
  end if;

  insert into public.assistant_messages (conversation_id, role, content, model_name)
  values (p_conversation_id, 'assistant', p_content, p_model_name)
  returning id into v_message_id;

  update public.assistant_conversations set updated_at = now() where id = p_conversation_id;
  return v_message_id;
end;
$$;

revoke all on function public.append_assistant_message(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.append_assistant_message(uuid, text, text) to authenticated;

-- 11. Registro de consultas: solo el login del backend (rrhh_api) puede escribir.
-- Esquema privado: PostgREST no lo expone y rrhh_api no necesita privilegios sobre public.
-- El backend llama a esta función SIN "SET ROLE authenticated", con el id ya verificado por requireAuth.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated, service_role;
grant usage on schema app_private to rrhh_api;

create or replace function app_private.log_chat_query(
  p_profile_id uuid,
  p_question text,
  p_intent text,
  p_agent text,
  p_cited_documents jsonb,
  p_resolved boolean,
  p_escalated boolean,
  p_latency_ms integer,
  p_prompt_version text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_log_id uuid;
begin
  if p_profile_id is null or not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception using errcode = '22023', message = 'Unknown profile.';
  end if;

  -- Las demás validaciones las aplican los CHECK de la tabla; created_at lo fija el servidor.
  insert into public.chat_query_logs (profile_id, question, intent, agent, cited_documents, resolved, escalated, latency_ms, prompt_version)
  values (p_profile_id, p_question, p_intent, p_agent, coalesce(p_cited_documents, '[]'::jsonb), p_resolved, p_escalated, p_latency_ms, p_prompt_version)
  returning id into v_log_id;
  return v_log_id;
end;
$$;

revoke all on function app_private.log_chat_query(uuid, text, text, text, jsonb, boolean, boolean, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.log_chat_query(uuid, text, text, text, jsonb, boolean, boolean, integer, text)
  to rrhh_api;

commit;
