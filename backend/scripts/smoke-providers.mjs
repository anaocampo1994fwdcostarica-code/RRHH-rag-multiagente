// Prueba de humo REAL de los proveedores (npm run smoke:providers). Nunca imprime la clave.
// 1. Conexión con OpenAI: código HTTP de GET /models y si los modelos configurados están disponibles.
// 2. El LLM configurado clasifica 3 preguntas del banco con el prompt y el validador reales del orquestador.
// 3. Embeddings: compara E5 local contra OpenAI en "vacaciones anuales" frente a "días de descanso pagados"
//    y frente a "horas extra" (puntajes, diferencia y latencia por embedding).
import { env } from '../src/config/env.js'
import { createIntentClassifier } from '../src/agents/intentClassifier.js'
import { createLlmProvider } from '../src/llm/providers.js'
import { createOpenAiEmbeddingProvider } from '../src/llm/openaiProvider.js'
import { cosineSimilarity, createLocalEmbeddingProvider } from '../src/rag/localEmbeddingProvider.js'

const results = []
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`) }
const timed = async (fn) => { const started = performance.now(); const value = await fn(); return [value, Math.round(performance.now() - started)] }

// --- 1. Conexión con OpenAI ---
const llm = createLlmProvider()
const openaiEmbeddings = createOpenAiEmbeddingProvider()
let openaiReachable = false
if (process.env.OPENAI_API_KEY) {
  const response = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` } })
  const body = await response.json().catch(() => ({}))
  const ids = new Set((body.data ?? []).map((model) => model.id))
  openaiReachable = response.ok
  check('OpenAI GET /models', response.ok, `HTTP ${response.status}${body.error?.code ? ` (${body.error.code})` : ''}`)
  if (response.ok) {
    check(`Modelo de chat disponible: ${llm.model}`, ids.has(llm.model))
    check(`Modelo de embeddings disponible: ${openaiEmbeddings.model}`, ids.has(openaiEmbeddings.model))
  }
} else {
  const required = env.llmProvider === 'openai' || env.embeddingsProvider === 'openai'
  if (required) check('OPENAI_API_KEY presente', false)
  else console.log('OpenAI: se omite (no está seleccionado y no hay OPENAI_API_KEY)')
}

// --- 2. Clasificación con el LLM configurado ---
console.log(`\nLLM: ${env.llmProvider} · modelo ${llm.model}`)
if (env.llmProvider !== 'openai' || openaiReachable) {
  const classifier = createIntentClassifier({ llm, timeoutMs: 8000 })
  for (const [question, expected] of [
    ['¿Cuántos días de vacaciones me quedan disponibles?', 'personal_data'],
    ['¿Cuánto dura el periodo de prueba?', 'policy'],
    ['¿Me recomiendas una película?', 'out_of_scope'],
  ]) {
    const [result, ms] = await timed(() => classifier.classify(question))
    check(`Clasifica "${question}"`, result.intent === expected && !result.fallback, `${result.intent}${result.fallback ? ' (RESPALDO: el LLM falló)' : ''} · ${ms} ms`)
  }
} else {
  console.log('  (se omite: OpenAI no autentica)')
}

// --- 3. Embeddings: E5 local frente a OpenAI ---
const pairs = ['vacaciones anuales', 'días de descanso pagados', 'horas extra']
async function compare(label, provider, taskType) {
  if (typeof provider.preload === 'function') await provider.preload()
  const vectors = []
  const latencies = []
  for (const text of pairs) {
    const [vector, ms] = await timed(() => provider.embed(text, taskType))
    vectors.push(vector)
    latencies.push(ms)
  }
  const related = cosineSimilarity(vectors[0], vectors[1])
  const unrelated = cosineSimilarity(vectors[0], vectors[2])
  check(`${label}: 768 dimensiones y orden semántico correcto`, vectors[0].length === 768 && related > unrelated,
    `relacionado ${related.toFixed(4)} · sin relación ${unrelated.toFixed(4)} · diferencia ${(related - unrelated).toFixed(4)} · latencia ${latencies.join('/')} ms`)
  return { related, unrelated }
}
console.log('')
const e5 = await compare('E5 local (multilingual-e5-base)', createLocalEmbeddingProvider(), 'passage')
let openai
if (openaiReachable) openai = await compare(`OpenAI (${openaiEmbeddings.model}, dimensions 768)`, openaiEmbeddings)
else console.log('  OpenAI embeddings: se omite (OpenAI no autentica)')
if (openai) {
  console.log(`\nSeparación (relacionado − sin relación): E5 ${(e5.related - e5.unrelated).toFixed(4)} · OpenAI ${(openai.related - openai.unrelated).toFixed(4)}`)
  console.log(`Umbral configurado (${env.embeddingsProvider}): ${env.ragSimilarityThreshold}`)
}

const failed = results.filter((result) => !result.ok).length
console.log(failed ? `\n${failed} comprobación(es) fallaron.` : `\n${results.length}/${results.length} comprobaciones correctas.`)
process.exitCode = failed ? 1 : 0
