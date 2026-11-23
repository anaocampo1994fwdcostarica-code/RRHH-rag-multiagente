# Integración Google Drive

## Componentes locales

`backend/src/rag/googleDriveClient.js` usa `googleapis` con una cuenta de servicio de solo lectura. El cliente es perezoso: no crea una sesión hasta que un proceso autorizado lo invoque. Solo lista archivos PDF, Google Docs y Google Sheets contenidos en `GOOGLE_DRIVE_FOLDER_ID`; no busca fuera de esa carpeta.

`documentExtractors.js` extrae PDF mediante `pdf-parse`, exporta Google Docs como texto y conserva cada pestaña de Sheets como una sección. `documentIngestionService.js` normaliza, calcula SHA-256, fragmenta, crea embeddings y delega la persistencia al repositorio Data API. `documentSyncService.js` no registra tareas programadas: solo sincroniza cuando un llamador autorizado lo invoca.

## Configuración requerida

Definir exclusivamente fuera de Git y del frontend:

- `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_DRIVE_FOLDER_ID`
- `GEMINI_API_KEY`

La cuenta de servicio debe tener acceso de lector únicamente a la carpeta autorizada. No debe usar cuentas personales ni permisos de escritura. La clave privada no se imprime, no se registra y no pertenece a `.env.example` con un valor real.

## Activación segura

1. Revisar y aplicar manualmente la migración local `20261119100000_add_policy_rag_pgvector.sql` en Supabase de pruebas.
2. Verificar manualmente la extensión `vector`, la columna `document_chunks.section`, RLS y `match_policy_chunks`.
3. Establecer las variables solo en el entorno del backend.
4. Crear un disparador administrativo protegido por `documents.manage`; la ingesta no debe exponerse a empleados ni al chat.
5. Ejecutar una sincronización de prueba con documentos ficticios autorizados y verificar las citas recuperadas.

## Límites actuales

No existe programador diario ni endpoint de ingesta expuesto. La asociación de una versión documental a `policy_versions.source_document_version_id` requiere el flujo administrativo de políticas correspondiente. Por tanto, cargar un documento no lo publica automáticamente como evidencia RAG.

El endpoint administrativo ya está preparado, pero devuelve una indisponibilidad controlada hasta que `ENABLE_DOCUMENT_SYNC=true` se configure después de las validaciones manuales. El endpoint no acepta IDs de carpeta ni credenciales desde HTTP.
