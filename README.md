# RRHH RAG Multiagente — Portal de Recursos Humanos de Café Volcán

Portal de RRHH con un asistente que responde sobre políticas internas (RAG sobre Google Drive), consulta los datos propios de cada colaborador y genera un reporte diario para el equipo de RRHH.

- **Agente orquestador:** capa de seguridad determinista, reglas de alta confianza y clasificador LLM → enruta a los agentes.
- **Agente de políticas (RAG):** E5 local + pgvector sobre los documentos publicados en Drive; responde solo con evidencia y cita documento, sección y enlace.
- **Agente de datos:** funciones SQL con RLS (saldo de vacaciones, próximo pago, evaluación, solicitudes, incapacidades).
- **Agente analista:** reporte diario con cifras 100 % SQL y un resumen ejecutivo redactado por el LLM y validado.
- **Frontend:** React + Vite + Tailwind; dashboard, reportes y documentos para RRHH; chat, políticas y solicitudes para todos.

El estado de cada sesión de trabajo, las decisiones y los pendientes están en [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Contenido

1. [Requisitos](#1-requisitos)
2. [Supabase: proyecto, migraciones y rol `rrhh_api`](#2-supabase-proyecto-migraciones-y-rol-rrhh_api)
3. [Datos de demostración (seed)](#3-datos-de-demostración-seed)
4. [Usuarios de prueba](#4-usuarios-de-prueba)
5. [Cuenta de servicio de Google Drive](#5-cuenta-de-servicio-de-google-drive)
6. [Variables de entorno](#6-variables-de-entorno)
7. [Levantar backend y frontend](#7-levantar-backend-y-frontend)
8. [Ingesta de políticas y reporte diario](#8-ingesta-de-políticas-y-reporte-diario)
9. [Tareas programadas (Windows)](#9-tareas-programadas-windows)
10. [Pruebas y evaluación](#10-pruebas-y-evaluación)
11. [Estructura del repositorio](#11-estructura-del-repositorio)

## 1. Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 24.x (probado con 24.13) | backend, frontend y scripts |
| npm | el que trae Node | dependencias |
| Proyecto de Supabase | Postgres 15+ con `pgvector` 0.8+ | base de datos, autenticación y RLS |
| Cuenta de DeepSeek | API key | LLM (`deepseek-flash`, sin razonamiento) |
| Cuenta de servicio de Google Cloud | Drive API y Sheets API habilitadas | lectura de las políticas |
| Windows 10/11 (opcional) | Programador de tareas | sincronización 02:00 y reporte 07:00 |
| RAM libre | ~1 GB | modelo de embeddings E5 local (`Xenova/multilingual-e5-base`) |

La primera ejecución descarga el modelo E5 (~280 MB) a la caché de `@huggingface/transformers`.

## 2. Supabase: proyecto, migraciones y rol `rrhh_api`

1. Crea un proyecto de Supabase **de pruebas** (el de este equipo es `bxtetlzjlgoezxcjhdrw`) y descarga su certificado CA (*Project Settings → Database → SSL*). Guárdalo fuera del repositorio.
2. Aplica **todas** las migraciones de `supabase/migrations/` en orden cronológico, por nombre de archivo, de `20261117170000_…` a `20261122100000_…`:
   - Con la CLI de Supabase: `supabase db push`.
   - O una por una con el script del backend, que aplica cada archivo en una sola transacción (todo o nada). Requiere el `.env` del harness, ver el paso 4:
     ```powershell
     cd backend
     node scripts/apply-migration.mjs ../supabase/migrations/<archivo>.sql
     ```
3. Verifica el estado con `supabase/manual_checks/20261119_migration_status_readonly.sql` en el SQL Editor (solo lectura). Todas las filas deben decir "aplicada".
4. **Rol `rrhh_api`.** La migración `20261118090000` crea el login restringido con el que se conecta Express. No trae contraseña.
   - Asígnale una contraseña desde un canal seguro, o rótala con `node backend/scripts/rotate-rrhh-api-password.mjs --confirm`. Este script usa la conexión de administración de `supabase/tests/rls/.env` y escribe `DATABASE_URL` en `backend/.env` sin imprimir la clave.
   - Usa el **Session pooler** (puerto 5432) con el usuario `rrhh_api.<project-ref>`.

> Regla del proyecto: las cifras y consultas de datos viven en funciones SQL (SECURITY INVOKER con RLS). El backend solo las invoca. La única escritura privilegiada pasa por funciones del esquema `app_private`, que solo puede ejecutar `rrhh_api`.

## 3. Datos de demostración (seed)

En el SQL Editor del proyecto **de pruebas**:

1. `supabase/seeds/demo_data.sql.example`: 6 departamentos, 54 colaboradores `DEMO-*`, saldos, solicitudes, incapacidades, movimientos, calendario de pagos 2026 y evaluaciones. Es idempotente y calcula las fechas relativas a "hoy" en hora de Costa Rica. Al final trae las consultas de verificación V1 (resumen comparable con el reporte diario) y V2 (debe devolver 0 filas).
2. *(Opcional)* `supabase/seeds/chat_logs_demo.sql.example`: consultas **sintéticas** al chatbot de los 30 días anteriores, marcadas con `prompt_version = 'demo-seed'`, para que el reporte y la tendencia tengan historial. Para borrarlas: `delete from public.chat_query_logs where prompt_version = 'demo-seed';`.

## 4. Usuarios de prueba

Créalos en *Supabase → Authentication → Users → Add user*, con contraseñas propias. **Las contraseñas no se guardan en el repositorio.** El seed vincula cada usuario con su colaborador por correo.

| Correo | Colaborador | Rol | Qué ve |
|---|---|---|---|
| `rls.employee.a@test.invalid` | RLS-TEST-EMP-A | `employee` | Chat IA, Políticas, Solicitudes |
| `rls.employee.b@test.invalid` | RLS-TEST-EMP-B | `employee` | Chat IA, Políticas, Solicitudes |
| `rls.hr@test.invalid` | DEMO-011 | `hr` | Además: Dashboard, Reportes, Documentos, Gestión de solicitudes |
| `rls.admin@test.invalid` | DEMO-002 | `admin` | Todo |
| correo de `RLS_TEST_AUDITOR_EMAIL` | — | `auditor` | Dashboard y Reportes (solo lectura) |

Para asignar roles, ejecuta una vez por usuario en el SQL Editor:

```sql
insert into public.user_roles (profile_id, role_id)
select u.id, r.id from auth.users u, public.roles r
where u.email = 'rls.hr@test.invalid' and r.code = 'hr'
on conflict do nothing;
```

Los correos de prueba también se configuran en `supabase/tests/rls/.env` (`RLS_TEST_*_EMAIL`). Los scripts de evaluación los usan para resolver las identidades sin contraseñas.

## 5. Cuenta de servicio de Google Drive

1. En Google Cloud, crea una cuenta de servicio (p. ej. `rrhh-drive-lector`) y habilita **Drive API** y **Sheets API**.
2. Descarga su llave JSON en una carpeta **fuera del repositorio** (p. ej. `C:\Users\<usuario>\credenciales\`).
3. En Google Drive, comparte la carpeta de políticas ("Políticas RRHH") con el correo de la cuenta de servicio, con rol **Lector**.
4. Copia el correo y la llave privada a `backend/.env` sin imprimirlos:
   ```powershell
   cd backend
   npm run configure:drive-env -- C:\Users\<usuario>\credenciales\llave.json
   ```
5. Pon el ID de la carpeta en `GOOGLE_DRIVE_FOLDER_ID` y comprueba el acceso con `npm run drive:list`. Debe listar los 11 documentos.

## 6. Variables de entorno

Copia los ejemplos y complétalos. Ningún `.env` se versiona.

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
Copy-Item supabase\tests\rls\.env.example supabase\tests\rls\.env
```

**`backend/.env`**

| Variable | Descripción |
|---|---|
| `PORT`, `FRONTEND_URL` | Puerto de Express (por defecto 3001) y origen permitido por CORS (p. ej. `http://localhost:5173`). |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | URL del proyecto y clave publicable (verificación de JWT y RPC con el token del usuario). |
| `DATABASE_URL`, `DATABASE_SSL_CA_FILE` | Conexión de `rrhh_api` por Session pooler y ruta al certificado CA. |
| `LLM_PROVIDER`, `EMBEDDINGS_PROVIDER` | `deepseek` y `local` (por defecto). Alternativas: `openai`, `gemini`. |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `DEEPSEEK_TIMEOUT_MS` | LLM. Modelo por defecto `deepseek-flash` y plazo de 6000 ms en el chat. |
| `DEEPSEEK_THINKING` | *(opcional)* `enabled` activa el razonamiento del modelo. Por defecto está desactivado para cumplir la latencia. |
| `RAG_SIMILARITY_THRESHOLD` | *(opcional)* Sobrescribe el umbral calibrado (0,828 para E5). |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_DRIVE_FOLDER_ID` | Cuenta de servicio y carpeta de Drive (ver §5). |
| `ENABLE_DOCUMENT_SYNC` | `true` habilita el botón "Sincronizar ahora" (`POST /api/admin/documents/sync`). |
| `RAG_INGEST_USER_ID` | *(opcional)* UUID del usuario RRHH que firma la ingesta y los reportes. Por defecto se usa `rls.hr`. |
| `OPENAI_*`, `GEMINI_*` | Solo si se usan esos proveedores. |

**`frontend/.env`**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL` (p. ej. `http://localhost:3001/api`) y `VITE_ENABLE_LEAVE_REQUEST_SUBMISSION`.

**`supabase/tests/rls/.env`**: conexión de administración al proyecto de pruebas (`RLS_TEST_PROJECT_REF`, `RLS_TEST_CONNECTION_MODE`, `RLS_TEST_DATABASE_URL`, `RLS_TEST_SSL_CA_FILE`) y los correos `RLS_TEST_*_EMAIL`. Los scripts la usan solo para leer identidades, aplicar migraciones y ejecutar pruebas con ROLLBACK. Ver [`supabase/tests/rls/README.md`](supabase/tests/rls/README.md).

## 7. Levantar backend y frontend

```powershell
# Terminal 1: API (http://localhost:3001)
cd backend
npm install
npm run dev

# Terminal 2: interfaz (http://localhost:5173)
cd frontend
npm install
npm run dev
```

- Comprueba la API con `GET http://localhost:3001/api/health`.
- Para producción: `npm start` en `backend` y `npm run build` en `frontend`; el resultado queda en `frontend/dist/`.
- Al entrar, un colaborador va al **Chat IA** y RRHH al **Dashboard**.

## 8. Ingesta de políticas y reporte diario

Todos los comandos se ejecutan en `backend/`.

| Comando | Qué hace |
|---|---|
| `npm run ingest:drive` | Ingesta completa desde Drive: fragmenta por sección, calcula embeddings, publica con el flujo editorial y archiva lo que ya no está. Es idempotente. |
| `npm run sync:drive` | Sincronización incremental (`changes.list`). Sin token guardado, hace la ingesta completa. |
| `npm run report:daily` | Genera y guarda el reporte de hoy, en hora de Costa Rica. Regenerar una fecha reemplaza el reporte. |
| `npm run report:daily -- --date=AAAA-MM-DD` | Genera el reporte de una fecha. |
| `npm run report:daily -- --backfill=30` | Genera los últimos 30 días (historial y tendencia del dashboard). |
| `npm run embeddings:rebuild` | Recalcula los vectores al cambiar de modelo; después hay que recalibrar con `npm run calibrate:threshold`. |

Orden sugerido en una instalación nueva: migraciones → seed → usuarios y roles → `drive:list` → `ingest:drive` → `report:daily -- --backfill=30`.

## 9. Tareas programadas (Windows)

Se registran sin permisos de administrador y quedan a nombre del usuario que tiene la sesión iniciada.

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\windows\register-sync-task.ps1    # RRHH-RAG sync-drive, 02:00 CR
powershell -ExecutionPolicy Bypass -File backend\scripts\windows\register-report-task.ps1  # RRHH-RAG report-daily, 07:00 CR

Get-ScheduledTask -TaskName 'RRHH-RAG*'                  # estado
Start-ScheduledTask -TaskName 'RRHH-RAG report-daily'    # probar ahora
Unregister-ScheduledTask -TaskName 'RRHH-RAG sync-drive' -Confirm:$false   # quitar
```

- Las bitácoras quedan en `backend/logs/` (`sync-drive-AAAA-MM-DD.log`, `report-daily-AAAA-MM-DD.log`) y se conservan 30 días.
- La hora de Costa Rica se convierte a la hora local del equipo al registrar la tarea.
- Si el equipo estuvo apagado varios días, corre `npm run report:daily -- --backfill=N`.

## 10. Pruebas y evaluación

| Comando | Dónde | Qué prueba |
|---|---|---|
| `npm test`, `npm run lint` | `backend/` | Pruebas unitarias y de contrato (sin red) y ESLint. |
| `npm test`, `npm run lint`, `npm run build` | `frontend/` | Lógica de presentación, ESLint y build. |
| `npm run test:report-integration` | `backend/` | Funciones del reporte contra la base real: V1, permisos (403/42501), idempotencia y auditor. Usa ROLLBACK. |
| `npm run test:data-integration` | `backend/` | Agente de datos contra la base real. |
| `node ../supabase/tests/rls/run-rls-tests.mjs` | `backend/` | Harness SQL de RLS (todo con ROLLBACK). |
| `node scripts/profile-latency.mjs` | `backend/` | Tiempo por etapa (clasificación, embedding, búsqueda, LLM, SQL, registro) de una consulta de política, una de datos y una mixta. |
| `npm run eval:bank` | `backend/` | Banco base de 25 preguntas con el orquestador real → `docs/evidencias/eval_banco_<fecha>.md`. |
| `npm run eval:bank -- --bank all --log` | `backend/` | Las 45 preguntas (25 del banco + 20 del equipo), guardadas en `chat_query_logs` → `docs/evidencias/hoja_evaluacion_45_<fecha>.md` y `.csv`, con aciertos, citas, latencia < 8 s, p90 y las preguntas 21, 22 y 23 aparte. |
| `node scripts/evidence-report-v1.mjs` | `backend/` | Compara el reporte diario guardado con V1 del seed → `docs/evidencias/reporte_diario_vs_v1_<fecha>.md`. |

La meta de latencia es que el 90 % de las consultas responda en menos de 8 s. Las evidencias de cada evaluación quedan en `docs/evidencias/`.

## 11. Estructura del repositorio

```text
backend/
  src/
    agents/        orquestador, clasificador, seguridad, agente de datos, agente analista y prompts versionados (.md)
    rag/           Drive, fragmentación, ingesta, sincronización, agente de políticas
    controllers/ routes/ repositories/ services/ middlewares/ validation/
  scripts/         CLI (ingesta, reporte, evaluación, integración, migraciones) y windows/ (tareas programadas)
  test/            pruebas con node --test
frontend/
  src/
    pages/ features/ (reports, documents, policies, chat, requests…) components/ api/
supabase/
  migrations/      esquema, RLS y funciones (aplicar en orden)
  seeds/           datos de demostración (*.sql.example)
  manual_checks/   consultas de verificación de solo lectura
  tests/rls/       harness de pruebas RLS
docs/
  HANDOFF.md       estado, decisiones y pendientes por sesión
  evidencias/      calibración, evaluaciones y validaciones
```
