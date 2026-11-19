-- SOLO LECTURA. Ejecutar en el SQL Editor del proyecto Supabase de PRUEBAS antes de aplicar 20261119091000.
-- Identifica qué versión de public.guard_employee_leave_request_submission está instalada SIN depender
-- de los comentarios (un editor o una copia pueden haberlos quitado):
--   huella = md5 del cuerpo sin comentarios "--" y sin espacios en blanco.
--   Huellas esperadas (calculadas en PostgreSQL 17 con los archivos del repo):
--     20261119090000 → 69374d84205b6c91c98c615c7bae8616
--     20261119091000 → 5ff9146df6650bde15c0d7fb051ddc2a
-- Devuelve una sola fila.

select
  md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) as huella,
  case md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
    when '69374d84205b6c91c98c615c7bae8616' then '090000 (mismo código que el repo)'
    when '5ff9146df6650bde15c0d7fb051ddc2a' then '091000 (mismo código que el repo)'
    else 'DISTINTA del repo'
  end as version_por_codigo,
  p.prosrc like '%Staff authorization remains governed%' as conserva_comentarios_090000,
  -- Marcadores de comportamiento de la 090000.
  p.prosrc ~ 'has_permission\(''requests\.manage''\)\s+then\s+return\s+new;' as staff_pasa_sin_restriccion,
  p.prosrc like '%Leave request submission is not permitted.%' as rechaza_envio_no_permitido,
  p.prosrc ~ 'old\.status\s*<>\s*''draft''' and p.prosrc ~ 'new\.status\s*<>\s*''submitted''' as solo_draft_a_submitted,
  p.prosrc ~ 'new\.submitted_at\s*:=\s*now\(\)' as fija_submitted_at_en_bd,
  -- Configuración esperada: SECURITY INVOKER, search_path fijo y sin EXECUTE para clientes.
  p.prosecdef as security_definer,
  p.proconfig as configuracion,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_puede_ejecutar,
  (select pg_get_triggerdef(t.oid) from pg_trigger t
    where t.tgrelid = 'public.leave_requests'::regclass and t.tgname = 'leave_requests_guard_employee_submission') as trigger_def,
  (select jsonb_build_object('cmd', cmd, 'roles', roles, 'using', qual, 'with_check', with_check) from pg_policies
    where schemaname = 'public' and tablename = 'leave_requests' and policyname = 'requests_update_own_draft_to_submitted') as policy_def,
  pg_get_functiondef(p.oid) as definicion_completa
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'guard_employee_leave_request_submission';
