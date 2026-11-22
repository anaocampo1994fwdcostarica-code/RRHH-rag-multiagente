import assert from 'node:assert/strict'
import test from 'node:test'
import { createOrchestrator } from '../src/agents/orchestrator.js'
import { createChatController } from '../src/controllers/chatController.js'
import { createGeminiProvider } from '../src/rag/geminiProvider.js'
import { createPolicyAgent } from '../src/rag/policyAgent.js'
import { createVectorRepository } from '../src/rag/vectorRepository.js'

const auth = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })
const embedding = Array.from({ length: 768 }, () => 0.01)

function createResponse() {
  return {
    statusCode: undefined,
    body: undefined,
    status(statusCode) { this.statusCode = statusCode; return this },
    json(body) { this.body = body },
  }
}

test('the policy agent uses injected providers and derives citations only from retrieved chunks', async () => {
  let receivedAuth
  const agent = createPolicyAgent({
    embeddings: { embed: async () => embedding },
    vectors: {
      search: async (identity) => {
        receivedAuth = identity
        return [{ content: 'Las vacaciones deben solicitarse previamente.', document_id: 'document-1', document_title: 'Política de vacaciones', section: 'Solicitud', version: '2', document_url: 'https://drive.google.com/open?id=allowed' }]
      },
    },
    llm: { generate: async () => 'Debes solicitar las vacaciones previamente.' },
  })

  const response = await agent.answer(auth, '¿Cuál es la política de vacaciones?')
  assert.equal(receivedAuth, auth)
  assert.equal(response.evidenceStatus, 'supported')
  assert.deepEqual(response.citations, [{ documentId: 'document-1', documentTitle: 'Política de vacaciones', documentCode: null, section: 'Solicitud', version: '2', url: 'https://drive.google.com/open?id=allowed' }])
  assert.equal(JSON.stringify(response).includes('allowed'), true)
})

test('the policy agent does not generate a supported answer without retrieved evidence', async () => {
  let generateCalls = 0
  const agent = createPolicyAgent({ embeddings: { embed: async () => embedding }, vectors: { search: async () => [] }, llm: { generate: async () => { generateCalls += 1 } } })
  const response = await agent.answer(auth, 'política de permisos')
  assert.equal(response.evidenceStatus, 'insufficient')
  assert.deepEqual(response.citations, [])
  assert.equal(generateCalls, 0)
})

const offlineDeps = {
  conversations: { getRecentMessages: async () => [], createConversation: async () => 'conversation-1', appendUserMessage: async () => {} },
  resolveIsHr: async () => false,
}
const classifierFor = (intent) => ({ classify: async (question) => ({ intent, subqueries: {}, reformulated: question }) })

test('the orchestrator invokes RAG for policy intent and blocks third-party prompts before classifying', async () => {
  let calls = 0
  let classified = 0
  const classifier = { classify: async (question) => { classified += 1; return { intent: 'policy', subqueries: {}, reformulated: question } } }
  const orchestrator = createOrchestrator({ ...offlineDeps, classifier, policyAgent: { answer: async () => { calls += 1; return { evidenceStatus: 'supported', answer: 'Respuesta', citations: [{ documentId: 'd1' }] } } } })
  const policy = await orchestrator.answer(auth, 'política de vacaciones')
  const restricted = await orchestrator.answer(auth, 'mi compañero gana cuánto')
  assert.equal(policy.agent, 'policy_rag')
  assert.equal(policy.evidenceStatus, 'supported')
  assert.equal(restricted.evidenceStatus, 'restricted')
  assert.equal(calls, 1)
  // 'política de vacaciones' la resuelven las reglas de alta confianza y la de terceros se niega antes: 0 llamadas.
  assert.equal(classified, 0)
})

test('the orchestrator maps provider errors to unavailable without leaking provider details', async () => {
  const orchestrator = createOrchestrator({ ...offlineDeps, classifier: classifierFor('policy'), policyAgent: { answer: async () => { throw new Error('provider secret detail') } } })
  const response = await orchestrator.answer(auth, 'horario de trabajo')
  assert.equal(response.evidenceStatus, 'unavailable')
  assert.equal(response.answer.includes('secret'), false)
})

test('the vector repository validates embeddings and makes only the approved RPC call', async () => {
  let call
  const repository = createVectorRepository({ createDataClient: (identity) => ({ rpc: async (name, parameters) => { call = { identity, name, parameters }; return { data: [] } } }) })
  assert.deepEqual(await repository.search(auth, embedding), [])
  assert.equal(call.identity, auth)
  assert.equal(call.name, 'match_policy_chunks')
  assert.equal(call.parameters.query_embedding.length, 768)
  await assert.rejects(repository.search(auth, [0]), /Invalid query embedding/)
  await assert.rejects(repository.search(auth, embedding, { limit: 11 }), /Invalid retrieval limit/)
})

test('the Gemini provider validates 768 dimensions with an injected local client', async () => {
  const provider = createGeminiProvider({
    apiKey: 'test-key-not-used-remotely',
    createClient: () => ({ models: { embedContent: async () => ({ embeddings: [{ values: embedding }] }), generateContent: async () => ({ text: 'Texto local' }) } }),
  })
  assert.equal((await provider.embed('texto')).length, 768)
  assert.equal(await provider.generate('pregunta'), 'Texto local')
  assert.equal(await provider.generateJson('pregunta', { schema: {} }), 'Texto local')
})

test('the chat controller requires a bounded question and forwards verified identity to its injected orchestrator', async () => {
  let received
  const controller = createChatController({ answer: async (...arguments_) => { received = arguments_; return { answer: 'Respuesta', intent: 'policy', agent: 'policy_rag', evidenceStatus: 'supported', citations: [] } } })
  const response = createResponse()
  await controller({ body: { question: ' política de horarios ' }, auth }, response, (error) => { throw error })
  assert.equal(response.statusCode, 200)
  assert.equal(received[0], auth)
  assert.equal(received[1], 'política de horarios')
  assert.deepEqual(received[2], { conversationId: undefined })

  let error
  await controller({ body: { question: '' }, auth }, createResponse(), (nextError) => { error = nextError })
  assert.equal(error.statusCode, 400)

  let conversationError
  await controller({ body: { question: 'hola', conversationId: 'no-es-uuid' }, auth }, createResponse(), (nextError) => { conversationError = nextError })
  assert.equal(conversationError.statusCode, 400)
})

test('policy agent returns not-found with escalation when the model reports SIN_EVIDENCIA', async () => {
  const { createPolicyAgent } = await import('../src/rag/policyAgent.js')
  const agent = createPolicyAgent({
    embeddings: { embed: async () => [0.1] },
    vectors: { search: async () => [{ document_id: 'd1', document_title: 'POL-06 Beneficios', section: '3. Bonos', content: 'Bono escolar.' }] },
    llm: { generate: async () => 'SIN_EVIDENCIA' },
  })
  const result = await agent.answer({}, '¿Hay bono por mascotas?')
  assert.equal(result.evidenceStatus, 'insufficient')
  assert.equal(result.escalationOffered, true)
  assert.deepEqual(result.citations, [])
})

test('policy agent cites only the fragments referenced by the model and always at least one', async () => {
  const { createPolicyAgent } = await import('../src/rag/policyAgent.js')
  const chunks = [
    { document_id: 'd1', document_title: 'POL-01', section: '2. Días', content: 'a' },
    { document_id: 'd2', document_title: 'POL-05', section: '4. Pagos', content: 'b' },
  ]
  const make = (text) => createPolicyAgent({ embeddings: { embed: async () => [0] }, vectors: { search: async () => chunks }, llm: { generate: async () => text } })
  assert.deepEqual((await make('Se paga el día 15 [2].').answer({}, 'q')).citations.map((c) => c.documentId), ['d2'])
  assert.deepEqual((await make('Respuesta sin marcas.').answer({}, 'q')).citations.map((c) => c.documentId), ['d1'])
})
