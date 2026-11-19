# Pendientes de validación final

## Estado de migraciones aplicadas a mano

- Las migraciones aplicadas a mano desde el SQL Editor NO quedan registradas en `supabase_migrations.schema_migrations`; Supabase no sabe que existen. Su estado se verifica con `supabase/manual_checks/20261119_migration_status_readonly.sql` (solo lectura) antes y después de cada aplicación.
- La versión de `guard_employee_leave_request_submission` se identifica por la huella del código (sin comentarios ni espacios), no por sus comentarios: el proyecto de pruebas tenía la 090000 sin el comentario del repo. Detalle en `supabase/manual_checks/20261119_guard_function_diagnosis_readonly.sql`.
- En el proyecto de pruebas había 1 documento en `active` antes de la 101000 (pasa a `in_review` y no es visible para el RAG hasta publicarse).
- [x] 2026-11-19: en el proyecto de pruebas quedaron aplicadas y verificadas 20261119090000, 20261119091000, 20261119100000, 20261119101000 y 20261120090000 (evidencia: `docs/evidencias/validacion_seed_2026-11-19.md`).
- `20261119100000` y `20261119101000` no traen `begin/commit`: al pegarlas en el SQL Editor hay que envolverlas en una transacción explícita para que un error no deje la base a medias.

## RAG e ingesta documental

- [x] `20261119100000_add_policy_rag_pgvector.sql` aplicada en pruebas (2026-11-19); verificados `vector` en `extensions`, `document_chunks.section`, RLS, índice ivfflat y EXECUTE de `match_policy_chunks` solo para `authenticated`.
- [x] `20261119101000_add_document_editorial_review_states.sql` aplicada en pruebas (2026-11-19); 1 documento `active` → `in_review`. Pendiente: validar con un documento `published` que el RPC lo devuelva.
- Configurar fuera de Git la cuenta de servicio Google Drive de solo lectura, una carpeta autorizada y `GEMINI_API_KEY`.
- Crear y revisar el flujo administrativo protegido por `documents.manage` que invoque la ingesta; no exponerla al chat ni a empleados.
- Validar con documentos ficticios autorizados la asociación de `policy_versions.source_document_version_id`, la recuperación y las citas de `POST /api/chat`.
- Mantener la sincronización diaria deshabilitada hasta completar la validación anterior.

## Orquestador (sesión 1)

- El rol RRHH se resuelve con `has_permission('employees.read')`; confirmar que ese permiso solo lo tienen `hr`/`admin` en los datos reales.
- [x] Agente de datos real (sesión 3): herramientas SQL fijas con `withUserTransaction` + filtro `current_employee_id()`, plantillas deterministas; integración real 7/7 (`npm run test:data-integration`).
- [x] `ChatPage.jsx` envía y conserva `conversationId` y muestra el aviso "¿Quieres que RRHH te contacte?" (solo visual).
- Implementar el flujo real de contacto con RRHH detrás del aviso de escalamiento.
- Medir con Gemini real el p90 de latencia (< 8 s) y la precisión del clasificador con el banco de 45 preguntas (sesión 7).

## Agente de datos (sesión 3)

- [x] Regla de arquitectura aplicada (2026-11-19): las consultas del agente de datos viven en la base (`20261121090000_add_data_agent_functions.sql`: funciones `get_my_*` y `get_absences_today_summary`, SECURITY INVOKER, STABLE, sin identidad como parámetro). El backend solo las invoca. Aplicada en pruebas: estado OK, harness 18/18, test:data-integration 7/7, respuestas de A idénticas.
- Aplicar la misma regla al agente analista (sesión 5) y al dashboard: `DashboardPage.jsx` todavía tiene cifras fijas.

- Mejora opcional: alcance `other` (RRHH consultando datos de otra persona por el chat). Hoy responde "no disponible" y ofrece escalar; requeriría herramientas con identificación explícita del colaborador, validada contra `employees.read` y auditada.
- `backend/.env` ya tiene `DATABASE_URL` (`rrhh_api`) y `DATABASE_SSL_CA_FILE`; `chat_query_logs` y el agente de datos dependen de ellos.
- Probar en el navegador con `rls.employee.a` y revisar `chat_query_logs` (pasos en la sesión 3).
- [x] Datos demo de A y B corregidos en el seed (ingreso 2024-03-04 y 2025-06-16; A con 9 días, B con 21). V1: personas con más de 20 días = 5.

## Datos operativos y registro del chat (sesión 2)

- [x] `20261120090000_add_hr_operational_data.sql` aplicada en pruebas (2026-11-19); verificado que `authenticated` no ejecuta `log_chat_query` ni escribe en las tablas nuevas.
- [x] Seed demo aplicado dos veces en pruebas (2026-11-19): V1 idéntico, V2 = 0 filas, conteos iguales (idempotente). Pendiente: comparar V1 con el reporte diario (sesión 5).
- Configurar `DATABASE_URL` (login `rrhh_api`) y `DATABASE_SSL_CA_FILE` en el backend: sin ellos el registro en `chat_query_logs` falla en silencio y el chat sigue respondiendo.
- [x] Harness RLS después del seed: 18/18 aprobadas (2026-11-19), adaptado a la regla de la 091000.
- `append_assistant_message` permite que un usuario agregue mensajes "assistant" a SUS propias conversaciones con su JWT; solo afecta su memoria, no datos ajenos ni el registro.
- Reglas obligatorias para el reporte diario y el agente de datos:
  - Hoy = `(now() at time zone 'America/Costa_Rica')::date`, nunca `current_date`.
  - Días de vacaciones = días hábiles lunes a viernes, inclusive, sin descontar feriados; periodo = año de `start_date`.
  - Pendiente "con más de 3 días" = `status in ('submitted','in_review') and submitted_at < now() - interval '3 days'`.

## Solicitudes y empleados

- [x] `20261119091000_guard_administrative_leave_request_transitions.sql` aplicada en pruebas; el harness verifica que RRHH no pasa `draft → in_review` y sí `submitted → in_review`.
- Verificar RLS, trigger, historial y concurrencia de las transiciones administrativas con usuarios autorizados.
- Ejecutar la prueba manual de envío `draft → submitted` desde el navegador.
- Mantener deshabilitadas las acciones de revisión, aprobación y rechazo hasta validar la migración administrativa.
- Validar remotamente los endpoints de empleados y sus permisos `employees.read`.
- No habilitar creación, edición o desactivación de empleados sin reglas RLS y validación adicional.
