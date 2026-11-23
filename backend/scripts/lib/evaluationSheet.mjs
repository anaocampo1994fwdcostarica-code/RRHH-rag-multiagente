// Hoja de evaluación (banco base + preguntas del equipo): criterio de acierto, resumen y salida .md / .csv.
import { BANK_EXPECTATIONS } from '../bankExpectations.js'

export const LATENCY_LIMIT_MS = 8000
const AGENT_BY_INTENT = { policy: 'policy_rag', personal_data: 'data', mixed: 'data+policy_rag', restricted: null, out_of_scope: null, aggregate: 'data' }

// Une los metadatos de cada pregunta (agente esperado, respuesta esperada, fuente y patrones obligatorios).
export function describeQuestion(item, { expectDenied = false } = {}) {
  const bank = BANK_EXPECTATIONS[item.number]
  const expectedAgent = expectDenied ? null : (bank ? bank.agent : AGENT_BY_INTENT[item.expected] ?? null)
  return {
    type: item.number <= 25 ? 'banco' : 'equipo',
    expectedAgent,
    expectedAnswer: expectDenied ? 'Negarse: el dato agregado solo está disponible para RRHH.' : (bank?.expectedAnswer ?? item.expectedAnswer ?? ''),
    source: bank?.source ?? item.source ?? '',
    mustInclude: expectDenied ? [] : (bank?.mustInclude ?? []),
    // Preguntas sin respuesta en las políticas: lo correcto es no inventar y ofrecer escalar (23 y las marcadas).
    expectNotFound: item.number === 23 || item.expectNotFound === true,
  }
}

const sourceCodes = (source) => [...String(source).matchAll(/[A-Z]{3}-RH-\d{2}/g)].map((m) => m[0])

// Criterio automático. Devuelve { ok, criterion } con el motivo en palabras.
export function gradeRow(row) {
  const r = row.response
  const citations = r.citations ?? []
  const cited = citations.map((c) => c.documentCode).filter(Boolean)
  const codes = sourceCodes(row.source)
  const includes = (row.mustInclude ?? []).every((pattern) => pattern.test(r.answer ?? ''))
  const citesSource = codes.length === 0 || codes.some((code) => cited.includes(code))

  if (row.expectDenied || row.expected === 'restricted') {
    const ok = r.evidenceStatus === 'restricted' && r.agent === null
    return { ok, criterion: ok ? 'Se negó sin consultar agentes.' : 'Debía negarse sin consultar agentes.' }
  }
  if (row.expected === 'out_of_scope') {
    const ok = r.intent === 'out_of_scope'
    return { ok, criterion: ok ? 'Fuera de alcance, sin agente.' : `Debía ser fuera de alcance (obtuvo ${r.intent}).` }
  }
  if (row.expectNotFound) {
    const ok = r.intent === 'policy' && r.evidenceStatus === 'insufficient' && r.escalationOffered && citations.length === 0
    return { ok, criterion: ok ? 'No inventó: dijo que no la encontró y ofreció escalar.' : 'Debía decir que no la encontró, sin citas, y ofrecer escalar.' }
  }
  const problems = []
  if (r.intent !== row.expected) problems.push(`intención ${r.intent} (esperada ${row.expected})`)
  const statusOk = row.expected === 'mixed' ? ['supported', 'partial'].includes(r.evidenceStatus) : r.evidenceStatus === 'supported'
  if (!statusOk) problems.push(`estado ${r.evidenceStatus}`)
  if (['policy', 'mixed'].includes(row.expected)) {
    if (citations.length === 0) problems.push('sin cita')
    else if (!citesSource) problems.push(`no cita ${codes.join(' / ')}`)
  }
  if (!includes) problems.push('no contiene el dato clave')
  if (problems.length) return { ok: false, criterion: `Incorrecta: ${problems.join('; ')}.` }
  const parts = ['intención', 'respuesta respaldada']
  if (['policy', 'mixed'].includes(row.expected)) parts.push(`cita ${codes.length ? codes.join('/') : 'presente'}`)
  if (row.mustInclude?.length) parts.push('dato clave')
  return { ok: true, criterion: `Correcta: ${parts.join(', ')}.` }
}

export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]
}

export function summarize(rows) {
  // Base del % con cita: respuestas RESPALDADAS por documentos (agente de políticas con estado supported o partial).
  // Se excluyen las "no encontrado" (insufficient: 23, 45…), que por diseño no citan, y las negadas o fuera de alcance.
  const documentBacked = rows.filter((row) => String(row.response.agent ?? '').includes('policy_rag') && ['supported', 'partial'].includes(row.response.evidenceStatus))
  const withCitation = documentBacked.filter((row) => (row.response.citations ?? []).length > 0)
  const notFound = rows.filter((row) => String(row.response.agent ?? '').includes('policy_rag') && row.response.evidenceStatus === 'insufficient')
  const correct = rows.filter((row) => row.grade.ok)
  const fast = rows.filter((row) => row.latencyMs < LATENCY_LIMIT_MS)
  const pct = (part, total) => (total ? `${((part / total) * 100).toFixed(1)} %` : '—')
  return {
    total: rows.length,
    correct: correct.length, correctPct: pct(correct.length, rows.length),
    cited: withCitation.length, answerable: documentBacked.length, citedPct: pct(withCitation.length, documentBacked.length),
    uncited: documentBacked.filter((row) => !(row.response.citations ?? []).length).map((row) => row.number),
    notFound: notFound.map((row) => row.number),
    fast: fast.length, fastPct: pct(fast.length, rows.length),
    p50: percentile(rows.map((r) => r.latencyMs), 0.5),
    p90: percentile(rows.map((r) => r.latencyMs), 0.9),
  }
}

const mdCell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
const csvCell = (text) => `"${String(text ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
const citationText = (row) => (row.response.citations ?? []).map((c) => `${c.documentCode ?? c.documentTitle ?? 'Documento'}${c.section ? ` ${c.section}` : ''}`).join('; ')

const BOM = String.fromCharCode(0xfeff) // Excel abre el CSV como UTF-8
export const CSV_HEADER = ['número', 'rol', 'pregunta', 'tipo', 'intención esperada', 'agente esperado', 'respuesta esperada', 'documento fuente', 'intención obtenida', 'agente obtenido', 'respuesta obtenida', 'citas', 'latencia (ms)', 'resultado', 'criterio']

export function toCsv(rows) {
  const lines = rows.map((row) => [
    row.number, row.role, row.question, row.type, row.expected, row.expectedAgent ?? '—', row.expectedAnswer, row.source,
    row.response.intent, row.response.agent ?? '—', row.response.answer, citationText(row), row.latencyMs,
    row.grade.ok ? 'correcto' : 'incorrecto', row.grade.criterion,
  ].map(csvCell).join(','))
  return `${BOM}${CSV_HEADER.map(csvCell).join(',')}\n${lines.join('\n')}\n`
}

export function toMarkdown(rows, { today, model, logged, summary }) {
  const special = rows.filter((row) => [21, 22, 23].includes(row.number))
  return `# Hoja de evaluación (45 preguntas) — ${today}

- Orquestador real: LLM \`${model.llm}\` sin razonamiento (\`thinking: disabled\`), embeddings \`${model.embeddings}\`, umbral ${model.threshold}; Supabase de pruebas vía \`rrhh_api\` con RLS y los claims del usuario.
- Usuario: \`rls.employee.a\` (colaborador). La pregunta 25 se evalúa como RRHH (\`rls.hr\`) y también como colaborador (debe negarse).
- Preguntas: 25 del banco base (\`scripts/questionBank.js\`, expectativas en \`scripts/bankExpectations.js\`) + 20 del equipo (\`scripts/teamQuestions.js\`).
- Registro: ${logged ? 'cada consulta quedó en `chat_query_logs` (`--log`).' : 'sin escrituras.'}
- Criterio de acierto (automático): intención correcta, respuesta respaldada (\`supported\`; en mixtas también \`partial\`), al menos una cita del documento fuente en política y mixtas, y el dato clave cuando está definido. Restringidas: negadas sin agente. Fuera de alcance: intención \`out_of_scope\`. La 23: dice que no la encontró, sin citas, y ofrece escalar.

## Resumen

| Indicador | Valor |
|---|---|
| Aciertos | ${summary.correct}/${summary.total} (${summary.correctPct}) |
| Con cita (respuestas respaldadas por documentos) | ${summary.cited}/${summary.answerable} (${summary.citedPct})${summary.uncited.length ? ` · **sin cita: ${summary.uncited.join(', ')}**` : ''} |
| Latencia < 8 s | ${summary.fast}/${summary.total} (${summary.fastPct}) |
| Latencia p50 / p90 | ${summary.p50} ms / ${summary.p90} ms |

"Con cita" se calcula sobre las respuestas respaldadas por documentos (agente de políticas con estado \`supported\` o \`partial\`). Se excluyen las respuestas "no encontré la política" (${summary.notFound.length ? summary.notFound.join(', ') : 'ninguna'}), que por diseño no citan y ofrecen escalar, y las negadas o fuera de alcance. Una respuesta respaldada sin cita contaría como error y aparecería marcada arriba.

## Preguntas 21, 22 y 23

| # | Rol | Pregunta | Intención | Agente | Estado | Resultado | Respuesta |
|---|---|---|---|---|---|---|---|
${special.map((row) => `| ${row.number} | ${row.role} | ${mdCell(row.question)} | ${row.response.intent} | ${row.response.agent ?? '—'} | ${row.response.evidenceStatus} | ${row.grade.ok ? '✔' : '✖'} ${mdCell(row.grade.criterion)} | ${mdCell(row.response.answer)} |`).join('\n')}

## Detalle

| # | Rol | Pregunta | Tipo | Agente esperado | Respuesta esperada | Fuente | Respuesta obtenida | Citas | Latencia (ms) | Resultado |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.map((row) => `| ${row.number} | ${row.role} | ${mdCell(row.question)} | ${row.type} · ${row.expected} | ${row.expectedAgent ?? '—'} | ${mdCell(row.expectedAnswer)} | ${mdCell(row.source)} | ${mdCell(row.response.answer)} | ${mdCell(citationText(row)) || '—'} | ${row.latencyMs} | ${row.grade.ok ? '✔ correcto' : '✖ incorrecto'} — ${mdCell(row.grade.criterion)} |`).join('\n')}
`
}
