import assert from 'node:assert/strict'
import test from 'node:test'
import { createVerifiedAuthIdentity } from '../src/security/authIdentity.js'
import { authenticateIntegrationToken, runRlsIntegration, validateIntegrationConfig } from '../src/testing/rlsIntegration.js'

const userA = createVerifiedAuthIdentity({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })
const userB = createVerifiedAuthIdentity({ userId: '22222222-2222-4222-8222-222222222222', role: 'authenticated' })

function integrationConfig(databaseUrl) {
  return {
    projectRef: 'bxtetlzjlgoezxcjhdrw',
    supabaseUrl: 'https://bxtetlzjlgoezxcjhdrw.supabase.co',
    databaseUrl,
    employeeAToken: 'token-a',
    employeeBToken: 'token-b',
  }
}

test('accepts only the approved project and rrhh_api Session Pooler configuration', () => {
  assert.doesNotThrow(() => validateIntegrationConfig({
    ...integrationConfig('postgresql://rrhh_api.bxtetlzjlgoezxcjhdrw:placeholder@aws-1-us-west-2.pooler.supabase.com:5432/postgres'),
  }))
})

test('rejects administrative and authenticated connection users', () => {
  for (const user of ['postgres', 'service_role', 'supabase_admin', 'authenticated']) {
    assert.throws(
      () => validateIntegrationConfig(integrationConfig(`postgresql://${user}.bxtetlzjlgoezxcjhdrw:placeholder@aws-1-us-west-2.pooler.supabase.com:5432/postgres`)),
      /dedicated rrhh_api/,
    )
  }
})

test('rejects a different project and Transaction Pooler before connecting', () => {
  assert.throws(
    () => validateIntegrationConfig({ ...integrationConfig('postgresql://rrhh_api.otherprojectref:placeholder@aws-1-us-west-2.pooler.supabase.com:5432/postgres'), projectRef: 'otherprojectref', supabaseUrl: 'https://otherprojectref.supabase.co' }),
    /project reference is not approved/,
  )
  assert.throws(
    () => validateIntegrationConfig(integrationConfig('postgresql://rrhh_api.bxtetlzjlgoezxcjhdrw:placeholder@aws-1-us-west-2.pooler.supabase.com:6543/postgres')),
    /port 5432/,
  )
})

test('rejects configuration template placeholders before any connection', () => {
  assert.throws(() => validateIntegrationConfig(integrationConfig('postgresql://rrhh_api.bxtetlzjlgoezxcjhdrw:replace_with_database_password@aws-1-us-west-2.pooler.supabase.com:5432/postgres')), /template password placeholder/)
})

test('creates integration identities only through the authentication middleware', async () => {
  const identity = await authenticateIntegrationToken('token-a', {
    middleware: async (request, _response, next) => {
      request.auth = userA
      next()
    },
  })
  assert.equal(identity, userA)
})

test('fails when the integration token is not accepted by middleware', async () => {
  await assert.rejects(
    () => authenticateIntegrationToken('invalid-token', { middleware: async (_request, response) => response.status(401).json({ error: 'Unauthorized' }) }),
    /not accepted/,
  )
})

test('runs employee leave-request checks in rollback-only transactions without identity leakage', async () => {
  const calls = []
  const createdRequestId = 'request-created-by-a'
  const employeeBRequestId = 'request-owned-by-b'
  const createdConversationId = 'conversation-created-by-a'
  const createdMessageId = 'message-created-by-a'
  const fixtureConversationId = 'conversation-owned-by-b'
  const fixtureMessageId = 'message-owned-by-b'
  const fixtureChunkId = 'chunk-owned-by-b'
  let createdRequestReads = 0
  let createdConversationReads = 0
  let createdMessageReads = 0
  const contexts = new Map([
    [userA.userId, { auth_user_id: userA.userId, effective_role: 'authenticated', connection_role: 'rrhh_api', effective_bypasses_rls: false, connection_bypasses_rls: false }],
    [userB.userId, { auth_user_id: userB.userId, effective_role: 'authenticated', connection_role: 'rrhh_api', effective_bypasses_rls: false, connection_bypasses_rls: false }],
  ])
  const transaction = async (auth, callback) => {
    calls.push({ userId: auth.userId, completion: 'rollback' })
    return callback({
      async query(text, values = []) {
        if (text.includes('pg_roles')) return { rowCount: 1, rows: [contexts.get(auth.userId)] }
        if (text.includes('where profile_id = auth.uid()')) return { rowCount: 1, rows: [{ id: `employee-${auth.userId}`, profile_id: auth.userId, employee_code: 'RLS-TEST' }] }
        if (text.includes('where employee_id = public.current_employee_id()')) return { rowCount: 1, rows: [{ id: employeeBRequestId, employee_id: `employee-${userB.userId}` }] }
        if (text.includes('title = $1') && text.includes('from public.assistant_conversations')) {
          if (auth.userId === userB.userId) return { rowCount: 1, rows: [{ id: fixtureConversationId }] }
          return { rowCount: 0, rows: [] }
        }
        if (text.includes('model_name = $3') && text.includes('from public.assistant_messages')) {
          if (auth.userId === userB.userId && values[0] === fixtureConversationId) return { rowCount: 1, rows: [{ id: fixtureMessageId }] }
          return { rowCount: 0, rows: [] }
        }
        if (text.includes('similarity = 0.90000::numeric') && text.includes('from public.assistant_message_sources')) {
          if (auth.userId === userB.userId && values[0] === fixtureMessageId) return { rowCount: 1, rows: [{ assistant_message_id: fixtureMessageId, chunk_id: fixtureChunkId }] }
          return { rowCount: 0, rows: [] }
        }
        if (text.includes('select id from public.leave_requests where id = $1')) {
          if (values[0] === createdRequestId && createdRequestReads++ === 0) return { rowCount: 1, rows: [{ id: createdRequestId }] }
          return { rowCount: 0, rows: [] }
        }
        if (text.includes('from public.leave_types')) return { rowCount: 1, rows: [{ id: 'leave-type-active' }] }
        if (text.includes('insert into public.leave_requests')) {
          if (values[0] === `employee-${userA.userId}` && text.includes("'draft'")) {
            return { rowCount: 1, rows: [{ id: createdRequestId, employee_id: `employee-${userA.userId}`, status: 'draft' }] }
          }
          const error = new Error('RLS denied write')
          error.code = '42501'
          throw error
        }
        if (text.includes('insert into public.assistant_conversations')) {
          if (values[0] === userB.userId) {
            const error = new Error('RLS denied foreign conversation')
            error.code = '42501'
            throw error
          }
          return { rowCount: 1, rows: [{ id: createdConversationId, owner_profile_id: values[0] }] }
        }
        if (text.includes('insert into public.assistant_messages')) {
          if (values[0] === fixtureConversationId) {
            const error = new Error('RLS denied message in foreign conversation')
            error.code = '42501'
            throw error
          }
          const role = values.find((value) => ['assistant', 'system'].includes(value)) ?? 'user'
          if (role !== 'user') {
            const error = new Error('RLS denied message role')
            error.code = '42501'
            throw error
          }
          return { rowCount: 1, rows: [{ id: createdMessageId, conversation_id: values[0], role: 'user' }] }
        }
        if (text.includes('insert into public.assistant_message_sources')) {
          const error = new Error('permission denied for table assistant_message_sources')
          error.code = '42501'
          throw error
        }
        if (text.includes('select id from public.assistant_conversations where id = $1')) {
          if (values[0] === fixtureConversationId) return { rowCount: 0, rows: [] }
          if (values[0] === createdConversationId && createdConversationReads++ === 0) return { rowCount: 1, rows: [{ id: createdConversationId }] }
          return { rowCount: 0, rows: [] }
        }
        if (text.includes('select id from public.assistant_messages where id = $1')) {
          if (values[0] === fixtureMessageId) return { rowCount: 0, rows: [] }
          if (values[0] === createdMessageId && createdMessageReads++ === 0) return { rowCount: 1, rows: [{ id: createdMessageId }] }
          return { rowCount: 0, rows: [] }
        }
        if (text.includes('select assistant_message_id from public.assistant_message_sources')) return { rowCount: 0, rows: [] }
        if (text.includes('update public.assistant_conversations')) return { rowCount: 0, rows: [] }
        if (text.includes('update public.assistant_messages')) {
          const error = new Error('permission denied for table assistant_messages')
          error.code = '42501'
          throw error
        }
        if (text.includes('where id = $1')) return { rowCount: 0, rows: [] }
        if (text.includes('update public.leave_requests') || text.includes('update public.employees')) return { rowCount: 0, rows: [] }
        throw new Error(`Unexpected test query: ${text}`)
      },
    })
  }

  const report = await runRlsIntegration({
    employeeAToken: 'token-a',
    employeeBToken: 'token-b',
    authenticate: async (token) => (token === 'token-a' ? userA : userB),
    transaction,
  })

  assert.equal(report.rollbackRequired, true)
  assert.equal(report.results.length, 31)
  assert.deepEqual(calls.map(({ userId }) => userId), [userB.userId, userB.userId, userB.userId, userA.userId, userA.userId, userA.userId, userA.userId, userA.userId, userA.userId, userA.userId, userA.userId, userA.userId, userA.userId, userA.userId, userA.userId, userB.userId])
})
