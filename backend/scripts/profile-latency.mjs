// Mide el tiempo por etapa de una consulta de política, una de datos y una mixta con el orquestador real.
//   node scripts/profile-latency.mjs [--runs=3]
// Etapas: permisos/historial, clasificación (LLM), embedding (E5), búsqueda vectorial, selección de herramienta
// del agente de datos (LLM), consulta de datos (SQL), redacción (LLM) y registro (no bloqueante).
// Solo lectura (transacciones con ROLLBACK); no escribe en chat_query_logs.
import '../src/config/env.js'
import { createOrchestrator } from '../src/agents/orchestrator.js'
import { createIntentClassifier } from '../src/agents/intentClassifier.js'
import { createDataAgent } from '../src/agents/dataAgent.js'
import { env } from '../src/config/env.js'
import { createEmbeddingProvider, createLlmProvider } from '../src/llm/providers.js'
import { createPolicyAgent } from '../src/rag/policyAgent.js'
import { createDataAgentRepository } from '../src/repositories/dataAgentRepository.js'
import { createVerifiedAuthIdentity } from '../src/security/authIdentity.js'
import { getPostgresPool } from '../src/services/postgresPool.js'
import { withUserTransaction } from '../src/services/withUserTransaction.js'
import { connectHarnessAdmin, readHarnessEnv, userIdByEmail } from './lib/harnessAdmin.mjs'

const runs = Number(process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] ?? 3)
const QUESTIONS = [
  ['política', '¿Cuántos días de vacaciones me corresponden al año?'],
  ['datos', '¿Cuántos días de vacaciones me quedan disponibles?'],
  ['mixta', '¿Cuántos días me quedan y puedo pasar los que sobren al otro año?'],
]

const admin = await connectHarnessAdmin()
const employee = createVerifiedAuthIdentity({ userId: await userIdByEmail(admin, readHarnessEnv().RLS_TEST_EMPLOYEE_A_EMAIL), role: 'authenticated' })
await admin.end()

let marks = []
const time = (stage, fn) => async (...args) => {
  const t = performance.now()
  try { return await fn(...args) } finally { marks.push([stage, performance.now() - t]) }
}

const readOnly = (auth, callback) => withUserTransaction(auth, callback, { completion: 'rollback' })
const llm = createLlmProvider()
const embeddings = createEmbeddingProvider()
if (typeof embeddings.preload === 'function') await embeddings.preload()

const classifierLlm = { ...llm, generateJson: time('clasificación (LLM)', llm.generateJson.bind(llm)) }
const dataLlm = { ...llm, generateJson: time('herramienta de datos (LLM)', llm.generateJson.bind(llm)), generate: time('redacción (LLM)', llm.generate.bind(llm)) }
const policyLlm = { ...llm, generate: time('redacción (LLM)', llm.generate.bind(llm)) }
const timedEmbeddings = { ...embeddings, embed: time('embedding (E5)', embeddings.embed.bind(embeddings)) }
const vectors = {
  search: time('búsqueda vectorial', (auth, embedding, { limit = 5, threshold = env.ragSimilarityThreshold } = {}) => readOnly(auth, async (client) => (await client.query(
    'select * from public.match_policy_chunks($1::extensions.vector, $2, $3)', [`[${embedding.join(',')}]`, limit, threshold])).rows)),
}
const repo = createDataAgentRepository({ transaction: readOnly })
const timedRepo = Object.fromEntries(Object.entries(repo).map(([k, fn]) => [k, time('consulta de datos (SQL)', fn)]))

const orchestrator = createOrchestrator({
  classifier: createIntentClassifier({ llm: classifierLlm }),
  policyAgent: createPolicyAgent({ embeddings: timedEmbeddings, vectors, llm: policyLlm }),
  dataAgent: createDataAgent({ llm: dataLlm, repository: timedRepo }),
  resolveIsHr: time('permisos', (auth) => readOnly(auth, async (client) => (await client.query("select public.has_permission('employees.read') as allowed")).rows[0].allowed === true)),
  conversations: { getRecentMessages: async () => [], createConversation: async () => null, appendUserMessage: async () => {}, appendAssistantMessage: async () => {} },
  queryLog: { record: time('registro (no bloquea)', async () => {}) },
})

const rows = []
for (const [kind, question] of QUESTIONS) {
  for (let i = 0; i < runs; i += 1) {
    marks = []
    const t = performance.now()
    const response = await orchestrator.answer(employee, question)
    const total = performance.now() - t
    const byStage = {}
    for (const [stage, ms] of marks) byStage[stage] = (byStage[stage] ?? 0) + ms
    rows.push({ kind, run: i + 1, total, byStage, intent: response.intent, status: response.evidenceStatus })
  }
}
await (await getPostgresPool()).end()

const stages = ['permisos', 'clasificación (LLM)', 'embedding (E5)', 'búsqueda vectorial', 'herramienta de datos (LLM)', 'consulta de datos (SQL)', 'redacción (LLM)', 'registro (no bloquea)']
const fmt = (ms) => (ms === undefined ? '—' : `${(ms / 1000).toFixed(2)} s`)
console.log(`Proveedor: ${llm.name} (${llm.model ?? ''}) · thinking=${process.env.DEEPSEEK_THINKING ?? 'disabled'} · ${runs} corridas por consulta (mediana)\n`)
console.log(`| Consulta | ${stages.join(' | ')} | Total | Intención / estado |`)
console.log(`|---|${stages.map(() => '---').join('|')}|---|---|`)
for (const [kind] of QUESTIONS) {
  const mine = rows.filter((r) => r.kind === kind)
  const median = (values) => { const v = values.filter((x) => x !== undefined).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : undefined }
  const cells = stages.map((stage) => fmt(median(mine.map((r) => r.byStage[stage]))))
  console.log(`| ${kind} | ${cells.join(' | ')} | **${fmt(median(mine.map((r) => r.total)))}** | ${mine[0].intent} / ${mine[0].status} |`)
}
console.log('\nTotales por corrida:', rows.map((r) => `${r.kind}#${r.run} ${fmt(r.total)}`).join(', '))
