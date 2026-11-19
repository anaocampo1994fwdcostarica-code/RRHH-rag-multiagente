import { normalize } from '../safetyGuard.js'

// Herramientas del agente de datos. El LLM solo elige una y extrae parámetros de esta lista cerrada;
// no existe ningún parámetro de identidad (employee_id, código, nombre o correo).

export const SELF_TOOLS = Object.freeze(['vacation_balance', 'next_payment', 'next_review', 'my_requests', 'my_sick_leaves'])
export const LEAVE_TYPES = Object.freeze(['vacaciones', 'permiso_personal', 'cita_medica', 'duelo'])
export const REQUEST_STATUSES = Object.freeze(['draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled'])
export const WEEKDAYS = Object.freeze({ lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 })

export const toolSelectionSchema = Object.freeze({
  type: 'object',
  properties: {
    tool: { type: 'string', enum: [...SELF_TOOLS, 'none'] },
    params: {
      type: 'object',
      properties: {
        weekday: { type: 'string', enum: Object.keys(WEEKDAYS) },
        date: { type: 'string' },
        leaveType: { type: 'string', enum: [...LEAVE_TYPES] },
        status: { type: 'string', enum: [...REQUEST_STATUSES] },
        activeOnly: { type: 'boolean' },
      },
    },
  },
  required: ['tool'],
})

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : null
}

/**
 * Valida la selección del modelo. Solo conserva parámetros conocidos y válidos para la herramienta;
 * todo lo demás (por ejemplo employee_id o un nombre) se descarta en silencio.
 */
export function parseToolSelection(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Tool selection must be an object.')
  if (![...SELF_TOOLS, 'none'].includes(value.tool)) throw new TypeError('Unknown tool.')
  const input = value.params && typeof value.params === 'object' && !Array.isArray(value.params) ? value.params : {}
  const params = {}
  if (value.tool === 'my_requests') {
    const weekday = normalize(input.weekday ?? '')
    if (WEEKDAYS[weekday]) params.isoWeekday = WEEKDAYS[weekday]
    const date = validDate(input.date)
    if (date) params.date = date
    if (LEAVE_TYPES.includes(input.leaveType)) params.leaveType = input.leaveType
    if (REQUEST_STATUSES.includes(input.status)) params.status = input.status
  }
  if (value.tool === 'my_sick_leaves' && input.activeOnly === true) params.activeOnly = true
  return { tool: value.tool, params }
}

/** Respaldo determinista cuando el LLM falla, tarda o devuelve JSON inválido. */
export function fallbackToolSelection(question) {
  const text = normalize(question)
  const params = {}
  const weekday = Object.keys(WEEKDAYS).find((day) => new RegExp(`\\b${day}\\b`).test(text))
  if (/\b(solicitud|solicitudes|tramite|estado de mi)\b/.test(text)) {
    if (weekday) params.isoWeekday = WEEKDAYS[weekday]
    return { tool: 'my_requests', params, fallback: true }
  }
  if (/\bincapacidad(es)?\b|\bincapacitad[oa]\b/.test(text)) return { tool: 'my_sick_leaves', params: /\b(actual|activa|vigente)\b/.test(text) ? { activeOnly: true } : {}, fallback: true }
  if (/\b(evaluacion|desempeno)\b/.test(text)) return { tool: 'next_review', params, fallback: true }
  if (/\b(pago|pagan|planilla|quincena|aguinaldo|salario)\b/.test(text)) return { tool: 'next_payment', params, fallback: true }
  if (/\b(vacaciones|dias|saldo|quedan|acumulad[oa]s?)\b/.test(text)) return { tool: 'vacation_balance', params, fallback: true }
  return { tool: 'none', params, fallback: true }
}
