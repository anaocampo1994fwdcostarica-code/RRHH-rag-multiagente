// npm run test:report-integration — integración REAL de las funciones del reporte diario contra el
// proyecto de PRUEBAS. Todo corre en una transacción con ROLLBACK, salvo el guardado como rrhh_api
// (fecha de prueba 2001-01-01), que se verifica y se borra al final: no deja rastro.
// Verifica: cifras de hoy = V1 del seed, tendencia de 30 días, permisos (42501) para un colaborador,
// que authenticated no puede escribir daily_hr_reports, idempotencia del guardado (rrhh_api) y que el
// autor debe tener reports.read.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import '../src/config/env.js'
import { getPostgresPool } from '../src/services/postgresPool.js'
import { connectHarnessAdmin, readHarnessEnv, userIdByEmail } from './lib/harnessAdmin.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const seed = readFileSync(`${root}supabase/seeds/demo_data.sql.example`, 'utf8')
const v1Sql = seed.slice(seed.indexOf('-- V1.'), seed.indexOf('-- V2.'))

const env = readHarnessEnv()
const client = await connectHarnessAdmin()
const results = []
let savedTestReport = null
async function check(name, fn) {
  await client.query('savepoint t')
  try {
    await fn()
    results.push([name, true])
  } catch (error) {
    results.push([name, false, error.message])
  } finally {
    await client.query('rollback to savepoint t')
    await client.query('reset role')
  }
}
async function as(userId) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated' })])
  await client.query('set local role authenticated')
}
async function expectCode(code, sql, values = []) {
  await client.query('savepoint e')
  try {
    await client.query(sql, values)
  } catch (error) {
    await client.query('rollback to savepoint e')
    assert.equal(error.code, code, error.message)
    return
  }
  throw new Error(`Se esperaba ${code} y no hubo error: ${sql}`)
}

try {
  const hr = await userIdByEmail(client, env.RLS_TEST_HR_EMAIL)
  const employee = await userIdByEmail(client, env.RLS_TEST_EMPLOYEE_A_EMAIL)
  await client.query('begin')

  await check('la base tiene solo los 56 colaboradores del seed', async () => {
    const { rows: [r] } = await client.query(`select count(*)::int total, count(*) filter (where employee_code like 'DEMO-%' or employee_code like 'RLS-TEST-EMP-%')::int seed
      from public.employees where deleted_at is null`)
    assert.deepEqual(r, { total: 56, seed: 56 })
  })

  await check('get_daily_report_metrics(hoy) coincide con V1', async () => {
    const v1 = Object.fromEntries((await client.query(v1Sql)).rows.map((r) => [r.metric, Number(r.value)]))
    await as(hr)
    const { rows: [{ m }] } = await client.query('select public.get_daily_report_metrics() as m')
    assert.equal(m.absences.approved_leave_people, v1.ausentes_hoy_por_permiso_aprobado)
    assert.equal(m.sick_leaves.active, v1.incapacidades_activas_hoy)
    assert.equal(m.requests.pending_total, v1.solicitudes_pendientes)
    assert.equal(m.requests.pending_over_3_days, v1.solicitudes_pendientes_mas_de_3_dias)
    assert.equal(m.turnover.hires_month, v1.ingresos_del_mes)
    assert.equal(m.turnover.exits_month, v1.salidas_del_mes)
    assert.equal(m.vacation_over_20.count, v1.personas_con_mas_de_20_dias_acumulados)
    assert.equal(typeof m.turnover.formula, 'string')
  })

  await check('fechas pasadas funcionan y las futuras dan 22023', async () => {
    await as(hr)
    const { rows: [{ m }] } = await client.query("select public.get_daily_report_metrics(((now() at time zone 'America/Costa_Rica')::date - 10)) as m")
    assert.equal(m.meta.basis.requests, 'aproximada')
    await expectCode('22023', "select public.get_daily_report_metrics(((now() at time zone 'America/Costa_Rica')::date + 1))")
  })

  await check('get_hr_trend_30d devuelve 30 días consecutivos que terminan hoy', async () => {
    await as(hr)
    const { rows } = await client.query("select day::text, absences, chat_queries, (now() at time zone 'America/Costa_Rica')::date::text as today from public.get_hr_trend_30d()")
    assert.equal(rows.length, 30)
    assert.equal(rows.at(-1).day, rows[0].today)
    for (let i = 1; i < rows.length; i += 1) assert.equal((new Date(rows[i].day) - new Date(rows[i - 1].day)) / 86400000, 1)
  })

  await check('la tendencia deja en null las consultas del día en curso (incompleto)', async () => {
    await as(hr)
    const { rows } = await client.query('select chat_queries from public.get_hr_trend_30d()')
    assert.equal(rows.at(-1).chat_queries, null)
    assert.ok(rows.slice(0, -1).every((r) => Number.isInteger(r.chat_queries)))
  })

  await check('el auditor (solo reports.read) lee reportes guardados pero no puede generar métricas', async () => {
    const auditor = await userIdByEmail(client, env.RLS_TEST_AUDITOR_EMAIL)
    await as(auditor)
    await client.query('select * from public.list_daily_reports(1)')
    await expectCode('42501', 'select public.get_daily_report_metrics()')
  })

  await check('list_published_policies: un colaborador ve las políticas publicadas con enlace de Drive', async () => {
    await as(employee)
    const { rows } = await client.query('select document_code, drive_url from public.list_published_policies()')
    assert.ok(rows.length >= 1)
    assert.ok(rows.every((r) => r.drive_url === null || /^https:\/\/(docs|drive)\.google\.com\//.test(r.drive_url)))
  })

  await check('un colaborador recibe 42501 en todas las funciones de reporte y documentos', async () => {
    await as(employee)
    for (const sql of ['select public.get_daily_report_metrics()', 'select * from public.get_hr_trend_30d()', 'select * from public.get_daily_report()',
      'select * from public.list_daily_reports()', 'select * from public.list_drive_documents()', 'select * from public.get_last_document_sync_run()']) {
      await expectCode('42501', sql)
    }
  })

  await check('authenticated (incluso RRHH) no puede escribir daily_hr_reports ni llamar al guardado', async () => {
    await as(hr)
    await expectCode('42501', "insert into public.daily_hr_reports (report_date, metrics) values ('2001-01-01', '{}')")
    await expectCode('42501', "update public.daily_hr_reports set narrative = 'x'")
    await expectCode('42501', "select app_private.save_daily_hr_report('2001-01-01', '{\"report_date\":\"2001-01-01\"}', 'x', $1)", [hr])
  })

  // Postgres de Supabase no puede asumir rrhh_api: se usa la conexión real del backend (login rrhh_api), con ROLLBACK.
  const api = await (await getPostgresPool()).connect()
  const asApi = async (fn) => { await api.query('begin'); try { await fn() } finally { await api.query('rollback') } }
  const apiExpect = async (code, sql, values) => { await api.query('savepoint e'); try { await api.query(sql, values) } catch (error) { await api.query('rollback to savepoint e'); assert.equal(error.code, code, error.message); return } throw new Error('Se esperaba ' + code) }
  // rrhh_api no tiene lectura sobre public: guarda dos veces una fecha de prueba (2001-01-01) con COMMIT,
  // se verifica con la conexión de administrador y se borra al final (no queda rastro).
  await check('guardar como rrhh_api es idempotente: regenerar reemplaza el reporte del día', async () => {
    const save = (narrative) => api.query("select app_private.save_daily_hr_report('2001-01-01', $1::jsonb, $2, $3) as id",
      [JSON.stringify({ report_date: '2001-01-01', meta: { narrative_source: 'template' } }), narrative, hr])
    const { rows: [{ user: who }] } = await api.query('select current_user as user')
    assert.equal(who, 'rrhh_api')
    const first = (await save('Primera versión.')).rows[0].id
    savedTestReport = first
    const second = (await save('Segunda versión.')).rows[0].id
    savedTestReport = first
    assert.equal(first, second)
    const { rows } = await client.query("select narrative from public.daily_hr_reports where report_date = '2001-01-01'")
    assert.deepEqual(rows, [{ narrative: 'Segunda versión.' }])
    const { rows: audit } = await client.query("select metadata->>'replaced' as replaced from public.admin_audit_log where entity_id = $1 order by created_at", [first])
    assert.deepEqual(audit.map((r) => r.replaced), ['false', 'true'])
  })

  await check('el autor del reporte debe tener reports.read y la fecha debe coincidir con las métricas', async () => {
    await asApi(async () => {
    await apiExpect('42501', "select app_private.save_daily_hr_report('2001-01-01', '{\"report_date\":\"2001-01-01\"}', 'x', $1)", [employee])
    await apiExpect('22023', "select app_private.save_daily_hr_report('2001-01-01', '{\"report_date\":\"2001-01-02\"}', 'x', $1)", [hr])
    })
  })
  api.release()
  await (await getPostgresPool()).end()
} finally {
  await client.query('rollback').catch(() => {})
  if (savedTestReport) {
    await client.query('begin')
    await client.query('delete from public.admin_audit_log where entity_id = $1', [savedTestReport])
    await client.query("delete from public.daily_hr_reports where report_date = '2001-01-01'")
    await client.query('commit')
  }
  await client.end()
}

for (const [name, ok, detail] of results) console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
const failed = results.filter(([, ok]) => !ok).length
console.log(`\n${results.length - failed}/${results.length} pruebas de integración (ROLLBACK; el reporte de prueba 2001-01-01 se borra al final).`)
process.exitCode = failed ? 1 : 0
