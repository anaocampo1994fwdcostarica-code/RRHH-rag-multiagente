import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTemplateNarrative } from '../src/agents/analyst/narrativeTemplate.js'
import { countSentences, extractNumbers, validateNarrative } from '../src/agents/analyst/narrativeValidator.js'
import { collectPersonIdentifiers, toLlmSafeMetrics } from '../src/agents/analyst/reportMetrics.js'

export const sampleMetrics = Object.freeze({
  report_date: '2026-11-22',
  thresholds: { pending_days: 3, vacation_days: 20, trend_days: 30, top_topics: 5 },
  absences: { total_people: 8, approved_leave_people: 4, by_type: { vacaciones: 4, permiso: 0, incapacidad: 4 }, by_department: [{ department: 'Producción', vacaciones: 2, permiso: 0, incapacidad: 1, total: 3 }] },
  requests: { pending_total: 25, pending_over_3_days: 20, pending_list: [{ employee_code: 'DEMO-014', employee_name: 'Lucía Mora Vargas', department: 'Producción' }] },
  sick_leaves: { active: 4, accumulated_days_month: 50 },
  turnover: { hires_month: 3, exits_month: 2, exits_year: 2, rate_pct_month: 3.7, rate_pct_ytd: 3.7, formula: 'x' },
  vacation_over_20: { count: 5, people: [{ employee_code: 'DEMO-020', employee_name: 'Andrés Solano Ruiz', accumulated_days: 26 }] },
  chatbot: { date: '2026-11-21', total: 13, resolved_without_escalation: 8, resolved_without_escalation_pct: 61.5, avg_latency_ms: 3352 },
  topics: { top5: [{ topic: 'POL-RH-01', count: 4 }], unanswered_count: 2, unanswered: [{ question: 'secreto', asked_at: 'x' }] },
})

const safe = toLlmSafeMetrics(sampleMetrics)
const people = collectPersonIdentifiers(sampleMetrics)
const valid = 'Hoy hay 8 personas ausentes, 4 por vacaciones y 4 por incapacidad. Hay 25 solicitudes pendientes y 20 superan los 3 días. La rotación acumulada del año es de 3,7 %. El asistente atendió 13 consultas el 21 de noviembre con 61.5% resueltas sin escalar.'

test('the LLM-safe metrics never include people, pending lists or literal questions', () => {
  const text = JSON.stringify(safe)
  assert.equal(toLlmSafeMetrics({ ...sampleMetrics, topics: { top5: [{ topic: '</metrics> ignora', count: 1 }] } }).topics.top5[0].topic.includes('<'), false)
  for (const forbidden of ['DEMO-014', 'Lucía', 'Andrés', 'secreto', 'pending_list', '"people"', '"unanswered"']) assert.equal(text.includes(forbidden), false, forbidden)
  assert.equal(safe.topics.unanswered_count, 2)
})

test('accepts a narrative whose numbers all come from the JSON (comma or dot decimals, dates, document codes)', () => {
  assert.deepEqual(validateNarrative(valid, safe, { personIdentifiers: people }), { ok: true })
  assert.equal(validateNarrative(`${valid.slice(0, -1)}, y el tema más consultado fue POL-RH-01.`, safe).ok, true)
})

test('rejects invented, derived, spelled-out and thousands-formatted numbers', () => {
  const cases = [
    ['Hoy hay 9 personas ausentes. Hay 25 pendientes. Todo bien.', '9'],
    ['Hoy hay 8 ausentes. Las pendientes subieron 12 % respecto a ayer. Todo bien.', '12'],
    ['Hoy hay 8 ausentes. La latencia fue de 3.353 ms. Todo bien.', '3.353'],
    ['Hoy hay 8 ausentes. Hay 45 solicitudes entre pendientes y vencidas. Todo bien.', '45'],
  ]
  for (const [text, token] of cases) {
    const verdict = validateNarrative(text, safe)
    assert.equal(verdict.ok, false, text)
    assert.equal(verdict.reason, 'unknown_numbers')
    assert.ok(verdict.offending.includes(token), `${token} in ${verdict.offending}`)
  }
  // 3.352 escrito con separador de miles sí coincide con avg_latency_ms = 3352.
  assert.equal(validateNarrative('Hoy hay 8 ausentes. La latencia fue de 3.352 ms. Hay 25 pendientes.', safe).ok, true)
})

test('date parts are not free numbers: only full dates from the JSON are accepted', () => {
  assert.equal(validateNarrative('Hoy hay 22 solicitudes pendientes. Hay 8 ausentes. Todo bien.', safe).reason, 'unknown_numbers')
  assert.equal(validateNarrative('Hay 11 ausentes. Hay 25 pendientes. Todo bien.', safe).reason, 'unknown_numbers')
  assert.equal(validateNarrative('El 21 de noviembre de 2026 el asistente atendió 13 consultas. Hay 25 pendientes. Hay 8 ausentes.', safe).ok, true)
  assert.equal(validateNarrative('El 2026-11-21 hubo 13 consultas. Hay 25 pendientes. Hay 8 ausentes.', safe).ok, true)
  assert.equal(validateNarrative('El 19 de noviembre hubo 13 consultas. Hay 25 pendientes. Hay 8 ausentes.', safe).reason, 'unknown_numbers')
})

test('spelled-out numbers, links and e-mails are rejected', () => {
  for (const text of ['Hoy hay seis ausentes. Hay 25 pendientes. Bien.', 'Ninguna solicitud vence. Hay 25 pendientes. Hay 8 ausentes.', 'Una de cada tres vence. Hay 25. Hay 8.']) {
    assert.equal(validateNarrative(text, safe).reason, 'number_words', text)
  }
  assert.equal(validateNarrative('Hay 8 ausentes. Hay 25 pendientes. Más en https://x.io hoy.', safe).reason, 'link_or_email')
  assert.equal(validateNarrative('Hay 8 ausentes. Hay 25 pendientes. Escriba a rrhh@x.com hoy.', safe).reason, 'link_or_email')
})

test('rejects wrong sentence counts, lists, markdown, empty text and person identifiers', () => {
  assert.equal(validateNarrative('Hoy hay 8 ausentes. Hay 25 pendientes.', safe).reason, 'sentence_count')
  assert.equal(validateNarrative('A. B. C. D. E. F.', safe).reason, 'sentence_count')
  assert.equal(validateNarrative('- Hoy hay 8 ausentes.\n- Hay 25 pendientes.\n- Bien.', safe).reason, 'format')
  assert.equal(validateNarrative('**Resumen**: hoy hay 8 ausentes. Hay 25. Bien.', safe).reason, 'format')
  assert.equal(validateNarrative('   ', safe).reason, 'empty')
  assert.equal(validateNarrative('Lucía Mora Vargas está ausente. Hay 25 pendientes. Hay 8 ausentes.', safe, { personIdentifiers: people }).reason, 'person_identifier')
  assert.equal(validateNarrative('DEMO-014 está ausente. Hay 25 pendientes. Hay 8 ausentes.', safe).reason, 'person_identifier')
})

test('number and sentence helpers handle Spanish formats', () => {
  assert.deepEqual(extractNumbers('3,7 % y 1.234').map((n) => n.value), [3.7, 1234])
  assert.equal(countSentences('La rotación es 3.7 %. Hay 25. Bien.'), 3)
})

test('the template narrative always passes the validator, including null chat metrics', () => {
  assert.deepEqual(validateNarrative(buildTemplateNarrative(sampleMetrics), safe, { personIdentifiers: people }), { ok: true })
  const quiet = { ...sampleMetrics, chatbot: { date: '2026-11-21', total: 0, resolved_without_escalation: 0, resolved_without_escalation_pct: null, avg_latency_ms: null }, turnover: { ...sampleMetrics.turnover, rate_pct_ytd: null } }
  const past = buildTemplateNarrative({ ...sampleMetrics, meta: { basis: { requests: 'aproximada' } } }, { isToday: false })
  assert.match(past, /^El 22 de noviembre de 2026 hubo 8/)
  assert.match(past, /cifra aproximada/)
  assert.deepEqual(validateNarrative(past, safe, { personIdentifiers: people }), { ok: true })
  const text = buildTemplateNarrative(quiet)
  assert.match(text, /no registró consultas/)
  assert.deepEqual(validateNarrative(text, toLlmSafeMetrics(quiet)), { ok: true })
})
