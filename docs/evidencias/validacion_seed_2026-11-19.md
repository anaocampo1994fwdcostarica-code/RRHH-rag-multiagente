# Validación de migraciones y seed demo — 2026-11-19

- Proyecto: Supabase de pruebas `rrhh-rag-multiagente-test` (PostgreSQL 17.12, base `postgres`).
- Conexión: session pooler con SSL verificado contra CA, configuración del harness RLS. No se registran datos de conexión en este documento.
- Fecha de referencia del seed: hoy en Costa Rica, `(now() at time zone 'America/Costa_Rica')::date` = 2026-11-19.
- Las consultas de verificación se ejecutaron dentro de `BEGIN READ ONLY … ROLLBACK`.

## Migraciones

| Paso | Migración | Resultado |
|---|---|---|
| 1 | 20261119090000_allow_employee_draft_submission | Ya aplicada (previa a esta sesión) |
| 2 | 20261119091000_guard_administrative_leave_request_transitions | Ya aplicada desde el SQL Editor; función idéntica al repo por huella de código |
| 3 | 20261119100000_add_policy_rag_pgvector | Ya aplicada desde el SQL Editor; verificados índice ivfflat `vector_cosine_ops`, EXECUTE solo `authenticated` + dueño, SECURITY DEFINER con search_path fijo |
| 4 | 20261119101000_add_document_editorial_review_states | Aplicada en esta sesión dentro de `begin … commit`. 1 documento `active` → `in_review` (sin políticas vinculadas) |
| 5 | 20261120090000_add_hr_operational_data | Aplicada en esta sesión. `authenticated` no puede ejecutar `log_chat_query` ni usar `app_private`; sin escritura directa en las 6 tablas; `anon` sin lectura |

Estado final (`supabase/manual_checks/20261119_migration_status_readonly.sql`): las 5 migraciones `aplicada`; función guarda `version 091000`.

## Seed demo (`supabase/seeds/demo_data.sql.example`, hasta `commit;`)

Ejecutado dos veces. Sin NOTICE (los 4 usuarios de prueba existían).

### V1 — Resumen (idéntico en la 1.ª y 2.ª ejecución)

| Métrica | Valor |
|---|---|
| colaboradores_demo_total | 56 |
| colaboradores_activos | 53 |
| departamentos_demo | 6 |
| ausentes_hoy_por_permiso_aprobado | 4 |
| incapacidades_activas_hoy | 4 |
| solicitudes_pendientes | 25 |
| solicitudes_pendientes_mas_de_3_dias | 18 |
| ingresos_del_mes | 3 |
| salidas_del_mes | 2 |
| personas_con_mas_de_20_dias_acumulados | 4 |
| proximo_pago | 2026-11-30 |
| movimientos_desde | 2026-08-19 |

### V2 — Coherencia saldo vs. solicitudes aprobadas

0 filas en ambas ejecuciones.

### Idempotencia — conteo de filas (idéntico antes y después de la 2.ª ejecución)

| employees | departments | positions | leave_types | leave_requests | status_history | vacation_balances | sick_leaves | personnel_movements | performance_reviews | payroll_calendar |
|---|---|---|---|---|---|---|---|---|---|---|
| 56 | 7 | 19 | 5 | 75 | 75 | 58 | 12 | 8 | 66 | 11 |

`leave_requests` incluye 73 solicitudes demo y 2 borradores previos de A y B (no marcados `[DEMO]`, no modificados).

### V3 — Solicitudes demo por estado

approved 26 · cancelled 7 · draft 7 · in_review 8 · rejected 8 · submitted 17.

### V6 — Usuarios de prueba vinculados

| Correo | Colaborador |
|---|---|
| rls.admin@test.invalid | DEMO-002 |
| rls.employee.a@test.invalid | RLS-TEST-EMP-A |
| rls.employee.b@test.invalid | RLS-TEST-EMP-B |
| rls.hr@test.invalid | DEMO-011 |

`rls.auditor@test.invalid` no se vincula (por diseño).

## Harness RLS (`supabase/tests/rls`, transacción con ROLLBACK)

### Primera ejecución (antes de adaptar el harness)

- 12 pruebas `passed`; la prueba `HR can read employees and manage request` falló con `Administrative leave request transition is not permitted.`
- Causa: el harness pasaba un fixture `draft` directo a `in_review` y modificaba `submitted_at`. La regla de la 20261119091000 es intencional (RRHH solo revisa solicitudes ya enviadas), así que se adaptó la prueba, no la migración. No estaba relacionada con el seed.

### Cambios en el harness

- El fixture de RRHH se crea en `submitted` con `submitted_at = now()` y la transición de RRHH cambia solo `status` a `in_review`.
- Prueba nueva `HR cannot move a draft request to in_review`: exige SQLSTATE `42501` y el mensaje exacto de la 091000.

### Ejecución final — reporte `rls-report-2026-11-19T19-21-31-321Z.json`

**18 aprobadas, 0 fallidas, `rollbackCompleted: true`.**

| # | Prueba | Evidencia |
|---|---|---|
| 0 | employee A reads own employee row | rowCount 1 |
| 1 | employee A cannot read employee B | rowCount 0 |
| 2 | employee A creates own draft request | rowCount 1 |
| 3 | employee A cannot modify employee B request | rowCount 0 |
| 4 | employee A cannot assign self admin role | 42501 |
| 5 | employee A has no access.manage permission | allowed false |
| 6 | employee A cannot read employee B conversation | rowCount 0 |
| 7 | employee A cannot read audit log | rowCount 0 |
| 8 | current_employee_id remains scoped to employee A | matched true |
| 9 | owns_conversation rejects foreign conversation | allowed false |
| 10 | employee A cannot invoke trigger function directly | 42501 |
| 11 | employee B reads only own employee row | own 1, foreign 0 |
| 12 | HR cannot move a draft request to in_review | 42501 + mensaje de la 091000 |
| 13 | HR can read employees and review a submitted request | employees 2, updated 1 |
| 14 | administrator can manage role assignments | inserted 1, deleted 1 |
| 15 | auditor reads audit but cannot modify employee | audit 1, updated 0 |
| 16 | anonymous user cannot read document chunks | 42501 |
| 17 | anonymous user cannot read audit log | 42501 |

## Pendiente

- Prueba del backend con `chat_query_logs` (requiere `DATABASE_URL` de `rrhh_api` y sesión en el frontend).
