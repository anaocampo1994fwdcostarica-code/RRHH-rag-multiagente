# Pendientes de validación final

## RAG e ingesta documental

- Revisar y aplicar manualmente `20261119100000_add_policy_rag_pgvector.sql` únicamente en Supabase de pruebas; confirmar `vector`, `document_chunks.section`, RLS y `match_policy_chunks`.
- Revisar y aplicar manualmente `20261119101000_add_document_editorial_review_states.sql`; validar la conversión de `active` a `in_review` y que el RPC exija documentos `published`.
- Configurar fuera de Git la cuenta de servicio Google Drive de solo lectura, una carpeta autorizada y `GEMINI_API_KEY`.
- Crear y revisar el flujo administrativo protegido por `documents.manage` que invoque la ingesta; no exponerla al chat ni a empleados.
- Validar con documentos ficticios autorizados la asociación de `policy_versions.source_document_version_id`, la recuperación y las citas de `POST /api/chat`.
- Mantener la sincronización diaria deshabilitada hasta completar la validación anterior.

## Solicitudes y empleados

- Aplicar y validar manualmente `20261119091000_guard_administrative_leave_request_transitions.sql` en el entorno Supabase de pruebas.
- Verificar RLS, trigger, historial y concurrencia de las transiciones administrativas con usuarios autorizados.
- Ejecutar la prueba manual de envío `draft → submitted` desde el navegador.
- Mantener deshabilitadas las acciones de revisión, aprobación y rechazo hasta validar la migración administrativa.
- Validar remotamente los endpoints de empleados y sus permisos `employees.read`.
- No habilitar creación, edición o desactivación de empleados sin reglas RLS y validación adicional.
