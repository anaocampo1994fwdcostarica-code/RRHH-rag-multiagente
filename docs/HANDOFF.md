# HANDOFF — Sesión 4: RAG con Google Drive

Actualizado: 2026-11-21 · Rama: `ana` · Proyecto Supabase de pruebas: `bxtetlzjlgoezxcjhdrw`

Este documento permite retomar el trabajo en un chat nuevo. Empieza por **Pendientes** (abajo).

## 1. Qué está hecho

| Paso | Estado | Evidencia |
|---|---|---|
| 0. Proveedores | DeepSeek (LLM) + E5 local (`Xenova/multilingual-e5-base`, 768 dim). OpenAI/Gemini sin clave en `.env`. | `npm run smoke:providers` |
| 1. Conexión con Drive | Solo lectura, recorre subcarpetas. 11 archivos legibles: 7 Docs, 3 PDF, 1 Sheets (en `Políticas RRHH/Café Volcán`). | `npm run drive:list` |
| 2. Ingesta | 11 documentos `published`, fragmentados por sección numerada sin partir tablas; metadatos de la tabla inicial; webViewLink real; publicación por funciones SQL firmada por `rls.hr` (DEMO-011). MAN-RH-07 y COD-RH-09 están en su versión 2 (sin pies de página del PDF). | `npm run ingest:drive`, `document_status_history` |
| 3. Umbral | **0,828** para E5: peor pregunta de política 0,848, bono por mascotas (23) 0,807, película (24) 0,768. Las 15 preguntas de política recuperan el documento correcto. | `docs/evidencias/calibracion_umbral_2026-11-21.md` |
| 4. Agente de políticas | Solo responde con fragmentos; `SIN_EVIDENCIA` → "no la encontré" + escalar a RRHH; ≥1 cita (documento, sección, enlace) construida desde los fragmentos; evidencia delimitada contra inyección. Prompt versionado **v1.1.0**. | `backend/src/agents/prompts/policyAgent.md`, `backend/src/rag/policyAgent.js` |
| 5. Sincronización diaria | `changes.list` con `startPageToken` en `drive_sync_state`; nuevos/editados se reindexan (versión nueva solo de ese documento); renombrados actualizan el título; eliminados o movidos fuera se **archivan**; cambio de carpeta → reconciliación completa. Cada ejecución en `document_sync_runs`. Tarea de Windows 02:00 (hora de Costa Rica). | `npm run sync:drive`, `backend/scripts/windows/` |
| 6. Seed | Alineado y **reaplicado**: pagos = hoja "Pagos 2026" de CAL-RH-05 (25 fechas; 28/08, 14/09, 13/11, aguinaldo 18/12); vacaciones 15 días por año cumplido y 1,25/mes el primer año; evaluaciones en la 2.ª quincena de junio y diciembre. V2 = 0 filas; harness SQL 18/18; `test:data-integration` 7/7. | `supabase/seeds/demo_data.sql.example` |
| 7. Evaluación | **Pendiente** (ver abajo). Borrador de 20 preguntas propias listo para revisión. | `backend/scripts/teamQuestions.js` |
| Revisión de código | Revisor: 1 crítico, 4 altos, 6 medios, 4 bajos. Corregidos en código y en la migración `20261121110000` (ver §5). | commit `49de410` y siguientes |

Pruebas: `npm test` 197/197 y `npm run lint` limpio en backend (2026-11-21).

## 2. Comandos (en `backend/`)

| Comando | Qué hace |
|---|---|
| `npm run configure:drive-env [ruta.json]` | Copia `client_email` y `private_key` de la llave de la cuenta de servicio a `backend/.env` sin imprimir la clave. Sin ruta, usa el único `.json` de `C:\Users\<usuario>\credenciales`. |
| `npm run drive:list` | Lista la carpeta y subcarpetas: nombre, tipo, fecha y si se puede leer. `EXPECTED_DRIVE_FILES=11` para exigir el total. |
| `npm run ingest:drive` | Ingesta completa: indexa, publica, archiva lo que ya no está y guarda el token. Idempotente. `--allow-mass-archive` solo si de verdad hay que archivar más del 30 %. |
| `npm run sync:drive` | Sincronización incremental (`changes.list`). Sin token guardado, hace la ingesta completa. |
| `npm run embeddings:rebuild [--only-stale]` | Recalcula los vectores de todas las versiones vigentes con el proveedor activo (al cambiar de modelo). Luego recalibrar. |
| `npm run calibrate:threshold` | Tabla de mejor puntaje por pregunta (1, 3–8, 10–16, 20, 23, 24) y umbral propuesto. Escribe `docs/evidencias/calibracion_umbral_2026-11-21.md`. |
| `npm run eval:bank` | Evalúa las 25 preguntas del banco con el orquestador real (solo lectura). |
| `npm run test:data-integration` | Integración del agente de datos contra el proyecto de pruebas. |
| `npm run test:rls-integration` | Integración RLS vía HTTP. **Requiere renovar tokens** en `backend/.env.integration` (ver Pendientes). |
| `node scripts/apply-migration.mjs ../supabase/migrations/<archivo>.sql` | Aplica UNA migración en el proyecto de pruebas, en una transacción (todo o nada). |
| `node ../supabase/tests/rls/run-rls-tests.mjs` | Harness SQL de RLS (18 pruebas, todo con ROLLBACK). |

Tarea programada (PowerShell, sin administrador):
- Registrar: `powershell -ExecutionPolicy Bypass -File backend\scripts\windows\register-sync-task.ps1`
- Probar ahora: `Start-ScheduledTask -TaskName 'RRHH-RAG sync:drive'` → bitácora en `backend/logs/sync-drive-AAAA-MM-DD.log` (30 días).
- Quitar: `Unregister-ScheduledTask -TaskName 'RRHH-RAG sync:drive' -Confirm:$false`

## 3. Decisiones tomadas

- **Proveedores:** DeepSeek como LLM y E5 local (`Xenova/multilingual-e5-base`, 768 dim) como embeddings. Cambiar de modelo obliga a `embeddings:rebuild` y a recalibrar.
- **Umbral de similitud:** 0,828 (punto medio entre 0,848 y 0,807), fijado en `DEFAULT_SIMILARITY_THRESHOLDS.local` (`backend/src/config/env.js`). Se puede sobrescribir con `RAG_SIMILARITY_THRESHOLD`.
- **Fuente de feriados y fechas de pago:** CAL-RH-05 (hojas "Feriados 2026" y "Pagos 2026") es la única fuente; el seed copia "Pagos 2026".
- **Drive:** cuenta de servicio `rrhh-drive-lector` (proyecto "My First Project"), rol Lector sobre la carpeta "Políticas RRHH"; Drive API y Sheets API habilitadas. Variables en `backend/.env`: `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY`.
- **Códigos:** se usan los de la tabla inicial de cada documento (POL-RH-05, PRO-RH-03, CAL-RH-05…), no los del nombre del archivo. El slug de `hr_policies` sale del código (`pol-rh-05`).
- **Formatos:** Google Docs se exportan a Markdown (conservan `#` y tablas); los PDF se leen con `pdf-parse` (se quitan los pies de página); cada fila de Sheets se convierte en texto ("Feriado: Navidad. Fecha: viernes 25 de diciembre de 2026. …").
- **Flujo editorial:** `pending → in_review → published` solo mediante funciones (`submit_document_for_review`, `publish_document_version`, `archive_document`, `reopen_document`); un trigger bloquea cualquier otro cambio de `document_status`; todo queda en `document_status_history` con `auth.uid()`.
- **Quién firma:** la ingesta y la sincronización se firman como el usuario RRHH de pruebas `rls.hr` (DEMO-011). Para otro usuario, definir `RAG_INGEST_USER_ID` (UUID).
- **Documento viejo en `in_review`** (`RLS Integration Conversation Fixture Document`): era un fixture de pruebas, no una política; se **archivó** con nota, firmado por `rls.hr`. Ninguna prueba lo usaba.
- **Archivar, no borrar:** lo que sale de la carpeta se archiva (deja de aparecer en el RAG) y se reabre si vuelve.
- **Tarea diaria:** Programador de tareas de Windows (no `node-cron` dentro de Express, que puede tener varias instancias).
- **Ruta `POST /admin/documents/sync`:** usa la misma sincronización incremental (sigue protegida por `ENABLE_DOCUMENT_SYNC=true` y `documents.manage`). Se eliminó el pipeline de ingesta anterior.

## 4. Migraciones aplicadas en el proyecto de pruebas

Aplicadas a mano (no figuran en `supabase_migrations.schema_migrations`). Verificar con `supabase/manual_checks/20261119_migration_status_readonly.sql` (todas en "aplicada" al 2026-11-21).

| Migración | Contenido |
|---|---|
| `20261119090000`, `20261119091000` | Envío de solicitudes por el colaborador y transiciones administrativas. |
| `20261119100000` | pgvector, `document_chunk_embeddings`, `match_policy_chunks`. |
| `20261119101000` | Estados editoriales `pending/in_review/published/archived/failed`. |
| `20261120090000`, `20261121090000` | Datos operativos de RRHH y funciones del agente de datos. |
| `20261121100000` | Metadatos de documento/versión/fragmento, `document_status_history`, `drive_sync_state`, métricas de `document_sync_runs`, índice HNSW, funciones editoriales, `match_policy_chunks` con código y webViewLink. |
| `20261121110000` | Correcciones de la revisión: trigger de estado, `reopen_document`, `start_document_sync_run` (una sincronización a la vez), bloqueo por documento al publicar, cambio de código archiva la política anterior, `hnsw.iterative_scan`. |

## 5. Pendientes

1. **Pruebas de sincronización en Drive (usuario).** Editar POL-05, renombrar POL-08 y mover POL-10 fuera de la carpeta; esperar 1–2 minutos y correr `npm run sync:drive`. Esperado: POL-RH-05 `updated` (policy_version 2), POL-RH-08 `renamed`, AVI-RH-10 `archived` ("Movido fuera de la carpeta…"). Luego devolver POL-10 a la carpeta, correr `sync:drive` y verificar que vuelve a `published` con `reopen_document` en el historial. Consultas: `select * from document_sync_runs order by started_at desc limit 1` y `select * from document_status_history order by changed_at desc limit 10`.
2. **`npm run eval:bank`** con las 25 preguntas del banco y el RAG activo (cerrar otros programas: E5 necesita ~1 GB de RAM y el equipo llegó a tener 370 MB libres). Reportar: % de intenciones, respuestas de política correctas y con cita, p90 de latencia y las preguntas 21, 22 y 23. Revisar que `eval-bank.mjs` ya no cuente "pendiente RAG" como neutro ahora que el RAG está activo.
3. **Revisar `backend/scripts/teamQuestions.js`** (borrador de 20 preguntas, números 26–45: 11 política, 4 datos personales, 2 mixtas, 2 restringidas, 1 fuera de alcance; 8 difíciles). Después, agregar a `eval-bank.mjs` una opción para incluirlas (por ejemplo `--bank team`) y correr las 45.
4. **Probar en el navegador** las preguntas 1, 7, 19, 20 y 23 con `rls.employee.a` (19 debe decir 10 días disponibles y que no se acumulan salvo la excepción de POL-RH-01 §6; 23 debe decir que no la encontró y ofrecer escalar). Correr también `npm test` y `npm run lint` en `frontend`.
5. **`test:rls-integration`:** los tokens de acceso de `backend/.env.integration` vencieron (401). Renovarlos y correrlo.
6. **Hallazgos de la revisión no resueltos (baja prioridad):**
   - La ingesta calcula los embeddings en serie (suficiente para 11 documentos; usar lotes si crece).
   - La guardia de `document_status` depende de `app.editorial_transition`; un cliente con SQL directo podría activarla (por la API REST de Supabase no es posible).
   - `apply-migration.mjs` no registra la versión en `schema_migrations` y las migraciones no son reaplicables (`create policy`/`create index` sin `if not exists`).
   - En `test:data-integration`, la pregunta 18 ("solicitud del viernes") ahora encuentra un borrador del fixture de integración RLS (26–28 de noviembre); la prueba pasa, pero conviene que el fixture no caiga en la ventana del seed.
7. **Push:** la rama `ana` está publicada en `origin` (GitHub). Falta abrir el PR cuando el equipo lo decida.

## 6. Archivos clave

- Ingesta y sincronización: `backend/src/rag/{googleDriveClient,policyChunker,policyExtractor,driveIngestion,driveSync,documentAdminService}.js`
- Agente: `backend/src/rag/policyAgent.js`, `backend/src/agents/prompts/policyAgent.md`
- Scripts: `backend/scripts/{configure-drive-env,list-drive,ingest-drive,sync-drive,rebuild-embeddings,calibrate-threshold,apply-migration}.mjs`, `backend/scripts/lib/`, `backend/scripts/windows/`
- Pruebas: `backend/test/{policyChunker,driveIngestion,driveSyncHardening,ragMigrationContract,ragChat}.test.js`
- Base de datos: `supabase/migrations/20261121100000_*.sql`, `supabase/migrations/20261121110000_*.sql`, `supabase/seeds/demo_data.sql.example`, `supabase/manual_checks/20261119_migration_status_readonly.sql`
