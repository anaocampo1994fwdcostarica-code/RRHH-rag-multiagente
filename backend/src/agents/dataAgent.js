import { createDataAgentRepository } from '../repositories/dataAgentRepository.js'
import { fallbackToolSelection, parseToolSelection, toolSelectionSchema } from './data/dataTools.js'
import { NOT_LINKED, renderAbsencesToday, renderNextPayment, renderNextReview, renderRequests, renderSickLeaves, renderVacationBalance } from './data/dataTemplates.js'
import { loadPrompt } from './prompts/index.js'

// Agente de datos.
//
//   answer(auth, { question, scope }) → Promise<{ evidenceStatus, answer, escalationOffered, tool }>
//
//   scope 'self'      → datos del usuario autenticado (único scope posible para un colaborador).
//   scope 'aggregate' → ausencias de hoy por tipo y departamento (solo RRHH; el SQL vuelve a exigirlo).
//   scope 'other'     → datos de otra persona: no disponible todavía, se ofrece escalar.
//
// El LLM solo elige la herramienta (JSON validado); nunca escribe SQL ni redacta cifras.
export const DATA_SCOPES = Object.freeze(['self', 'aggregate', 'other'])

const ESCALATE = '¿Quieres que RRHH te contacte?'
const UNKNOWN = { evidenceStatus: 'no_data', escalationOffered: true, answer: `No identifiqué qué dato tuyo necesitas. Puedo ayudarte con tu saldo de vacaciones, tu próximo pago, tu próxima evaluación, tus solicitudes o tus incapacidades. ${ESCALATE}` }
const OTHER_UNAVAILABLE = { evidenceStatus: 'unavailable', escalationOffered: true, answer: `La consulta de datos de otra persona todavía no está disponible en el asistente. Puedes revisarla en el módulo de empleados del portal. ${ESCALATE}` }

export function assertDataAgent(agent) {
  if (typeof agent?.answer !== 'function') throw new TypeError('Data agent must expose answer(auth, { question, scope }).')
  return agent
}

export function createDataAgent({ llm, repository = createDataAgentRepository(), prompt = loadPrompt('dataAgent'), timeoutMs = 3000 } = {}) {
  async function selectTool(question) {
    if (!llm?.generateJson) return fallbackToolSelection(question)
    const controller = new AbortController()
    let timer
    try {
      const request = llm.generateJson(`Pregunta del usuario:\n"""${question}"""`, { schema: toolSelectionSchema, systemInstruction: prompt.text, signal: controller.signal })
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Tool selection timeout.')) }, timeoutMs) })
      return { ...parseToolSelection(await Promise.race([request, timeout])), fallback: false }
    } catch {
      return fallbackToolSelection(question)
    } finally {
      clearTimeout(timer)
    }
  }

  async function runSelfTool({ tool, params }, auth) {
    switch (tool) {
      case 'vacation_balance': return [await repository.vacationBalance(auth), renderVacationBalance]
      case 'next_payment': return [await repository.nextPayment(auth), renderNextPayment]
      case 'next_review': return [await repository.nextReview(auth), renderNextReview]
      case 'my_requests': return [await repository.myRequests(auth, params), (result) => renderRequests(result, { filtered: Object.keys(params).length > 0 })]
      case 'my_sick_leaves': return [await repository.mySickLeaves(auth, params), renderSickLeaves]
      default: return [null, null]
    }
  }

  return {
    promptVersion: prompt.version,
    async answer(auth, { question, scope } = {}) {
      if (!DATA_SCOPES.includes(scope)) throw new TypeError('Invalid data scope.')
      if (scope === 'other') return { ...OTHER_UNAVAILABLE, tool: null }
      if (scope === 'aggregate') return { ...renderAbsencesToday(await repository.absencesToday(auth)), tool: 'absences_today' }

      const selection = await selectTool(String(question ?? ''))
      const [result, render] = await runSelfTool(selection, auth)
      if (!render) return { ...UNKNOWN, tool: null }
      if (!result.linked) return { ...NOT_LINKED, tool: selection.tool }
      return { ...render(result), tool: selection.tool }
    },
  }
}
