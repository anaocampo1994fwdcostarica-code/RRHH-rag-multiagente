# Matriz de permisos — Portal RRHH

**Fecha de elaboración:** 2026-11-23  
**Fuente:** migraciones de Supabase, middleware de autorización, rutas Express y documentación del proyecto.

## 1. Roles del sistema

| Rol | Descripción | Alcance general |
|---|---|---|
| `employee` | Colaborador | Consulta de políticas, chat y gestión de sus propias solicitudes/datos. |
| `hr` | Recursos Humanos | Operación de RRHH: empleados, solicitudes, políticas, documentos y reportes. |
| `admin` | Administrador | Todos los permisos definidos en el sistema. |
| `auditor` | Auditor | Lectura de reportes y auditoría. |

## 2. Matriz RBAC

**✓ = concedido por rol; — = no concedido.**

| Código de permiso | Descripción | employee | hr | admin | auditor |
|---|---|:---:|:---:|:---:|:---:|
| `employees.read` | Consultar empleados y datos operativos autorizados | — | ✓ | ✓ | — |
| `employees.manage` | Crear, modificar y administrar empleados, departamentos y puestos | — | ✓ | ✓ | — |
| `requests.manage` | Gestionar solicitudes de permisos/licencias y tipos de solicitud | — | ✓ | ✓ | — |
| `policies.manage` | Gestionar políticas y sus versiones/publicación editorial | — | ✓ | ✓ | — |
| `documents.manage` | Gestionar documentos, versiones, fragmentos y sincronizaciones de Drive | — | ✓ | ✓ | — |
| `reports.read` | Consultar reportes diarios e historial | — | ✓ | ✓ | ✓ |
| `reports.manage` | Gestionar reportes administrativos | — | ✓ | ✓ | — |
| `audit.read` | Consultar bitácora de auditoría | — | — | ✓ | ✓ |
| `access.manage` | Gestionar roles, asignaciones y permisos | — | — | ✓ | — |

El rol `employee` no recibe permisos administrativos en la tabla RBAC; su acceso personal se concede por reglas de pertenencia, principalmente `auth.uid()` y `current_employee_id()`.

## 3. Acceso funcional por módulo y endpoint

| Módulo / operación | Endpoint | Autenticación | Permiso explícito | Roles esperados |
|---|---|---|---|---|
| Estado del servicio | `GET /health` | No | Ninguno | Público |
| Sesión actual | `GET /auth/me` | JWT | Ninguno adicional | Todo usuario autenticado |
| Chat IA | `POST /chat` | JWT | Ninguno adicional | Todo usuario autenticado; los datos se filtran por identidad |
| Políticas publicadas | `GET /policies`, `GET /policies/:slug` | JWT | Ninguno adicional | Todo usuario autenticado |
| Mis solicitudes | `GET /leave-requests`, `GET /leave-requests/:id` | JWT | Ninguno adicional | El colaborador solo ve las propias; RRHH/admin pueden gestionar |
| Crear solicitud | `POST /leave-requests` | JWT | Ninguno adicional | Usuario autenticado; sujeto a validación y RLS |
| Enviar solicitud | `POST /leave-requests/:id/submit` | JWT | Ninguno adicional | Propietario de la solicitud; RRHH/admin según transición permitida |
| Tipos de solicitud | `GET /leave-types` | JWT | Ninguno adicional | Todo usuario autenticado |
| Empleados | `GET /employees`, `GET /employees/:id` | JWT | `employees.read` | `hr`, `admin` |
| Solicitudes administrativas | `GET /admin/leave-requests`, `GET /admin/leave-requests/:id` | JWT | `requests.manage` | `hr`, `admin` |
| Documentos administrativos | `GET /admin/documents`, `GET /admin/documents/sync/last` | JWT | `documents.manage` | `hr`, `admin` |
| Sincronizar documentos | `POST /admin/documents/sync` | JWT | `documents.manage` + función habilitada | `hr`, `admin` |
| Reporte diario | `GET /reports/daily` | JWT | `reports.read` | `hr`, `admin`, `auditor` |
| Historial de reportes | `GET /reports/daily/history` | JWT | `reports.read` | `hr`, `admin`, `auditor` |
| Consultar permiso | `GET /auth/permissions/:permission` | JWT | Ninguno adicional | Todo usuario autenticado; responde según sus permisos |

## 4. Reglas de alcance de datos

| Recurso | Colaborador | RRHH / administrador | Auditor |
|---|---|---|---|
| Perfil y empleado | Su propio perfil/registro | Lectura de empleados; administración según permiso | Sin acceso operativo de empleados |
| Saldos, incapacidades, evaluaciones y movimientos | Solo sus propios datos | Datos de empleados según RLS y funciones autorizadas | No por permiso de auditoría |
| Solicitudes | Solo las propias | Gestión administrativa y transiciones autorizadas | Sin acceso |
| Políticas | Solo publicadas y no archivadas | Gestión de catálogo, versiones y publicación | Solo mediante funciones/reporte si aplica; no `policies.manage` |
| Documentos fuente/RAG | No acceso directo a tablas documentales | Gestión mediante `documents.manage` | No acceso |
| Reportes diarios | No | Lectura y generación administrativa | Lectura |
| Bitácora de auditoría | No | Solo si también tiene `audit.read` | Lectura |
| Roles y permisos | No | No, salvo administrador | No |

## 5. Controles y observaciones

1. La autorización se implementa en dos capas: middleware Express (`requireAuth`/`requirePermission`) y políticas RLS/funciones de Supabase (`has_permission`, `current_employee_id`).
2. `admin` recibe todos los permisos actuales por la migración de autorización. Si se agregan permisos nuevos, debe revisarse la asignación del rol.
3. El rol `auditor` tiene lectura de reportes y auditoría, pero no recibe `employees.read`, `requests.manage` ni acceso documental.
4. El chat requiere autenticación, pero no un permiso administrativo. El agente de datos debe limitarse a los datos propios, mientras que las consultas agregadas requieren permisos de RRHH/reportes.
5. La sincronización documental tiene un control adicional: `ENABLE_DOCUMENT_SYNC` debe estar exactamente en `true`; además requiere `documents.manage`.
6. La publicación editorial de políticas/documentos requiere controles combinados de `documents.manage` y, cuando corresponde, `policies.manage`.
7. Los reportes son de solo lectura para la API. La generación/escritura se realiza por el proceso administrativo del backend y no por usuarios finales.
8. Esta matriz refleja el código y las migraciones del repositorio. Debe validarse contra las asignaciones reales de `user_roles` del proyecto Supabase antes de usarla como evidencia de producción.

## 6. Referencias técnicas

- `supabase/migrations/20261117170100_identity_and_authorization.sql`
- `supabase/migrations/20261117170700_rls_and_access_policies.sql`
- `backend/src/middlewares/requirePermission.js`
- `backend/src/routes/`
- `README.md`, sección de usuarios demo y roles
