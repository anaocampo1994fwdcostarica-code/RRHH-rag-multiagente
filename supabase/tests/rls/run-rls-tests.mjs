import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg
const EXPECTED_PROJECT_REF = 'bxtetlzjlgoezxcjhdrw'
const EXPECTED_DB_HOST = `db.${EXPECTED_PROJECT_REF}.supabase.co`
const POOLER_HOST_SUFFIX = '.pooler.supabase.com'
const SESSION_POOLER_PORT = '5432'
const testDirectory = dirname(fileURLToPath(import.meta.url))
const reportDirectory = `${testDirectory}/reports`

async function loadLocalEnvironment() {
  try {
    const content = await readFile(`${testDirectory}/.env`, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator < 1) continue
      const key = trimmed.slice(0, separator).trim()
      let value = trimmed.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      if (!process.env[key]) process.env[key] = value
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function validateConfiguration() {
  const projectRef = required('RLS_TEST_PROJECT_REF')
  if (projectRef !== EXPECTED_PROJECT_REF) throw new Error('RLS_TEST_PROJECT_REF does not match the approved test project.')

  const connectionMode = required('RLS_TEST_CONNECTION_MODE')
  if (!['direct', 'session_pooler'].includes(connectionMode)) throw new Error('RLS_TEST_CONNECTION_MODE must be direct or session_pooler.')

  const databaseUrl = new URL(required('RLS_TEST_DATABASE_URL'))
  if (databaseUrl.protocol !== 'postgresql:' && databaseUrl.protocol !== 'postgres:') throw new Error('RLS_TEST_DATABASE_URL must be a PostgreSQL URL.')

  const databaseUser = decodeURIComponent(databaseUrl.username)
  if (connectionMode === 'direct') {
    if (databaseUrl.hostname !== EXPECTED_DB_HOST) throw new Error('Refusing direct connection: host does not match the approved test project.')
    if (databaseUser !== 'postgres') throw new Error('Refusing direct connection: PostgreSQL user must be postgres.')
  }

  if (connectionMode === 'session_pooler') {
    if (!databaseUrl.hostname.endsWith(POOLER_HOST_SUFFIX)) throw new Error('Refusing session pooler connection: host must end in .pooler.supabase.com.')
    if (databaseUrl.port !== SESSION_POOLER_PORT) throw new Error('Refusing session pooler connection: port must be 5432; transaction pooler port 6543 is not supported.')
    if (databaseUser !== `postgres.${EXPECTED_PROJECT_REF}`) throw new Error('Refusing session pooler connection: PostgreSQL user does not match the approved test project.')
  }

  for (const parameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
    databaseUrl.searchParams.delete(parameter)
  }

  return {
    databaseUrl: databaseUrl.toString(),
    connectionMode,
    servername: databaseUrl.hostname,
    sslCaFile: required('RLS_TEST_SSL_CA_FILE'),
    emails: {
      employeeA: required('RLS_TEST_EMPLOYEE_A_EMAIL'),
      employeeB: required('RLS_TEST_EMPLOYEE_B_EMAIL'),
      hr: required('RLS_TEST_HR_EMAIL'),
      admin: required('RLS_TEST_ADMIN_EMAIL'),
      auditor: required('RLS_TEST_AUDITOR_EMAIL'),
    },
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function createRecorder() {
  const results = []
  return {
    pass(name, evidence) { results.push({ name, status: 'passed', evidence }) },
    fail(name, error) { results.push({ name, status: 'failed', error: error.message }) },
    list() { return results },
  }
}

// expectedMessage (opcional): además del SQLSTATE, exige el mensaje exacto para documentar qué regla bloqueó.
async function expectBlocked(client, name, callback, recorder, { expectedMessage } = {}) {
  await client.query('SAVEPOINT expected_error_case')
  let operationError

  try {
    await callback()
  } catch (error) {
    operationError = error
  }

  if (!operationError) {
    await client.query('RELEASE SAVEPOINT expected_error_case')
    recorder.fail(name, new Error('Operation completed when it should have been blocked.'))
    return
  }

  try {
    await client.query('ROLLBACK TO SAVEPOINT expected_error_case')
    await client.query('RELEASE SAVEPOINT expected_error_case')
  } catch (recoveryError) {
    throw new Error(`Could not recover the transaction after ${name}.`, { cause: recoveryError })
  }

  const expectedCode = operationError.code === '42501' || operationError.code === '0A000'
  const expectedText = !expectedMessage || operationError.message === expectedMessage
  if (expectedCode && expectedText) recorder.pass(name, { sqlState: operationError.code, ...(expectedMessage && { message: operationError.message }) })
  else recorder.fail(name, operationError)
}

async function runAs(client, databaseRole, userId, callback) {
  await client.query('SAVEPOINT rls_case')
  try {
    await client.query(`SET LOCAL ROLE ${databaseRole}`)
    if (userId) await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId])
    return await callback()
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT rls_case')
    await client.query('RELEASE SAVEPOINT rls_case')
  }
}

async function resolveUsers(client, emails) {
  const values = Object.values(emails)
  const { rows } = await client.query(`
    select u.id as user_id, u.email, p.id as profile_id, e.id as employee_id, e.employee_code
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.employees e on e.profile_id = u.id and e.deleted_at is null
    where u.email = any($1::text[])
  `, [values])

  assert(rows.length === values.length, 'One or more configured fictitious Auth users do not exist.')
  const byEmail = new Map(rows.map((row) => [row.email, row]))
  const users = Object.fromEntries(Object.entries(emails).map(([key, email]) => [key, byEmail.get(email)]))
  for (const [key, user] of Object.entries(users)) assert(user?.profile_id, `Missing profile for ${key}.`)
  assert(users.employeeA.employee_id && users.employeeA.employee_code === 'RLS-TEST-EMP-A', 'Employee A fixture is missing or has an unexpected code.')
  assert(users.employeeB.employee_id && users.employeeB.employee_code === 'RLS-TEST-EMP-B', 'Employee B fixture is missing or has an unexpected code.')
  return users
}

async function createTransientFixtures(client, users) {
  const suffix = randomBytes(8).toString('hex').replace(/[0-9]/g, 'a')
  const leaveTypeCode = `rls_test_permission_${suffix}`
  const { rows: [leaveType] } = await client.query(
    'insert into public.leave_types (code, name) values ($1, $2) returning id',
    [leaveTypeCode, `RLS test permission ${suffix}`],
  )
  // 20261119091000: RRHH solo revisa solicitudes ya enviadas (submitted → in_review → approved/rejected).
  const { rows: [request] } = await client.query(`
    insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, status, submitted_at)
    values ($1, $2, current_date + 10, current_date + 11, 'submitted', now())
    returning id
  `, [users.employeeB.employee_id, leaveType.id])
  // Borrador para documentar que RRHH no puede saltarse el envío del colaborador.
  const { rows: [draftRequest] } = await client.query(`
    insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, status)
    values ($1, $2, current_date + 12, current_date + 13, 'draft')
    returning id
  `, [users.employeeB.employee_id, leaveType.id])
  const { rows: [conversation] } = await client.query(
    'insert into public.assistant_conversations (owner_profile_id, title) values ($1, $2) returning id',
    [users.employeeB.profile_id, `RLS test conversation ${suffix}`],
  )
  await client.query(
    'insert into public.admin_audit_log (actor_profile_id, action, entity_type, metadata) values ($1, $2, $3, $4::jsonb)',
    [users.admin.profile_id, 'rls_test', 'security_test', JSON.stringify({ marker: suffix })],
  )
  const { rows: roles } = await client.query("select id, code from public.roles where code in ('admin', 'auditor')")
  const roleIds = Object.fromEntries(roles.map((role) => [role.code, role.id]))
  assert(roleIds.admin && roleIds.auditor, 'Required admin or auditor role is missing.')
  const existingAdmin = await client.query('select 1 from public.user_roles where profile_id = $1 and role_id = $2', [users.employeeA.profile_id, roleIds.admin])
  assert(existingAdmin.rowCount === 0, 'Employee A already has the admin role; test fixture is unsafe.')
  const availableRole = await client.query(`
    select r.id
    from public.roles r
    where r.code in ('employee', 'hr', 'auditor')
      and not exists (
        select 1 from public.user_roles ur
        where ur.profile_id = $1 and ur.role_id = r.id
      )
    order by r.code
    limit 1
  `, [users.employeeA.profile_id])
  assert(availableRole.rowCount === 1, 'No role is available for the administrator assignment test.')
  return { leaveTypeId: leaveType.id, requestId: request.id, draftRequestId: draftRequest.id, conversationId: conversation.id, adminRoleId: roleIds.admin, assignmentRoleId: availableRole.rows[0].id }
}

async function executeTests(client, users, fixtures, recorder) {
  await runAs(client, 'authenticated', users.employeeA.user_id, async () => {
    const own = await client.query("select employee_code from public.employees where employee_code = 'RLS-TEST-EMP-A'")
    assert(own.rowCount === 1, 'Employee A cannot read their own employee row.')
    recorder.pass('employee A reads own employee row', { rowCount: own.rowCount })

    const other = await client.query("select employee_code from public.employees where employee_code = 'RLS-TEST-EMP-B'")
    assert(other.rowCount === 0, 'Employee A can read Employee B.')
    recorder.pass('employee A cannot read employee B', { rowCount: other.rowCount })

    const ownRequest = await client.query(`
      insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, status)
      values ($1, $2, current_date + 20, current_date + 21, 'draft') returning id
    `, [users.employeeA.employee_id, fixtures.leaveTypeId])
    assert(ownRequest.rowCount === 1, 'Employee A could not create an own draft request.')
    recorder.pass('employee A creates own draft request', { rowCount: ownRequest.rowCount })

    const foreignUpdate = await client.query('update public.leave_requests set reason = $1 where id = $2', ['blocked attempt', fixtures.requestId])
    assert(foreignUpdate.rowCount === 0, 'Employee A modified Employee B request.')
    recorder.pass('employee A cannot modify employee B request', { rowCount: foreignUpdate.rowCount })

    await expectBlocked(client, 'employee A cannot assign self admin role', () => client.query(
      'insert into public.user_roles (profile_id, role_id) values ($1, $2)',
      [users.employeeA.profile_id, fixtures.adminRoleId],
    ), recorder)

    const permission = await client.query("select public.has_permission('access.manage') as allowed")
    assert(permission.rows[0].allowed === false, 'Employee A unexpectedly has access.manage.')
    recorder.pass('employee A has no access.manage permission', { allowed: false })

    const foreignConversation = await client.query('select id from public.assistant_conversations where id = $1', [fixtures.conversationId])
    assert(foreignConversation.rowCount === 0, 'Employee A can read Employee B conversation.')
    recorder.pass('employee A cannot read employee B conversation', { rowCount: foreignConversation.rowCount })

    const audit = await client.query('select id from public.admin_audit_log')
    assert(audit.rowCount === 0, 'Employee A can read audit records.')
    recorder.pass('employee A cannot read audit log', { rowCount: audit.rowCount })

    const ownEmployeeId = await client.query('select public.current_employee_id() as employee_id')
    assert(ownEmployeeId.rows[0].employee_id === users.employeeA.employee_id, 'current_employee_id returned an unexpected value.')
    recorder.pass('current_employee_id remains scoped to employee A', { matched: true })

    const ownsOther = await client.query('select public.owns_conversation($1) as allowed', [fixtures.conversationId])
    assert(ownsOther.rows[0].allowed === false, 'owns_conversation accepted another employee conversation.')
    recorder.pass('owns_conversation rejects foreign conversation', { allowed: false })

    await expectBlocked(client, 'employee A cannot invoke trigger function directly', () => client.query('select public.handle_new_user()'), recorder)
  })

  await runAs(client, 'authenticated', users.employeeB.user_id, async () => {
    const own = await client.query("select employee_code from public.employees where employee_code = 'RLS-TEST-EMP-B'")
    assert(own.rowCount === 1, 'Employee B cannot read their own employee row.')
    const other = await client.query("select employee_code from public.employees where employee_code = 'RLS-TEST-EMP-A'")
    assert(other.rowCount === 0, 'Employee B can read Employee A.')
    recorder.pass('employee B reads only own employee row', { ownRows: own.rowCount, foreignRows: other.rowCount })
  })

  await runAs(client, 'authenticated', users.hr.user_id, async () => {
    const employees = await client.query("select employee_code from public.employees where employee_code in ('RLS-TEST-EMP-A', 'RLS-TEST-EMP-B')")
    assert(employees.rowCount === 2, 'HR cannot read both test employees.')

    // Regla de la 20261119091000: un borrador no puede pasar a revisión sin que el colaborador lo envíe.
    await expectBlocked(client, 'HR cannot move a draft request to in_review', () => client.query(
      "update public.leave_requests set status = 'in_review' where id = $1",
      [fixtures.draftRequestId],
    ), recorder, { expectedMessage: 'Administrative leave request transition is not permitted.' })

    // Transición permitida: solo cambia status; el trigger conserva submitted_at y demás columnas.
    const update = await client.query("update public.leave_requests set status = 'in_review' where id = $1 returning status", [fixtures.requestId])
    assert(update.rowCount === 1 && update.rows[0].status === 'in_review', 'HR could not move the submitted request to in_review.')
    recorder.pass('HR can read employees and review a submitted request', { employeeRows: employees.rowCount, updatedRows: update.rowCount })
  })

  await runAs(client, 'authenticated', users.admin.user_id, async () => {
    const insert = await client.query('insert into public.user_roles (profile_id, role_id) values ($1, $2)', [users.employeeA.profile_id, fixtures.assignmentRoleId])
    assert(insert.rowCount === 1, 'Administrator could not assign a role.')
    const remove = await client.query('delete from public.user_roles where profile_id = $1 and role_id = $2', [users.employeeA.profile_id, fixtures.assignmentRoleId])
    assert(remove.rowCount === 1, 'Administrator could not remove the temporary role.')
    recorder.pass('administrator can manage role assignments', { insertedRows: insert.rowCount, deletedRows: remove.rowCount })
  })

  await runAs(client, 'authenticated', users.auditor.user_id, async () => {
    const audit = await client.query('select id from public.admin_audit_log')
    assert(audit.rowCount >= 1, 'Auditor cannot read audit records.')
    const update = await client.query("update public.employees set employment_status = 'inactive' where employee_code = 'RLS-TEST-EMP-A'")
    assert(update.rowCount === 0, 'Auditor modified an employee.')
    recorder.pass('auditor reads audit but cannot modify employee', { auditRows: audit.rowCount, updatedRows: update.rowCount })
  })

  await runAs(client, 'anon', null, async () => {
    await expectBlocked(client, 'anonymous user cannot read document chunks', () => client.query('select id from public.document_chunks'), recorder)
    await expectBlocked(client, 'anonymous user cannot read audit log', () => client.query('select id from public.admin_audit_log'), recorder)
  })
}

async function main() {
  await loadLocalEnvironment()
  const config = validateConfiguration()
  const certificateAuthority = await readFile(config.sslCaFile, 'utf8')
  assert(certificateAuthority.includes('BEGIN CERTIFICATE'), 'RLS_TEST_SSL_CA_FILE does not contain a PEM certificate.')
  if (process.argv.includes('--validate-config')) {
    console.log(`RLS configuration is valid for ${config.connectionMode}. No remote connection was opened.`)
    return
  }

  const recorder = createRecorder()
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: {
      ca: certificateAuthority,
      rejectUnauthorized: true,
      servername: config.servername,
    },
  })
  let rollbackCompleted = false

  try {
    await client.connect()
    await client.query('begin')
    const users = await resolveUsers(client, config.emails)
    const fixtures = await createTransientFixtures(client, users)
    await executeTests(client, users, fixtures, recorder)
  } catch (error) {
    recorder.fail('test harness', error)
  } finally {
    try {
      await client.query('rollback')
      rollbackCompleted = true
    } catch (error) {
      recorder.fail('transaction rollback', error)
    }
    await client.end().catch(() => undefined)
  }

  const report = { projectRef: EXPECTED_PROJECT_REF, rollbackCompleted, results: recorder.list() }
  await mkdir(reportDirectory, { recursive: true })
  await writeFile(`${reportDirectory}/rls-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(report, null, 2))
  console.table(report.results)
  if (!rollbackCompleted || report.results.some((result) => result.status === 'failed')) process.exitCode = 1
}

main().catch((error) => { console.error('RLS test runner failed before execution:', error.message); process.exitCode = 1 })
