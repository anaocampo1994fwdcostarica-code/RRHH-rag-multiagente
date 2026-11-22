-- Latencia REAL del chat (consultas hechas desde el navegador) — solo lectura.
-- Cambia los dos valores de "params":
--   email: el usuario con el que probaste en el navegador.
--   desde: hora (Costa Rica) en que empezaste a probar. Así se excluyen las corridas de
--          npm run eval:bank -- --log, que también registran como rls.employee.a y rls.hr.
-- latency_ms lo mide el orquestador (de la llegada de la pregunta a la respuesta); no incluye la red
-- navegador ↔ API ni el render.

with params as (
  select 'rls.employee.a@test.invalid'::text as email,
         (current_date::timestamp + time '00:00') as desde          -- p. ej. '2026-11-22 18:30'::timestamp
),
mine as (
  select q.created_at, q.intent, q.agent, q.resolved, q.escalated, q.latency_ms, q.question
  from public.chat_query_logs q
  join auth.users u on u.id = q.profile_id
  cross join params p
  where u.email = p.email
    and q.prompt_version is distinct from 'demo-seed'
    and (q.created_at at time zone 'America/Costa_Rica')::date = (now() at time zone 'America/Costa_Rica')::date
    and (q.created_at at time zone 'America/Costa_Rica') >= p.desde
)
-- 1) Resumen
select count(*)                                                              as consultas,
       round(avg(latency_ms))::int                                           as promedio_ms,
       percentile_cont(0.5) within group (order by latency_ms)::int          as p50_ms,
       percentile_cont(0.9) within group (order by latency_ms)::int          as p90_ms,
       max(latency_ms)                                                       as maximo_ms,
       round(100.0 * count(*) filter (where latency_ms < 8000) / nullif(count(*), 0), 1) as pct_menos_8s
from mine;

-- 2) Detalle (ejecútala por separado si el editor muestra solo el último resultado)
-- select to_char(created_at at time zone 'America/Costa_Rica', 'HH24:MI:SS') as hora, intent, agent,
--        resolved, escalated, latency_ms, left(question, 80) as pregunta
-- from mine order by created_at;
