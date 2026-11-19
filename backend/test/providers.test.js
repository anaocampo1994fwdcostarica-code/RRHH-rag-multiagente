import assert from 'node:assert/strict'
import test from 'node:test'
import { createDeepseekProvider } from '../src/llm/deepseekProvider.js'
import { cosineSimilarity, createLocalEmbeddingProvider, e5Input } from '../src/rag/localEmbeddingProvider.js'
import { createVectorRepository } from '../src/rag/vectorRepository.js'

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

test('el repositorio vectorial usa por defecto el umbral configurado para E5 (0.82)', async () => {
  let parameters
  const repository = createVectorRepository({ createDataClient: () => ({ rpc: async (_name, values) => { parameters = values; return { data: [] } } }) })
  await repository.search({}, Array.from({ length: 768 }, () => 0.01))
  assert.equal(parameters.similarity_threshold, 0.82)
})
