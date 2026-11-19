// Prueba de humo REAL de los proveedores configurados (npm run smoke:providers).
// - DeepSeek clasifica 3 preguntas del banco con el prompt y el validador reales del orquestador.
// - Embeddings locales E5: 768 dimensiones, norma ≈ 1, orden semántico esperado y latencia tras precarga.
// Nunca imprime la clave.
import '../src/config/env.js'
import { createIntentClassifier } from '../src/agents/intentClassifier.js'
import { createDeepseekProvider } from '../src/llm/deepseekProvider.js'
import { cosineSimilarity, createLocalEmbeddingProvider } from '../src/rag/localEmbeddingProvider.js'

const results = []
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`) }

// --- DeepSeek ---
const llm = createDeepseekProvider()
console.log(`LLM: deepseek · modelo ${llm.model}`)
const classifier = createIntentClassifier({ llm, timeoutMs: 8000 })
for (const [question, expected] of [
  ['¿Cuántos días de vacaciones me quedan disponibles?', 'personal_data'],
  ['¿Cuánto dura el periodo de prueba?', 'policy'],
  ['¿Me recomiendas una película?', 'out_of_scope'],
]) {
  const started = performance.now()
  const result = await classifier.classify(question)
  const ms = Math.round(performance.now() - started)
  check(`DeepSeek clasifica "${question}"`, result.intent === expected && !result.fallback, `${result.intent}${result.fallback ? ' (RESPALDO: el LLM falló)' : ''} · ${ms} ms`)
}

// --- Embeddings locales ---
const embeddings = createLocalEmbeddingProvider()
let started = performance.now()
await embeddings.preload()
console.log(`Embeddings: ${embeddings.model} · precarga ${Math.round(performance.now() - started)} ms`)
const [anchor, related, unrelated] = await Promise.all(['vacaciones anuales', 'días de descanso pagados', 'horas extra'].map((text) => embeddings.embed(text, 'passage')))
const norm = Math.sqrt(anchor.reduce((sum, value) => sum + value * value, 0))
check('E5 devuelve 768 dimensiones', anchor.length === 768, `${anchor.length}`)
check('E5 devuelve vectores normalizados', Math.abs(norm - 1) < 1e-3, `norma ${norm.toFixed(4)}`)
const simRelated = cosineSimilarity(anchor, related)
const simUnrelated = cosineSimilarity(anchor, unrelated)
check('"vacaciones anuales" ≈ "días de descanso pagados" > "horas extra"', simRelated > simUnrelated, `${simRelated.toFixed(4)} vs ${simUnrelated.toFixed(4)}`)
started = performance.now()
await embeddings.embed('¿Cuántos días de vacaciones me corresponden al año?')
check('Latencia de un embedding de pregunta (tras precarga)', true, `${Math.round(performance.now() - started)} ms`)

const failed = results.filter((result) => !result.ok).length
console.log(failed ? `\n${failed} comprobación(es) fallaron.` : `\n${results.length}/${results.length} comprobaciones correctas.`)
process.exitCode = failed ? 1 : 0
