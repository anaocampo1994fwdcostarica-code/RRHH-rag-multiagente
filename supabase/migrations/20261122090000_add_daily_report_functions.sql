-- Sesión 5: agente analista (reporte diario), dashboard y catálogo de documentos.
-- Requiere 20261117170600 (daily_hr_reports), 20261120090000 (datos operativos, app_private) y 20261121110000.
-- Se aplica en el proyecto de PRUEBAS solo con confirmación del usuario.
--
-- Reglas (mismas que 20261121090000):
--   * Las cifras se calculan aquí; el backend solo invoca funciones.
--   * Funciones de lectura: SECURITY INVOKER, STABLE, search_path fijo; el permiso se exige por dentro
--     (42501) porque no existe un GRANT por permiso de la aplicación.
--   * "Hoy" = (now() at time zone 'America/Costa_Rica')::date. Nunca current_date.
--   * Un día D en hora de Costa Rica = [D 00:00 CR, D+1 00:00 CR).
--   * Fechas pasadas (backfill): ausencias, incapacidades, movimientos, chat y tendencia se reconstruyen
--     por fechas. Pendientes se aproximan con submitted_at/resolved_at (el historial de estados del seed
--     lleva la fecha de carga). Los saldos de vacaciones son una foto actual. Cada bloque declara su base
--     en meta.basis ('historica' | 'aproximada' | 'foto_actual').
--
-- Rotación (documentada también en el JSON, turnover.formula):
--   plantilla(F)     = colaboradores con deleted_at nulo, hired_on <= F y (ended_on nulo o ended_on > F)
--   rotación mes (%) = salidas del mes hasta D / ((plantilla(inicio de mes - 1) + plantilla(D)) / 2) × 100
--   rotación año (%) = salidas del 1-ene hasta D / ((plantilla(31-dic anterior) + plantilla(D)) / 2) × 100
--   salidas = personnel_movements.type = 'salida'. Plantilla promedio 0 => null. Redondeo a 1 decimal.

begin;

-- =====================================================================================
-- 1. Métricas del reporte diario (bloques 1 a 7; el 8 lo redacta el agente).
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
  if not public.has_permission('reports.read') then
    raise exception using errcode = '42501', message = 'Daily report metrics require reports.read.';
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
    'active', count(*) filter (where v_date between sl.start_date and sl.end_date),
    'accumulated_days_month', coalesce(sum(greatest(0, least(sl.end_date, v_date) - greatest(sl.start_date, v_month_start) + 1)), 0)
  ) into v_sick
  from public.sick_leaves sl
  join public.employees e on e.id = sl.employee_id and e.deleted_at is null
  where sl.start_date <= v_date and sl.end_date >= v_month_start;

  -- 4. Ingresos, salidas y rotación.
  select count(*) filter (where pm.type = 'ingreso' and pm.movement_date between v_month_start and v_date),
         count(*) filter (where pm.type = 'salida' and pm.movement_date between v_month_start and v_date),
         count(*) filter (where pm.type = 'salida' and pm.movement_date between v_year_start and v_date)
    into v_hires_month, v_exits_month, v_exits_year
  from public.personnel_movements pm
  join public.employees e on e.id = pm.employee_id and e.deleted_at is null;

  select count(*) filter (where e.hired_on <= v_month_start - 1 and (e.ended_on is null or e.ended_on > v_month_start - 1)),
         count(*) filter (where e.hired_on <= v_year_start - 1 and (e.ended_on is null or e.ended_on > v_year_start - 1)),
         count(*) filter (where e.hired_on <= v_date and (e.ended_on is null or e.ended_on > v_date))
    into v_hc_month_start, v_hc_year_start, v_hc_end
  from public.employees e
  where e.deleted_at is null and e.hired_on is not null;

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
    where c.value ~ '^[0-9a-fA-F-]{36}$'
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

-- =====================================================================================
-- 2. Tendencia de 30 días (D-29 … D): personas ausentes y consultas al chatbot por día.
-- =====================================================================================
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
  if not public.has_permission('reports.read') then
    raise exception using errcode = '42501', message = 'Trend data requires reports.read.';
  end if;
  if v_date > v_today or v_date < date '2000-01-01' then
    raise exception using errcode = '22023', message = 'Report date must be between 2000-01-01 and today (Costa Rica).';
  end if;

  return query
  with days as (
    select g::date as d from generate_series(v_date - 29, v_date, interval '1 day') g
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
         coalesce((select chat.n from chat where chat.d = days.d), 0)::integer
  from days
  order by days.d;
end;
$$;

-- =====================================================================================
-- 3. Lectura de reportes guardados (el dashboard solo lee daily_hr_reports).
--    SECURITY INVOKER: la política reports_read_staff (reports.read) decide; además se exige explícitamente.
-- =====================================================================================
create or replace function public.get_daily_report(p_date date default null)
returns table (report_date date, status text, metrics jsonb, narrative text, generated_at timestamptz, generated_by uuid)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'America/Costa_Rica')::date);
begin
  if not public.has_permission('reports.read') then
    raise exception using errcode = '42501', message = 'Daily reports require reports.read.';
  end if;
  return query
  select r.report_date, r.status, r.metrics, r.narrative, r.generated_at, r.generated_by
  from public.daily_hr_reports r
  where r.report_date = v_date and r.status = 'generated';
end;
$$;

create or replace function public.list_daily_reports(p_limit integer default 30, p_before date default null)
returns table (
  report_date date, generated_at timestamptz, narrative_source text,
  absences_total integer, pending_total integer, pending_over_3_days integer)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_permission('reports.read') then
    raise exception using errcode = '42501', message = 'Daily reports require reports.read.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 366 then
    raise exception using errcode = '22023', message = 'p_limit must be between 1 and 366.';
  end if;
  return query
  select r.report_date, r.generated_at,
         r.metrics #>> '{meta,narrative_source}',
         (r.metrics #>> '{absences,total_people}')::integer,
         (r.metrics #>> '{requests,pending_total}')::integer,
         (r.metrics #>> '{requests,pending_over_3_days}')::integer
  from public.daily_hr_reports r
  where r.status = 'generated' and (p_before is null or r.report_date < p_before)
  order by r.report_date desc
  limit p_limit;
end;
$$;

-- =====================================================================================
-- 4. Guardado del reporte: solo rrhh_api (backend/CLI), SECURITY DEFINER. Regenerar una fecha la reemplaza.
--    rrhh_api no pasa por "SET ROLE authenticated" aquí, así que auth.uid() es nulo: se verifica que
--    p_generated_by tenga reports.read consultando roles y permisos directamente.
-- =====================================================================================
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
  if p_generated_by is null or not exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.profile_id = p_generated_by and p.code = 'reports.read'
  ) then
    raise exception using errcode = '42501', message = 'The report author must have reports.read.';
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

-- Solo la función escribe en daily_hr_reports: se retira la escritura directa de authenticated.
drop policy if exists reports_manage_staff on public.daily_hr_reports;
revoke insert, update, delete on public.daily_hr_reports from authenticated;

-- =====================================================================================
-- 5. Catálogo de documentos de Drive y última sincronización (página Documentos, documents.manage).
-- =====================================================================================
create or replace function public.list_drive_documents()
returns table (
  document_id uuid, document_code text, title text, mime_type text, format text,
  doc_version text, version_label text, document_status text, web_view_link text,
  source_modified_at timestamptz, updated_at timestamptz)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_permission('documents.manage') then
    raise exception using errcode = '42501', message = 'Document catalog requires documents.manage.';
  end if;
  return query
  select d.id, d.document_code, d.title, d.mime_type,
         case
           when d.mime_type = 'application/vnd.google-apps.document' then 'Google Docs'
           when d.mime_type = 'application/vnd.google-apps.spreadsheet' then 'Google Sheets'
           when d.mime_type = 'application/pdf' then 'PDF'
           else coalesce(d.mime_type, 'Desconocido')
         end,
         v.doc_version, v.version_label, d.document_status,
         case when d.web_view_link ~ '^https://(docs|drive)\.google\.com/' then d.web_view_link end,
         v.source_modified_at, d.updated_at
  from public.documents d
  left join lateral (
    select dv.doc_version, dv.version_label, dv.source_modified_at
    from public.document_versions dv
    where dv.document_id = d.id
    order by dv.created_at desc
    limit 1
  ) v on true
  where d.source_provider = 'google_drive' and d.deleted_at is null
  order by d.document_code nulls last, d.title;
end;
$$;

create or replace function public.get_last_document_sync_run()
returns table (
  run_id uuid, run_kind text, status text, started_at timestamptz, finished_at timestamptz,
  documents_examined integer, documents_created integer, documents_updated integer,
  documents_archived integer, documents_failed integer, error_message text)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_permission('documents.manage') then
    raise exception using errcode = '42501', message = 'Sync runs require documents.manage.';
  end if;
  return query
  select r.id, r.run_kind, r.status, r.started_at, r.finished_at,
         r.documents_examined, r.documents_created, r.documents_updated,
         r.documents_archived, r.documents_failed, left(r.error_message, 500)
  from public.document_sync_runs r
  where r.source_provider = 'google_drive'
  order by r.started_at desc
  limit 1;
end;
$$;

-- =====================================================================================
-- 6. Privilegios (patrón de 20261117170800 y 20261121090000).
-- =====================================================================================
revoke all on function public.get_daily_report_metrics(date) from public, anon, authenticated, service_role;
revoke all on function public.get_hr_trend_30d(date) from public, anon, authenticated, service_role;
revoke all on function public.get_daily_report(date) from public, anon, authenticated, service_role;
revoke all on function public.list_daily_reports(integer, date) from public, anon, authenticated, service_role;
revoke all on function public.list_drive_documents() from public, anon, authenticated, service_role;
revoke all on function public.get_last_document_sync_run() from public, anon, authenticated, service_role;
grant execute on function public.get_daily_report_metrics(date) to authenticated;
grant execute on function public.get_hr_trend_30d(date) to authenticated;
grant execute on function public.get_daily_report(date) to authenticated;
grant execute on function public.list_daily_reports(integer, date) to authenticated;
grant execute on function public.list_drive_documents() to authenticated;
grant execute on function public.get_last_document_sync_run() to authenticated;

revoke all on function app_private.save_daily_hr_report(date, jsonb, text, uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.save_daily_hr_report(date, jsonb, text, uuid) to rrhh_api;

commit;
