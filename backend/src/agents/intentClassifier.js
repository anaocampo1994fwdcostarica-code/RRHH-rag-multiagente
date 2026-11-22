import { loadPrompt } from './prompts/index.js'
import { normalize } from './safetyGuard.js'

export const INTENTS = Object.freeze(['policy', 'personal_data', 'mixed', 'restricted', 'aggregate', 'out_of_scope'])
const MAX_TEXT = 1000

export const classificationSchema = Object.freeze({
  type: 'object',
  properties: {
    intent: { type: 'string', enum: [...INTENTS] },
    subqueries: {
      type: 'object',
      properties: { policy: { type: 'string' }, personal: { type: 'string' } },
    },
    reformulated: { type: 'string' },
  },
  required: ['intent', 'subqueries', 'reformulated'],
})

const optionalText = (value) => {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new TypeError('Invalid subquery.')
  const trimmed = value.trim()
  if (trimmed.length > MAX_TEXT) throw new TypeError('Subquery too long.')
  return trimmed || undefined
}

// Valida estrictamente la salida del modelo. Cualquier desviación lanza error y activa el respaldo.
export function parseClassification(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Classification must be an object.')
  if (!INTENTS.includes(value.intent)) throw new TypeError('Unknown intent.')
  if (value.subqueries !== undefined && (typeof value.subqueries !== 'object' || value.subqueries === null || Array.isArray(value.subqueries))) throw new TypeError('Invalid subqueries.')
  const reformulated = optionalText(value.reformulated)
  if (!reformulated) throw new TypeError('Missing reformulated question.')
  const subqueries = {}
  const policy = optionalText(value.subqueries?.policy)
  const personal = optionalText(value.subqueries?.personal)
  if (policy) subqueries.policy = policy
  if (personal) subqueries.personal = personal
  return { intent: value.intent, subqueries, reformulated }
}

// Solo es dato personal si requiere un registro del usuario (saldo, fecha, estado), no una regla.
const firstPersonRecord = /\b(?:me quedan?|tengo disponibles?|mis? (?:saldo|solicitud|solicitudes|proximo pago|proxima evaluacion)|estado (?:de|esta) mis?)\b/
const hrTopic = /\b(?:vacaciones|permiso|licencia|incapacidad|incapacitad[oa]|accidente|riesgos? del trabajo|aguinaldo|salario|pago|planilla|teletrabajo|trabajo|trabaja|labora|laboral|horas? extra|prueba|preaviso|renuncia|despido|liquidacion|cesantia|seguro|ccss|ins|mtss|pension|acoso|feriados?|semana santa|bono|beneficio|politica|reglamento|codigo|ley|evaluacion|contrato|jornada|horario|rrhh|recursos humanos|empresa)\b/

/**
 * Respaldo determinista cuando el LLM falla o devuelve JSON inválido.
 * Nunca devuelve "policy" para algo sospechoso: en ese caso devuelve "restricted".
 */
export function fallbackClassification(question, { suspicious = false } = {}) {
  const base = { subqueries: {}, reformulated: question, fallback: true }
  if (suspicious) return { ...base, intent: 'restricted' }
  const text = normalize(question)
  if (firstPersonRecord.test(text)) return { ...base, intent: 'personal_data', subqueries: { personal: question } }
  if (hrTopic.test(text)) return { ...base, intent: 'policy', subqueries: { policy: question } }
  return { ...base, intent: 'out_of_scope' }
}

// Clasificación por reglas de alta confianza: si la pregunta (sin historial) es claramente un dato propio o
// claramente una consulta de política, no se llama al LLM clasificador (~1 s menos). Ante cualquier duda
// (pronombres posesivos, preguntas compuestas, verbos de norma) devuelve null y decide el LLM.
const policyCue = /\b(?:puedo|debo|se puede|como|cuanto dura|cuando pagan|que pasa|que incluye|que cubre|quien paga|se calcula|anticipacion|politica|reglamento|procedimiento)\b/
// Cualquier referencia a la propia persona ("me pagan", "he tomado") puede pedir un dato propio: decide el LLM.
const possessive = /\b(?:mi|mis|me|he|tengo|llevo)\b/
// Un dato propio solo es "claro" en preguntas cortas y sin condición ("¿me alcanza para…?" es mixta).
const conditional = /\b(?:alcanza|para|si|antes|despues)\b/
export function confidentClassification(question) {
  const text = normalize(question)
  if (!text || text.length > 160) return null
  const personal = firstPersonRecord.test(text)
  if (personal) {
    if (policyCue.test(text) || conditional.test(text) || /\by\b/.test(text) || text.split(/\s+/).length > 9) return null
    return { intent: 'personal_data', subqueries: { personal: question }, reformulated: question, fallback: false, ruleBased: true }
  }
  if (hrTopic.test(text) && !possessive.test(text)) {
    return { intent: 'policy', subqueries: { policy: question }, reformulated: question, fallback: false, ruleBased: true }
  }
  return null
}

function formatHistory(history) {
  if (!history?.length) return '(sin mensajes previos)'
  return history.map((message) => `${message.role === 'assistant' ? 'Asistente' : 'Usuario'}: ${String(message.content).slice(0, 500)}`).join('\n')
}

export function createIntentClassifier({ llm, prompt = loadPrompt('orchestrator'), timeoutMs = 3500 } = {}) {
  if (!llm?.generateJson) throw new TypeError('Intent classifier requires an LLM with generateJson.')

  return {
    promptVersion: prompt.version,
    async classify(question, { history = [], suspicious = false } = {}) {
      const controller = new AbortController()
      let timer
      try {
        const request = llm.generateJson(
          `Historial reciente (más antiguo primero):\n${formatHistory(history)}\n\nPregunta actual del usuario:\n"""${question}"""`,
          { schema: classificationSchema, systemInstruction: prompt.text, signal: controller.signal, maxTokens: 300 },
        )
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Classifier timeout.')) }, timeoutMs) })
        return { ...parseClassification(await Promise.race([request, timeout])), fallback: false }
      } catch {
        return fallbackClassification(question, { suspicious })
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
