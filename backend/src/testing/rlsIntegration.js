import { requireAuth } from '../middlewares/requireAuth.js'
import { withUserTransaction } from '../services/withUserTransaction.js'

const approvedProjectRef = 'bxtetlzjlgoezxcjhdrw'
const applicationConnectionRole = 'rrhh_api'
const ownEmployeeQuery = `
  select id, profile_id, employee_code
  from public.employees
  where profile_id = auth.uid() and deleted_at is null
`
const employeeBRequestQuery = `
  select id, employee_id
  from public.leave_requests
  where employee_id = public.current_employee_id() and deleted_at is null
  order by created_at asc
  limit 1
`
const activeLeaveTypeQuery = `
  select id
  from public.leave_types
  where is_active = true
  order by created_at asc
  limit 1
`
const fixtureConversationTitle = 'RLS Integration Fixture Conversation for Employee B'
const fixtureMessageContent = 'RLS integration fixture assistant message for Employee B.'
const fixtureModelName = 'rls-fixture'
const fixtureConversationQuery = `
  select id
  from public.assistant_conversations
  where owner_profile_id = auth.uid()
    and title = $1
    and deleted_at is null
  order by created_at asc
  limit 2
`
const fixtureMessageQuery = `
  select id
  from public.assistant_messages
  where conversation_id = $1
    and role = 'assistant'
    and content = $2
    and model_name = $3
  order by created_at asc
  limit 2
`
const fixtureSourceQuery = `
  select assistant_message_id, chunk_id
  from public.assistant_message_sources
  where assistant_message_id = $1
    and rank = 1
    and similarity = 0.90000::numeric
  limit 2
`
const securityContextQuery = `
  select
    auth.uid() as auth_user_id,
    current_user as effective_role,
    session_user as connection_role,
    coalesce((select rolbypassrls from pg_roles where rolname = current_user), true) as effective_bypasses_rls,
    coalesce((select rolbypassrls from pg_roles where rolname = session_user), true) as connection_bypasses_rls
`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function expectDeniedTransaction(transaction, auth, name, callback) {
  try {
    await transaction(auth, callback)
  } catch (error) {
    if (error?.code === '42501') return { name, status: 'passed', evidence: { sqlState: error.code } }
    throw new Error(`${name} failed with an unexpected PostgreSQL error.`, { cause: error })
  }

  throw new Error(`${name} completed when it should have been denied.`)
}

function createResponse() {
  return {
    statusCode: undefined,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

export function validateIntegrationConfig({ projectRef, supabaseUrl, databaseUrl, employeeAToken, employeeBToken }) {
  assert(projectRef === approvedProjectRef, 'RLS integration project reference is not approved.')
  assert(typeof employeeAToken === 'string' && employeeAToken.trim(), 'Employee A access token is required.')
  assert(typeof employeeBToken === 'string' && employeeBToken.trim(), 'Employee B access token is required.')
  assert(!employeeAToken.includes('replace_with_') && !employeeBToken.includes('replace_with_'), 'Integration access tokens must not use template placeholders.')

  const authUrl = new URL(supabaseUrl)
  assert(authUrl.protocol === 'https:' && authUrl.hostname === `${approvedProjectRef}.supabase.co`, 'SUPABASE_URL does not match the approved test project.')

  const poolerUrl = new URL(databaseUrl)
  assert(poolerUrl.hostname.endsWith('.pooler.supabase.com'), 'RLS integration requires a Supabase Session Pooler host.')
  assert(poolerUrl.port === '5432', 'RLS integration requires Session Pooler port 5432.')
  assert(decodeURIComponent(poolerUrl.username) === `${applicationConnectionRole}.${approvedProjectRef}`, 'DATABASE_URL must use the dedicated rrhh_api pooler user for the approved test project.')
  assert(decodeURIComponent(poolerUrl.password) && !decodeURIComponent(poolerUrl.password).includes('replace_with_'), 'DATABASE_URL must not use a template password placeholder.')
}

export async function authenticateIntegrationToken(token, { middleware = requireAuth } = {}) {
  const request = {
    get(name) {
      return name === 'authorization' ? `Bearer ${token}` : undefined
    },
  }
  const response = createResponse()
  let nextCalls = 0

  await middleware(request, response, () => { nextCalls += 1 })
  if (nextCalls !== 1 || !request.auth) {
    throw new Error(`Integration token was not accepted (${response.statusCode ?? 500}).`)
  }

  return request.auth
}

function validateSecurityContext(context, auth) {
  assert(context.auth_user_id === auth.userId, 'auth.uid() does not match the verified test identity.')
  assert(context.effective_role === 'authenticated', 'The effective PostgreSQL role is not authenticated.')
  assert(context.connection_role === applicationConnectionRole, 'The connection role must be rrhh_api.')
  assert(context.effective_bypasses_rls === false, 'The effective PostgreSQL role bypasses RLS.')
  assert(context.connection_bypasses_rls === false, 'The connection role bypasses RLS.')
}

export async function runRlsIntegration({ employeeAToken, employeeBToken, authenticate = authenticateIntegrationToken, transaction = (auth, callback) => withUserTransaction(auth, callback, { completion: 'rollback' }) }) {
  const employeeA = await authenticate(employeeAToken)
  const employeeB = await authenticate(employeeBToken)
  assert(employeeA.userId !== employeeB.userId, 'Integration tokens must identify two different employees.')

  const employeeBRow = await transaction(employeeB, async (query) => {
    const result = await query.query(ownEmployeeQuery)
    assert(result.rowCount === 1, 'Employee B does not have exactly one visible employee row.')
    return result.rows[0]
  })

  const employeeBRequest = await transaction(employeeB, async (query) => {
    const result = await query.query(employeeBRequestQuery)
    assert(result.rowCount === 1, 'Integration fixture missing: Employee B needs one active leave request for isolation checks.')
    return result.rows[0]
  })

  const employeeBConversationFixture = await transaction(employeeB, async (query) => {
    const conversation = await query.query(fixtureConversationQuery, [fixtureConversationTitle])
    assert(conversation.rowCount === 1, 'Integration fixture missing: Employee B needs exactly one conversation fixture.')

    const message = await query.query(fixtureMessageQuery, [conversation.rows[0].id, fixtureMessageContent, fixtureModelName])
    assert(message.rowCount === 1, 'Integration fixture missing: Employee B needs exactly one assistant message fixture.')

    const source = await query.query(fixtureSourceQuery, [message.rows[0].id])
    assert(source.rowCount === 1, 'Integration fixture missing: Employee B needs exactly one readable message-source fixture.')

    return {
      conversationId: conversation.rows[0].id,
      messageId: message.rows[0].id,
      chunkId: source.rows[0].chunk_id,
    }
  })

  const employeeAResults = await transaction(employeeA, async (query) => {
    const contextResult = await query.query(securityContextQuery)
    assert(contextResult.rowCount === 1, 'Security context query did not return exactly one row.')
    validateSecurityContext(contextResult.rows[0], employeeA)

    const ownResult = await query.query(ownEmployeeQuery)
    assert(ownResult.rowCount === 1, 'Employee A does not have exactly one visible employee row.')

    const foreignResult = await query.query('select id from public.employees where id = $1', [employeeBRow.id])
    assert(foreignResult.rowCount === 0, 'Employee A can read Employee B employee row.')

    const leaveTypeResult = await query.query(activeLeaveTypeQuery)
    assert(leaveTypeResult.rowCount === 1, 'Integration fixture missing: at least one active leave type is required.')

    const createRequest = await query.query(`
      insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, reason, status)
      values ($1, $2, current_date + 30, current_date + 31, $3, 'draft')
      returning id, employee_id, status
    `, [ownResult.rows[0].id, leaveTypeResult.rows[0].id, 'RLS integration rollback test'])
    assert(createRequest.rowCount === 1, 'Employee A could not create an own draft request.')
    assert(createRequest.rows[0].employee_id === ownResult.rows[0].id && createRequest.rows[0].status === 'draft', 'Employee A draft request returned unexpected ownership or status.')

    const ownRequest = await query.query('select id from public.leave_requests where id = $1', [createRequest.rows[0].id])
    assert(ownRequest.rowCount === 1, 'Employee A cannot read their own draft request.')

    const foreignRequest = await query.query('select id from public.leave_requests where id = $1', [employeeBRequest.id])
    assert(foreignRequest.rowCount === 0, 'Employee A can read Employee B leave request.')

    const foreignRequestUpdate = await query.query('update public.leave_requests set reason = $1 where id = $2 returning id', ['unauthorized update attempt', employeeBRequest.id])
    assert(foreignRequestUpdate.rowCount === 0, 'Employee A modified Employee B leave request.')

    const ownEmployeeUpdate = await query.query('update public.employees set employment_status = employment_status where id = $1 returning id', [ownResult.rows[0].id])
    assert(ownEmployeeUpdate.rowCount === 0, 'Employee A modified an employee record without authorization.')

    const conversation = await query.query(`
      insert into public.assistant_conversations (owner_profile_id, title)
      values ($1, $2)
      returning id, owner_profile_id
    `, [ownResult.rows[0].profile_id, 'RLS integration rollback conversation'])
    assert(conversation.rowCount === 1 && conversation.rows[0].owner_profile_id === ownResult.rows[0].profile_id, 'Employee A could not create an own conversation.')

    const message = await query.query(`
      insert into public.assistant_messages (conversation_id, role, content)
      values ($1, 'user', $2)
      returning id, conversation_id, role
    `, [conversation.rows[0].id, 'RLS integration user message'])
    assert(message.rowCount === 1 && message.rows[0].conversation_id === conversation.rows[0].id && message.rows[0].role === 'user', 'Employee A could not create an own user message.')

    const ownConversation = await query.query('select id from public.assistant_conversations where id = $1', [conversation.rows[0].id])
    assert(ownConversation.rowCount === 1, 'Employee A cannot read their own conversation.')

    const ownMessage = await query.query('select id from public.assistant_messages where id = $1', [message.rows[0].id])
    assert(ownMessage.rowCount === 1, 'Employee A cannot read their own message.')

    return {
      ownEmployeeId: ownResult.rows[0].id,
      ownProfileId: ownResult.rows[0].profile_id,
      foreignRows: foreignResult.rowCount,
      ownRequestId: createRequest.rows[0].id,
      activeLeaveTypeId: leaveTypeResult.rows[0].id,
      ownConversationId: conversation.rows[0].id,
      ownMessageId: message.rows[0].id,
    }
  })

  const rollbackCheck = await transaction(employeeA, async (query) => {
    const request = await query.query('select id from public.leave_requests where id = $1', [employeeAResults.ownRequestId])
    const conversation = await query.query('select id from public.assistant_conversations where id = $1', [employeeAResults.ownConversationId])
    const message = await query.query('select id from public.assistant_messages where id = $1', [employeeAResults.ownMessageId])
    assert(request.rowCount === 0, 'Rollback did not remove Employee A transient leave request.')
    assert(conversation.rowCount === 0, 'Rollback did not remove Employee A transient conversation.')
    assert(message.rowCount === 0, 'Rollback did not remove Employee A transient message.')
    return { requestRows: request.rowCount, conversationRows: conversation.rowCount, messageRows: message.rowCount }
  })

  const foreignRequestInsert = await expectDeniedTransaction(transaction, employeeA, 'employee A cannot create a leave request for employee B', (query) => query.query(`
    insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, reason, status)
    values ($1, $2, current_date + 32, current_date + 33, $3, 'draft')
    returning id
  `, [employeeBRow.id, employeeAResults.activeLeaveTypeId, 'unauthorized foreign request']))

  const deniedStatuses = []
  for (const status of ['submitted', 'approved']) {
    deniedStatuses.push(await expectDeniedTransaction(transaction, employeeA, `employee A cannot create a ${status} leave request`, (query) => query.query(`
      insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, reason, status, submitted_at, resolved_at)
      values ($1, $2, current_date + 34, current_date + 35, $3, $4, now(), case when $4 = 'approved' then now() else null end)
      returning id
    `, [employeeAResults.ownEmployeeId, employeeAResults.activeLeaveTypeId, 'unauthorized non-draft request', status])))
  }

  const foreignConversationInsert = await expectDeniedTransaction(transaction, employeeA, 'employee A cannot create a conversation for employee B', (query) => query.query(`
    insert into public.assistant_conversations (owner_profile_id, title)
    values ($1, $2)
    returning id
  `, [employeeBRow.profile_id, 'unauthorized foreign conversation']))

  const deniedMessageRoles = []
  for (const role of ['assistant', 'system']) {
    deniedMessageRoles.push(await expectDeniedTransaction(transaction, employeeA, `employee A cannot create a ${role} message`, async (query) => {
      const conversation = await query.query(`
        insert into public.assistant_conversations (owner_profile_id, title)
        values ($1, $2)
        returning id
      `, [employeeAResults.ownProfileId, `rollback ${role} message conversation`])
      assert(conversation.rowCount === 1, 'Could not prepare an own conversation for a denied message-role check.')
      return query.query(`
        insert into public.assistant_messages (conversation_id, role, content)
        values ($1, $2, $3)
        returning id
      `, [conversation.rows[0].id, role, `unauthorized ${role} message`])
    }))
  }

  const messageSourceInsert = await expectDeniedTransaction(transaction, employeeA, 'employee A cannot create a message source without INSERT privilege', async (query) => {
    const conversation = await query.query(`
      insert into public.assistant_conversations (owner_profile_id, title)
      values ($1, $2)
      returning id
    `, [employeeAResults.ownProfileId, 'rollback message source conversation'])
    assert(conversation.rowCount === 1, 'Could not prepare an own conversation for a denied message-source check.')
    const message = await query.query(`
      insert into public.assistant_messages (conversation_id, role, content)
      values ($1, 'user', $2)
      returning id
    `, [conversation.rows[0].id, 'message source privilege check'])
    assert(message.rowCount === 1, 'Could not prepare an own message for a denied message-source check.')
    return query.query(`
      insert into public.assistant_message_sources (assistant_message_id, chunk_id, rank, similarity)
      values ($1, $2, 1, null)
    `, [message.rows[0].id, '00000000-0000-4000-8000-000000000001'])
  })

  const foreignConversationPrivacy = await transaction(employeeA, async (query) => {
    const conversation = await query.query('select id from public.assistant_conversations where id = $1', [employeeBConversationFixture.conversationId])
    assert(conversation.rowCount === 0, 'Employee A can read Employee B conversation.')

    const message = await query.query('select id from public.assistant_messages where id = $1', [employeeBConversationFixture.messageId])
    assert(message.rowCount === 0, 'Employee A can read Employee B message.')

    const source = await query.query('select assistant_message_id from public.assistant_message_sources where assistant_message_id = $1 and chunk_id = $2', [employeeBConversationFixture.messageId, employeeBConversationFixture.chunkId])
    assert(source.rowCount === 0, 'Employee A can read Employee B message source.')

    const conversationUpdate = await query.query('update public.assistant_conversations set title = title where id = $1 returning id', [employeeBConversationFixture.conversationId])
    assert(conversationUpdate.rowCount === 0, 'Employee A modified Employee B conversation.')

    return {
      conversationRows: conversation.rowCount,
      messageRows: message.rowCount,
      sourceRows: source.rowCount,
      updateRows: conversationUpdate.rowCount,
    }
  })

  const foreignMessageInsert = await expectDeniedTransaction(transaction, employeeA, 'employee A cannot insert a message in employee B conversation', (query) => query.query(`
    insert into public.assistant_messages (conversation_id, role, content)
    values ($1, 'user', $2)
    returning id
  `, [employeeBConversationFixture.conversationId, 'unauthorized foreign conversation message']))

  const foreignMessageUpdate = await expectDeniedTransaction(transaction, employeeA, 'employee A has no UPDATE privilege on messages', (query) => query.query(`
    update public.assistant_messages
    set content = content
    where id = $1
    returning id
  `, [employeeBConversationFixture.messageId]))

  const employeeBContext = await transaction(employeeB, async (query) => {
    const contextResult = await query.query(securityContextQuery)
    assert(contextResult.rowCount === 1, 'Employee B security context query did not return exactly one row.')
    validateSecurityContext(contextResult.rows[0], employeeB)
    return contextResult.rows[0].auth_user_id
  })

  assert(employeeBContext === employeeB.userId, 'Employee B transaction retained another identity.')

  return {
    rollbackRequired: true,
    results: [
      { name: 'employee B resolves only own employee record', status: 'passed' },
      { name: 'employee A PostgreSQL role and auth.uid are RLS-safe', status: 'passed' },
      { name: 'employee A reads own employee record', status: 'passed', evidence: { employeeId: employeeAResults.ownEmployeeId } },
      { name: 'employee A cannot read employee B record', status: 'passed', evidence: { rowCount: employeeAResults.foreignRows } },
      { name: 'employee A creates and reads own draft leave request', status: 'passed', evidence: { requestId: employeeAResults.ownRequestId } },
      { name: 'employee A cannot read employee B leave request', status: 'passed', evidence: { requestId: employeeBRequest.id, rowCount: 0 } },
      { name: 'employee A cannot modify employee B leave request', status: 'passed', evidence: { rowCount: 0 } },
      { name: 'employee A cannot modify employee records', status: 'passed', evidence: { rowCount: 0 } },
      { name: 'employee A draft leave request is rolled back', status: 'passed', evidence: { rowCount: rollbackCheck.requestRows } },
      foreignRequestInsert,
      ...deniedStatuses,
      { name: 'employee A creates an own conversation', status: 'passed', evidence: { conversationId: employeeAResults.ownConversationId } },
      { name: 'employee A creates an own user message', status: 'passed', evidence: { messageId: employeeAResults.ownMessageId } },
      { name: 'employee A reads own conversation', status: 'passed', evidence: { rowCount: 1 } },
      { name: 'employee A reads own user message', status: 'passed', evidence: { rowCount: 1 } },
      { name: 'employee A conversation and message are rolled back', status: 'passed', evidence: { conversationRows: rollbackCheck.conversationRows, messageRows: rollbackCheck.messageRows } },
      foreignConversationInsert,
      ...deniedMessageRoles,
      messageSourceInsert,
      { name: 'employee B reads own fixture conversation', status: 'passed', evidence: { conversationId: employeeBConversationFixture.conversationId } },
      { name: 'employee B reads own fixture message', status: 'passed', evidence: { messageId: employeeBConversationFixture.messageId } },
      { name: 'employee B reads own fixture message source', status: 'passed', evidence: { chunkId: employeeBConversationFixture.chunkId } },
      { name: 'employee A cannot read employee B conversation', status: 'passed', evidence: { rowCount: foreignConversationPrivacy.conversationRows } },
      { name: 'employee A cannot read employee B message', status: 'passed', evidence: { rowCount: foreignConversationPrivacy.messageRows } },
      { name: 'employee A cannot read employee B message source', status: 'passed', evidence: { rowCount: foreignConversationPrivacy.sourceRows } },
      { name: 'employee A cannot modify employee B conversation', status: 'passed', evidence: { rowCount: foreignConversationPrivacy.updateRows } },
      foreignMessageInsert,
      foreignMessageUpdate,
      { name: 'employee B transaction receives only employee B identity', status: 'passed' },
    ],
  }
}
