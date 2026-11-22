-- Sesión 5 (2.ª migración): catálogo de políticas publicadas y correcciones de la revisión del reporte diario.
-- Requiere 20261122090000. Se aplica en el proyecto de PRUEBAS solo con confirmación del usuario.
--
-- Correcciones de la revisión (20261122090000):
--   * Generar métricas y tendencia exige reports.read + employees.read + requests.manage: con solo reports.read
--     (auditor) la RLS devolvería ceros silenciosos. Leer reportes guardados sigue pidiendo solo reports.read.
--   * cited_documents: regex de UUID estricta antes del cast (un valor mal formado ya no rompe el reporte).
--   * Pendientes solo de colaboradores vigentes; incapacidades activas = personas distintas.
--   * Rotación: ingresos/salidas = personas distintas; la plantilla histórica no excluye bajas lógicas posteriores.
--   * Tendencia: series con enteros (no depende del TimeZone de la sesión) y consultas del día en curso = null
--     (día incompleto), para no mostrar una caída falsa al final.
--   * daily_hr_reports: también se retira la escritura directa de service_role.
--   * save_daily_hr_report exige al autor los mismos permisos que la generación.

-- Catálogo de políticas: los colaboradores no tienen lectura sobre documents/document_versions/policy_versions,
-- así que list_published_policies es SECURITY DEFINER y expone SOLO metadatos de políticas publicadas y vigentes
-- (código, título, categoría, versión, vigencia, enlace de Drive validado). Nunca contenido ni fragmentos.

begin;

create or replace function public.list_published_policies()
returns table (
  slug text, document_code text, title text, category text, doc_version text, revision integer,
  effective_from date, drive_url text, published_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  return query
  select p.slug,
         d.document_code,
         p.title,
         case split_part(d.document_code, '-', 1)
           when 'POL' then 'Política'
           when 'PRO' then 'Procedimiento'
           when 'REG' then 'Reglamento'
           when 'MAN' then 'Manual'
           when 'COD' then 'Código'
           when 'CAT' then 'Catálogo'
           when 'AVI' then 'Aviso'
           when 'CAL' then 'Calendario'
           else initcap(p.category)
         end,
         dv.doc_version,
         pv.version_number,
         dv.effective_from,
         case when d.web_view_link ~ '^https://(docs|drive)\.google\.com/' then d.web_view_link end,
         pv.published_at
  from public.hr_policies p
  join public.policy_versions pv on pv.policy_id = p.id and pv.is_current
  left join public.document_versions dv on dv.id = pv.source_document_version_id
  left join public.documents d on d.id = dv.document_id and d.deleted_at is null and d.document_status = 'published'
  where p.status = 'published' and p.archived_at is null
  order by d.document_code nulls last, p.title;
end;
$$;

revoke all on function public.list_published_policies() from public, anon, authenticated, service_role;
grant execute on function public.list_published_policies() to authenticated;

-- =====================================================================================
-- Correcciones del reporte diario
-- =====================================================================================
create or replace function public.get_daily_report_metrics(p_date date default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'America/Costa_Rica')::date;
  v_date date := coalesce(p_date, v_today);
  v_day_end timestamptz;
  v_chat_day date;
  v_chat_start timestamptz;
  v_chat_end timestamptz;
  v_month_start date;
  v_year_start date;
  v_pending_cutoff timestamptz;
  v_absences jsonb;
  v_requests jsonb;
  v_sick jsonb;
  v_turnover jsonb;
  v_vacation jsonb;
  v_chatbot jsonb;
  v_topics jsonb;
  v_hc_month_start integer;
  v_hc_year_start integer;
  v_hc_end integer;
  v_hires_month integer;
  v_exits_month integer;
  v_exits_year integer;
begin
  if not (public.has_permission('reports.read') and public.has_permission('employees.read') and public.has_permission('requests.manage')) then
    raise exception using errcode = '42501', message = 'Report generation requires reports.read, employees.read and requests.manage.';
  end if;
  if v_date > v_today or v_date < date '2000-01-01' then
    raise exception using errcode = '22023', message = 'Report date must be between 2000-01-01 and today (Costa Rica).';
  end if;

  v_day_end := ((v_date + 1)::timestamp at time zone 'America/Costa_Rica');
  v_chat_day := v_date - 1;
  v_chat_start := (v_chat_day::timestamp at time zone 'America/Costa_Rica');
  v_chat_end := (v_date::timestamp at time zone 'America/Costa_Rica');
  v_month_start := date_trunc('month', v_date)::date;
  v_year_start := date_trunc('year', v_date)::date;
  -- Con D = hoy equivale a "submitted_at < now() - 3 días" (criterio de V1).
  v_pending_cutoff := least(now(), v_day_end) - interval '3 days';

  -- 1. Ausentes en D por tipo y por departamento (personas distintas).
  with absences as (
    select lr.employee_id,
           case when lt.code = 'vacaciones' then 'vacaciones' else 'permiso' end as category
    from public.leave_requests lr
    join public.leave_types lt on lt.id = lr.leave_type_id
    where lr.status = 'approved' and lr.deleted_at is null and v_date between lr.start_date and lr.end_date
    union all
    select sl.employee_id, 'incapacidad'
    from public.sick_leaves sl
    where v_date between sl.start_date and sl.end_date
  ),
  scoped as (
    select a.employee_id, a.category, d.name as department
    from absences a
    join public.employees e on e.id = a.employee_id and e.deleted_at is null
    join public.departments d on d.id = e.department_id
  ),
  by_department as (
    select department,
           count(distinct employee_id) filter (where category = 'vacaciones') as vacaciones,
           count(distinct employee_id) filter (where category = 'permiso') as permiso,
           count(distinct employee_id) filter (where category = 'incapacidad') as incapacidad,
           count(distinct employee_id) as total
    from scoped group by department
  )
  select jsonb_build_object(
    'total_people', (select count(distinct employee_id) from scoped),
    'approved_leave_people', (select count(distinct employee_id) from scoped where category <> 'incapacidad'),
    'by_type', jsonb_build_object(
      'vacaciones', (select count(distinct employee_id) from scoped where category = 'vacaciones'),
      'permiso', (select count(distinct employee_id) from scoped where category = 'permiso'),
      'incapacidad', (select count(distinct employee_id) from scoped where category = 'incapacidad')),
    'by_department', coalesce((select jsonb_agg(jsonb_build_object(
        'department', department, 'vacaciones', vacaciones, 'permiso', permiso,
        'incapacidad', incapacidad, 'total', total) order by total desc, department) from by_department), '[]'::jsonb)
  ) into v_absences;

  -- 2. Solicitudes pendientes al cierre de D (enviadas y no resueltas a esa hora).
  with pending as (
    select lr.*, lt.name as leave_type_name
    from public.leave_requests lr
    join public.leave_types lt on lt.id = lr.leave_type_id
    join public.employees pe on pe.id = lr.employee_id and pe.deleted_at is null
    where lr.deleted_at is null
      and lr.submitted_at is not null and lr.submitted_at < v_day_end
      and (lr.status in ('submitted', 'in_review')
           or (lr.status in ('approved', 'rejected', 'cancelled') and lr.resolved_at >= v_day_end))
  )
  select jsonb_build_object(
    'pending_total', (select count(*) from pending),
    'pending_over_3_days', (select count(*) from pending where submitted_at < v_pending_cutoff),
    'pending_list', coalesce((select jsonb_agg(row_data order by submitted_at) from (
        select p.submitted_at, jsonb_build_object(
          'request_id', p.id,
          'employee_code', e.employee_code,
          'employee_name', e.full_name,
          'department', d.name,
          'leave_type', p.leave_type_name,
          'start_date', p.start_date,
          'end_date', p.end_date,
          'submitted_on', (p.submitted_at at time zone 'America/Costa_Rica')::date,
          'days_waiting', v_date - (p.submitted_at at time zone 'America/Costa_Rica')::date,
          'over_3_days', p.submitted_at < v_pending_cutoff,
          'status', case when p.status in ('submitted', 'in_review') then p.status else 'submitted' end) as row_data
        from pending p
        join public.employees e on e.id = p.employee_id
        left join public.departments d on d.id = e.department_id
        order by p.submitted_at
        limit 50) list), '[]'::jsonb)
  ) into v_requests;

  -- 3. Incapacidades activas en D y días acumulados del mes (1 al D, recortando cada incapacidad al rango).
  select jsonb_build_object(
    'active', count(distinct sl.employee_id) filter (where v_date between sl.start_date and sl.end_date),
    'accumulated_days_month', coalesce(sum(greatest(0, least(sl.end_date, v_date) - greatest(sl.start_date, v_month_start) + 1)), 0)
  ) into v_sick
  from public.sick_leaves sl
  join public.employees e on e.id = sl.employee_id and e.deleted_at is null
  where sl.start_date <= v_date and sl.end_date >= v_month_start;

  -- 4. Ingresos, salidas y rotación.
  select count(distinct pm.employee_id) filter (where pm.type = 'ingreso' and pm.movement_date between v_month_start and v_date),
         count(distinct pm.employee_id) filter (where pm.type = 'salida' and pm.movement_date between v_month_start and v_date),
         count(distinct pm.employee_id) filter (where pm.type = 'salida' and pm.movement_date between v_year_start and v_date)
    into v_hires_month, v_exits_month, v_exits_year
  from public.personnel_movements pm;

  select count(*) filter (where e.hired_on <= v_month_start - 1 and (e.ended_on is null or e.ended_on > v_month_start - 1)),
         count(*) filter (where e.hired_on <= v_year_start - 1 and (e.ended_on is null or e.ended_on > v_year_start - 1)),
         count(*) filter (where e.hired_on <= v_date and (e.ended_on is null or e.ended_on > v_date))
    into v_hc_month_start, v_hc_year_start, v_hc_end
  from public.employees e
  where e.hired_on is not null;

  v_turnover := jsonb_build_object(
    'hires_month', v_hires_month,
    'exits_month', v_exits_month,
    'exits_year', v_exits_year,
    'headcount_month_start', v_hc_month_start,
    'headcount_year_start', v_hc_year_start,
    'headcount_end', v_hc_end,
    'rate_pct_month', case when v_hc_month_start + v_hc_end = 0 then null
                           else round(v_exits_month * 200.0 / (v_hc_month_start + v_hc_end), 1) end,
    'rate_pct_ytd', case when v_hc_year_start + v_hc_end = 0 then null
                         else round(v_exits_year * 200.0 / (v_hc_year_start + v_hc_end), 1) end,
    'formula', 'salidas del periodo / ((plantilla al inicio del periodo + plantilla al día del reporte) / 2) x 100; periodo = mes y año calendario hasta la fecha del reporte');

  -- 5. Colaboradores con más de 20 días de vacaciones acumulados (suma de periodos; foto actual).
  with acc as (
    select vb.employee_id, sum(vb.available_days)::integer as days
    from public.vacation_balances vb
    join public.employees e on e.id = vb.employee_id and e.deleted_at is null
    group by vb.employee_id
    having sum(vb.available_days) > 20
  )
  select jsonb_build_object(
    'count', (select count(*) from acc),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'employee_code', e.employee_code, 'employee_name', e.full_name, 'department', d.name,
        'accumulated_days', acc.days) order by acc.days desc, e.employee_code)
      from acc join public.employees e on e.id = acc.employee_id
      left join public.departments d on d.id = e.department_id), '[]'::jsonb)
  ) into v_vacation;

  -- 6. Uso del chatbot el día anterior a D.
  select jsonb_build_object(
    'date', v_chat_day,
    'total', count(*),
    'resolved_without_escalation', count(*) filter (where q.resolved and not q.escalated),
    'resolved_without_escalation_pct', case when count(*) = 0 then null
      else round(count(*) filter (where q.resolved and not q.escalated) * 100.0 / count(*), 1) end,
    'avg_latency_ms', case when count(*) = 0 then null else round(avg(q.latency_ms))::integer end,
    'by_intent', coalesce((select jsonb_object_agg(i.intent, i.n) from (
        select intent, count(*) as n from public.chat_query_logs
        where created_at >= v_chat_start and created_at < v_chat_end group by intent) i), '{}'::jsonb)
  ) into v_chatbot
  from public.chat_query_logs q
  where q.created_at >= v_chat_start and q.created_at < v_chat_end;

  -- 7. Top 5 de temas (documento citado) y preguntas de política que el RAG no pudo responder.
  with day_logs as (
    select * from public.chat_query_logs
    where created_at >= v_chat_start and created_at < v_chat_end
  ),
  cited as (
    select (c.value)::uuid as document_id
    from day_logs l, jsonb_array_elements_text(l.cited_documents) c(value)
    where c.value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ),
  topics as (
    select coalesce(doc.document_code, doc.title, 'Documento no disponible') as topic, count(*) as n
    from cited left join public.documents doc on doc.id = cited.document_id
    group by 1
    order by n desc, topic
    limit 5
  ),
  unanswered as (
    select l.question, l.created_at
    from day_logs l
    where l.intent in ('policy', 'mixed') and not l.resolved
  )
  select jsonb_build_object(
    'top5', coalesce((select jsonb_agg(jsonb_build_object('topic', topic, 'count', n) order by n desc, topic) from topics), '[]'::jsonb),
    'unanswered_count', (select count(*) from unanswered),
    'unanswered', coalesce((select jsonb_agg(jsonb_build_object(
        'question', left(u.question, 200),
        'asked_at', u.created_at) order by u.created_at)
      from (select * from unanswered order by created_at limit 10) u), '[]'::jsonb)
  ) into v_topics;

  return jsonb_build_object(
    'schema_version', 1,
    'report_date', v_date,
    'timezone', 'America/Costa_Rica',
    'thresholds', jsonb_build_object('pending_days', 3, 'vacation_days', 20, 'trend_days', 30, 'top_topics', 5),
    'absences', v_absences,
    'requests', v_requests,
    'sick_leaves', v_sick,
    'turnover', v_turnover,
    'vacation_over_20', v_vacation,
    'chatbot', v_chatbot,
    'topics', v_topics,
    'meta', jsonb_build_object('basis', jsonb_build_object(
      'absences', 'historica',
      'requests', case when v_date = v_today then 'historica' else 'aproximada' end,
      'sick_leaves', 'historica',
      'turnover', 'historica',
      'vacation_over_20', 'foto_actual',
      'chatbot', 'historica',
      'topics', 'historica'))
  );
end;
$$;

create or replace function public.get_hr_trend_30d(p_date date default null)
returns table (day date, absences integer, chat_queries integer)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'America/Costa_Rica')::date;
  v_date date := coalesce(p_date, v_today);
begin
  if not (public.has_permission('reports.read') and public.has_permission('employees.read') and public.has_permission('requests.manage')) then
    raise exception using errcode = '42501', message = 'Report generation requires reports.read, employees.read and requests.manage.';
  end if;
  if v_date > v_today or v_date < date '2000-01-01' then
    raise exception using errcode = '22023', message = 'Report date must be between 2000-01-01 and today (Costa Rica).';
  end if;

  return query
  with days as (
    select v_date - 29 + i as d from generate_series(0, 29) i
  ),
  absence_rows as (
    select lr.employee_id, lr.start_date, lr.end_date
    from public.leave_requests lr
    join public.employees e on e.id = lr.employee_id and e.deleted_at is null
    where lr.status = 'approved' and lr.deleted_at is null and lr.end_date >= v_date - 29 and lr.start_date <= v_date
    union all
    select sl.employee_id, sl.start_date, sl.end_date
    from public.sick_leaves sl
    join public.employees e on e.id = sl.employee_id and e.deleted_at is null
    where sl.end_date >= v_date - 29 and sl.start_date <= v_date
  ),
  chat as (
    select (q.created_at at time zone 'America/Costa_Rica')::date as d, count(*) as n
    from public.chat_query_logs q
    where q.created_at >= ((v_date - 29)::timestamp at time zone 'America/Costa_Rica')
      and q.created_at < ((v_date + 1)::timestamp at time zone 'America/Costa_Rica')
    group by 1
  )
  select days.d,
         (select count(distinct a.employee_id) from absence_rows a where days.d between a.start_date and a.end_date)::integer,
         case when days.d >= v_today then null
              else coalesce((select chat.n from chat where chat.d = days.d), 0)::integer end
  from days
  order by days.d;
end;
$$;

-- Autor del reporte: mismos permisos que la generación.
create or replace function app_private.report_author_allowed(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select count(distinct p.code) = 3
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where ur.profile_id = p_profile_id and p.code in ('reports.read', 'employees.read', 'requests.manage');
$$;
revoke all on function app_private.report_author_allowed(uuid) from public, anon, authenticated, service_role;

create or replace function app_private.save_daily_hr_report(
  p_report_date date,
  p_metrics jsonb,
  p_narrative text,
  p_generated_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_id uuid;
  v_replaced boolean;
begin
  if p_report_date is null or p_report_date > (now() at time zone 'America/Costa_Rica')::date then
    raise exception using errcode = '22023', message = 'Report date must not be null or in the future (Costa Rica).';
  end if;
  if p_metrics is null or jsonb_typeof(p_metrics) <> 'object'
     or (p_metrics ->> 'report_date') is distinct from p_report_date::text then
    raise exception using errcode = '22023', message = 'Metrics must be a JSON object for the same report date.';
  end if;
  if p_narrative is null or char_length(btrim(p_narrative)) = 0 or char_length(p_narrative) > 2000 then
    raise exception using errcode = '22023', message = 'Narrative must have between 1 and 2000 characters.';
  end if;
  if p_generated_by is null or not app_private.report_author_allowed(p_generated_by) then
    raise exception using errcode = '42501', message = 'The report author must have reports.read, employees.read and requests.manage.';
  end if;

  -- Serializa regeneraciones simultáneas de la misma fecha.
  perform pg_advisory_xact_lock(hashtextextended('daily_hr_report:' || p_report_date::text, 0));
  v_replaced := exists (select 1 from public.daily_hr_reports where report_date = p_report_date);

  insert into public.daily_hr_reports (report_date, status, metrics, narrative, generated_at, generated_by)
  values (p_report_date, 'generated', p_metrics, p_narrative, now(), p_generated_by)
  on conflict (report_date) do update
    set status = 'generated', metrics = excluded.metrics, narrative = excluded.narrative,
        generated_at = excluded.generated_at, generated_by = excluded.generated_by
  returning id into v_id;

  insert into public.admin_audit_log (actor_profile_id, action, entity_type, entity_id, metadata)
  values (p_generated_by, 'daily_report.generate', 'daily_hr_report', v_id,
          jsonb_build_object('report_date', p_report_date, 'replaced', v_replaced,
                             'narrative_source', p_metrics #>> '{meta,narrative_source}'));
  return v_id;
end;
$$;

revoke insert, update, delete on public.daily_hr_reports from service_role;

commit;
