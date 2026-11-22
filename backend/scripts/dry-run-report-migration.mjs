// Prueba en seco de la migración del reporte diario: la aplica dentro de una transacción, compara
// get_daily_report_metrics(hoy) con la consulta V1 del seed, prueba 42501 para un colaborador y hace ROLLBACK.
// Uso: node scripts/dry-run-report-migration.mjs [../supabase/migrations/20261122090000_add_daily_report_functions.sql]
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { connectHarnessAdmin, readHarnessEnv, userIdByEmail } from './lib/harnessAdmin.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const migrationFile = process.argv[2] ?? `${root}supabase/migrations/20261122090000_add_daily_report_functions.sql`
const migration = readFileSync(migrationFile, 'utf8').replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '')
const seed = readFileSync(`${root}supabase/seeds/demo_data.sql.example`, 'utf8')
const v1Sql = seed.slice(seed.indexOf('-- V1.'), seed.indexOf('-- V2.'))
if (!v1Sql.includes('with ctx')) throw new Error('No se encontró la consulta V1 en el seed.')

async function asClaims(client, userId) {
  await client.query('reset role')
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated' })])
  await client.query('set local role authenticated')
}

async function expect42501(client, label, sql) {
  await client.query('savepoint probe')
  try {
    await client.query(sql)
    await client.query('rollback to savepoint probe')
    return { label, ok: false, detail: 'no lanzó error' }
  } catch (error) {
    await client.query('rollback to savepoint probe')
    return { label, ok: error.code === '42501', detail: `${error.code} ${error.message}` }
  }
}

const env = readHarnessEnv()
const client = await connectHarnessAdmin()
let failed = false
try {
  const hrId = await userIdByEmail(client, env.RLS_TEST_HR_EMAIL)
  const employeeId = await userIdByEmail(client, env.RLS_TEST_EMPLOYEE_A_EMAIL)
  await client.query('begin')

  const { rows: [scope] } = await client.query(`select count(*)::int as total,
      count(*) filter (where employee_code like 'DEMO-%' or employee_code in ('RLS-TEST-EMP-A','RLS-TEST-EMP-B'))::int as seed
    from public.employees where deleted_at is null`)
  console.log(`Colaboradores (deleted_at nulo): ${scope.total}; del seed: ${scope.seed}`)
  if (scope.total !== 56 || scope.seed !== 56) { failed = true; console.log('ATENCIÓN: la base no tiene exactamente los 56 colaboradores del seed.') }

  await client.query(migration)
  const v1 = Object.fromEntries((await client.query(v1Sql)).rows.map((r) => [r.metric, r.value]))

  await asClaims(client, hrId)
  const { rows: [{ m, today }] } = await client.query("select public.get_daily_report_metrics() as m, (now() at time zone 'America/Costa_Rica')::date::text as today")
  const { rows: trend } = await client.query('select * from public.get_hr_trend_30d()')

  const pairs = [
    ['Ausentes hoy con permiso aprobado', m.absences.approved_leave_people, v1.ausentes_hoy_por_permiso_aprobado],
    ['Incapacidades activas hoy', m.sick_leaves.active, v1.incapacidades_activas_hoy],
    ['Solicitudes pendientes', m.requests.pending_total, v1.solicitudes_pendientes],
    ['Pendientes con más de 3 días', m.requests.pending_over_3_days, v1.solicitudes_pendientes_mas_de_3_dias],
    ['Ingresos del mes', m.turnover.hires_month, v1.ingresos_del_mes],
    ['Salidas del mes', m.turnover.exits_month, v1.salidas_del_mes],
    ['Personas con más de 20 días acumulados', m.vacation_over_20.count, v1.personas_con_mas_de_20_dias_acumulados],
  ]
  console.log(`\nFecha (Costa Rica): ${today}\n\n| Métrica | Reporte | V1 | ¿Coincide? |\n|---|---|---|---|`)
  for (const [label, report, expected] of pairs) {
    const same = String(report) === String(expected)
    if (!same) failed = true
    console.log(`| ${label} | ${report} | ${expected} | ${same ? 'Sí' : 'NO'} |`)
  }
  console.log(`\nOtras cifras: ausentes ${JSON.stringify(m.absences.by_type)} (total ${m.absences.total_people}); incapacidad días mes ${m.sick_leaves.accumulated_days_month}; rotación mes ${m.turnover.rate_pct_month} %, año ${m.turnover.rate_pct_ytd} % (salidas año ${m.turnover.exits_year}, plantilla ${m.turnover.headcount_year_start}→${m.turnover.headcount_end}); chat ${m.chatbot.date}: ${m.chatbot.total} consultas; tendencia ${trend.length} días.`)
  if (trend.length !== 30) failed = true

  await asClaims(client, employeeId)
  const denied = [
    await expect42501(client, 'get_daily_report_metrics', 'select public.get_daily_report_metrics()'),
    await expect42501(client, 'list_drive_documents', 'select * from public.list_drive_documents()'),
    await expect42501(client, 'get_hr_trend_30d', 'select * from public.get_hr_trend_30d()'),
    await expect42501(client, 'list_daily_reports', 'select * from public.list_daily_reports()'),
    await expect42501(client, 'save_daily_hr_report (authenticated)', `select app_private.save_daily_hr_report(current_date, '{}'::jsonb, 'x', '${employeeId}')`),
  ]
  console.log('\nColaborador (rls.employee.a):')
  for (const d of denied) { if (!d.ok) failed = true; console.log(`- ${d.label}: ${d.ok ? '42501 OK' : 'FALLO'} (${d.detail})`) }
} catch (error) {
  failed = true
  console.error(`Error: ${error.code ?? ''} ${error.message}`)
} finally {
  await client.query('rollback').catch(() => {})
  await client.end()
  console.log('\nROLLBACK hecho: no se aplicó nada.')
  console.log(failed ? 'RESULTADO: hay diferencias o fallos.' : 'RESULTADO: todo coincide.')
  process.exitCode = failed ? 1 : 0
}
