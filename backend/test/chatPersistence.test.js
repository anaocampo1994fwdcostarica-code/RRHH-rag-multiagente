import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createOrchestrator } from '../src/agents/orchestrator.js'
import { createConversationRepository } from '../src/agents/conversationRepository.js'
import { createChatQueryLogRepository } from '../src/repositories/chatQueryLogRepository.js'
import { createVerifiedAuthIdentity } from '../src/security/authIdentity.js'

const userId = '11111111-1111-4111-8111-111111111111'
const verifiedAuth = createVerifiedAuthIdentity({ userId, role: 'authenticated', accessToken: 'token-local' })
const root = new URL('../..', import.meta.url)
const migrationUrl = new URL('supabase/migrations/20261120090000_add_hr_operational_data.sql', root)
const seedUrl = new URL('supabase/seeds/demo_data.sql.example', root)

const entry = {
  userId,
  question: '¿Cuántos días me quedan?',
  intent: 'personal_data',
  agent: 'data',
  citedDocuments: ['doc-1'],
  resolved: true,
  escalated: false,
  latencyMs: 812.4,
  promptVersion: '1.0.0',
}

test('el registro de consultas llama solo a app_private.log_chat_query como rrhh_api, sin cambiar de rol', async () => {
  const queries = []
  const repository = createChatQueryLogRepository({ getPool: async () => ({ query: async (text, values) => { queries.push({ text, values }) } }) })
  await repository.record(entry, { auth: verifiedAuth })
  assert.equal(queries.length, 1)
  assert.match(queries[0].text, /^select app_private\.log_chat_query\(\$1, \$2, \$3, \$4, \$5::jsonb, \$6, \$7, \$8, \$9\)$/)
  assert.doesNotMatch(queries[0].text, /set\s+(local\s+)?role/i)
  assert.deepEqual(queries[0].values, [userId, entry.question, 'personal_data', 'data', '["doc-1"]', true, false, 812, '1.0.0'])
})

test('el registro de consultas exige una identidad verificada que coincida con el perfil', async () => {
  let poolRequested = false
  const repository = createChatQueryLogRepository({ getPool: async () => { poolRequested = true; return { query: async () => {} } } })
  await assert.rejects(repository.record(entry, { auth: { userId, role: 'authenticated' } }), /verified profile/)
  await assert.rejects(repository.record({ ...entry, userId: '22222222-2222-4222-8222-222222222222' }, { auth: verifiedAuth }), /verified profile/)
  await assert.rejects(repository.record(entry), /verified profile/)
  assert.equal(poolRequested, false)
})

test('la respuesta no espera al registro ni al guardado de la respuesta del asistente', async () => {
  const appended = []
  const orchestrator = createOrchestrator({
    classifier: { classify: async (question) => ({ intent: 'policy', subqueries: {}, reformulated: question }) },
    policyAgent: { answer: async () => ({ evidenceStatus: 'supported', answer: 'Según la política…', citations: [{ documentId: 'd1' }] }) },
    conversations: {
      getRecentMessages: async () => [],
      createConversation: async () => 'conversation-1',
      appendUserMessage: async () => {},
      appendAssistantMessage: async (...args) => { appended.push(args) },
    },
    resolveIsHr: async () => false,
    queryLog: { record: () => new Promise(() => {}) }, // nunca termina
  })
  const response = await orchestrator.answer(verifiedAuth, '¿Cuánto dura el periodo de prueba?')
  assert.equal(response.evidenceStatus, 'supported')
  assert.equal(response.conversationId, 'conversation-1')
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(appended, [[verifiedAuth, 'conversation-1', 'Según la política…']])
})

test('un fallo al guardar la respuesta del asistente no rompe el chat', async () => {
  const orchestrator = createOrchestrator({
    classifier: { classify: async (question) => ({ intent: 'out_of_scope', subqueries: {}, reformulated: question }) },
    policyAgent: { answer: async () => { throw new Error('no debe llamarse') } },
    conversations: { getRecentMessages: async () => [], createConversation: async () => 'c', appendUserMessage: async () => {}, appendAssistantMessage: async () => { throw new Error('rpc') } },
    resolveIsHr: async () => false,
    queryLog: { record: async () => { throw new Error('db') } },
  })
  const response = await orchestrator.answer(verifiedAuth, '¿Me recomiendas una película?')
  assert.equal(response.intent, 'out_of_scope')
  await new Promise((resolve) => setImmediate(resolve))
})

test('el repositorio de conversación guarda respuestas con el RPC append_assistant_message', async () => {
  let call
  const repository = createConversationRepository({ createDataClient: (identity) => ({ rpc: async (name, parameters) => { call = { identity, name, parameters }; return { error: null } } }) })
  await repository.appendAssistantMessage(verifiedAuth, 'conversation-1', 'x'.repeat(9000))
  assert.equal(call.identity, verifiedAuth)
  assert.equal(call.name, 'append_assistant_message')
  assert.equal(call.parameters.p_conversation_id, 'conversation-1')
  assert.equal(call.parameters.p_content.length, 8000)
})

test('la migración operativa restringe escritura, aplica RLS y reserva el log a rrhh_api', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  for (const table of ['vacation_balances', 'sick_leaves', 'personnel_movements', 'payroll_calendar', 'performance_reviews', 'chat_query_logs']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table)
  }
  for (const fragment of [
    'available_days integer generated always as (assigned_days - taken_days) stored',
    "public.has_permission('employees.read') or public.has_permission('reports.read')",
    'from public, anon, authenticated;',
    'grant usage on schema app_private to rrhh_api;',
    'to rrhh_api;',
    'public.owns_conversation(p_conversation_id)',
    "'assistant'",
    'set search_path = pg_catalog, public, pg_temp',
    'add column if not exists full_name text',
  ]) assert.equal(sql.includes(fragment), true, fragment)

  // Nadie fuera de rrhh_api puede ejecutar el log; authenticated no recibe escritura directa.
  assert.doesNotMatch(sql, /grant execute on function app_private\.log_chat_query[^;]*authenticated/)
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*to authenticated/)
  const code = sql.replace(/--.*$/gm, '')
  assert.doesNotMatch(code, /current_date/)
})

test('el seed demo es idempotente, usa la fecha de Costa Rica y limpia el historial antes de las solicitudes', async () => {
  const seed = await readFile(seedUrl, 'utf8')
  assert.match(seed, /now\(\) at time zone 'America\/Costa_Rica'/)
  assert.doesNotMatch(seed.replace(/--.*$/gm, ''), /current_date/)
  assert.doesNotMatch(seed, /insert into auth\./i)
  const historyDelete = seed.indexOf('delete from public.leave_request_status_history')
  const requestDelete = seed.indexOf('delete from public.leave_requests')
  assert.ok(historyDelete > 0 && historyDelete < requestDelete)
  assert.match(seed, /submitted_at < now\(\) - interval '3 days'/)
})
