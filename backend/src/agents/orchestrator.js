import { createGeminiProvider } from '../rag/geminiProvider.js'
import { createPolicyAgent } from '../rag/policyAgent.js'
import { createVectorRepository } from '../rag/vectorRepository.js'

const restricted = /(?:mi compa(?:ñ|n)ero|otro empleado|salario|sueldo).*(?:tiene|gana|cuánto)/i
const personal = /(?:mis |mi )(?:vacaciones|solicitudes|permisos|saldo)/i
const policy = /(?:pol[ií]tica|vacaciones|teletrabajo|permiso|horario)/i

export function classifyQuery(question) {
  if (restricted.test(question)) return 'restricted'
  if (personal.test(question) && policy.test(question)) return 'mixed'
  if (personal.test(question)) return 'personal_data'
  if (policy.test(question)) return 'policy'
  return 'out_of_scope'
}

function response({ answer, intent, agent, evidenceStatus, citations = [] }) {
  return { answer, intent, agent, evidenceStatus, citations }
}

function createDefaultPolicyAgent() {
  const gemini = createGeminiProvider()
  return createPolicyAgent({ embeddings: gemini, vectors: createVectorRepository(), llm: gemini })
}

export function createOrchestrator({ policyAgent = createDefaultPolicyAgent() } = {}) {
  return {
    async answer(auth, question) {
      const intent = classifyQuery(question)

      if (intent === 'restricted') return response({ intent, agent: null, evidenceStatus: 'restricted', answer: 'No puedo consultar información personal de otros colaboradores.' })
      if (intent === 'mixed') return response({ intent, agent: null, evidenceStatus: 'restricted', answer: 'No puedo combinar datos personales con consultas documentales en el asistente actual.' })
      if (intent === 'personal_data') return response({ intent, agent: null, evidenceStatus: 'unavailable', answer: 'La consulta de datos personales aún no está disponible en el chat.' })

      if (intent === 'policy') {
        try {
          const ragResponse = await policyAgent.answer(auth, question)
          return response({ intent, agent: 'policy_rag', evidenceStatus: ragResponse.evidenceStatus, answer: ragResponse.answer, citations: ragResponse.citations })
        } catch {
          return response({ intent, agent: 'policy_rag', evidenceStatus: 'unavailable', answer: 'La evidencia documental no está disponible temporalmente.' })
        }
      }

      return response({ intent, agent: null, evidenceStatus: 'out_of_scope', answer: 'La consulta está fuera del alcance actual del asistente de RRHH.' })
    },
  }
}

const defaultOrchestrator = createOrchestrator()

export async function orchestrateQuestion(auth, question) {
  return defaultOrchestrator.answer(auth, question)
}
