// Agente analista: redacta el resumen ejecutivo (3 a 5 frases) del reporte diario a partir del JSON
// de métricas. El LLM solo recibe agregados; si su texto menciona un número que no está en el JSON,
// o falla, se usa la plantilla determinista.
import { getLlmProvider } from '../llm/providers.js'
import { buildTemplateNarrative } from './analyst/narrativeTemplate.js'
import { validateNarrative } from './analyst/narrativeValidator.js'
import { collectPersonIdentifiers, toLlmSafeMetrics } from './analyst/reportMetrics.js'
import { loadPrompt } from './prompts/index.js'

export function createAnalystAgent({ llm = getLlmProvider(), prompt = loadPrompt('analystAgent'), maxAttempts = 2, maxTokens = 3000 } = {}) {
  return {
    promptVersion: prompt.version,
    async summarize(metrics, { isToday = true } = {}) {
      const safe = toLlmSafeMetrics(metrics, { isToday })
      const personIdentifiers = collectPersonIdentifiers(metrics)
      const input = `${prompt.text}\n\n<metrics>\n${JSON.stringify(safe)}\n</metrics>`
      let rejectReason = null
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let text
        try {
          text = String(await llm.generate(input, { maxTokens }) ?? '').trim()
        } catch (error) {
          rejectReason = `llm_error: ${String(error?.message ?? error).slice(0, 120)}`
          break // Un error del proveedor no se reintenta aquí (el proveedor ya reintenta).
        }
        const verdict = validateNarrative(text, safe, { personIdentifiers })
        if (verdict.ok) return { text, source: 'llm', promptVersion: prompt.version, rejectReason: null, attempts: attempt }
        rejectReason = verdict.offending ? `${verdict.reason}: ${verdict.offending.slice(0, 5).join(', ')}` : verdict.reason
      }
      return { text: buildTemplateNarrative(metrics, { isToday }), source: 'template', promptVersion: prompt.version, rejectReason }
    },
  }
}
