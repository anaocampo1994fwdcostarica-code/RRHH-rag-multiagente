# Pendientes de validación final

## Estado de migraciones aplicadas a mano

- Las migraciones aplicadas a mano desde el SQL Editor NO quedan registradas en `supabase_migrations.schema_migrations`; Supabase no sabe que existen. Su estado se verifica con `supabase/manual_checks/20261119_migration_status_readonly.sql` (solo lectura) antes y después de cada aplicación.
- La versión de `guard_employee_leave_request_submission` se identifica por la huella del código (sin comentarios ni espacios), no por sus comentarios: el proyecto de pruebas tenía la 090000 sin el comentario del repo. Detalle en `supabase/manual_checks/20261119_guard_function_diagnosis_readonly.sql`.
- En el proyecto de pruebas había 1 documento en `active` antes de la 101000 (pasa a `in_review` y no es visible para el RAG hasta publicarse).
- `20261119100000` y `20261119101000` no traen `begin/commit`: al pegarlas en el SQL Editor hay que envolverlas en una transacción explícita para que un error no deje la base a medias.

## RAG e ingesta documental

- Revisar y aplicar manualmente `20261119100000_add_policy_rag_pgvector.sql` únicamente en Supabase de pruebas; confirmar `vector`, `document_chunks.section`, RLS y `match_policy_chunks`.
- Revisar y aplicar manualmente `20261119101000_add_document_editorial_review_states.sql`; validar la conversión de `active` a `in_review` y que el RPC exija documentos `published`.
- Configurar fuera de Git la cuenta de servicio Google Drive de solo lectura, una carpeta autorizada y `GEMINI_API_KEY`.
- Crear y revisar el flujo administrativo protegido por `documents.manage` que invoque la ingesta; no exponerla al chat ni a empleados.
- Validar con documentos ficticios autorizados la asociación de `policy_versions.source_document_version_id`, la recuperación y las citas de `POST /api/chat`.
- Mantener la sincronización diaria deshabilitada hasta completar la validación anterior.

## Orquestador (sesión 1)

- El rol RRHH se resuelve con `has_permission('employees.read')`; confirmar que ese permiso solo lo tienen `hr`/`admin` en los datos reales.
- Conectar el agente de datos real (sesión 3) respetando el contrato `answer(auth, { question, scope })`; hoy es un stub.
- Enviar `conversationId` desde `ChatPage.jsx` (el backend lo devuelve en cada respuesta) y mostrar la oferta de escalar (`escalationOffered`).
- Medir con Gemini real el p90 de latencia (< 8 s) y la precisión del clasificador con el banco de 45 preguntas (sesión 7).

## Datos operativos y registro del chat (sesión 2)

- Revisar y aplicar manualmente `20261120090000_add_hr_operational_data.sql` en Supabase de pruebas (requiere `20261118090000` aplicada). Validada solo en un PostgreSQL 17 local con un shim de Supabase, no en Supabase.
- Aplicar `supabase/seeds/demo_data.sql.example` solo en pruebas y comparar V1 con el reporte diario; V2 (coherencia saldo vs. solicitudes) debe devolver 0 filas.
- Configurar `DATABASE_URL` (login `rrhh_api`) y `DATABASE_SSL_CA_FILE` en el backend: sin ellos el registro en `chat_query_logs` falla en silencio y el chat sigue respondiendo.
- Volver a ejecutar el harness RLS después del seed: los usuarios A y B ahora tienen solicitudes, saldos, una incapacidad y evaluaciones demo persistentes.
- `append_assistant_message` permite que un usuario agregue mensajes "assistant" a SUS propias conversaciones con su JWT; solo afecta su memoria, no datos ajenos ni el registro.
- Reglas obligatorias para el reporte diario y el agente de datos:
  - Hoy = `(now() at time zone 'America/Costa_Rica')::date`, nunca `current_date`.
  - Días de vacaciones = días hábiles lunes a viernes, inclusive, sin descontar feriados; periodo = año de `start_date`.
  - Pendiente "con más de 3 días" = `status in ('submitted','in_review') and submitted_at < now() - interval '3 days'`.

## Solicitudes y empleados

- Aplicar y validar manualmente `20261119091000_guard_administrative_leave_request_transitions.sql` en el entorno Supabase de pruebas.
- Verificar RLS, trigger, historial y concurrencia de las transiciones administrativas con usuarios autorizados.
- Ejecutar la prueba manual de envío `draft → submitted` desde el navegador.
- Mantener deshabilitadas las acciones de revisión, aprobación y rechazo hasta validar la migración administrativa.
- Validar remotamente los endpoints de empleados y sus permisos `employees.read`.
- No habilitar creación, edición o desactivación de empleados sin reglas RLS y validación adicional.
