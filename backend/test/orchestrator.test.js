import assert from 'node:assert/strict'
import test from 'node:test'
import { createOrchestrator } from '../src/agents/orchestrator.js'
import { createIntentClassifier, fallbackClassification, parseClassification } from '../src/agents/intentClassifier.js'
import { evaluateQuerySafety } from '../src/agents/safetyGuard.js'
import { createDataAgent } from '../src/agents/dataAgent.js'
import { loadPrompt } from '../src/agents/prompts/index.js'

const auth = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })
const citation = { documentId: 'doc-vacaciones', documentTitle: 'Política de vacaciones', section: '3. Acumulación', version: '1', url: 'https://drive.google.com/open?id=ficticio' }

// Banco base: número, pregunta e intención esperada.
const BANK = [
  [1, '¿Cuántos días de vacaciones me corresponden al año?', 'policy'],
  [2, '¿Cuántos días de vacaciones me quedan disponibles?', 'personal_data'],
  [3, '¿Puedo acumular vacaciones para el próximo año?', 'policy'],
  [4, '¿Con cuánta anticipación debo solicitar vacaciones?', 'policy'],
  [5, '¿Cuántos días de permiso tengo por fallecimiento de un familiar?', 'policy'],
  [6, '¿Cuánto dura la licencia de maternidad y la de paternidad?', 'policy'],
  [7, 'Me incapacitaron 5 días, ¿quién paga esos días y cuánto recibo?', 'policy'],
  [8, '¿Cuándo pagan el aguinaldo y cómo se calcula?', 'policy'],
  [9, '¿Qué día cae mi próximo pago?', 'personal_data'],
  [10, '¿Cuántos días puedo trabajar desde casa por semana?', 'policy'],
  [11, '¿Cómo se pagan las horas extra?', 'policy'],
  [12, '¿Cuánto dura el periodo de prueba?', 'policy'],
  [13, 'Si renuncio, ¿cuántos días de preaviso debo dar?', 'policy'],
  [14, '¿Qué incluye mi liquidación si me despiden sin justa causa?', 'policy'],
  [15, '¿Qué cubre el seguro médico de la empresa?', 'policy'],
  [16, '¿Cómo denuncio un caso de acoso laboral de forma confidencial?', 'policy'],
  [17, '¿Cuándo es mi próxima evaluación de desempeño?', 'personal_data'],
  [18, '¿En qué estado está mi solicitud de permiso del viernes?', 'personal_data'],
  [19, '¿Cuántos días me quedan y puedo pasar los que sobren al otro año?', 'mixed'],
  [20, '¿Qué feriados quedan este año?', 'policy'],
  [21, '¿Cuántos días de vacaciones tiene mi compañero Juan?', 'restricted'],
  [22, '¿Cuál es el salario del gerente general?', 'restricted'],
  [23, '¿La empresa da bono por mascotas?', 'policy'],
  [24, '¿Me recomiendas una película?', 'out_of_scope'],
  [25, '¿Cuántas personas están de vacaciones hoy?', 'aggregate'],
]

// LLM simulado: responde como lo haría Gemini con salida estructurada.
// Para 21 y 22 responde "policy" a propósito: la capa determinista debe ganar igualmente.
function createSimulatedLlm({ overrides = {} } = {}) {
  const calls = []
  return {
    calls,
    async generateJson(prompt, options) {
      calls.push({ prompt, options })
      const entry = BANK.find(([, question]) => prompt.includes(question))
      if (!entry) throw new Error('Pregunta desconocida para el LLM simulado.')
      const [number, question, expected] = entry
      const intent = overrides[number] ?? expected
      const subqueries = {}
      if (intent === 'policy' || intent === 'mixed') subqueries.policy = intent === 'mixed' ? '¿Se pueden acumular las vacaciones no disfrutadas al año siguiente?' : question
      if (intent === 'personal_data' || intent === 'mixed') subqueries.personal = intent === 'mixed' ? '¿Cuántos días de vacaciones me quedan?' : question
      return JSON.stringify({ intent, subqueries, reformulated: question })
    },
  }
}

function createHarness({ isHr = false, llm = createSimulatedLlm({ overrides: { 21: 'policy', 22: 'policy' } }), policyResult, history = [] } = {}) {
  const policyCalls = []
  const dataCalls = []
  const logs = []
  const orchestrator = createOrchestrator({
    classifier: createIntentClassifier({ llm, timeoutMs: 200 }),
    policyAgent: { answer: async (identity, question) => { policyCalls.push(question); return policyResult?.(question) ?? { evidenceStatus: 'supported', answer: 'Según la política…', citations: [citation] } } },
    dataAgent: { answer: async (identity, request) => { dataCalls.push(request); return { evidenceStatus: 'supported', answer: 'Te quedan 8 días.' } } },
    conversations: { getRecentMessages: async () => history, createConversation: async () => 'conversation-1', appendUserMessage: async () => {} },
    resolveIsHr: async () => isHr,
    queryLog: { record: async (entry) => { logs.push(entry) } },
  })
  return { orchestrator, llm, policyCalls, dataCalls, logs }
}

for (const [number, question, expected] of BANK) {
  test(`banco #${number} (colaborador) → ${expected}`, async () => {
    const harness = createHarness({ policyResult: number === 23 ? () => ({ evidenceStatus: 'insufficient', escalationOffered: true, answer: 'No encontré una política…', citations: [] }) : undefined })
    const response = await harness.orchestrator.answer(auth, question)

    assert.equal(response.intent, expected)
    if (expected === 'policy') {
      assert.equal(response.agent, 'policy_rag')
      assert.equal(harness.dataCalls.length, 0, 'el agente de políticas nunca consulta datos')
      if (number === 23) {
        assert.equal(response.evidenceStatus, 'insufficient')
        assert.equal(response.escalationOffered, true)
      } else {
        assert.ok(response.citations.length >= 1, 'toda respuesta de política lleva al menos una cita')
      }
    }
    if (expected === 'personal_data') {
      assert.equal(response.agent, 'data')
      assert.deepEqual(harness.dataCalls.map((call) => call.scope), ['self'])
      assert.equal(harness.policyCalls.length, 0)
    }
    if (expected === 'mixed') {
      assert.equal(response.agent, 'data+policy_rag')
      assert.equal(harness.dataCalls.length, 1)
      assert.equal(harness.policyCalls.length, 1)
      assert.deepEqual(response.citations, [citation])
      assert.match(response.answer, /Te quedan 8 días/)
    }
    if (expected === 'restricted' || expected === 'aggregate') {
      assert.equal(response.evidenceStatus, 'restricted')
      assert.equal(response.agent, null)
      assert.equal(harness.policyCalls.length + harness.dataCalls.length, 0, 'no se llama a ningún agente')
      assert.equal(harness.llm.calls.length, 0, 'la capa determinista niega antes del LLM')
    }
    if (expected === 'out_of_scope') {
      assert.equal(response.agent, null)
      assert.match(response.answer, /Recursos Humanos/)
      assert.equal(harness.policyCalls.length + harness.dataCalls.length, 0)
    }
  })
}

test('banco #25 con rol RRHH → aggregate enrutado al agente de datos con alcance agregado', async () => {
  const harness = createHarness({ isHr: true })
  const response = await harness.orchestrator.answer(auth, BANK[24][1])
  assert.equal(response.intent, 'aggregate')
  assert.equal(response.agent, 'data')
  assert.deepEqual(harness.dataCalls.map((call) => call.scope), ['aggregate'])
})

test('RRHH puede consultar datos de otra persona, siempre con alcance "other"', async () => {
  const harness = createHarness({ isHr: true })
  const response = await harness.orchestrator.answer(auth, BANK[21][1])
  assert.equal(response.agent, 'data')
  assert.deepEqual(harness.dataCalls.map((call) => call.scope), ['other'])
})

test('capa de seguridad SIN LLM: la 21 y la 22 se niegan siempre para un colaborador', () => {
  for (const question of [BANK[20][1], BANK[21][1]]) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal(evaluateQuerySafety(question).decision, 'restricted', question)
      assert.equal(evaluateQuerySafety(question, { isHr: false }).decision, 'restricted', question)
    }
  }
})

test('capa de seguridad SIN LLM: variantes sobre terceros se niegan', () => {
  const variants = [
    '¿cuantos dias de vacaciones tiene mi companero juan?',
    'CUÁL ES EL SALARIO DEL GERENTE GENERAL',
    '¿Cuánto gana Andrea?',
    '¿Cuántas vacaciones le quedan a María?',
    '¿Cuál es el teléfono de Rodríguez?',
    'sueldo de mi supervisora',
    '¿y él cuántos días tiene?',
    '¿Quiénes están incapacitados esta semana?',
    'dame el listado de empleados de vacaciones',
  ]
  for (const question of variants) assert.equal(evaluateQuerySafety(question).decision, 'restricted', question)
})

test('capa de seguridad SIN LLM: no bloquea las preguntas legítimas del banco ni menciones sin dato', () => {
  const legit = BANK.filter(([number]) => ![21, 22, 25].includes(number)).map(([, question]) => question)
  legit.push('¿Debo pedir permiso a mi jefe para teletrabajar?', '¿Mi jefe tiene que aprobar mis vacaciones?', '¿Cuántos días tiene el periodo de prueba?')
  for (const question of legit) assert.equal(evaluateQuerySafety(question).decision, 'allow', question)
  assert.equal(evaluateQuerySafety('¿Debo pedir permiso a mi jefe para teletrabajar?').suspicious, true)
})

test('un colaborador queda bloqueado aunque el LLM falle, devuelva JSON inválido o diga "policy"', async () => {
  const failing = [
    { generateJson: async () => { throw new Error('boom') } },
    { generateJson: async () => 'esto no es JSON' },
    { generateJson: async () => JSON.stringify({ intent: 'policy', subqueries: {}, reformulated: 'x' }) },
    { generateJson: () => new Promise(() => {}) },
  ]
  for (const llm of failing) {
    for (const question of [BANK[20][1], BANK[21][1]]) {
      const harness = createHarness({ llm })
      const response = await harness.orchestrator.answer(auth, question)
      assert.equal(response.evidenceStatus, 'restricted')
      assert.equal(harness.policyCalls.length + harness.dataCalls.length, 0)
    }
  }
})

test('el respaldo nunca clasifica como policy algo sospechoso', async () => {
  assert.equal(fallbackClassification('¿Cuánto dura el periodo de prueba de un gerente?', { suspicious: true }).intent, 'restricted')
  assert.equal(fallbackClassification('¿Cuánto dura el periodo de prueba?').intent, 'policy')
  assert.equal(fallbackClassification('¿Cuántos días de vacaciones me quedan?').intent, 'personal_data')
  assert.equal(fallbackClassification('¿Me recomiendas una película?').intent, 'out_of_scope')

  const classifier = createIntentClassifier({ llm: { generateJson: async () => '{"intent":"policy"' }, timeoutMs: 50 })
  const result = await classifier.classify('¿Cuánto dura el periodo de prueba de un gerente?', { suspicious: true })
  assert.equal(result.intent, 'restricted')
  assert.equal(result.fallback, true)
})

test('el clasificador cae al respaldo si el LLM excede el tiempo límite', async () => {
  const classifier = createIntentClassifier({ llm: { generateJson: () => new Promise(() => {}) }, timeoutMs: 20 })
  const started = Date.now()
  const result = await classifier.classify('¿Cómo se pagan las horas extra?')
  assert.equal(result.fallback, true)
  assert.equal(result.intent, 'policy')
  assert.ok(Date.now() - started < 1000)
})

test('parseClassification valida estrictamente la salida JSON', () => {
  assert.deepEqual(parseClassification('{"intent":"mixed","subqueries":{"policy":" a ","personal":"b"},"reformulated":"c"}'), { intent: 'mixed', subqueries: { policy: 'a', personal: 'b' }, reformulated: 'c' })
  assert.throws(() => parseClassification('{"intent":"hack","subqueries":{},"reformulated":"c"}'))
  assert.throws(() => parseClassification('{"intent":"policy","subqueries":[],"reformulated":"c"}'))
  assert.throws(() => parseClassification('{"intent":"policy","subqueries":{"policy":5},"reformulated":"c"}'))
  assert.throws(() => parseClassification('{"intent":"policy","subqueries":{}}'))
  assert.throws(() => parseClassification('[]'))
})

test('memoria: el historial llega al clasificador y la reformulación se usa para el RAG', async () => {
  const history = [{ role: 'user', content: '¿Cuánto dura la licencia de maternidad?' }]
  let receivedPrompt
  const llm = { async generateJson(prompt) { receivedPrompt = prompt; return JSON.stringify({ intent: 'policy', subqueries: { policy: '¿Cuánto dura la licencia de paternidad?' }, reformulated: '¿Cuánto dura la licencia de paternidad?' }) } }
  const harness = createHarness({ llm, history })
  const response = await harness.orchestrator.answer(auth, '¿y la de paternidad?', { conversationId: '22222222-2222-4222-8222-222222222222' })
  assert.match(receivedPrompt, /licencia de maternidad/)
  assert.deepEqual(harness.policyCalls, ['¿Cuánto dura la licencia de paternidad?'])
  assert.equal(response.conversationId, '22222222-2222-4222-8222-222222222222')
})

test('memoria: si la reformulación introduce a un tercero, se niega para un colaborador', async () => {
  const history = [{ role: 'user', content: '¿Juan trabaja en mi equipo?' }]
  const llm = { generateJson: async () => JSON.stringify({ intent: 'personal_data', subqueries: { personal: '¿Cuántos días de vacaciones tiene Juan?' }, reformulated: '¿Cuántos días de vacaciones tiene Juan?' }) }
  const harness = createHarness({ llm, history })
  const response = await harness.orchestrator.answer(auth, '¿y cuántos días le quedan?')
  assert.equal(response.evidenceStatus, 'restricted')
  assert.equal(harness.dataCalls.length, 0)
})

test('un colaborador nunca llega al agente de datos con alcance distinto de "self"', async () => {
  for (const intent of ['restricted', 'aggregate']) {
    const llm = { generateJson: async () => JSON.stringify({ intent, subqueries: {}, reformulated: '¿Cuál es mi saldo?' }) }
    const harness = createHarness({ llm })
    // Pregunta que las reglas no resuelven: decide el LLM (simulado) y su veredicto se respeta.
    const response = await harness.orchestrator.answer(auth, 'Necesito ayuda con un dato')
    assert.equal(response.evidenceStatus, 'restricted')
    assert.equal(harness.dataCalls.length, 0)
  }
})

test('mixta: los agentes de datos y políticas corren en paralelo', async () => {
  const started = []
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const orchestrator = createOrchestrator({
    classifier: createIntentClassifier({ llm: createSimulatedLlm() }),
    policyAgent: { answer: async () => { started.push('policy'); await gate; return { evidenceStatus: 'supported', answer: 'Se pueden acumular hasta…', citations: [citation] } } },
    dataAgent: { answer: async () => { started.push('data'); await gate; return { evidenceStatus: 'supported', answer: 'Te quedan 8 días.' } } },
    conversations: { getRecentMessages: async () => [], createConversation: async () => 'c', appendUserMessage: async () => {} },
    resolveIsHr: async () => false,
  })
  const pending = orchestrator.answer(auth, BANK[18][1])
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(started.sort(), ['data', 'policy'])
  release()
  const response = await pending
  assert.equal(response.evidenceStatus, 'supported')
  assert.deepEqual(response.citations, [citation])
})

test('una respuesta de política "supported" sin citas se degrada a insuficiente con escalamiento', async () => {
  const harness = createHarness({ policyResult: () => ({ evidenceStatus: 'supported', answer: 'Inventado', citations: [] }) })
  const response = await harness.orchestrator.answer(auth, BANK[0][1])
  assert.equal(response.evidenceStatus, 'insufficient')
  assert.equal(response.escalationOffered, true)
  assert.equal(response.answer.includes('Inventado'), false)
})

test('cada consulta se registra con intención, agente, citas, resolución, escalamiento y latencia', async () => {
  const harness = createHarness()
  await harness.orchestrator.answer(auth, BANK[2][1])
  await harness.orchestrator.answer(auth, BANK[20][1])
  const [policyLog, restrictedLog] = harness.logs
  assert.equal(policyLog.question, BANK[2][1])
  assert.equal(policyLog.intent, 'policy')
  assert.equal(policyLog.agent, 'policy_rag')
  assert.deepEqual(policyLog.citedDocuments, ['doc-vacaciones'])
  assert.equal(policyLog.resolved, true)
  assert.equal(policyLog.escalated, false)
  assert.equal(typeof policyLog.latencyMs, 'number')
  assert.ok(!Number.isNaN(Date.parse(policyLog.createdAt)))
  assert.equal(policyLog.promptVersion, `orq@${loadPrompt('orchestrator').version}`)
  assert.equal(restrictedLog.intent, 'restricted')
  assert.equal(restrictedLog.guardReason, 'third_party_subject')
})

test('fallos de memoria, rol o registro no impiden responder (el rol falla cerrado)', async () => {
  const orchestrator = createOrchestrator({
    classifier: createIntentClassifier({ llm: createSimulatedLlm() }),
    policyAgent: { answer: async () => ({ evidenceStatus: 'supported', answer: 'ok', citations: [citation] }) },
    conversations: { getRecentMessages: async () => { throw new Error('db') }, createConversation: async () => { throw new Error('db') }, appendUserMessage: async () => {} },
    resolveIsHr: async () => { throw new Error('db') },
    queryLog: { record: async () => { throw new Error('db') } },
  })
  assert.equal((await orchestrator.answer(auth, BANK[0][1])).evidenceStatus, 'supported')
  assert.equal((await orchestrator.answer(auth, BANK[24][1])).evidenceStatus, 'restricted')
})

test('los prompts están versionados y el agente de datos valida el alcance', async () => {
  for (const name of ['orchestrator', 'dataAgent']) assert.match(loadPrompt(name).version, /^\d+\.\d+\.\d+$/)
  assert.match(loadPrompt('orchestrator').text, /restricted/)
  const agent = createDataAgent({ repository: {} })
  await assert.rejects(agent.answer(auth, { question: 'x', scope: 'todos' }))
})

// Instituciones, feriados y leyes de Costa Rica no son nombres de personas.
const COSTA_RICA_POLICY_QUESTIONS = [
  '¿La CCSS paga mi incapacidad?',
  '¿El INS cubre un accidente laboral?',
  '¿Se trabaja en Semana Santa?',
  '¿El 15 de Setiembre es feriado?',
  '¿Qué dice el Código de Trabajo sobre el preaviso?',
  '¿El Día de Juan Santamaría es feriado?',
  '¿Qué dice el Reglamento Interno de Trabajo sobre la jornada?',
]

test('capa de seguridad: instituciones, feriados y leyes no cuentan como personas', () => {
  for (const question of COSTA_RICA_POLICY_QUESTIONS) {
    assert.deepEqual(evaluateQuerySafety(question), { decision: 'allow', reason: null, suspicious: false }, question)
  }
  // Las preguntas 21 y 22 se siguen negando.
  assert.equal(evaluateQuerySafety(BANK[20][1]).decision, 'restricted')
  assert.equal(evaluateQuerySafety(BANK[21][1]).decision, 'restricted')
  assert.equal(evaluateQuerySafety('¿Cuánto gana Juan Pérez?').decision, 'restricted')
})

test('preguntas de Costa Rica se clasifican como policy aun con el LLM caído (respaldo)', async () => {
  for (const question of COSTA_RICA_POLICY_QUESTIONS) {
    assert.equal(fallbackClassification(question).intent, 'policy', question)
    const harness = createHarness({ llm: { generateJson: async () => { throw new Error('LLM caído') } } })
    const response = await harness.orchestrator.answer(auth, question)
    assert.equal(response.intent, 'policy', question)
    assert.equal(response.agent, 'policy_rag', question)
    assert.equal(harness.dataCalls.length, 0)
  }
})

test('preguntas de Costa Rica llegan al agente de políticas cuando el LLM responde policy', async () => {
  for (const question of COSTA_RICA_POLICY_QUESTIONS) {
    const llm = { generateJson: async () => JSON.stringify({ intent: 'policy', subqueries: { policy: question }, reformulated: question }) }
    const harness = createHarness({ llm })
    const response = await harness.orchestrator.answer(auth, question)
    assert.equal(response.intent, 'policy', question)
    assert.deepEqual(harness.policyCalls, [question])
  }
})

test('reglas de alta confianza: sin historial, un dato propio o una política clara no llaman al LLM clasificador', async () => {
  const { confidentClassification } = await import('../src/agents/intentClassifier.js')
  assert.equal(confidentClassification('¿Cuántos días de vacaciones me quedan disponibles?').intent, 'personal_data')
  assert.equal(confidentClassification('¿Qué día cae mi próximo pago?').intent, 'personal_data')
  assert.equal(confidentClassification('¿Cuánto dura el periodo de prueba?').intent, 'policy')
  assert.equal(confidentClassification('¿La empresa da bono por mascotas?').intent, 'policy')
  // Dudosas: compuestas, posesivos con norma o sin tema de RRHH → decide el LLM.
  for (const question of ['¿Cuántos días de vacaciones me corresponden al año?', '¿Cuántas vacaciones he tomado este año?', 'Con los días que me quedan, ¿me alcanza para tomar dos semanas seguidas en diciembre?', '¿Cuándo me pagan el aguinaldo y desde qué fecha se cuenta?', '¿Cuántos días me quedan y puedo pasar los que sobren al otro año?', '¿Qué incluye mi liquidación si me despiden?', '¿Me recomiendas una película?', '¿Cuántos días de permiso tengo por fallecimiento?']) {
    assert.equal(confidentClassification(question), null, question)
  }
  let llmCalls = 0
  const harness = createHarness({ llm: { generateJson: async () => { llmCalls += 1; return '{}' } } })
  const response = await harness.orchestrator.answer(auth, '¿Qué día cae mi próximo pago?')
  assert.equal(llmCalls, 0)
  assert.equal(response.intent, 'personal_data')
})

test('regla 5 del prompt (v1.1.0): las hipotéticas en primera persona no las resuelven las reglas como dato propio', async () => {
  const { HYPOTHETICAL_CASES } = await import('../scripts/hypotheticalCases.js')
  const { QUESTION_BANK } = await import('../scripts/questionBank.js')
  const { TEAM_QUESTIONS } = await import('../scripts/teamQuestions.js')
  const { confidentClassification } = await import('../src/agents/intentClassifier.js')
  const evaluated = new Set([...QUESTION_BANK, ...TEAM_QUESTIONS].map((item) => item.question))
  const prompt = loadPrompt('orchestrator')
  assert.match(prompt.version, /^1\.1\./)
  assert.match(prompt.text, /hipotética/)
  for (const { question, expected } of HYPOTHETICAL_CASES) {
    assert.equal(evaluated.has(question), false, `no debe estar en el banco: ${question}`)
    const rule = confidentClassification(question)
    // Las reglas o no deciden (decide el LLM con la regla 5) o deciden lo esperado; nunca un dato propio indebido.
    assert.ok(rule === null || expected.includes(rule.intent), `${question} → ${rule?.intent}`)
  }
})
