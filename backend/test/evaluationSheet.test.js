import assert from 'node:assert/strict'
import test from 'node:test'
import { describeQuestion, gradeRow, summarize, toCsv } from '../scripts/lib/evaluationSheet.mjs'
import { BANK_EXPECTATIONS } from '../scripts/bankExpectations.js'
import { QUESTION_BANK } from '../scripts/questionBank.js'
import { TEAM_QUESTIONS } from '../scripts/teamQuestions.js'

const row = (number, expected, response, extra = {}) => {
  const item = { number, expected, question: 'q', ...extra }
  return { ...item, ...describeQuestion(item, extra), response: { citations: [], answer: '', ...response }, latencyMs: 1000 }
}

test('the 45 questions have expected answer, source and agent', () => {
  assert.equal(QUESTION_BANK.length + TEAM_QUESTIONS.length, 45)
  for (const item of QUESTION_BANK) assert.ok(BANK_EXPECTATIONS[item.number]?.expectedAnswer, `banco ${item.number}`)
  for (const item of TEAM_QUESTIONS) assert.ok(item.expectedAnswer && item.source, `equipo ${item.number}`)
})

test('policy answers must be supported, cite the source document and contain the key fact', () => {
  const ok = row(1, 'policy', { intent: 'policy', evidenceStatus: 'supported', answer: '15 días hábiles [1]', citations: [{ documentCode: 'POL-RH-01' }] })
  assert.equal(gradeRow(ok).ok, true)
  const wrongDoc = row(1, 'policy', { intent: 'policy', evidenceStatus: 'supported', answer: '15 días', citations: [{ documentCode: 'POL-RH-02' }] })
  assert.match(gradeRow(wrongDoc).criterion, /no cita POL-RH-01/)
  const noFact = row(1, 'policy', { intent: 'policy', evidenceStatus: 'supported', answer: 'Depende.', citations: [{ documentCode: 'POL-RH-01' }] })
  assert.match(gradeRow(noFact).criterion, /dato clave/)
})

test('21/22 must be denied without agent, 23 must not invent, 25 as collaborator must be denied', () => {
  assert.equal(gradeRow(row(21, 'restricted', { intent: 'restricted', evidenceStatus: 'restricted', agent: null })).ok, true)
  assert.equal(gradeRow(row(22, 'restricted', { intent: 'policy', evidenceStatus: 'supported', agent: 'policy_rag' })).ok, false)
  assert.equal(gradeRow(row(23, 'policy', { intent: 'policy', evidenceStatus: 'insufficient', escalationOffered: true })).ok, true)
  assert.equal(gradeRow(row(23, 'policy', { intent: 'policy', evidenceStatus: 'supported', citations: [{ documentCode: 'CAT-RH-06' }] })).ok, false)
  assert.equal(gradeRow(row(25, 'aggregate', { intent: 'aggregate', evidenceStatus: 'restricted', agent: null }, { expectDenied: true })).ok, true)
})

test('summary counts accuracy, citations, latency and p90; CSV has a header and quotes values', () => {
  const rows = [
    { ...row(1, 'policy', { intent: 'policy', evidenceStatus: 'supported', answer: '15', citations: [{ documentCode: 'POL-RH-01' }] }), latencyMs: 2000 },
    { ...row(3, 'policy', { intent: 'policy', evidenceStatus: 'insufficient', answer: 'no "sé"' }), latencyMs: 9000 },
  ].map((r) => ({ ...r, role: 'colaborador', grade: gradeRow(r) }))
  const summary = summarize(rows)
  assert.equal(summary.correct, 1)
  assert.equal(summary.cited, 1)
  assert.equal(summary.fast, 1)
  assert.equal(summary.p90, 9000)
  const csv = toCsv(rows)
  assert.match(csv, /número.*criterio/)
  assert.ok(csv.includes('"no ""sé"""'))
})
