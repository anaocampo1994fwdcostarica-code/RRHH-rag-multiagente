# HANDOFF — Sesión 5: agente analista y dashboard (incluye la sesión 4: RAG con Google Drive)

Actualizado: 2026-11-22 · Rama: `ana` · Proyecto Supabase de pruebas: `bxtetlzjlgoezxcjhdrw`

Este documento permite retomar el trabajo en un chat nuevo. Empieza por **Pendientes** (§5) y por **Sesión 5** (abajo).

## Sesión 5 — resumen (2026-11-22)

| Paso | Estado | Evidencia |
|---|---|---|
| Limpieza del repo | `frontend/node_modules` (6265 archivos) y `frontend/dist` fuera de git; `.gitignore` ya los excluía. | commit `ba488a2` |
| Migraciones | `20261122090000` (métricas, tendencia, lectura y guardado del reporte, catálogo de documentos) y `20261122100000` (catálogo de políticas y correcciones de la revisión). Las dos se probaron en seco contra V1 con ROLLBACK antes de aplicarse. | `backend/scripts/dry-run-report-migration.mjs` |
| Agente analista | Cifras 100 % SQL (`get_daily_report_metrics`, `get_hr_trend_30d`). Resumen de 3 a 5 frases por DeepSeek con prompt versionado **v1.1.0**. El validador rechaza cifras que no están en el JSON, números escritos con palabras, partes de fecha sueltas, enlaces y nombres; si rechaza, se usa una plantilla determinista. El LLM solo recibe agregados (sin personas ni preguntas). | `backend/src/agents/analystAgent.js`, `backend/src/agents/analyst/` |
| Guardado | `app_private.save_daily_hr_report` (SECURITY DEFINER, solo `rrhh_api`): upsert por fecha con bloqueo y auditoría en `admin_audit_log`. El autor debe tener `reports.read`, `employees.read` y `requests.manage`. Nadie más escribe `daily_hr_reports` (ni `authenticated` ni `service_role`). | `npm run test:report-integration` |
| Programación | `npm run report:daily` y tarea `RRHH-RAG report-daily` (07:00 CR), registrada y probada (código 0). Backfill de 30 días (24/10 a 22/11), regenerado tras las correcciones: 30/30 resúmenes redactados por la IA y validados (0 con plantilla). La tarea `RRHH-RAG sync-drive` (02:00) quedó registrada por primera vez: el nombre anterior con `:` no es válido en Windows. Probada con código 0. | `backend/logs/` |
| API | `GET /api/reports/daily?date=` (sin fecha: hoy o, si aún no existe, el último, con `isLatestFallback`) y `GET /api/reports/daily/history`, ambos con `reports.read`; un colaborador recibe 403. `GET /api/admin/documents`, `GET /api/admin/documents/sync/last` y `POST /api/admin/documents/sync` (409 si ya hay una en curso). `GET /api/policies` lee `list_published_policies()`. `/auth/permissions/reports.read` habilitado. | `backend/test/reportsEndpoints.test.js` |
| Frontend | Menú por permisos: colaborador ve Chat IA, Políticas y Solicitudes; RRHH además Dashboard, Reportes y Documentos. Empleados y Configuración salen del menú por decisión del usuario. `/` lleva a `/dashboard` o `/chat`. El Dashboard solo lee `daily_hr_reports`: 5 KPI, tendencia de 30 días, ausencias por departamento, pendientes, resumen, temas e historial. Reportes, Documentos y Políticas muestran datos reales. Sin etiquetas de demo (verificado con grep). Gráficos con recharts 3.11.0. | `frontend/src/pages/DashboardPage.jsx`, `frontend/src/features/{reports,documents,policies}` |
| Validación | El reporte de hoy coincide con V1 en las 7 métricas comparables. | `docs/evidencias/reporte_diario_vs_v1_2026-11-22.md` |
| Revisión | Revisor: 0 críticos, 3 altos, 9 medios y 8 bajos. Corregidos los altos y medios, salvo "Empleados" en el menú (pedido del usuario). Lo menor queda en §5. | este HANDOFF |

**Latencia y evaluación completa (2026-11-22, al cierre de la sesión 5):**

| Indicador | Valor |
|---|---|
| Latencia | p90 bajó de 14,6 s a **5,2 s**; **100 %** de las consultas en menos de 8 s (antes 23 %). |
| Medición por etapa | `docs/evidencias/latencia_etapas_2026-11-22.md` (`node scripts/profile-latency.mjs`) |
| Hoja de 45 preguntas | 25 del banco + 20 del equipo, corrida con `--log`: aciertos **45/46** (97,8 %), con cita 96,6 %. |
| Archivos de la hoja | `docs/evidencias/hoja_evaluacion_45_2026-11-22.md` y `.csv` |
| Única falla | La 14 ("¿Qué incluye **mi** liquidación…?"): el LLM la clasifica como mixta. |
| 21, 22 y 23 | 21 y 22 se niegan sin agente; la 23 dice que no la encontró y ofrece escalar. |

Qué se cambió para la latencia:
- DeepSeek corre sin razonamiento (`thinking: disabled`) y con `max_tokens` por llamada.
- La transacción RLS se prepara en una sola ida a la base.
- La clasificación corre en paralelo con la verificación de permisos.
- Reglas de alta confianza evitan el LLM clasificador en preguntas claras.
- El guardado del registro y de la memoria no bloquea la respuesta.

Las consultas de hoy en `chat_query_logs` incluyen 2 corridas de la evaluación (92 filas reales). El README se reescribió como guía de instalación completa.

**Ajustes finales (2026-11-22):**
- **Prompt del orquestador v1.1.0.** Regla 5: una pregunta hipotética o sobre qué aplica a la persona ("si me despiden", "si renuncio", "qué me corresponde") es de política aunque use "mi" o "me", salvo que pida un dato guardado.
- **Prueba en vivo del clasificador.** `node scripts/check-classifier-hypotheticals.mjs` usa frases que no están en el banco: 6/6.
- **Hoja de 45 preguntas.** Con la regla nueva da **46/46 (100 %)**, 96,6 % con cita, 100 % por debajo de 8 s y p90 de 5,0 s. La hoja anterior se conserva como `hoja_evaluacion_45_2026-11-22_antes.md` y `.csv` (45/46; fallaba la 14).
- **Citas.** El agente de políticas renumera los `[n]` del texto para que coincidan con la lista de citas sin duplicados.
- **Chat.**
  - Markdown seguro con `react-markdown` y `remark-gfm`, sin HTML crudo.
  - Estado de evidencia en español.
  - Citas numeradas, con chips `[n]` que enlazan a cada cita y "Ver en Drive" por cita.
  - Sin el buscador "Búsqueda próximamente".
  - Los motivos de Solicitudes se muestran sin el prefijo `[DEMO]`.
- **Pendiente conocido.** El borrador "RLS integration fixture for RLS-TEST-EMP-B" (2099-01-15) se conserva porque lo usa el harness RLS. Solo lo ve `rls.employee.b`.
- **Latencia real desde el navegador.** Se mide con `supabase/manual_checks/20261122_chat_latency_today_readonly.sql`. Hay que cambiar el correo y la hora de inicio para excluir las corridas de `eval:bank`.

**Métrica "con cita" y sensibilidad al proveedor (2026-11-22):**
- "Con cita" se calcula ahora sobre las respuestas **respaldadas por documentos** (agente de políticas con estado `supported` o `partial`). Se excluyen las de "no encontré" (23 y 45), que no citan por diseño.
- Corrida oficial: **28/28 (100 %)**. Ninguna respuesta respaldada sale sin cita.
- Una corrida de control hacia las 00:00 UTC, con DeepSeek tardando ~3 s por llamada, dio 43/46, 87 % por debajo de 8 s y p90 de 8,4 s (`hoja_evaluacion_45_2026-11-22_deepseek_lento.md`).
- **Causa:** el clasificador corta a los 3,5 s y cae al respaldo por reglas. Ese respaldo clasifica como fuera de alcance preguntas sin palabras clave de RRHH ("ascender"). Ocurrió en la 32 y la 39; la 37 se clasificó como política.
- **Pendiente:** dar más margen o un reintento al clasificador y ampliar el vocabulario del respaldo. Hay que medirlo en horario pico.

**Riesgo de latencia del proveedor (2026-11-22, noche):**

Cambios:
- **Respaldo del clasificador.** Si el LLM no responde a tiempo y la capa de seguridad no bloqueó la pregunta, el respaldo:
  - reconoce un dato propio (incluye giros como "¿me aprobaron…?" o "¿tengo alguna … registrada?");
  - solo clasifica como `out_of_scope` lo inequívoco (películas, deportes, recetas…);
  - envía todo lo demás al agente de políticas, que dice "no encontré" y ofrece escalar.
  - Se amplió el vocabulario de RRHH: ascenso, carrera, evaluación, capacitación, beca, despido, renuncia, liquidación, etc.
- **Búsqueda especulativa.** El embedding y la búsqueda vectorial de la pregunta original corren en paralelo con la clasificación, solo sin historial y si la capa de seguridad no la niega.
  - Se reutilizan para política y mixtas.
  - Si no encontraron nada y el clasificador reformuló la consulta, se busca de nuevo con la reformulación.
  - Si la intención es otra, se descartan sin enviar ni registrar nada.
- **Presupuesto de 7 s por consulta** (`CHAT_BUDGET_MS`). El clasificador recibe el tiempo restante menos 2,5 s de reserva; la selección de herramienta y la redacción, el tiempo restante.
  - Si se agota, o el proveedor falla al redactar, se responde con la sección más relacionada y su cita ("No alcancé a redactar la respuesta…", estado `partial`) y se ofrece escalar.
  - Nunca se devuelve un error genérico.
- **Pruebas** (`backend/test/latencyBudget.test.js`, tiempo real):
  - Con un LLM de 3 s por llamada, la 32, la 37 y la 39 se clasifican bien.
  - Con un LLM que no responde, la 32 cae en políticas con cita y la 37 y la 39 en datos.
  - La 21, la 22 y la 24 siguen igual en ambos casos.
  - Todas las consultas terminan dentro del presupuesto.

Corridas de `--bank all --log` (las hojas están en `docs/evidencias/hoja_evaluacion_45_2026-11-22_presupuesto_N.md/.csv`):

| Corrida | Hora (UTC) | Código | Aciertos | Con cita | < 8 s | p90 | Fallas |
|---|---|---|---|---|---|---|---|
| 1 | 00:33 | especulativa sin reintento | 44/46 | 100 % | 100 % | 3,8 s | 28 y 32: la pregunta original no supera el umbral → "no encontré" |
| 2 | 01:05 | ídem | 43/46 | 100 % | 97,8 % | 5,0 s | 1: error genérico (plazo interno de DeepSeek); 28 y 32 como en la 1 |
| 3 | 01:09 | con reintento y sin error genérico | 43/46 | 100 % | **100 %** | 4,1 s | 1 y 6: presupuesto agotado → sección con cita (`partial`); 28 |
| 4 | 01:12 | ídem | 43/46 | 100 % | **100 %** | 4,6 s | 1 y 5: presupuesto agotado → `partial`; 28 |

Las corridas 1 y 2 encontraron los dos defectos que se corrigieron antes de la 3: la falta de reintento con la reformulación y el error genérico ante el plazo del proveedor. En la 3 y la 4 todas las consultas responden en menos de 8 s.

Las fallas restantes son de dos tipos:
- **Llamadas lentas del proveedor** (unos 7–7,9 s de extremo a extremo) que el presupuesto corta. Se entrega la sección correcta con su cita, pero sin redactar.
- **La 28** ("Me caso en febrero…"). La corrida oficial de la tarde, sin presupuesto, daba 46/46.

**Pendiente a decidir:** subir el presupuesto a ~7,5 s, que sigue dentro de los 8 s. Las respuestas lentas terminarían de redactarse, a costa de menos margen para la red. La 28 hay que investigarla con el detalle de la clasificación.

**Datos del chat:** las consultas de `chat_query_logs` **anteriores al 2026-11-22 son sintéticas** (`supabase/seeds/chat_logs_demo.sql.example`, `prompt_version = 'demo-seed'`, prefijo `[DEMO]`). **Desde el 2026-11-22 son reales** (chat y `npm run eval:bank -- --log`). Para borrar las sintéticas: `delete from public.chat_query_logs where prompt_version = 'demo-seed';` y luego `npm run report:daily -- --backfill=30`.

Pruebas al cierre:
- Backend: `npm test` 249/249 y lint limpio.
- Integración: `test:report-integration` 11/11.
- Frontend: `npm test` 35/35, lint limpio y build correcto.

## 1. Qué está hecho (sesión 4)

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
| `npm run report:daily [-- --date=AAAA-MM-DD \| --backfill[=30]]` | Genera y guarda el reporte diario (por defecto, hoy en hora CR). Regenerar una fecha la reemplaza. Imprime `WARN` si el resumen cayó a la plantilla. Lo firma `RAG_INGEST_USER_ID` o `rls.hr`. |
| `npm run test:report-integration` | Integración real del reporte: V1, tendencia, 403/42501, idempotencia, auditor y políticas. Usa ROLLBACK; el reporte de prueba 2001-01-01 se borra al final. |
| `node scripts/dry-run-report-migration.mjs [migración]` | Aplica una migración en una transacción, compara con V1 y prueba los 42501. Siempre termina en ROLLBACK. |
| `node scripts/evidence-report-v1.mjs` | Escribe `docs/evidencias/reporte_diario_vs_v1_<fecha>.md` (reporte guardado vs. V1, sin datos personales). |
| `npm run eval:bank -- --log` | Igual que `eval:bank`, pero guarda cada consulta en `chat_query_logs` (datos reales para el reporte). |
| `npm run embeddings:rebuild [--only-stale]` | Recalcula los vectores de todas las versiones vigentes con el proveedor activo (al cambiar de modelo). Luego recalibrar. |
| `npm run calibrate:threshold` | Tabla de mejor puntaje por pregunta (1, 3–8, 10–16, 20, 23, 24) y umbral propuesto. Escribe `docs/evidencias/calibracion_umbral_2026-11-21.md`. |
| `npm run eval:bank` | Evalúa las 25 preguntas del banco con el orquestador real (solo lectura). |
| `npm run test:data-integration` | Integración del agente de datos contra el proyecto de pruebas. |
| `npm run test:rls-integration` | Integración RLS vía HTTP. **Requiere renovar tokens** en `backend/.env.integration` (ver Pendientes). |
| `node scripts/apply-migration.mjs ../supabase/migrations/<archivo>.sql` | Aplica UNA migración en el proyecto de pruebas, en una transacción (todo o nada). |
| `node ../supabase/tests/rls/run-rls-tests.mjs` | Harness SQL de RLS (18 pruebas, todo con ROLLBACK). |

Tareas programadas (PowerShell, sin administrador). Para ver su estado: `Get-ScheduledTask -TaskName 'RRHH-RAG*'`.

Reporte diario, 07:00 (`RRHH-RAG report-daily`):
- Registrar: `powershell -ExecutionPolicy Bypass -File backend\scripts\windows\register-report-task.ps1`
- Probar ahora: `Start-ScheduledTask -TaskName 'RRHH-RAG report-daily'` → bitácora en `backend/logs/report-daily-AAAA-MM-DD.log`.

Sincronización de Drive, 02:00 (`RRHH-RAG sync-drive`):
- Registrar: `powershell -ExecutionPolicy Bypass -File backend\scripts\windows\register-sync-task.ps1`
- Probar ahora: `Start-ScheduledTask -TaskName 'RRHH-RAG sync-drive'` → bitácora en `backend/logs/sync-drive-AAAA-MM-DD.log` (30 días).
- Quitar: `Unregister-ScheduledTask -TaskName 'RRHH-RAG sync-drive' -Confirm:$false`

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
| `20261122090000` | Sesión 5: `get_daily_report_metrics`, `get_hr_trend_30d`, `get_daily_report`, `list_daily_reports`, `app_private.save_daily_hr_report`, `list_drive_documents` y `get_last_document_sync_run`. `daily_hr_reports` queda sin escritura directa. |
| `20261122100000` | Sesión 5: `list_published_policies` (SECURITY DEFINER, solo metadatos de políticas publicadas) y correcciones de la revisión: permisos para generar, UUID estricto, conteos por persona, tendencia con el día en curso en null y sin escritura de `service_role`. |
| `20261121110000` | Correcciones de la revisión: trigger de estado, `reopen_document`, `start_document_sync_run` (una sincronización a la vez), bloqueo por documento al publicar, cambio de código archiva la política anterior, `hnsw.iterative_scan`. |

## 5. Pendientes

**Sesión 5**
1. **Prueba de navegador completada por el usuario** con `rls.employee.a` y `rls.hr`. Falta conservar las capturas de aceptación en `docs/evidencias/capturas/` según su README.
2. Ejecutar `npm run eval:bank -- --bank all --log` con acceso a Supabase/DeepSeek; la corrida del 2026-11-22 quedó bloqueada por `connect EACCES` al puerto 5432. El paquete reproducible está en `docs/evidencias/paquete_evidencia_2026-11-22.md`.
3. Hallazgos menores de la revisión sin corregir:
   - `p_generated_by` lo aporta `rrhh_api`; es el borde de confianza, igual que en `log_chat_query`.
   - Las tareas corren con la sesión del usuario (sin principal ni `-WakeToRun`). `StartWhenAvailable` solo recupera el día actual: si el equipo estuvo apagado varios días, correr `--backfill=N`.
   - La hora local de las tareas se calcula al registrarlas. Si el equipo cambia de zona horaria o de horario de verano, hay que registrarlas otra vez.
   - La integración y la prueba en seco exigen exactamente 56 colaboradores.
   - El bundle del frontend pesa 1 MB (sin code-splitting).
4. Criterios que hay que conocer:
   - "Más de 3 días" usa 72 h exactas (criterio de V1).
   - Los pendientes de fechas pasadas son aproximados y lo indica `meta.basis`.
   - Los resúmenes de días pasados no dicen "hoy".

**Sesión 4**
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

- Sesión 5 — base de datos: `supabase/migrations/20261122090000_add_daily_report_functions.sql`, `supabase/migrations/20261122100000_policies_catalog_and_report_fixes.sql`, `supabase/seeds/chat_logs_demo.sql.example`
- Sesión 5 — backend: `backend/src/agents/{analystAgent.js,analyst/,prompts/analystAgent.md}`, `backend/src/{repositories/dailyReportRepository,services/dailyReportService,controllers/reportsController,routes/reportsRoutes,validation/reports}.js`, `backend/scripts/{daily-report,run-report-integration,dry-run-report-migration,evidence-report-v1}.mjs`, `backend/scripts/windows/{register-report-task,run-daily-report}.ps1`
- Sesión 5 — frontend: `frontend/src/pages/DashboardPage.jsx`, `frontend/src/features/reports/`, `frontend/src/features/documents/`, `frontend/src/features/policies/`, `frontend/src/components/{AccessDenied,PermissionGate,StatusBlocks}.jsx`, `frontend/src/components/layout/Sidebar.jsx`

- Ingesta y sincronización: `backend/src/rag/{googleDriveClient,policyChunker,policyExtractor,driveIngestion,driveSync,documentAdminService}.js`
- Agente: `backend/src/rag/policyAgent.js`, `backend/src/agents/prompts/policyAgent.md`
- Scripts: `backend/scripts/{configure-drive-env,list-drive,ingest-drive,sync-drive,rebuild-embeddings,calibrate-threshold,apply-migration}.mjs`, `backend/scripts/lib/`, `backend/scripts/windows/`
- Pruebas: `backend/test/{policyChunker,driveIngestion,driveSyncHardening,ragMigrationContract,ragChat}.test.js`
- Base de datos: `supabase/migrations/20261121100000_*.sql`, `supabase/migrations/20261121110000_*.sql`, `supabase/seeds/demo_data.sql.example`, `supabase/manual_checks/20261119_migration_status_readonly.sql`

## Decisiones sesión 5

Aprobadas por el usuario el 2026-11-22 (agente analista, dashboard, reportes y documentos).

| # | Tema | Opción elegida | Por qué |
|---|---|---|---|
| 1 | Backfill de 30 días con métricas no reconstruibles | Se generan los 30 días. Ausencias, incapacidades, movimientos, chat y tendencia se reconstruyen por fechas; las solicitudes pendientes se **aproximan** (`submitted_at` antes del cierre del día y `resolved_at` nulo o posterior); los saldos de vacaciones (>20 días) son una **foto actual**. Cada bloque lo declara en `metrics.meta.basis` (`historica` / `aproximada` / `foto_actual`) y el dashboard lo indica. | `vacation_balances` solo guarda el saldo vigente, y el historial de estados del seed lleva la fecha de carga, no la real. Marcar la base evita presentar como histórico algo que no lo es, sin renunciar a la tendencia. |
| 2 | Rotación | **Acumulada del año** (1-ene a la fecha) y **del mes**: salidas del periodo / ((plantilla al inicio del periodo + plantilla al día del reporte) / 2) × 100, a 1 decimal. Plantilla = `hired_on`/`ended_on`; salidas = `personnel_movements` tipo `salida`. | Es la fórmula estándar de rotación de salidas sobre plantilla promedio; "acumulada" en el enunciado se interpreta como año calendario hasta la fecha. Se calcula en SQL y la fórmula viaja en `turnover.formula`. |
| 3 | `chat_query_logs` sin datos | Se siembran **consultas sintéticas** de los últimos 30 días en un seed aparte, marcadas como demo. | Sin datos, los bloques 6 y 7 y la tendencia de consultas saldrían en 0 y no se podrían demostrar ni validar. |
| 4 | Top 5 de temas | Por **documento citado** (`cited_documents` → código del documento), más desglose por `intent`. Las preguntas no respondidas (`intent` policy/mixed y `resolved = false`) se muestran recortadas a 200 caracteres, solo a `reports.read`, y **nunca se envían al LLM**. | `chat_query_logs` no tiene columna de tema; el documento citado es objetivo y 100 % SQL (sin clasificación por LLM). Las preguntas pueden contener datos personales. |
| 5 | Rol auditor | Ve **Dashboard y Reportes** (tiene `reports.read`), **no Documentos** (no tiene `documents.manage`). | El menú y la API se rigen por permisos, no por nombre de rol; el auditor necesita leer reportes para su función. |
| 6 | Gráficos | **`recharts`**. | Librería React madura, responsiva y accesible; evita mantener gráficos SVG a mano. |
| 7 | Colaborador en `/` | `/` redirige a `/chat` sin `reports.read` y a `/dashboard` con él; `/dashboard` y `/reportes` escritos a mano muestran "Acceso restringido" y la API responde 403. | El colaborador no tiene dashboard; aterrizar en el chat es su caso de uso principal. |
| 8 | Tarea de las 07:00 y firma | La tarea genera **solo el día de hoy**; el backfill de 30 días se corre a mano una vez (`--backfill=30`). Firma `rls.hr` (DEMO-011) o `RAG_INGEST_USER_ID`. | A las 07:00 el chat del día anterior ya está completo; regenerar 30 días cada mañana sería costo de LLM sin beneficio. Misma identidad que la ingesta. |
| 9 | Solicitudes para RRHH | "Gestión de solicitudes" queda como subentrada de Solicitudes. | Decisión del usuario. |
| 10 | Escritura de `daily_hr_reports` | Solo `app_private.save_daily_hr_report` (SECURITY DEFINER, ejecutable solo por `rrhh_api`); se retiran `insert/update/delete` de `authenticated` y la política `reports_manage_staff`. Regenerar una fecha reemplaza el reporte (upsert por `report_date`) y queda en `admin_audit_log`. | Requisito del enunciado; ningún usuario puede alterar un reporte por la API REST. |
