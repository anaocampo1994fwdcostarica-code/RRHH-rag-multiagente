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
const hrTopic = /\b(?:vacaciones|permisos?|licencias?|incapacidad(?:es)?|incapacitad[oa]s?|enferm[oa]|accidente|riesgos? del trabajo|aguinaldo|salarios?|sueldo|pagos?|pagan|planilla|teletrabajo|trabajo|trabaja|labora|laboral|horas? extra|prueba|preaviso|renuncia|renunci[oa]|despid(?:o|en|ido|ieron)|liquidacion|cesantia|seguro|ccss|ins|mtss|pension|acoso|denuncia|feriados?|semana santa|bonos?|beneficios?|politicas?|reglamento|codigo|conducta|ley|evaluaci(?:on|ones)|desempeno|ascen(?:so|sos|der)|asciend\w*|promocion|carrera|capacitaci(?:on|ones)|curso|becas?|formacion|contrato|jornada|horario|uniforme|onboarding|ingreso|rrhh|recursos humanos|empresa|jefatura|privacidad|asistente)\b/
// Un dato propio también se reconoce sin LLM por estos giros ("¿me aprobaron…?", "¿tengo alguna incapacidad registrada?").
const personalRecordFallback = /\b(?:me (?:aprobaron|rechazaron|aceptaron|respondieron)|tengo (?:alguna|algun|registrad\w*)|registrad[ao]s?|(?:que|la que) (?:mande|envie|pedi)|he tomado|llevo tomad\w*)\b/
// Fuera de alcance solo cuando es inequívoco (ocio, cocina, deportes…) y no menciona nada de RRHH.
const clearlyOutOfScope = /\b(?:peliculas?|series?|netflix|musica|canciones?|deportes?|futbol|partido|recetas?|cocinar|chistes?|clima|horoscopo|videojuegos?|juegos?|turismo|restaurantes?|chatgpt|bitcoin)\b/

/**
 * Respaldo determinista cuando el LLM falla, no responde a tiempo o devuelve JSON inválido.
 * La capa de seguridad ya decidió antes (las preguntas sobre terceros nunca llegan aquí como "policy").
 * - Sospechosa → "restricted".
 * - Dato propio reconocible → "personal_data".
 * - Fuera de alcance inequívoco → "out_of_scope".
 * - Todo lo demás → "policy": el agente de políticas solo lee documentos y, si no encuentra nada,
 *   dice "no encontré" y ofrece escalar. Es más seguro que descartar una pregunta legítima.
 */
export function fallbackClassification(question, { suspicious = false } = {}) {
  const base = { subqueries: {}, reformulated: question, fallback: true }
  if (suspicious) return { ...base, intent: 'restricted' }
  const text = normalize(question)
  if (firstPersonRecord.test(text) || personalRecordFallback.test(text)) return { ...base, intent: 'personal_data', subqueries: { personal: question } }
  if (clearlyOutOfScope.test(text) && !hrTopic.test(text)) return { ...base, intent: 'out_of_scope' }
  return { ...base, intent: 'policy', subqueries: { policy: question } }
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

// timeoutMs: plazo por defecto; el orquestador lo acorta con el presupuesto restante de la consulta.
export function createIntentClassifier({ llm, prompt = loadPrompt('orchestrator'), timeoutMs = 4500 } = {}) {
  if (!llm?.generateJson) throw new TypeError('Intent classifier requires an LLM with generateJson.')

  return {
    promptVersion: prompt.version,
    async classify(question, { history = [], suspicious = false, timeoutMs: callTimeoutMs } = {}) {
      const limit = Math.max(0, Math.min(timeoutMs, callTimeoutMs ?? timeoutMs))
      if (limit === 0) return fallbackClassification(question, { suspicious })
      const controller = new AbortController()
      let timer
      try {
        const request = llm.generateJson(
          `Historial reciente (más antiguo primero):\n${formatHistory(history)}\n\nPregunta actual del usuario:\n"""${question}"""`,
          { schema: classificationSchema, systemInstruction: prompt.text, signal: controller.signal, maxTokens: 300 },
        )
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Classifier timeout.')) }, limit) })
        return { ...parseClassification(await Promise.race([request, timeout])), fallback: false }
      } catch {
        return fallbackClassification(question, { suspicious })
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
