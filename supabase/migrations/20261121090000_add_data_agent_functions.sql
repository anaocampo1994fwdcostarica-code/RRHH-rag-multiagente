-- Propuesta local: aplicar manualmente en el proyecto Supabase de PRUEBAS tras revisión.
-- Requiere 20261120090000_add_hr_operational_data.sql.
--
-- Regla de arquitectura: las consultas de datos viven en la base; el backend solo invoca estas funciones.
--   * SECURITY INVOKER (aplica la RLS del usuario), STABLE y search_path fijo.
--   * Ninguna recibe employee_id, código ni nombre: usan public.current_employee_id() por dentro.
--   * "Hoy" = (now() at time zone 'America/Costa_Rica')::date, calculado dentro de cada función
--     y devuelto en la columna today.
--   * get_my_*: lanzan P0002 si el usuario no tiene colaborador vinculado (el agente lo distingue de "sin datos").
--   * get_absences_today_summary: lanza 42501 si no hay employees.read ni reports.read.

begin;

create or replace function public.get_my_vacation_balance()
returns table (period integer, assigned_days integer, taken_days integer, available_days integer, today date)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_employee_id uuid := public.current_employee_id();
  v_today date := (now() at time zone 'America/Costa_Rica')::date;
begin
  if v_employee_id is null then
    raise exception using errcode = 'P0002', message = 'No employee is linked to the current user.';
  end if;
  return query
  select vb.period, vb.assigned_days, vb.taken_days, vb.available_days, v_today
  from public.vacation_balances vb
  where vb.employee_id = v_employee_id
  order by vb.period;
end;
$$;

create or replace function public.get_my_next_payment()
returns table (pay_date date, period_label text, type text, today date)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'America/Costa_Rica')::date;
begin
  -- El calendario no es personal, pero el agente de datos exige un colaborador vinculado.
  if public.current_employee_id() is null then
    raise exception using errcode = 'P0002', message = 'No employee is linked to the current user.';
  end if;
  return query
  select pc.pay_date, pc.period_label, pc.type, v_today
  from public.payroll_calendar pc
  where pc.pay_date >= v_today
  order by pc.pay_date, pc.type
  limit 3;
end;
$$;

create or replace function public.get_my_next_review()
returns table (scheduled_date date, status text, today date)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_employee_id uuid := public.current_employee_id();
  v_today date := (now() at time zone 'America/Costa_Rica')::date;
begin
  if v_employee_id is null then
    raise exception using errcode = 'P0002', message = 'No employee is linked to the current user.';
  end if;
  return query
  select pr.scheduled_date, pr.status, v_today
  from public.performance_reviews pr
  where pr.employee_id = v_employee_id
    and pr.status = 'programada'
    and pr.scheduled_date >= v_today
  order by pr.scheduled_date
  limit 1;
end;
$$;

-- p_weekday: 1 = lunes … 7 = domingo. Busca solicitudes que incluyan ese día entre hoy - 7 y hoy + 14
-- ("la del viernes") y prioriza la más cercana a hoy.
create or replace function public.get_my_requests(
  p_date date default null,
  p_weekday integer default null,
  p_leave_type text default null,
  p_status text default null
)
returns table (leave_type text, leave_type_name text, start_date date, end_date date, status text, submitted_on date, resolved_on date, today date)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_employee_id uuid := public.current_employee_id();
  v_today date := (now() at time zone 'America/Costa_Rica')::date;
begin
  if v_employee_id is null then
    raise exception using errcode = 'P0002', message = 'No employee is linked to the current user.';
  end if;
  if p_weekday is not null and p_weekday not between 1 and 7 then
    raise exception using errcode = '22023', message = 'p_weekday must be between 1 and 7.';
  end if;
  return query
  select lt.code, lt.name, lr.start_date, lr.end_date, lr.status,
    (lr.submitted_at at time zone 'America/Costa_Rica')::date,
    (lr.resolved_at at time zone 'America/Costa_Rica')::date,
    v_today
  from public.leave_requests lr
  join public.leave_types lt on lt.id = lr.leave_type_id
  where lr.employee_id = v_employee_id
    and lr.deleted_at is null
    and (p_date is null or p_date between lr.start_date and lr.end_date)
    and (p_leave_type is null or lt.code = p_leave_type)
    and (p_status is null or lr.status = p_status)
    and (p_weekday is null or exists (
      select 1 from generate_series(greatest(lr.start_date, v_today - 7), least(lr.end_date, v_today + 14), interval '1 day') d
      where extract(isodow from d) = p_weekday))
  order by case when p_weekday is null and p_date is null then null else abs(lr.start_date - v_today) end nulls last,
    lr.start_date desc
  limit 5;
end;
$$;

create or replace function public.get_my_sick_leaves(p_active_only boolean default false)
returns table (type text, entity text, start_date date, end_date date, days integer, active boolean, today date)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_employee_id uuid := public.current_employee_id();
  v_today date := (now() at time zone 'America/Costa_Rica')::date;
begin
  if v_employee_id is null then
    raise exception using errcode = 'P0002', message = 'No employee is linked to the current user.';
  end if;
  return query
  select sl.type, sl.entity, sl.start_date, sl.end_date, sl.days, v_today between sl.start_date and sl.end_date, v_today
  from public.sick_leaves sl
  where sl.employee_id = v_employee_id
    and (not coalesce(p_active_only, false) or v_today between sl.start_date and sl.end_date)
  order by sl.start_date desc
  limit 5;
end;
$$;

-- Solo RRHH / reportes. level: 'detail' (departamento + tipo), 'category' (total por tipo) y 'total'.
-- Las personas se cuentan de forma distinta en cada nivel.
create or replace function public.get_absences_today_summary()
returns table (level text, department text, category text, detail text, people integer, today date)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'America/Costa_Rica')::date;
begin
  if not (public.has_permission('employees.read') or public.has_permission('reports.read')) then
    raise exception using errcode = '42501', message = 'Aggregate absence data requires employees.read or reports.read.';
  end if;
  return query
  with absences as (
    select lr.employee_id, 'permiso_aprobado'::text as category, lt.name as detail
    from public.leave_requests lr
    join public.leave_types lt on lt.id = lr.leave_type_id
    where lr.status = 'approved' and lr.deleted_at is null and v_today between lr.start_date and lr.end_date
    union all
    select sl.employee_id, 'incapacidad'::text, sl.type
    from public.sick_leaves sl
    where v_today between sl.start_date and sl.end_date
  ),
  scoped as (
    select a.employee_id, a.category, a.detail, d.name as department
    from absences a
    join public.employees e on e.id = a.employee_id and e.deleted_at is null
    join public.departments d on d.id = e.department_id
  )
  select
    case when grouping(s.department) = 0 then 'detail' when grouping(s.category) = 0 then 'category' else 'total' end,
    s.department, s.category, s.detail, count(distinct s.employee_id)::integer, v_today
  from scoped s
  group by grouping sets ((s.department, s.category, s.detail), (s.category), ())
  order by 1, 2 nulls last, 3 nulls last, 4 nulls last;
end;
$$;

-- Privilegios (patrón de 20261117170800): solo authenticated ejecuta; la RLS decide qué filas ve.
revoke all on function public.get_my_vacation_balance() from public, anon, authenticated, service_role;
revoke all on function public.get_my_next_payment() from public, anon, authenticated, service_role;
revoke all on function public.get_my_next_review() from public, anon, authenticated, service_role;
revoke all on function public.get_my_requests(date, integer, text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_my_sick_leaves(boolean) from public, anon, authenticated, service_role;
revoke all on function public.get_absences_today_summary() from public, anon, authenticated, service_role;

grant execute on function public.get_my_vacation_balance() to authenticated;
grant execute on function public.get_my_next_payment() to authenticated;
grant execute on function public.get_my_next_review() to authenticated;
grant execute on function public.get_my_requests(date, integer, text, text) to authenticated;
grant execute on function public.get_my_sick_leaves(boolean) to authenticated;
grant execute on function public.get_absences_today_summary() to authenticated;

commit;
