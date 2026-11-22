import { getEmbeddingProvider, getLlmProvider } from '../llm/providers.js'
import { createPolicyAgent } from '../rag/policyAgent.js'
import { createVectorRepository } from '../rag/vectorRepository.js'
import { createChatQueryLogRepository } from '../repositories/chatQueryLogRepository.js'
import { permissionsRepository } from '../repositories/permissionsRepository.js'
import { createConversationRepository } from './conversationRepository.js'
import { assertDataAgent, createDataAgent } from './dataAgent.js'
import { confidentClassification, createIntentClassifier } from './intentClassifier.js'
import { evaluateQuerySafety } from './safetyGuard.js'

// Flujo: identidad/rol + historial → capa de seguridad determinista (sin LLM) → clasificador
// LLM (JSON validado) → segunda pasada de seguridad sobre la reformulación → enrutamiento.

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

// LLM y embeddings según LLM_PROVIDER / EMBEDDINGS_PROVIDER (por defecto DeepSeek + E5 local).

function createDefaultDependencies() {
  const llm = getLlmProvider()
  return {
    policyAgent: createPolicyAgent({ embeddings: getEmbeddingProvider(), vectors: createVectorRepository(), llm }),
    classifier: createIntentClassifier({ llm }),
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
    answer: `Tus datos: ${dataResult.answer}\n\nLo que dice la política: ${policyResult.answer}`,
    citations: policyResult.citations,
    escalationOffered: Boolean(policyResult.escalationOffered || dataResult.escalationOffered),
  }
}

export function createOrchestrator({
  policyAgent,
  classifier,
  dataAgent = createDataAgent({ llm: getLlmProvider() }),
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

  async function decide(question, { isHr, classification: pendingClassification }) {
    const guard = evaluateQuerySafety(question, { isHr })
    if (guard.decision === 'restricted') {
      return { blocked: true, intent: guard.reason === 'aggregate_data' ? 'aggregate' : 'restricted', guardReason: guard.reason }
    }

    const classification = await pendingClassification
    const meta = { guardReason: guard.reason, classifierFallback: Boolean(classification.fallback), classifierRuleBased: Boolean(classification.ruleBased) }

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
      const isHrPromise = Promise.resolve().then(() => resolveIsHr(auth)).then((value) => value === true, () => false)
      const historyPromise = conversationId
        ? Promise.resolve().then(() => conversations.getRecentMessages(auth, conversationId, HISTORY_LIMIT)).catch(() => [])
        : Promise.resolve([])
      // La clasificación arranca en cuanto hay historial, en paralelo con la consulta de permisos. Sin historial,
      // las reglas de alta confianza evitan el LLM. suspicious se calcula como colaborador (lo más estricto);
      // la decisión final con el rol real la toma decide().
      // Si como colaborador la pregunta ya se niega sin LLM, la clasificación espera al rol real (así un colaborador
      // nunca dispara el LLM con una pregunta sobre terceros, y RRHH sí la clasifica).
      const employeeGuard = evaluateQuerySafety(question, { isHr: false })
      const classify = (history) => (history.length ? null : confidentClassification(question))
        ?? classifier.classify(question, { history, suspicious: employeeGuard.suspicious })
      const classification = employeeGuard.decision === 'restricted'
        ? Promise.all([isHrPromise, historyPromise]).then(([hr, history]) => (hr ? classify(history) : { intent: 'restricted', subqueries: {}, reformulated: question, fallback: false }))
        : historyPromise.then(classify)

      // Persistencia en paralelo y sin bloquear: solo una conversación nueva espera su id (para devolverlo).
      const conversationIdPromise = conversationId
        ? Promise.resolve(conversationId)
        : Promise.resolve().then(() => conversations.createConversation(auth, question)).catch(() => null)
      const userMessageSaved = conversationIdPromise
        .then((id) => (id ? conversations.appendUserMessage(auth, id, question) : undefined))
        .catch(() => {})

      const isHr = await isHrPromise
      const decision = await decide(question, { isHr, classification })
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
          promptVersion: [
            classifier.promptVersion && `orq@${classifier.promptVersion}`,
            ['data', 'data+policy_rag'].includes(result.agent) && dataAgent.promptVersion && `data@${dataAgent.promptVersion}`,
          ].filter(Boolean).join('+').slice(0, 40) || null,
          latencyMs,
          createdAt: new Date(startedAt).toISOString(),
        }, { auth })).catch(ignoreFailure)
      } catch {
        // Un registro que lanza de forma síncrona tampoco debe impedir la respuesta.
      }

      const savedConversationId = await conversationIdPromise
      // Memoria: la respuesta se guarda después del mensaje del usuario (orden), sin esperar.
      if (savedConversationId) {
        userMessageSaved
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
