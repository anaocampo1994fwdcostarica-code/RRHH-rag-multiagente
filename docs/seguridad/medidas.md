# Auditoría y medidas de seguridad

## Sesión

La aplicación usa `Authorization: Bearer <access-token>` emitido por Supabase. El navegador no envía ese token automáticamente como una cookie, por lo que el CSRF clásico no aplica al flujo principal. Como defensa adicional de la asignación, el backend emite una cookie `csrf` con `SameSite=Strict` y el frontend la devuelve en `X-CSRF-Token` para métodos mutantes cuando existe un `Origin`.

## Endpoints

| Método | Ruta | Modifica datos | Permiso | Estado |
|---|---|---:|---|---|
| GET | `/health` | No | Ninguno | OK |
| GET | `/auth/me` | No | JWT | OK |
| POST | `/chat` | Sí: conversación/log | JWT | OK |
| GET | `/employees`, `/employees/:id` | No | `employees.read` | OK |
| GET | `/policies`, `/policies/:slug` | No | JWT; RLS solo publicadas | OK |
| GET | `/leave-types` | No | JWT | OK |
| GET | `/leave-requests`, `/leave-requests/:id` | No | JWT; RLS propias | OK |
| POST | `/leave-requests` | Sí | JWT; validación/RLS | OK |
| POST | `/leave-requests/:id/submit` | Sí | JWT; transición/RLS | OK |
| GET | `/admin/leave-requests`, `/admin/leave-requests/:id` | No | `requests.manage` | OK |
| GET | `/admin/documents`, `/admin/documents/sync/last` | No | `documents.manage` | OK |
| POST | `/admin/documents/sync` | Sí | `documents.manage` + flag | OK |
| GET | `/reports/daily`, `/reports/daily/history` | No | `reports.read` | OK |
| GET | `/auth/permissions/:permission` | No | JWT | OK |

## SQL

La capa de negocio usa consultas parametrizadas (`$1`, `$2`), funciones/RPC de Supabase y listas blancas. No se encontró `sql.raw` ni concatenación de valores de usuario en los repositorios de rutas. Las interpolaciones encontradas en scripts de integración se limitan a nombres de tablas/roles fijos de harness y no reciben entrada HTTP; deben seguir tratándose como código privilegiado y no exponerse como endpoint.

## XSS

- `react-markdown` se usa sin `rehype-raw`; el HTML crudo se representa como texto.
- Los enlaces Markdown aceptan únicamente `http:`, `https:` y `mailto:`; los enlaces de citas internas usan `#cita-*`.
- No se encontraron `innerHTML` ni `dangerouslySetInnerHTML` en `frontend/src`.
- Los enlaces de Drive pasan por validadores de URL antes de pintarse.
- Se añadió CSP en frontend y `helmet`/CSP en backend.

## CORS, cabeceras y cuerpo

- CORS usa `CORS_ORIGINS`, sin comodín, y limita las cabeceras a `Authorization`, `Content-Type` y `X-CSRF-Token`.
- `helmet` añade cabeceras de seguridad y `frame-ancestors 'none'`.
- El JSON del backend tiene límite de `256kb`.
- Los errores 5xx se devuelven con mensaje genérico; el detalle debe permanecer en logs del servidor.

## Hallazgos pendientes

- Falta ejecutar la prueba dinámica de CORS/CSRF contra el entorno levantado.
- El laboratorio SQLi y su migración no se aplican sin confirmación explícita.
- Debe revisarse la política CSP final con las URL reales de Supabase y API antes de producción.
