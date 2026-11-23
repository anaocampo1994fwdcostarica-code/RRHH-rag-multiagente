-- SOLO LECTURA. Ejecutar en el SQL Editor del proyecto Supabase de PRUEBAS.
-- Las migraciones aplicadas a mano desde el SQL Editor NO quedan registradas en
-- supabase_migrations.schema_migrations; este archivo verifica su estado por los objetos que crean.
--
-- Resultado: una fila por migración.
--   estado = 'aplicada'    → existen todos sus objetos.
--   estado = 'PARCIAL'     → existen algunos: NO volver a ejecutar la migración tal cual; ver la guía.
--   estado = 'no aplicada' → no existe ninguno.
-- Los componentes que empiezan por 'dato:' son condiciones de datos: cuentan para 'aplicada', no para 'PARCIAL'.
-- La fila "entorno" es informativa (aplicada = null).
-- No usa casts ::regclass ni ::regprocedure sobre objetos opcionales, para no fallar si faltan.

with checks(ord, migration, component, ok, marker) as (
  -- 20261119090000: crea la función guarda, el trigger y la política de envío del colaborador.
  select 1, '20261119090000_allow_employee_draft_submission', c.component, c.ok, c.component not like 'dato:%' from (values
    ('funcion public.guard_employee_leave_request_submission',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'guard_employee_leave_request_submission')),
    ('trigger leave_requests_guard_employee_submission',
      exists (select 1 from pg_trigger t
              where t.tgrelid = 'public.leave_requests'::regclass
                and t.tgname = 'leave_requests_guard_employee_submission' and not t.tgisinternal)),
    ('policy requests_update_own_draft_to_submitted',
      exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'leave_requests'
                and policyname = 'requests_update_own_draft_to_submitted'))
  ) as c(component, ok)

  union all
  -- 20261119091000: reemplaza el cuerpo de la misma función; se reconoce por texto exclusivo.
  select 2, '20261119091000_guard_administrative_leave_request_transitions', c.component, c.ok, c.component not like 'dato:%' from (values
    ('funcion con mensaje exclusivo de 091000',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'guard_employee_leave_request_submission'
                and p.prosrc like '%Administrative leave request transition is not permitted.%')),
    ('funcion con transiciones submitted -> in_review -> approved/rejected',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'guard_employee_leave_request_submission'
                and p.prosrc like '%old.status = ''in_review'' and new.status in (''approved'', ''rejected'')%'))
  ) as c(component, ok)

  union all
  -- 20261119100000: pgvector, columna section, tabla de embeddings, índice, RLS, política y RPC.
  select 3, '20261119100000_add_policy_rag_pgvector', c.component, c.ok, c.component not like 'dato:%' from (values
    ('extension vector instalada',
      exists (select 1 from pg_extension where extname = 'vector')),
    ('columna document_chunks.section',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'document_chunks' and column_name = 'section')),
    ('tabla public.document_chunk_embeddings',
      to_regclass('public.document_chunk_embeddings') is not null),
    ('indice vectorial (ivfflat de 100000 o hnsw de 100000+121100000)',
      coalesce(to_regclass('public.document_chunk_embeddings_embedding_idx'), to_regclass('public.document_chunk_embeddings_embedding_hnsw_idx')) is not null),
    ('RLS habilitada en document_chunk_embeddings',
      coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.document_chunk_embeddings')), false)),
    ('policy document_chunk_embeddings_manage_staff',
      exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'document_chunk_embeddings'
                and policyname = 'document_chunk_embeddings_manage_staff')),
    ('funcion public.match_policy_chunks',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'match_policy_chunks')),
    ('authenticated puede ejecutar match_policy_chunks',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'match_policy_chunks'
                and has_function_privilege('authenticated', p.oid, 'EXECUTE')))
  ) as c(component, ok)

  union all
  -- 20261119101000: nueva restricción de estados editoriales y conversión de 'active' a 'in_review'.
  select 4, '20261119101000_add_document_editorial_review_states', c.component, c.ok, c.component not like 'dato:%' from (values
    ('restriccion documents_document_status_check con in_review y published',
      exists (select 1 from pg_constraint
              where conrelid = 'public.documents'::regclass and conname = 'documents_document_status_check'
                and pg_get_constraintdef(oid) like '%in_review%'
                and pg_get_constraintdef(oid) like '%published%')),
    ('dato: ningun documento queda en estado active',
      not exists (select 1 from public.documents where document_status = 'active'))
  ) as c(component, ok)

  union all
  -- 20261120090000: datos operativos, registro del chat y funciones de escritura controlada.
  select 5, '20261120090000_add_hr_operational_data', c.component, c.ok, c.component not like 'dato:%' from (values
    ('columna employees.full_name',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'employees' and column_name = 'full_name')),
    ('6 tablas nuevas',
      (select count(*) from unnest(array['vacation_balances', 'sick_leaves', 'personnel_movements',
        'payroll_calendar', 'performance_reviews', 'chat_query_logs']) as t(name)
       where to_regclass('public.' || t.name) is not null) = 6),
    ('RLS habilitada en las 6 tablas',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relrowsecurity
         and c.relname in ('vacation_balances', 'sick_leaves', 'personnel_movements',
           'payroll_calendar', 'performance_reviews', 'chat_query_logs')) = 6),
    ('funcion public.append_assistant_message',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'append_assistant_message')),
    ('esquema app_private',
      exists (select 1 from pg_namespace where nspname = 'app_private')),
    ('funcion app_private.log_chat_query',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'app_private' and p.proname = 'log_chat_query')),
    ('rrhh_api puede ejecutar log_chat_query',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'app_private' and p.proname = 'log_chat_query'
                and exists (select 1 from pg_roles where rolname = 'rrhh_api')
                and has_function_privilege('rrhh_api', p.oid, 'EXECUTE')))
  ) as c(component, ok)

  union all
  -- 20261121090000: funciones SQL del agente de datos (las consultas viven en la base).
  select 6, '20261121090000_add_data_agent_functions', c.component, c.ok, c.component not like 'dato:%' from (values
    ('6 funciones get_* del agente de datos',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('get_my_vacation_balance', 'get_my_next_payment', 'get_my_next_review',
         'get_my_requests', 'get_my_sick_leaves', 'get_absences_today_summary')) = 6),
    ('todas SECURITY INVOKER y STABLE con search_path fijo',
      not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('get_my_vacation_balance', 'get_my_next_payment', 'get_my_next_review',
         'get_my_requests', 'get_my_sick_leaves', 'get_absences_today_summary')
         and (p.prosecdef or p.provolatile <> 's' or p.proconfig is null))
      and exists (select 1 from pg_proc p where p.proname = 'get_absences_today_summary')),
    ('authenticated ejecuta y anon no',
      not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('get_my_vacation_balance', 'get_my_next_payment', 'get_my_next_review',
         'get_my_requests', 'get_my_sick_leaves', 'get_absences_today_summary')
         and (not has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')))
      and exists (select 1 from pg_proc p where p.proname = 'get_absences_today_summary'))
  ) as c(component, ok)

  union all
  -- 20261121100000: ingesta desde Drive, flujo editorial con historial y estado de sincronización.
  select 7, '20261121100000_drive_rag_ingestion_and_editorial_flow', c.component, c.ok, c.component not like 'dato:%' from (values
    ('columnas documents.document_code y web_view_link',
      (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'documents'
         and column_name in ('document_code', 'web_view_link', 'folder_path', 'last_seen_at', 'archived_reason')) = 5),
    ('columnas de metadatos en document_versions y document_chunks',
      (select count(*) from information_schema.columns where table_schema = 'public'
         and ((table_name = 'document_versions' and column_name in ('doc_version', 'effective_from', 'owner', 'document_title', 'embedding_model'))
           or (table_name = 'document_chunks' and column_name in ('document_code', 'doc_version', 'source_url', 'metadata')))) = 9),
    ('tablas document_status_history y drive_sync_state con RLS',
      coalesce((select bool_and(relrowsecurity) and count(*) = 2 from pg_class
        where oid in (to_regclass('public.document_status_history'), to_regclass('public.drive_sync_state'))), false)),
    ('tablas nuevas: anon sin acceso y authenticated solo SELECT',
      coalesce((select bool_and(not has_table_privilege('anon', oid, 'SELECT')
          and has_table_privilege('authenticated', oid, 'SELECT')
          and not has_table_privilege('authenticated', oid, 'INSERT')
          and not has_table_privilege('authenticated', oid, 'UPDATE')
          and not has_table_privilege('authenticated', oid, 'DELETE')) and count(*) = 2 from pg_class
        where oid in (to_regclass('public.document_status_history'), to_regclass('public.drive_sync_state'))), false)),
    ('indice HNSW document_chunk_embeddings_embedding_hnsw_idx',
      to_regclass('public.document_chunk_embeddings_embedding_hnsw_idx') is not null),
    ('funciones editoriales SECURITY DEFINER: authenticated ejecuta y anon no',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and p.proname in ('submit_document_for_review', 'publish_document_version', 'archive_document', 'save_drive_sync_token')
          and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')) = 4),
    ('match_policy_chunks devuelve document_code',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'match_policy_chunks' and 'document_code' = any (p.proargnames)))
  ) as c(component, ok)

  union all
  -- 20261121110000: guardia del estado editorial, reapertura, bloqueo de sincronización y búsqueda iterativa.
  select 8, '20261121110000_harden_editorial_flow', c.component, c.ok, c.component not like 'dato:%' from (values
    ('trigger documents_guard_status_change',
      exists (select 1 from pg_trigger t where t.tgrelid = 'public.documents'::regclass
              and t.tgname = 'documents_guard_status_change' and not t.tgisinternal)),
    ('funciones reopen_document y start_document_sync_run: authenticated ejecuta y anon no',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef and p.proname in ('reopen_document', 'start_document_sync_run')
          and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')) = 2),
    ('indice document_sync_runs_one_started_idx',
      to_regclass('public.document_sync_runs_one_started_idx') is not null),
    ('publish_document_version archiva la política de un código anterior',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'publish_document_version' and p.prosrc like '%pg_advisory_xact_lock%')),
    ('match_policy_chunks con hnsw.iterative_scan',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'match_policy_chunks' and p.prosrc like '%hnsw.iterative_scan%'))
  ) as c(component, ok)

  union all
  -- 20261122090000: reporte diario (métricas, tendencia, lectura, guardado) y catálogo de documentos.
  select 9, '20261122090000_add_daily_report_functions', c.component, c.ok, true from (values
    ('funciones de lectura INVOKER: authenticated ejecuta y anon no',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and not p.prosecdef
          and p.proname in ('get_daily_report_metrics', 'get_hr_trend_30d', 'get_daily_report', 'list_daily_reports', 'list_drive_documents', 'get_last_document_sync_run')
          and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')) = 6),
    ('app_private.save_daily_hr_report DEFINER solo para rrhh_api',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'app_private' and p.proname = 'save_daily_hr_report' and p.prosecdef
                and has_function_privilege('rrhh_api', p.oid, 'EXECUTE') and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
    ('daily_hr_reports sin escritura directa de authenticated',
      not has_table_privilege('authenticated', 'public.daily_hr_reports', 'INSERT')
      and not has_table_privilege('authenticated', 'public.daily_hr_reports', 'UPDATE')
      and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'daily_hr_reports' and policyname = 'reports_manage_staff'))
  ) as c(component, ok)
)
select
  migration,
  bool_and(ok) as aplicada,
  case when bool_and(ok) then 'aplicada' when bool_or(ok) filter (where marker) then 'PARCIAL' else 'no aplicada' end as estado,
  jsonb_object_agg(component, ok) as detalle
from checks
group by ord, migration

union all

-- Fila informativa: prerrequisitos y datos que la guía necesita.
select
  'entorno (informativo)',
  null,
  case
    when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'guard_employee_leave_request_submission')
      then 'funcion guarda: no existe'
    -- Huella = md5 del cuerpo sin comentarios ni espacios (no depende de que se conserven los comentarios).
    -- Ver 20261119_guard_function_diagnosis_readonly.sql para el detalle.
    else 'funcion guarda: ' || coalesce((
      select case md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
               when '69374d84205b6c91c98c615c7bae8616' then 'version 090000'
               when '5ff9146df6650bde15c0d7fb051ddc2a' then 'version 091000'
               else 'DISTINTA del repo (correr 20261119_guard_function_diagnosis_readonly.sql)'
             end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'guard_employee_leave_request_submission'), '?')
  end,
  jsonb_build_object(
    'rrhh_api_existe', exists (select 1 from pg_roles where rolname = 'rrhh_api'),
    'search_path_sesion', current_setting('search_path'),
    'vector_esquema', (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector'),
    'documents_status_check', (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'public.documents'::regclass and conname = 'documents_document_status_check'),
    'vector_disponible', exists (select 1 from pg_available_extensions where name = 'vector'),
    'documentos_por_estado', coalesce((select jsonb_object_agg(document_status, total)
      from (select document_status, count(*) as total from public.documents group by document_status) s), '{}'::jsonb),
    'solicitudes_por_estado', coalesce((select jsonb_object_agg(status, total)
      from (select status, count(*) as total from public.leave_requests group by status) s), '{}'::jsonb)
  )
order by 1;
