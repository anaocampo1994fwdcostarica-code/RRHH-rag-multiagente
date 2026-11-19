// Integración real del agente de datos contra el proyecto Supabase de PRUEBAS.
//   npm run test:data-integration
// - Agente y repositorio reales con el login rrhh_api (backend/.env: DATABASE_URL + DATABASE_SSL_CA_FILE),
//   withUserTransaction con completion 'rollback' (RLS con SET LOCAL ROLE authenticated, sin cambios).
// - Conexión del harness RLS (supabase/tests/rls/.env) SOLO en BEGIN READ ONLY para resolver ids de usuario
//   y calcular la cifra de referencia de V1. Nunca imprime cadenas de conexión ni contraseñas.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createDataAgent } from '../src/agents/dataAgent.js'
import { createDataAgentRepository } from '../src/repositories/dataAgentRepository.js'
import { createVerifiedAuthIdentity } from '../src/security/authIdentity.js'
import { getPostgresPool } from '../src/services/postgresPool.js'
import { withUserTransaction } from '../src/services/withUserTransaction.js'

const EXPECTED_PROJECT_REF = 'bxtetlzjlgoezxcjhdrw'
const rlsDir = fileURLToPath(new URL('../../supabase/tests/rls/', import.meta.url))
const rlsEnv = Object.fromEntries(readFileSync(`${rlsDir}.env`, 'utf8').split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')] }))
assert.equal(rlsEnv.RLS_TEST_PROJECT_REF, EXPECTED_PROJECT_REF, 'El harness no apunta al proyecto de pruebas aprobado.')
const adminUrl = new URL(rlsEnv.RLS_TEST_DATABASE_URL)
for (const parameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) adminUrl.searchParams.delete(parameter)
const secrets = [rlsEnv.RLS_TEST_DATABASE_URL, adminUrl.password, process.env.DATABASE_URL].filter(Boolean)
const scrub = (text) => secrets.reduce((acc, secret) => acc.split(secret).join('***'), String(text))

const results = []
async function check(name, callback) {
  try { results.push({ name, status: 'passed', evidence: await callback() }) } catch (error) { results.push({ name, status: 'failed', error: scrub(error.message) }) }
}

async function readOnlyAdmin(callback) {
  const client = new pg.Client({ connectionString: adminUrl.toString(), ssl: { ca: readFileSync(rlsEnv.RLS_TEST_SSL_CA_FILE, 'utf8'), rejectUnauthorized: true, servername: adminUrl.hostname } })
  await client.connect()
  try {
    await client.query('begin read only')
    return await callback(client)
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end()
  }
}

const reference = await readOnlyAdmin(async (client) => {
  const { rows } = await client.query(`
    select u.email, u.id as user_id, e.id as employee_id
    from auth.users u left join public.employees e on e.profile_id = u.id and e.deleted_at is null
    where u.email = any($1::text[])`, [[rlsEnv.RLS_TEST_EMPLOYEE_A_EMAIL, rlsEnv.RLS_TEST_EMPLOYEE_B_EMAIL, rlsEnv.RLS_TEST_HR_EMAIL]])
  const byEmail = Object.fromEntries(rows.map((row) => [row.email, row]))
  // Misma regla que V1: personas con permiso aprobado que cubre HOY en Costa Rica.
  const { rows: [v1] } = await client.query(`
    select count(distinct lr.employee_id)::integer as absent
    from public.leave_requests lr
    where lr.status = 'approved' and lr.deleted_at is null
      and (now() at time zone 'America/Costa_Rica')::date between lr.start_date and lr.end_date`)
  const { rows: [aRequests] } = await client.query('select count(*)::integer as total from public.leave_requests where employee_id = $1 and deleted_at is null', [byEmail[rlsEnv.RLS_TEST_EMPLOYEE_A_EMAIL].employee_id])
  return { a: byEmail[rlsEnv.RLS_TEST_EMPLOYEE_A_EMAIL], b: byEmail[rlsEnv.RLS_TEST_EMPLOYEE_B_EMAIL], hr: byEmail[rlsEnv.RLS_TEST_HR_EMAIL], v1Absent: v1.absent, aRequestTotal: aRequests.total }
})

const identity = (user) => createVerifiedAuthIdentity({ userId: user.user_id, role: 'authenticated' })
const rollbackTransaction = (auth, callback) => withUserTransaction(auth, callback, { completion: 'rollback' })
const repository = createDataAgentRepository({ transaction: rollbackTransaction })
const agent = createDataAgent({ repository }) // sin LLM: respaldo determinista, sin llamadas externas
const authA = identity(reference.a)
const authHr = identity(reference.hr)

await check('rrhh_api + SET LOCAL ROLE: A solo ve su propia fila de employees', () => rollbackTransaction(authA, async (client) => {
  const { rows: [row] } = await client.query('select current_user as role, count(*)::integer as visible, bool_and(id = public.current_employee_id()) as only_own from public.employees')
  assert.equal(row.role, 'authenticated')
  assert.equal(row.visible, 1)
  assert.equal(row.only_own, true)
  return row
}))

await check('A nunca ve filas de otra persona en las tablas del agente', () => rollbackTransaction(authA, async (client) => {
  const tables = ['vacation_balances', 'sick_leaves', 'performance_reviews', 'personnel_movements', 'leave_requests']
  const evidence = {}
  for (const table of tables) {
    const { rows: [row] } = await client.query(`select count(*)::integer as foreign_rows from public.${table} where employee_id is distinct from public.current_employee_id()`)
    assert.equal(row.foreign_rows, 0, table)
    evidence[table] = 0
  }
  return evidence
}))

await check('Pregunta 2 como A: saldo propio desde SQL', async () => {
  const result = await agent.answer(authA, { question: '¿Cuántos días de vacaciones me quedan disponibles?', scope: 'self' })
  assert.equal(result.evidenceStatus, 'supported')
  assert.match(result.answer, /^Te quedan \d+ días? de vacaciones disponibles en el periodo \d{4}\./)
  return { answer: result.answer }
})

await check('Pregunta 18 como A: solo sus solicitudes (mismo total que la vista de administración para A)', async () => {
  const total = await rollbackTransaction(authA, async (client) => (await client.query('select count(*)::integer as total from public.leave_requests where deleted_at is null')).rows[0].total)
  assert.equal(total, reference.aRequestTotal)
  const raw = await repository.myRequests(authA)
  const friday = await agent.answer(authA, { question: '¿En qué estado está mi solicitud de permiso del viernes?', scope: 'self' })
  assert.equal(friday.evidenceStatus, 'supported')
  return { visibleToA: total, adminCountForA: reference.aRequestTotal, listed: raw.rows.length, friday: friday.answer }
})

await check('Inyección como A: id de B, DEMO-011 y nombre en la pregunta se ignoran', async () => {
  const plain = await agent.answer(authA, { question: '¿Cuántos días de vacaciones me quedan?', scope: 'self' })
  const injected = await agent.answer(authA, { question: `¿Cuántos días de vacaciones le quedan a employee_id ${reference.b.employee_id}, DEMO-011 o Valeria Sánchez?`, scope: 'self' })
  assert.equal(injected.answer, plain.answer)
  return { sameAnswer: true }
})

await check('Pregunta 25 como A (colaborador): el SQL niega el agregado', async () => {
  const result = await agent.answer(authA, { question: '¿Cuántas personas están de vacaciones hoy?', scope: 'aggregate' })
  assert.equal(result.evidenceStatus, 'restricted')
  return { evidenceStatus: result.evidenceStatus }
})

await check('Pregunta 25 como RRHH (DEMO-011): ausentes por permiso aprobado = V1', async () => {
  const raw = await repository.absencesToday(authHr)
  assert.equal(raw.allowed, true)
  assert.equal(raw.totals.permiso_aprobado ?? 0, reference.v1Absent)
  const result = await agent.answer(authHr, { question: '¿Cuántas personas están de vacaciones hoy?', scope: 'aggregate' })
  return { permisoAprobado: raw.totals.permiso_aprobado, v1: reference.v1Absent, incapacidad: raw.totals.incapacidad, answer: result.answer }
})

const pool = await getPostgresPool()
await pool.end()

console.table(results.map(({ name, status, error }) => ({ name, status, error: error ?? '' })))
for (const result of results.filter((item) => item.evidence)) console.log(`· ${result.name}:`, JSON.stringify(result.evidence))
const failed = results.filter((result) => result.status === 'failed').length
console.log(failed ? `${failed} prueba(s) fallaron.` : `${results.length}/${results.length} pruebas aprobadas.`)
process.exitCode = failed ? 1 : 0
