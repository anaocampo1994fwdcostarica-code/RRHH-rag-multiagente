// Prueba EN VIVO del clasificador (LLM real) con preguntas hipotéticas en primera persona que NO están en el
// banco de evaluación: deben ser "policy" aunque usen "mi" o "me". Incluye controles que sí piden un dato
// guardado (deben seguir siendo personal_data o mixed). Sin escrituras.
//   node scripts/check-classifier-hypotheticals.mjs
import '../src/config/env.js'
import { createIntentClassifier } from '../src/agents/intentClassifier.js'
import { createLlmProvider } from '../src/llm/providers.js'
import { HYPOTHETICAL_CASES } from './hypotheticalCases.js'

const classifier = createIntentClassifier({ llm: createLlmProvider() })
let failed = 0
for (const { question, expected } of HYPOTHETICAL_CASES) {
  const result = await classifier.classify(question)
  const ok = expected.includes(result.intent) && !result.fallback
  if (!ok) failed += 1
  console.log(`${ok ? '✔' : '✖'} ${result.intent}${result.fallback ? ' (respaldo)' : ''} ← ${question}  [esperado: ${expected.join(' | ')}]`)
}
console.log(`\n${HYPOTHETICAL_CASES.length - failed}/${HYPOTHETICAL_CASES.length} correctas · prompt orchestrator v${classifier.promptVersion}`)
process.exitCode = failed ? 1 : 0
