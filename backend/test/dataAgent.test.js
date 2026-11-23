import assert from 'node:assert/strict'
import test from 'node:test'
import { createDataAgent } from '../src/agents/dataAgent.js'
import { fallbackToolSelection, parseToolSelection } from '../src/agents/data/dataTools.js'
import { formatDate } from '../src/agents/data/dataTemplates.js'
import { createOrchestrator } from '../src/agents/orchestrator.js'
import { createIntentClassifier } from '../src/agents/intentClassifier.js'
import { createDataAgentRepository } from '../src/repositories/dataAgentRepository.js'

const auth = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })
const TODAY = '2026-11-19'

// Repositorio simulado: registra cada llamada (método, identidad y parámetros) para comprobar
// que nunca recibe identificadores sacados de la pregunta.
function createFakeRepository(overrides = {}) {
  const calls = []
  const linked = (data) => ({ linked: true, today: TODAY, ...data })
  const base = {
    vacationBalance: async () => linked({ rows: [{ period: 2026, assigned_days: 15, taken_days: 6, available_days: 9 }] }),
    nextPayment: async () => linked({ rows: [{ pay_date: '2026-11-30', period_label: 'Segunda quincena de noviembre 2026', type: 'quincenal' }, { pay_date: '2026-12-15', period_label: 'Primera quincena de diciembre 2026', type: 'quincenal' }, { pay_date: '2026-12-18', period_label: 'Aguinaldo 2026', type: 'aguinaldo' }] }),
    nextReview: async () => linked({ rows: [{ scheduled_date: '2026-12-03', status: 'programada' }] }),
    myRequests: async () => linked({ rows: [{ leave_type: 'permiso_personal', leave_type_name: 'Permiso personal', start_date: '2026-11-20', end_date: '2026-11-20', status: 'submitted' }] }),
    mySickLeaves: async () => linked({ rows: [{ type: 'enfermedad', entity: 'empresa', start_date: '2026-10-01', end_date: '2026-10-03', days: 3, active: false }] }),
    absencesToday: async () => ({ allowed: true, today: TODAY, totals: { permiso_aprobado: 4, incapacidad: 4, total: 8 }, breakdown: [
      { department: 'Finanzas', category: 'incapacidad', detail: 'accidente_laboral', people: 1 },
      { department: 'Talento Humano', category: 'permiso_aprobado', detail: 'Vacaciones', people: 1 },
    ] }),
    ...overrides,
  }
  const repository = Object.fromEntries(Object.entries(base).map(([name, fn]) => [name, async (...args) => { calls.push({ name, args }); return fn(...args) }]))
  return { repository, calls }
}

const llmReturning = (selection) => ({ generateJson: async () => JSON.stringify(selection) })

test('formatDate produce fechas legibles en español', () => {
  assert.equal(formatDate('2026-11-28'), 'sábado 28 de noviembre')
  assert.equal(formatDate('2026-11-20'), 'viernes 20 de noviembre')
  assert.equal(formatDate('2027-01-04', { referenceYear: 2026 }), 'lunes 4 de enero de 2027')
})

test('herramienta vacation_balance (pregunta 2): cifras del SQL en plantilla natural', async () => {
  const { repository, calls } = createFakeRepository()
  const agent = createDataAgent({ llm: llmReturning({ tool: 'vacation_balance', params: {} }), repository })
  const result = await agent.answer(auth, { question: '¿Cuántos días de vacaciones me quedan disponibles?', scope: 'self' })
  assert.equal(result.answer, 'Te quedan 9 días de vacaciones disponibles en el periodo 2026. Has tomado 6 de los 15 asignados.')
  assert.equal(result.evidenceStatus, 'supported')
  assert.deepEqual(calls.map((call) => call.name), ['vacationBalance'])
  assert.equal(calls[0].args[0], auth)
})

test('vacation_balance suma periodos anteriores con saldo', async () => {
  const { repository } = createFakeRepository({ vacationBalance: async () => ({ linked: true, today: TODAY, rows: [
    { period: 2025, assigned_days: 14, taken_days: 0, available_days: 14 },
    { period: 2026, assigned_days: 14, taken_days: 0, available_days: 14 },
  ] }) })
  const result = await createDataAgent({ llm: llmReturning({ tool: 'vacation_balance' }), repository }).answer(auth, { question: 'saldo', scope: 'self' })
  assert.match(result.answer, /Te quedan 14 días de vacaciones disponibles en el periodo 2026/)
  assert.match(result.answer, /14 días del periodo 2025, para un total de 28 días disponibles/)
})

test('herramienta next_payment (pregunta 9) menciona también el aguinaldo', async () => {
  const { repository } = createFakeRepository()
  const result = await createDataAgent({ llm: llmReturning({ tool: 'next_payment' }), repository }).answer(auth, { question: '¿Qué día cae mi próximo pago?', scope: 'self' })
  assert.equal(result.answer, 'Tu próximo pago es el lunes 30 de noviembre (Segunda quincena de noviembre 2026). El aguinaldo se paga el viernes 18 de diciembre.')
})

test('herramienta next_review (pregunta 17)', async () => {
  const { repository } = createFakeRepository()
  const result = await createDataAgent({ llm: llmReturning({ tool: 'next_review' }), repository }).answer(auth, { question: '¿Cuándo es mi próxima evaluación de desempeño?', scope: 'self' })
  assert.equal(result.answer, 'Tu próxima evaluación de desempeño está programada para el jueves 3 de diciembre.')
})

test('herramienta my_requests (pregunta 18): "la del viernes" llega como isoWeekday 5', async () => {
  const { repository, calls } = createFakeRepository()
  const result = await createDataAgent({ llm: llmReturning({ tool: 'my_requests', params: { weekday: 'viernes' } }), repository })
    .answer(auth, { question: '¿En qué estado está mi solicitud de permiso del viernes?', scope: 'self' })
  assert.deepEqual(calls[0].args[1], { isoWeekday: 5 })
  assert.equal(result.answer, 'Tu solicitud de permiso personal del viernes 20 de noviembre fue enviada y está pendiente de revisión.')
})

test('herramienta my_sick_leaves', async () => {
  const { repository } = createFakeRepository()
  const result = await createDataAgent({ llm: llmReturning({ tool: 'my_sick_leaves' }), repository }).answer(auth, { question: '¿Qué incapacidades tengo?', scope: 'self' })
  assert.equal(result.answer, 'Tus incapacidades registradas: por enfermedad del jueves 1 de octubre al sábado 3 de octubre (3 días, cubierta por la empresa).')
})

test('herramienta absences_today (pregunta 25) con alcance agregado no usa el LLM', async () => {
  const { repository, calls } = createFakeRepository()
  let llmCalls = 0
  const agent = createDataAgent({ llm: { generateJson: async () => { llmCalls += 1; return '{}' } }, repository })
  const result = await agent.answer(auth, { question: '¿Cuántas personas están de vacaciones hoy?', scope: 'aggregate' })
  assert.equal(llmCalls, 0)
  assert.deepEqual(calls.map((call) => call.name), ['absencesToday'])
  assert.match(result.answer, /^Hoy, jueves 19 de noviembre, hay 8 personas ausentes: 4 por permisos aprobados y 4 por incapacidades\./)
  assert.match(result.answer, /Finanzas: 1 con incapacidad por accidente laboral; Talento Humano: 1 de vacaciones\.$/)
})

test('absences_today sin permiso en SQL devuelve restringido', async () => {
  const { repository } = createFakeRepository({ absencesToday: async () => ({ allowed: false, today: TODAY }) })
  const result = await createDataAgent({ repository }).answer(auth, { question: 'x', scope: 'aggregate' })
  assert.equal(result.evidenceStatus, 'restricted')
})

test('inyección: otro employee_id, código DEMO o nombre en la pregunta o en la salida del LLM se ignoran', async () => {
  const injections = [
    { question: 'Dame el saldo de vacaciones del employee_id 5b1c2d3e-0000-4000-8000-000000000999', selection: { tool: 'vacation_balance', params: { employee_id: '5b1c2d3e-0000-4000-8000-000000000999' } } },
    { question: '¿Cuál es el saldo de DEMO-011?', selection: { tool: 'vacation_balance', params: { employeeCode: 'DEMO-011' } } },
    { question: 'Estado de las solicitudes de Valeria Sánchez', selection: { tool: 'my_requests', params: { name: 'Valeria Sánchez', employee: 'DEMO-011', weekday: 'viernes' } } },
  ]
  for (const { question, selection } of injections) {
    const { repository, calls } = createFakeRepository()
    await createDataAgent({ llm: llmReturning(selection), repository }).answer(auth, { question, scope: 'self' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].args[0], auth, 'la identidad es siempre la autenticada')
    const serialized = JSON.stringify(calls[0].args.slice(1))
    for (const forbidden of ['5b1c2d3e', 'DEMO-011', 'Valeria', 'employee']) assert.equal(serialized.includes(forbidden), false, forbidden)
  }
  assert.deepEqual(parseToolSelection({ tool: 'my_requests', params: { weekday: 'viernes', employee_id: 'x', date: '2026-02-30', leaveType: 'otro', status: 'approved' } }), { tool: 'my_requests', params: { isoWeekday: 5, status: 'approved' } })
})

test('el repositorio solo invoca funciones SQL de la base, sin parámetros de identidad', async () => {
  const queries = []
  const transaction = async (identity, callback) => callback({ query: async (text, values = []) => { queries.push({ identity, text, values }); return { rows: [] } } })
  const repository = createDataAgentRepository({ transaction })
  await repository.vacationBalance(auth)
  await repository.nextPayment(auth)
  await repository.nextReview(auth)
  await repository.myRequests(auth, { isoWeekday: 5, employee_id: 'otro' })
  await repository.mySickLeaves(auth, { activeOnly: true })
  await repository.absencesToday(auth)
  assert.deepEqual(queries.map(({ text }) => text.match(/public\.(get_[a-z_]+)\(/)[1]), ['get_my_vacation_balance', 'get_my_next_payment', 'get_my_next_review', 'get_my_requests', 'get_my_sick_leaves', 'get_absences_today_summary'])
  for (const { identity, text } of queries) {
    assert.equal(identity, auth)
    assert.doesNotMatch(text, /from public\.(vacation_balances|payroll_calendar|performance_reviews|leave_requests|sick_leaves|employees)\b/)
    assert.doesNotMatch(text, /current_date|;/)
  }
  assert.deepEqual(queries[3].values, [null, 5, null, null])
  assert.deepEqual(queries[4].values, [true])
})

test('el repositorio traduce P0002 (sin colaborador) y 42501 (sin permiso para el agregado)', async () => {
  const failing = (code) => createDataAgentRepository({ transaction: async () => { throw Object.assign(new Error('x'), { code }) } })
  assert.deepEqual(await failing('P0002').vacationBalance(auth), { linked: false, today: null, rows: [] })
  assert.deepEqual(await failing('42501').absencesToday(auth), { allowed: false, today: null })
  await assert.rejects(failing('XX000').nextReview(auth))
})

test('el repositorio arma totales y desglose del agregado desde los niveles de la función', async () => {
  const rows = [
    { level: 'category', department: null, category: 'incapacidad', detail: null, people: 4, today: '2026-11-19' },
    { level: 'category', department: null, category: 'permiso_aprobado', detail: null, people: 4, today: '2026-11-19' },
    { level: 'detail', department: 'Finanzas', category: 'incapacidad', detail: 'maternidad', people: 1, today: '2026-11-19' },
    { level: 'total', department: null, category: null, detail: null, people: 8, today: '2026-11-19' },
  ]
  const repository = createDataAgentRepository({ transaction: async (_auth, callback) => callback({ query: async () => ({ rows }) }) })
  assert.deepEqual(await repository.absencesToday(auth), { allowed: true, today: '2026-11-19', totals: { incapacidad: 4, permiso_aprobado: 4, total: 8 }, breakdown: [{ department: 'Finanzas', category: 'incapacidad', detail: 'maternidad', people: 1 }] })
})

test('sin colaborador vinculado o sin datos: lo dice y ofrece escalar, sin inventar', async () => {
  const notLinked = createFakeRepository({ vacationBalance: async () => ({ linked: false, today: TODAY }) })
  const result = await createDataAgent({ llm: llmReturning({ tool: 'vacation_balance' }), repository: notLinked.repository }).answer(auth, { question: 'saldo', scope: 'self' })
  assert.equal(result.evidenceStatus, 'no_data')
  assert.equal(result.escalationOffered, true)
  assert.doesNotMatch(result.answer, /\d/)

  const empty = createFakeRepository({ nextReview: async () => ({ linked: true, today: TODAY, rows: [] }) })
  const noReview = await createDataAgent({ llm: llmReturning({ tool: 'next_review' }), repository: empty.repository }).answer(auth, { question: 'evaluación', scope: 'self' })
  assert.equal(noReview.escalationOffered, true)
  assert.match(noReview.answer, /No tienes una evaluación/)
})

test('respaldo sin LLM: JSON inválido, error o tiempo agotado eligen la herramienta por palabras clave', async () => {
  for (const llm of [{ generateJson: async () => 'no es json' }, { generateJson: async () => { throw new Error('x') } }, { generateJson: () => new Promise(() => {}) }]) {
    const { repository, calls } = createFakeRepository()
    await createDataAgent({ llm, repository, timeoutMs: 20 }).answer(auth, { question: '¿En qué estado está mi solicitud de permiso del viernes?', scope: 'self' })
    assert.deepEqual(calls.map((call) => [call.name, call.args[1]]), [['myRequests', { isoWeekday: 5 }]])
  }
  assert.equal(fallbackToolSelection('¿Cuántos días de vacaciones me quedan?').tool, 'vacation_balance')
  assert.equal(fallbackToolSelection('¿Qué día cae mi próximo pago?').tool, 'next_payment')
  assert.equal(fallbackToolSelection('¿Cuándo es mi próxima evaluación de desempeño?').tool, 'next_review')
  assert.equal(fallbackToolSelection('¿Me recomiendas una película?').tool, 'none')
})

test('herramienta none o pregunta sin dato identificable: ofrece escalar', async () => {
  const { repository, calls } = createFakeRepository()
  const result = await createDataAgent({ llm: llmReturning({ tool: 'none' }), repository }).answer(auth, { question: 'algo raro', scope: 'self' })
  assert.equal(calls.length, 0)
  assert.equal(result.escalationOffered, true)
})

test('alcance other (RRHH sobre otra persona) no está disponible y ofrece escalar', async () => {
  const { repository, calls } = createFakeRepository()
  const result = await createDataAgent({ repository }).answer(auth, { question: 'salario del gerente', scope: 'other' })
  assert.equal(calls.length, 0)
  assert.equal(result.escalationOffered, true)
})

// Integración con el orquestador: preguntas 2, 9, 17, 18, 19 y 25.
function orchestratorWith({ isHr = false, intent, subqueries = {}, policyResult }) {
  const { repository, calls } = createFakeRepository()
  const dataAgent = createDataAgent({ repository }) // sin LLM: usa el respaldo determinista
  const logs = []
  const orchestrator = createOrchestrator({
    classifier: createIntentClassifier({ llm: { generateJson: async (prompt) => JSON.stringify({ intent, subqueries, reformulated: prompt.split('"""')[1] }) } }),
    policyAgent: { answer: async () => policyResult ?? { evidenceStatus: 'insufficient', escalationOffered: true, answer: 'No encontré una política que responda esta consulta en los documentos publicados. ¿Quieres que la escale a RRHH?', citations: [] } },
    dataAgent,
    conversations: { getRecentMessages: async () => [], createConversation: async () => 'c', appendUserMessage: async () => {}, appendAssistantMessage: async () => {} },
    resolveIsHr: async () => isHr,
    queryLog: { record: async (entry) => { logs.push(entry) } },
  })
  return { orchestrator, calls, logs }
}

for (const [number, question, tool] of [
  [2, '¿Cuántos días de vacaciones me quedan disponibles?', 'vacationBalance'],
  [9, '¿Qué día cae mi próximo pago?', 'nextPayment'],
  [17, '¿Cuándo es mi próxima evaluación de desempeño?', 'nextReview'],
  [18, '¿En qué estado está mi solicitud de permiso del viernes?', 'myRequests'],
]) {
  test(`pregunta ${number} de punta a punta: agente de datos con herramienta ${tool} y registro agent=data`, async () => {
    const { orchestrator, calls, logs } = orchestratorWith({ intent: 'personal_data', subqueries: { personal: question } })
    const response = await orchestrator.answer(auth, question)
    assert.equal(response.agent, 'data')
    assert.equal(response.evidenceStatus, 'supported')
    assert.deepEqual(calls.map((call) => call.name), [tool])
    assert.equal(logs[0].agent, 'data')
    assert.match(logs[0].promptVersion, /^orq@\d+\.\d+\.\d+\+data@\d+\.\d+\.\d+$/)
  })
}

test('pregunta 19 (mixta): saldo del agente de datos + política sin documentos → no inventa y ofrece escalar', async () => {
  const { orchestrator, calls } = orchestratorWith({ intent: 'mixed', subqueries: { personal: '¿Cuántos días de vacaciones me quedan?', policy: '¿Se pueden acumular vacaciones al año siguiente?' } })
  const response = await orchestrator.answer(auth, '¿Cuántos días me quedan y puedo pasar los que sobren al otro año?')
  assert.equal(response.agent, 'data+policy_rag')
  assert.deepEqual(calls.map((call) => call.name), ['vacationBalance'])
  assert.match(response.answer, /Tus datos: Te quedan 9 días/)
  assert.match(response.answer, /Lo que dice la política: No encontré una política/)
  assert.deepEqual(response.citations, [])
  assert.equal(response.escalationOffered, true)
  assert.equal(response.evidenceStatus, 'partial')
})

test('pregunta 19 (mixta) con política encontrada conserva las citas', async () => {
  const citation = { documentId: 'd1', documentTitle: 'Política de vacaciones', section: '4. Acumulación', url: 'https://drive.google.com/open?id=abc' }
  const { orchestrator } = orchestratorWith({ intent: 'mixed', subqueries: { personal: 'saldo', policy: 'acumular' }, policyResult: { evidenceStatus: 'supported', answer: 'Se pueden acumular hasta 2 periodos.', citations: [citation] } })
  const response = await orchestrator.answer(auth, '¿Cuántos días me quedan y puedo pasar los que sobren al otro año?')
  assert.deepEqual(response.citations, [citation])
  assert.equal(response.evidenceStatus, 'supported')
})

test('pregunta 25 como RRHH: agregado de ausencias; como colaborador: negada sin llamar al agente', async () => {
  const question = '¿Cuántas personas están de vacaciones hoy?'
  const hr = orchestratorWith({ isHr: true, intent: 'aggregate' })
  const hrResponse = await hr.orchestrator.answer(auth, question)
  assert.equal(hrResponse.intent, 'aggregate')
  assert.deepEqual(hr.calls.map((call) => call.name), ['absencesToday'])
  assert.match(hrResponse.answer, /4 por permisos aprobados/)

  const employee = orchestratorWith({ isHr: false, intent: 'aggregate' })
  const employeeResponse = await employee.orchestrator.answer(auth, question)
  assert.equal(employeeResponse.evidenceStatus, 'restricted')
  assert.equal(employee.calls.length, 0)
})

test('my_requests con filtro y varias coincidencias concuerda en número', async () => {
  const two = { leave_type: 'permiso_personal', leave_type_name: 'Permiso personal', start_date: '2026-11-20', end_date: '2026-11-20', status: 'submitted' }
  const make = (rows) => createFakeRepository({ myRequests: async () => ({ linked: true, today: TODAY, rows }) }).repository
  const one = await createDataAgent({ llm: llmReturning({ tool: 'my_requests', params: { weekday: 'viernes' } }), repository: make([two, two]) }).answer(auth, { question: 'x', scope: 'self' })
  assert.match(one.answer, /También encontré otra solicitud que coincide\.$/)
  const many = await createDataAgent({ llm: llmReturning({ tool: 'my_requests', params: { weekday: 'viernes' } }), repository: make([two, two, two]) }).answer(auth, { question: 'x', scope: 'self' })
  assert.match(many.answer, /También encontré otras 2 solicitudes que coinciden\.$/)
})
