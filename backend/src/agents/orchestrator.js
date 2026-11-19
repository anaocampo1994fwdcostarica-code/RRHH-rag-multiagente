import { createGeminiProvider } from '../rag/geminiProvider.js'
import { createPolicyAgent } from '../rag/policyAgent.js'
import { createVectorRepository } from '../rag/vectorRepository.js'
import { createChatQueryLogRepository } from '../repositories/chatQueryLogRepository.js'
import { permissionsRepository } from '../repositories/permissionsRepository.js'
import { createConversationRepository } from './conversationRepository.js'
import { assertDataAgent, createDataAgentStub } from './dataAgent.js'
import { createIntentClassifier } from './intentClassifier.js'
import { evaluateQuerySafety } from './safetyGuard.js'

// Flujo: identidad/rol + historial → capa de seguridad determinista (sin LLM) → clasificador
// Gemini (JSON validado) → segunda pasada de seguridad sobre la reformulación → enrutamiento.

const HISTORY_LIMIT = 6

const MESSAGES = Object.freeze({
  restricted: 'No puedo compartir información personal de otros colaboradores. Si necesitas ese dato por una razón laboral, solicítalo directamente al equipo de RRHH.',
  aggregate: 'Las cifras sobre otras personas de la plantilla solo están disponibles para el equipo de RRHH.',
  outOfScope: 'Solo puedo ayudarte con temas de Recursos Humanos: vacaciones, permisos, incapacidades, pagos, beneficios, evaluaciones y políticas internas. ¿Tienes alguna consulta sobre esos temas?',
  policyUnavailable: 'La evidencia documental no está disponible temporalmente. Puedes intentar de nuevo en unos minutos o escalar la consulta a RRHH.',
  dataUnavailable: 'No pude consultar tus datos en este momento. Intenta de nuevo o contacta a RRHH.',
})

function buildResponse({ answer, intent, agent, evidenceStatus, citations = [], escalationOffered = false }) {
  return { answer, intent, agent, evidenceStatus, citations, escalationOffered }
}

function createDefaultDependencies() {
  const gemini = createGeminiProvider()
  return {
    policyAgent: createPolicyAgent({ embeddings: gemini, vectors: createVectorRepository(), llm: gemini }),
    classifier: createIntentClassifier({ llm: gemini }),
  }
}

async function runPolicyAgent(policyAgent, auth, question) {
  try {
    const result = await policyAgent.answer(auth, question)
    const citations = Array.isArray(result.citations) ? result.citations : []
    // Toda respuesta de política respaldada debe llevar al menos una cita recuperada.
    if (result.evidenceStatus === 'supported' && citations.length === 0) {
      return { evidenceStatus: 'insufficient', escalationOffered: true, answer: 'No encontré una política con citas verificables para esta consulta. ¿Quieres que la escale a RRHH?', citations: [] }
    }
    return { ...result, citations, escalationOffered: result.escalationOffered ?? result.evidenceStatus === 'insufficient' }
  } catch {
    return { evidenceStatus: 'unavailable', escalationOffered: true, answer: MESSAGES.policyUnavailable, citations: [] }
  }
}

async function runDataAgent(dataAgent, auth, question, scope) {
  try {
    return await dataAgent.answer(auth, { question, scope })
  } catch {
    return { evidenceStatus: 'unavailable', answer: MESSAGES.dataUnavailable }
  }
}

function combineMixed(dataResult, policyResult) {
  const statuses = [dataResult.evidenceStatus, policyResult.evidenceStatus]
  const evidenceStatus = statuses.every((status) => status === 'supported') ? 'supported' : statuses.some((status) => status === 'supported') ? 'partial' : policyResult.evidenceStatus
  return {
    evidenceStatus,
    answer: `**Tus datos:** ${dataResult.answer}\n\n**Lo que dice la política:** ${policyResult.answer}`,
    citations: policyResult.citations,
    escalationOffered: Boolean(policyResult.escalationOffered),
  }
}

export function createOrchestrator({
  policyAgent,
  classifier,
  dataAgent = createDataAgentStub(),
  conversations = createConversationRepository(),
  resolveIsHr = (auth) => permissionsRepository.hasPermission(auth, 'employees.read'),
  queryLog = createChatQueryLogRepository(),
  now = () => Date.now(),
} = {}) {
  if (!policyAgent || !classifier) {
    const defaults = createDefaultDependencies()
    policyAgent ??= defaults.policyAgent
    classifier ??= defaults.classifier
  }
  assertDataAgent(dataAgent)

  async function route(auth, { intent, scope, subqueries, reformulated }) {
    if (intent === 'policy') {
      const result = await runPolicyAgent(policyAgent, auth, subqueries.policy ?? reformulated)
      return buildResponse({ ...result, intent, agent: 'policy_rag' })
    }
    if (intent === 'personal_data' || intent === 'aggregate') {
      const result = await runDataAgent(dataAgent, auth, subqueries.personal ?? reformulated, scope)
      return buildResponse({ ...result, intent, agent: 'data' })
    }
    if (intent === 'mixed') {
      // Ambos agentes son independientes: se consultan en paralelo para cuidar la latencia.
      const [dataResult, policyResult] = await Promise.all([
        runDataAgent(dataAgent, auth, subqueries.personal ?? reformulated, 'self'),
        runPolicyAgent(policyAgent, auth, subqueries.policy ?? reformulated),
      ])
      return buildResponse({ ...combineMixed(dataResult, policyResult), intent, agent: 'data+policy_rag' })
    }
    return buildResponse({ intent: 'out_of_scope', agent: null, evidenceStatus: 'out_of_scope', answer: MESSAGES.outOfScope })
  }

  async function decide(question, { isHr, history }) {
    const guard = evaluateQuerySafety(question, { isHr })
    if (guard.decision === 'restricted') {
      return { blocked: true, intent: guard.reason === 'aggregate_data' ? 'aggregate' : 'restricted', guardReason: guard.reason }
    }

    const classification = await classifier.classify(question, { history, suspicious: guard.suspicious })
    const meta = { guardReason: guard.reason, classifierFallback: Boolean(classification.fallback) }

    // Para RRHH, la capa determinista fija la intención y el alcance de datos.
    if (guard.decision === 'aggregate') return { ...classification, ...meta, intent: 'aggregate', scope: 'aggregate' }
    if (guard.decision === 'third_party') return { ...classification, ...meta, intent: 'personal_data', scope: 'other' }

    if (!isHr) {
      if (classification.intent === 'restricted') return { blocked: true, intent: 'restricted', ...meta }
      if (classification.intent === 'aggregate') return { blocked: true, intent: 'aggregate', ...meta }
      // Segunda pasada: la reformulación con historial ("¿y él?") o las subconsultas pueden introducir a un tercero.
      const derived = [classification.reformulated, classification.subqueries.policy, classification.subqueries.personal].filter(Boolean)
      const derivedGuard = derived.map((text) => evaluateQuerySafety(text, { isHr: false })).find((result) => result.decision === 'restricted')
      if (derivedGuard) return { blocked: true, intent: derivedGuard.reason === 'aggregate_data' ? 'aggregate' : 'restricted', ...meta, guardReason: derivedGuard.reason }
      return { ...classification, ...meta, scope: 'self' }
    }

    if (classification.intent === 'restricted') return { ...classification, ...meta, intent: 'personal_data', scope: 'other' }
    return { ...classification, ...meta, scope: classification.intent === 'aggregate' ? 'aggregate' : 'self' }
  }

  return {
    async answer(auth, question, { conversationId } = {}) {
      const startedAt = now()
      const [isHr, history] = await Promise.all([
        Promise.resolve().then(() => resolveIsHr(auth)).then((value) => value === true, () => false),
        conversationId ? Promise.resolve().then(() => conversations.getRecentMessages(auth, conversationId, HISTORY_LIMIT)).catch(() => []) : [],
      ])

      // La persistencia corre en paralelo con la clasificación y nunca bloquea la respuesta.
      const persisted = Promise.resolve()
        .then(async () => {
          const id = conversationId ?? await conversations.createConversation(auth, question)
          await conversations.appendUserMessage(auth, id, question)
          return id
        })
        .catch(() => conversationId ?? null)

      const decision = await decide(question, { isHr, history })
      const result = decision.blocked
        ? buildResponse({ intent: decision.intent, agent: null, evidenceStatus: 'restricted', answer: decision.intent === 'aggregate' ? MESSAGES.aggregate : MESSAGES.restricted })
        : await route(auth, decision)

      const latencyMs = now() - startedAt
      // El registro y el guardado de la respuesta no se esperan: si fallan o tardan, la respuesta sale igual.
      const ignoreFailure = () => {}
      try {
        Promise.resolve(queryLog.record({
          userId: auth?.userId ?? null,
          question,
          reformulated: decision.reformulated ?? null,
          intent: result.intent,
          agent: result.agent,
          citedDocuments: [...new Set(result.citations.map((citation) => citation.documentId).filter(Boolean))],
          resolved: result.evidenceStatus === 'supported',
          escalated: result.escalationOffered,
          guardReason: decision.guardReason ?? null,
          classifierFallback: decision.classifierFallback ?? false,
          promptVersion: classifier.promptVersion ?? null,
          latencyMs,
          createdAt: new Date(startedAt).toISOString(),
        }, { auth })).catch(ignoreFailure)
      } catch {
        // Un registro que lanza de forma síncrona tampoco debe impedir la respuesta.
      }

      const savedConversationId = await persisted
      // Memoria: la respuesta queda en la conversación para reformular el siguiente turno.
      if (savedConversationId) {
        Promise.resolve()
          .then(() => conversations.appendAssistantMessage?.(auth, savedConversationId, result.answer))
          .catch(ignoreFailure)
      }

      return { ...result, conversationId: savedConversationId }
    },
  }
}

let defaultOrchestrator
export async function orchestrateQuestion(auth, question, options) {
  defaultOrchestrator ??= createOrchestrator()
  return defaultOrchestrator.answer(auth, question, options)
}
