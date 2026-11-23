// Evaluación del banco base (25 preguntas) contra el orquestador real.
//   npm run eval:bank
// - LLM y embeddings reales según LLM_PROVIDER / EMBEDDINGS_PROVIDER (por defecto DeepSeek + E5 local).
// - Antes de evaluar comprueba que el LLM autentica: si no, se detiene (no publica un reporte hecho solo
//   con el respaldo determinista).
// - Supabase de pruebas real a través de rrhh_api + withUserTransaction (RLS con los claims del usuario).
//   Las piezas que en producción usan supabase-js con el JWT (rol RRHH, búsqueda vectorial) se ejecutan con
//   el mismo SQL por esta conexión, porque el script no tiene contraseñas ni tokens de los usuarios de prueba.
// - Se evalúa como rls.employee.a; la pregunta 25 se evalúa como RRHH (rls.hr) y también como colaborador.
// - Por defecto no escribe en chat_query_logs ni en la memoria de conversación. Con --log (npm run eval:bank -- --log)
//   guarda cada consulta en chat_query_logs con app_private.log_chat_query (datos reales para el reporte diario).
// - Genera docs/evidencias/eval_banco_<fecha CR>.md. Nunca imprime claves ni cadenas de conexión.
import '../src/config/env.js'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
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
import { QUESTION_BANK } from './questionBank.js'
import { createChatQueryLogRepository } from '../src/repositories/chatQueryLogRepository.js'
import { TEAM_QUESTIONS } from './teamQuestions.js'
import { LATENCY_LIMIT_MS, describeQuestion, gradeRow, summarize, toCsv, toMarkdown } from './lib/evaluationSheet.mjs'

// Uso: npm run eval:bank [-- --bank=base|all] [--log]   (también se acepta "--bank all")
const args = process.argv.slice(2)
const bankIndex = args.indexOf('--bank')
const BANK = args.find((arg) => arg.startsWith('--bank='))?.split('=')[1] ?? (bankIndex >= 0 ? args[bankIndex + 1] : 'base')
const unknownArgs = args.filter((arg, i) => arg !== '--log' && !arg.startsWith('--bank') && !(bankIndex >= 0 && i === bankIndex + 1))
if (unknownArgs.length || !['base', 'all'].includes(BANK)) throw new Error(`Argumentos no válidos: ${args.join(' ')}. Uso: npm run eval:bank [-- --bank=base|all] [--log]`)
const LOG_QUERIES = process.argv.includes('--log')
// El orquestador no espera el registro; aquí se guardan las promesas para esperarlas antes de cerrar el pool.
const pendingLogs = []
let failedLogs = 0
const realQueryLog = createChatQueryLogRepository()
const queryLog = LOG_QUERIES
  ? { record: (entry, options) => { const p = realQueryLog.record(entry, options).catch(() => { failedLogs += 1 }); pendingLogs.push(p); return p } }
  : { record: async () => {} }

const POLICY_PENDING = new Set(['insufficient', 'unavailable'])

// --- Identidades de prueba (conexión del harness SOLO en lectura) ---
const rlsDir = fileURLToPath(new URL('../../supabase/tests/rls/', import.meta.url))
const rlsEnv = Object.fromEntries(readFileSync(`${rlsDir}.env`, 'utf8').split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')] }))
assert.equal(rlsEnv.RLS_TEST_PROJECT_REF, 'bxtetlzjlgoezxcjhdrw', 'El harness no apunta al proyecto de pruebas aprobado.')
const adminUrl = new URL(rlsEnv.RLS_TEST_DATABASE_URL)
for (const parameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) adminUrl.searchParams.delete(parameter)
const admin = new pg.Client({ connectionString: adminUrl.toString(), ssl: { ca: readFileSync(rlsEnv.RLS_TEST_SSL_CA_FILE, 'utf8'), rejectUnauthorized: true, servername: adminUrl.hostname } })
await admin.connect()
await admin.query('begin read only')
const { rows: users } = await admin.query('select email, id from auth.users where email = any($1::text[])', [[rlsEnv.RLS_TEST_EMPLOYEE_A_EMAIL, rlsEnv.RLS_TEST_HR_EMAIL]])
const { rows: [{ today }] } = await admin.query("select (now() at time zone 'America/Costa_Rica')::date::text as today")
await admin.query('rollback')
await admin.end()
const idOf = (email) => users.find((user) => user.email === email)?.id
const employeeA = createVerifiedAuthIdentity({ userId: idOf(rlsEnv.RLS_TEST_EMPLOYEE_A_EMAIL), role: 'authenticated' })
const hr = createVerifiedAuthIdentity({ userId: idOf(rlsEnv.RLS_TEST_HR_EMAIL), role: 'authenticated' })

// --- Orquestador real con transporte pg (misma RLS, sin escrituras) ---
const readOnly = (auth, callback) => withUserTransaction(auth, callback, { completion: 'rollback' })
const llm = createLlmProvider()
const embeddings = createEmbeddingProvider()
// process.exit() con conexiones de fetch abiertas dispara una aserción de libuv en Windows: se usa exitCode.
const llmError = await llm.generate('Responde solo: ok').then(() => null, (error) => error)
if (llmError) {
  console.log(`El LLM (${env.llmProvider}) no responde: ${llmError.message} Se detiene la evaluación.`)
  process.exitCode = 1
} else {
  await evaluate()
}

async function evaluate() {
if (typeof embeddings.preload === 'function') await embeddings.preload()
const vectors = {
  async search(auth, embedding, { limit = 5, threshold = env.ragSimilarityThreshold } = {}) {
    return readOnly(auth, async (client) => (await client.query(
      'select * from public.match_policy_chunks($1::extensions.vector, $2, $3)',
      [`[${embedding.join(',')}]`, limit, threshold],
    )).rows)
  },
}
const orchestrator = createOrchestrator({
  classifier: createIntentClassifier({ llm }),
  policyAgent: createPolicyAgent({ embeddings, vectors, llm }),
  dataAgent: createDataAgent({ llm, repository: createDataAgentRepository({ transaction: readOnly }) }),
  resolveIsHr: (auth) => readOnly(auth, async (client) => (await client.query("select public.has_permission('employees.read') as allowed")).rows[0].allowed === true),
  conversations: { getRecentMessages: async () => [], createConversation: async () => null, appendUserMessage: async () => {}, appendAssistantMessage: async () => {} },
  queryLog,
})

// --- Ejecución ---
const runs = [
  ...QUESTION_BANK.map((item) => ({ ...item, role: item.number === 25 ? 'RRHH' : 'colaborador', auth: item.number === 25 ? hr : employeeA })),
  { ...QUESTION_BANK.find((item) => item.number === 25), role: 'colaborador', auth: employeeA, expectDenied: true },
  ...(BANK === 'all' ? TEAM_QUESTIONS.map((item) => ({ ...item, role: 'colaborador', auth: employeeA })) : []),
].map((run) => ({ ...run, ...describeQuestion(run, { expectDenied: run.expectDenied }) }))

const rows = []
for (const run of runs) {
  const started = performance.now()
  let response
  try {
    response = await orchestrator.answer(run.auth, run.question)
  } catch (error) {
    response = { intent: 'error', agent: null, evidenceStatus: 'error', answer: `Error: ${error.message}`, citations: [] }
  }
  const latencyMs = Math.round(performance.now() - started)
  const intentOk = response.intent === run.expected
  const deniedOk = run.expectDenied || ['restricted'].includes(run.expected) ? response.evidenceStatus === 'restricted' && response.agent === null : true
  const policyPending = response.intent === 'policy' && POLICY_PENDING.has(response.evidenceStatus)
  const row = { ...run, response, latencyMs, intentOk, deniedOk, policyPending }
  row.grade = gradeRow(row)
  rows.push(row)
  console.log(`#${run.number} (${run.role}) ${intentOk ? '✔' : '✖'} ${run.expected} → ${response.intent} · ${response.agent ?? '—'} · ${latencyMs} ms${policyPending ? ' · pendiente RAG' : ''}`)
}
await Promise.all(pendingLogs)
if (LOG_QUERIES) console.log(`Consultas guardadas en chat_query_logs: ${pendingLogs.length - failedLogs}/${pendingLogs.length}.`)
await (await getPostgresPool()).end()

// --- Reporte ---
const escape = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
const pct = (part, total) => `${((part / total) * 100).toFixed(1)} %`
const resultLabel = (row) => {
  if (!row.intentOk) return '✖ intención'
  if (!row.deniedOk) return '✖ no se negó'
  if (row.policyPending) return '⏳ pendiente RAG'
  return '✔'
}
const citations = (row) => (row.response.citations ?? []).map((citation) => `${citation.documentTitle ?? 'Documento'}${citation.section ? ` · ${citation.section}` : ''}${citation.url ? ` (${citation.url})` : ''}`).join('; ') || '—'

const intentHits = rows.filter((row) => row.intentOk).length
const fast = rows.filter((row) => row.latencyMs < LATENCY_LIMIT_MS).length
const sorted = rows.map((row) => row.latencyMs).sort((a, b) => a - b)
const p90 = sorted[Math.ceil(sorted.length * 0.9) - 1]
const pending = rows.filter((row) => row.policyPending).length
const restricted = rows.filter((row) => [21, 22].includes(row.number))

// Costo aproximado (USD por millón de tokens). OpenAI (docs 2026-11-19): gpt-6-luna 0.1/0.5, embeddings 0.02.
// DeepSeek: la página de precios consultada no publica el precio de deepseek-flash; fijar EVAL_PRICE_INPUT /
// EVAL_PRICE_OUTPUT para estimar el costo. E5 local no tiene costo por token.
const DEFAULT_PRICES = llm.name === 'openai' ? { input: 0.1, output: 0.5 } : { input: NaN, output: NaN }
const PRICES = {
  input: Number(process.env.EVAL_PRICE_INPUT ?? DEFAULT_PRICES.input),
  output: Number(process.env.EVAL_PRICE_OUTPUT ?? DEFAULT_PRICES.output),
  embedding: Number(process.env.EVAL_PRICE_EMBEDDING ?? (String(embeddings.name).startsWith('openai') ? 0.02 : 0)),
}
const usage = {
  promptTokens: llm.usage?.promptTokens ?? 0,
  completionTokens: llm.usage?.completionTokens ?? 0,
  embeddingTokens: embeddings.usage?.embeddingTokens ?? 0,
}
const costUsd = (usage.promptTokens * PRICES.input + usage.completionTokens * PRICES.output + usage.embeddingTokens * PRICES.embedding) / 1e6
const costLine = llm.usage
  ? Number.isNaN(costUsd)
    ? `${usage.promptTokens} entrada + ${usage.completionTokens} salida (LLM, ${llm.usage.requests} llamadas) · precio no configurado (EVAL_PRICE_INPUT/OUTPUT)`
    : `${usage.promptTokens} entrada + ${usage.completionTokens} salida (LLM) · ${usage.embeddingTokens} (embeddings) ≈ USD ${costUsd.toFixed(4)} (${rows.length} consultas; ≈ USD ${(costUsd / rows.length).toFixed(5)} por consulta)`
  : 'el proveedor configurado no reporta uso de tokens'

const report = `# Evaluación del banco base — ${today}

- Orquestador real: LLM \`${env.llmProvider}\` (\`${llm.model ?? 'n/d'}\`), embeddings \`${env.embeddingsProvider}\` (\`${embeddings.model ?? 'n/d'}\`), umbral de similitud ${env.ragSimilarityThreshold} + Supabase de pruebas vía \`rrhh_api\` con RLS y claims del usuario.
- Usuario: \`rls.employee.a\` (colaborador). La pregunta 25 se evalúa como RRHH (\`rls.hr\`, DEMO-011) y también como colaborador.
- Registro: ${LOG_QUERIES ? 'cada consulta quedó en chat_query_logs (--log).' : 'sin escrituras en chat_query_logs ni en la memoria.'}
- "Pendiente RAG": pregunta de política con intención correcta, pero sin documentos publicados en el RAG todavía (el agente dice que no encontró la política y ofrece escalar). No cuenta como error.

## Resumen

| Indicador | Valor |
|---|---|
| Aciertos de intención | ${intentHits}/${rows.length} (${pct(intentHits, rows.length)}) |
| Latencia < 8 s | ${fast}/${rows.length} (${pct(fast, rows.length)}) |
| Latencia p90 | ${p90} ms |
| Política pendiente RAG | ${pending} |
| Tokens y costo aproximado | ${costLine} |

## Preguntas 21 y 22 (deben negarse siempre)

| # | Pregunta | Intención | Agente | Negada | Respuesta |
|---|---|---|---|---|---|
${restricted.map((row) => `| ${row.number} | ${escape(row.question)} | ${row.response.intent} | ${row.response.agent ?? '—'} | ${row.deniedOk ? '✔ sí' : '✖ NO'} | ${escape(row.response.answer)} |`).join('\n')}

## Detalle

| # | Rol | Pregunta | Esperada | Obtenida | Agente | Estado | Latencia (ms) | Resultado | Respuesta | Citas |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.map((row) => `| ${row.number} | ${row.role} | ${escape(row.question)} | ${row.expected} | ${row.response.intent} | ${row.response.agent ?? '—'} | ${row.response.evidenceStatus} | ${row.latencyMs} | ${resultLabel(row)} | ${escape(row.response.answer)} | ${escape(citations(row))} |`).join('\n')}
`

const outDir = fileURLToPath(new URL('../../docs/evidencias/', import.meta.url))
mkdirSync(outDir, { recursive: true })
const outFile = `${outDir}eval_banco_${today}.md`
writeFileSync(outFile, report)
console.log(`\nIntención: ${intentHits}/${rows.length} (${pct(intentHits, rows.length)}) · < 8 s: ${fast}/${rows.length} (${pct(fast, rows.length)}) · p90 ${p90} ms · pendiente RAG: ${pending}`)
console.log(`Tokens: ${costLine}`)
console.log(`21 y 22 negadas: ${restricted.every((row) => row.deniedOk) ? 'sí' : 'NO'}`)
console.log(`Reporte: docs/evidencias/eval_banco_${today}.md`)
if (BANK === 'all') {
  const summary = summarize(rows)
  const sheet = { today, logged: LOG_QUERIES, summary, model: { llm: `${env.llmProvider} ${llm.model ?? ''}`.trim(), embeddings: `${env.embeddingsProvider} ${embeddings.model ?? ''}`.trim(), threshold: env.ragSimilarityThreshold } }
  writeFileSync(`${outDir}hoja_evaluacion_45_${today}.md`, toMarkdown(rows, sheet))
  writeFileSync(`${outDir}hoja_evaluacion_45_${today}.csv`, toCsv(rows))
  console.log(`\nHoja (45): aciertos ${summary.correct}/${summary.total} (${summary.correctPct}) · con cita ${summary.citedPct} · < 8 s ${summary.fastPct} · p90 ${summary.p90} ms`)
  console.log(`Hoja: docs/evidencias/hoja_evaluacion_45_${today}.md y .csv`)
}
process.exitCode = restricted.every((row) => row.deniedOk) ? 0 : 1
}
