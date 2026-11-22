import assert from 'node:assert/strict'
import test from 'node:test'
import { createAnalystAgent } from '../src/agents/analystAgent.js'
import { loadPrompt } from '../src/agents/prompts/index.js'
import { sampleMetrics } from './narrativeValidator.test.js'

const good = 'Hoy hay 8 personas ausentes. Hay 25 solicitudes pendientes y 20 superan los 3 días. La rotación acumulada es de 3,7 %.'

function fakeLlm(responses) {
  const prompts = []
  return {
    prompts,
    async generate(prompt) {
      prompts.push(prompt)
      const next = responses.shift()
      if (next instanceof Error) throw next
      return next
    },
  }
}

test('the analyst prompt is versioned and delimits the metrics as data', () => {
  const prompt = loadPrompt('analystAgent')
  assert.match(prompt.version, /^\d+\.\d+\.\d+$/)
  assert.match(prompt.text, /<metrics>/)
})

test('uses the LLM text when every number is in the JSON, and never sends people or questions', async () => {
  const llm = fakeLlm([good])
  const result = await createAnalystAgent({ llm }).summarize(sampleMetrics)
  assert.equal(result.source, 'llm')
  assert.equal(result.text, good)
  assert.equal(llm.prompts.length, 1)
  for (const forbidden of ['DEMO-014', 'Lucía', 'secreto']) assert.equal(llm.prompts[0].includes(forbidden), false)
})

test('retries once and falls back to the template when the LLM invents numbers', async () => {
  const llm = fakeLlm(['Hoy hay 9 ausentes. Hay 30 pendientes. Bien.', 'Hoy hay 17 ausentes. Hay 25 pendientes. Bien.'])
  const result = await createAnalystAgent({ llm }).summarize(sampleMetrics)
  assert.equal(llm.prompts.length, 2)
  assert.equal(result.source, 'template')
  assert.match(result.rejectReason, /^unknown_numbers: 17/)
  assert.match(result.text, /^Hoy hay 8 personas ausentes/)
})

test('falls back to the template when the LLM fails or returns nothing', async () => {
  const failed = await createAnalystAgent({ llm: fakeLlm([new Error('timeout')]) }).summarize(sampleMetrics)
  assert.equal(failed.source, 'template')
  assert.match(failed.rejectReason, /^llm_error/)
  const empty = await createAnalystAgent({ llm: fakeLlm(['', '']) }).summarize(sampleMetrics)
  assert.equal(empty.source, 'template')
  assert.equal(empty.rejectReason, 'empty')
})
