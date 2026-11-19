import assert from 'node:assert/strict'
import test from 'node:test'
import { createDeepseekProvider } from '../src/llm/deepseekProvider.js'
import { cosineSimilarity, createLocalEmbeddingProvider, e5Input } from '../src/rag/localEmbeddingProvider.js'
import { createVectorRepository } from '../src/rag/vectorRepository.js'
import { DEFAULT_SIMILARITY_THRESHOLDS, env } from '../src/config/env.js'
import { createOpenAiEmbeddingProvider, createOpenAiProvider, toStrictSchema } from '../src/llm/openaiProvider.js'
import { classificationSchema, parseClassification } from '../src/agents/intentClassifier.js'
import { parseToolSelection, toolSelectionSchema } from '../src/agents/data/dataTools.js'

const SECRET = 'sk-test-secret-that-must-never-leak'
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const completion = (content) => jsonResponse(200, { choices: [{ message: { content } }] })

test('DeepSeek: llama a /chat/completions con JSON Output, temperatura 0 y el esquema en el prompt', async () => {
  let request
  const provider = createDeepseekProvider({ apiKey: SECRET, fetchImpl: async (url, init) => { request = { url, init }; return completion('{"intent":"policy"}') } })
  const text = await provider.generateJson('pregunta', { schema: { type: 'object' }, systemInstruction: 'Clasifica.' })
  assert.equal(text, '{"intent":"policy"}')
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions')
  assert.equal(request.init.headers.authorization, `Bearer ${SECRET}`)
  const body = JSON.parse(request.init.body)
  assert.equal(body.model, 'deepseek-flash')
  assert.equal(body.temperature, 0)
  assert.deepEqual(body.response_format, { type: 'json_object' })
  assert.match(body.messages[0].content, /json/)
  assert.match(body.messages[0].content, /JSON Schema/)
})

test('DeepSeek: reintenta ante 429 y 5xx con espera, y luego responde', async () => {
  const statuses = [429, 503]
  let calls = 0
  const provider = createDeepseekProvider({ apiKey: SECRET, baseDelayMs: 1, fetchImpl: async () => { calls += 1; const status = statuses.shift(); return status ? jsonResponse(status, {}) : completion('ok') } })
  assert.equal(await provider.generate('hola'), 'ok')
  assert.equal(calls, 3)
})

test('DeepSeek: no reintenta 4xx no recuperables y el error no contiene la clave', async () => {
  let calls = 0
  const provider = createDeepseekProvider({ apiKey: SECRET, baseDelayMs: 1, fetchImpl: async () => { calls += 1; return jsonResponse(401, { error: { message: `bad key ${SECRET}` } }) } })
  await assert.rejects(provider.generate('hola'), (error) => {
    assert.equal(error.status, 401)
    assert.equal(error.message.includes(SECRET), false)
    assert.equal(JSON.stringify(error).includes(SECRET), false)
    return true
  })
  assert.equal(calls, 1)
})

test('DeepSeek: contenido JSON vacío se reintenta (JSON Output puede devolver solo espacios)', async () => {
  const contents = ['   ', '{"tool":"none"}']
  const provider = createDeepseekProvider({ apiKey: SECRET, baseDelayMs: 1, fetchImpl: async () => completion(contents.shift()) })
  assert.equal(await provider.generateJson('x'), '{"tool":"none"}')
})

test('DeepSeek: respeta el tiempo límite y la señal del llamador', async () => {
  const hanging = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
  const provider = createDeepseekProvider({ apiKey: SECRET, timeoutMs: 30, fetchImpl: hanging })
  await assert.rejects(provider.generate('x'), /timed out or was aborted/)
  const controller = new AbortController()
  const pending = createDeepseekProvider({ apiKey: SECRET, timeoutMs: 5000, fetchImpl: hanging }).generateJson('x', { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, /aborted/)
})

test('DeepSeek: sin clave falla de inmediato sin llamar a la red', async () => {
  let called = false
  await assert.rejects(createDeepseekProvider({ apiKey: '', fetchImpl: async () => { called = true } }).generate('x'), /not configured/)
  assert.equal(called, false)
})

test('E5 local: prefijos query/passage, pooling mean + normalización y 768 dimensiones', async () => {
  const seen = []
  const vector = Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0))
  let loads = 0
  const provider = createLocalEmbeddingProvider({ shared: false, loadPipeline: async () => { loads += 1; return async (input, options) => { seen.push({ input, options }); return { data: Float32Array.from(vector) } } } })
  await provider.preload()
  assert.equal((await provider.embed('¿Cuántos días de vacaciones tengo?')).length, 768)
  await provider.embed('Artículo 3. Vacaciones.', 'RETRIEVAL_DOCUMENT')
  assert.equal(loads, 1, 'el modelo se carga una sola vez')
  assert.equal(seen[0].input, 'query: ¿Cuántos días de vacaciones tengo?')
  assert.equal(seen[1].input, 'passage: Artículo 3. Vacaciones.')
  assert.deepEqual(seen[0].options, { pooling: 'mean', normalize: true })
  assert.equal(e5Input('  hola ', 'passage'), 'passage: hola')
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1)
})

test('E5 local: rechaza salidas con dimensión incorrecta', async () => {
  const provider = createLocalEmbeddingProvider({ shared: false, loadPipeline: async () => async () => ({ data: new Float32Array(384) }) })
  await assert.rejects(provider.embed('x'), /Invalid local embedding/)
})

test('el repositorio vectorial usa por defecto el umbral configurado para el proveedor de embeddings', async () => {
  let parameters
  const repository = createVectorRepository({ createDataClient: () => ({ rpc: async (_name, values) => { parameters = values; return { data: [] } } }) })
  await repository.search({}, Array.from({ length: 768 }, () => 0.01))
  assert.equal(parameters.similarity_threshold, env.ragSimilarityThreshold)
  assert.deepEqual(DEFAULT_SIMILARITY_THRESHOLDS, { openai: 0.45, local: 0.82, gemini: 0.7 })
})

test('DeepSeek: DEEPSEEK_BASE_URL configurable (intermediaria compatible con OpenAI), solo https y sin credenciales', async () => {
  const urls = []
  const make = (baseUrl) => createDeepseekProvider({ apiKey: SECRET, baseUrl, fetchImpl: async (url) => { urls.push(url); return completion('ok') } })
  await make('https://gateway.example.test/v1/').generate('x')
  await make(undefined).generate('x')
  assert.deepEqual(urls, ['https://gateway.example.test/v1/chat/completions', 'https://api.deepseek.com/chat/completions'])
  assert.throws(() => make('http://gateway.example.test'), /https/)
  assert.throws(() => make('https://user:pass@gateway.example.test'), /credentials/)
})

test('OpenAI: Chat Completions con Structured Outputs estricto y reasoning_effort none, sin temperature', async () => {
  let request
  const provider = createOpenAiProvider({ apiKey: SECRET, fetchImpl: async (url, init) => { request = { url, init }; return jsonResponse(200, { choices: [{ message: { content: '{"intent":"policy"}' } }], usage: { prompt_tokens: 120, completion_tokens: 15 } }) } })
  assert.equal(await provider.generateJson('p', { schema: classificationSchema, systemInstruction: 'Clasifica.' }), '{"intent":"policy"}')
  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions')
  const body = JSON.parse(request.init.body)
  assert.equal(body.model, 'gpt-6-luna')
  assert.equal(body.reasoning_effort, 'none')
  assert.equal('temperature' in body, false)
  assert.equal(body.response_format.type, 'json_schema')
  assert.equal(body.response_format.json_schema.strict, true)
  assert.deepEqual(body.messages.map((message) => message.role), ['system', 'user'])
  assert.deepEqual(provider.usage, { requests: 1, promptTokens: 120, completionTokens: 15, embeddingTokens: 0 })
})

test('OpenAI: toStrictSchema cumple el modo estricto y los parsers aceptan los null resultantes', () => {
  const strict = toStrictSchema(toolSelectionSchema)
  assert.equal(strict.additionalProperties, false)
  assert.deepEqual(strict.required, ['tool', 'params'])
  assert.equal(strict.properties.params.additionalProperties, false)
  assert.deepEqual(strict.properties.params.required, ['weekday', 'date', 'leaveType', 'status', 'activeOnly'])
  assert.deepEqual(strict.properties.params.properties.weekday.type, ['string', 'null'])
  assert.equal(strict.properties.params.properties.weekday.enum.at(-1), null)
  assert.deepEqual(parseToolSelection({ tool: 'my_requests', params: { weekday: 'viernes', date: null, leaveType: null, status: null, activeOnly: null } }), { tool: 'my_requests', params: { isoWeekday: 5 } })
  const strictClassification = toStrictSchema(classificationSchema)
  assert.deepEqual(strictClassification.properties.subqueries.required, ['policy', 'personal'])
  assert.deepEqual(parseClassification({ intent: 'policy', subqueries: { policy: 'x', personal: null }, reformulated: 'x' }), { intent: 'policy', subqueries: { policy: 'x' }, reformulated: 'x' })
})

test('OpenAI: una negativa (refusal) se trata como error para activar el respaldo', async () => {
  const provider = createOpenAiProvider({ apiKey: SECRET, fetchImpl: async () => jsonResponse(200, { choices: [{ message: { content: null, refusal: 'No puedo.' } }] }) })
  await assert.rejects(provider.generateJson('x', { schema: classificationSchema }), /refused/)
})

test('OpenAI: reintenta 429/5xx, no reintenta 401 y el error solo trae el código, nunca la clave', async () => {
  const statuses = [429, 500]
  let calls = 0
  const ok = createOpenAiProvider({ apiKey: SECRET, baseDelayMs: 1, fetchImpl: async () => { calls += 1; const status = statuses.shift(); return status ? jsonResponse(status, {}) : jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }) } })
  assert.equal(await ok.generate('x'), 'ok')
  assert.equal(calls, 3)
  calls = 0
  const bad = createOpenAiProvider({ apiKey: SECRET, baseDelayMs: 1, fetchImpl: async () => { calls += 1; return jsonResponse(401, { error: { message: `Incorrect API key provided: ${SECRET}`, code: 'invalid_api_key' } }) } })
  await assert.rejects(bad.generate('x'), (error) => {
    assert.equal(error.message, 'OpenAI request failed with HTTP 401 (invalid_api_key).')
    assert.equal(JSON.stringify(error).includes(SECRET), false)
    return true
  })
  assert.equal(calls, 1)
})

test('OpenAI embeddings: text-embedding-3-small con dimensions 768, normalizados y con uso de tokens', async () => {
  let body
  const raw = Array.from({ length: 768 }, (_, index) => (index < 2 ? 3 : 0))
  const provider = createOpenAiEmbeddingProvider({ apiKey: SECRET, fetchImpl: async (url, init) => { body = { url, ...JSON.parse(init.body) }; return jsonResponse(200, { data: [{ embedding: raw }], usage: { prompt_tokens: 4, total_tokens: 4 } }) } })
  const vector = await provider.embed('vacaciones anuales', 'RETRIEVAL_DOCUMENT')
  assert.equal(body.url, 'https://api.openai.com/v1/embeddings')
  assert.equal(body.model, 'text-embedding-3-small')
  assert.equal(body.dimensions, 768)
  assert.equal(body.input, 'vacaciones anuales')
  assert.equal(vector.length, 768)
  assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-9)
  assert.equal(provider.usage.embeddingTokens, 4)
  const wrong = createOpenAiEmbeddingProvider({ apiKey: SECRET, fetchImpl: async () => jsonResponse(200, { data: [{ embedding: [1, 0] }] }) })
  await assert.rejects(wrong.embed('x'), /Invalid OpenAI embedding/)
})
