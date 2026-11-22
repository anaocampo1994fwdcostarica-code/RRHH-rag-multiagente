const TIME_ZONE = 'America/Costa_Rica'
const EMPTY = '—'

const shortMonths = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const longMonths = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function parseDateKey(value) {
  if (!isValidDateKey(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

/** '2026-11-22' -> '22 nov' */
export function formatShortDate(value) {
  const parts = parseDateKey(value)
  return parts ? `${parts.day} ${shortMonths[parts.month - 1]}` : EMPTY
}

/** '2026-11-22' -> '22 de noviembre de 2026' */
export function formatLongDate(value) {
  const parts = parseDateKey(value)
  return parts ? `${parts.day} de ${longMonths[parts.month - 1]} de ${parts.year}` : EMPTY
}

/** '2026-11-22' -> '22/11/2026' */
export function formatNumericDate(value) {
  const parts = parseDateKey(value)
  return parts ? `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}` : EMPTY
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** ISO timestamp -> '22/11/2026 14:05' in Costa Rica time. */
export function formatDateTimeCostaRica(value) {
  if (typeof value !== 'string' && !(value instanceof Date)) return EMPTY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return EMPTY
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

export function todayInCostaRica(now = new Date()) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(now).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)

export function formatCount(value) {
  return isNumber(value) ? new Intl.NumberFormat('es-CR').format(value) : EMPTY
}

/** Percentages come already as 0-100; null/undefined -> '—'. */
export function formatPercent(value, digits = 1) {
  if (!isNumber(value)) return EMPTY
  return `${new Intl.NumberFormat('es-CR', { maximumFractionDigits: digits }).format(value)} %`
}

export function formatMilliseconds(value) {
  return isNumber(value) ? `${new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(value)} ms` : EMPTY
}

export function formatDays(value) {
  if (!isNumber(value)) return EMPTY
  return `${new Intl.NumberFormat('es-CR', { maximumFractionDigits: 1 }).format(value)} ${value === 1 ? 'día' : 'días'}`
}

export function getNarrativeSourceLabel(source) {
  if (source === 'llm') return 'Redactado por IA'
  if (source === 'template') return 'Plantilla automática'
  return null
}

const leaveTypeLabels = { vacaciones: 'Vacaciones', vacation: 'Vacaciones', permiso: 'Permiso', permission: 'Permiso', incapacidad: 'Incapacidad', sick_leave: 'Incapacidad' }

export function getLeaveTypeLabel(value) {
  if (typeof value !== 'string' || !value) return EMPTY
  return leaveTypeLabels[value.toLowerCase()] ?? value
}

const basisNotes = {
  aproximada: 'Algunas cifras de este reporte son aproximadas.',
  foto_actual: 'Saldos de vacaciones: foto actual al momento de generar el reporte.',
}

/** meta.basis can be a string or an object { key: 'aproximada' | 'foto_actual' | ... }. */
export function getBasisNotes(meta) {
  const basis = meta?.basis
  const values = typeof basis === 'string' ? [basis] : basis && typeof basis === 'object' ? Object.values(basis) : []
  return [...new Set(values.filter((value) => typeof value === 'string' && basisNotes[value]).map((value) => basisNotes[value]))]
}

/** Maps an ApiError (or anything thrown) to a UI state kind. */
export function classifyApiError(error) {
  const status = error?.status
  if (status === 400) return 'invalid'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 503) return 'unavailable'
  if (status === 401) return 'unauthorized'
  return 'error'
}

export function getReportErrorMessage(error) {
  switch (classifyApiError(error)) {
    case 'invalid': return 'Fecha no válida. Elige una fecha entre el 1 de enero de 2020 y hoy.'
    case 'not-found': return 'No hay reporte generado para este día. Elige otra fecha.'
    case 'unavailable': return 'El servicio de reportes no está disponible temporalmente. Intenta de nuevo en unos minutos.'
    default: return 'No fue posible cargar el reporte. Intenta de nuevo.'
  }
}

export function getSyncErrorMessage(error) {
  switch (classifyApiError(error)) {
    case 'conflict': return 'Ya hay una sincronización en curso. Espera a que termine e inténtalo de nuevo.'
    case 'unavailable': return 'La sincronización con Google Drive está desactivada en este entorno.'
    case 'forbidden': return 'No tienes permisos para sincronizar documentos.'
    default: return 'No fue posible iniciar la sincronización. Intenta de nuevo.'
  }
}

const documentStatusLabels = {
  published: 'Publicado',
  in_review: 'En revisión',
  pending: 'Pendiente de revisión',
  archived: 'Archivado',
  failed: 'Con error',
}
const documentStatusStyles = {
  published: 'bg-emerald-100 text-emerald-900',
  in_review: 'bg-sky-100 text-sky-900',
  pending: 'bg-amber-100 text-amber-900',
  archived: 'bg-slate-200 text-slate-800',
  failed: 'bg-rose-100 text-rose-900',
}

export function getDocumentStatusLabel(status) {
  return documentStatusLabels[status] ?? 'Estado no disponible'
}

export function getDocumentStatusStyle(status) {
  return documentStatusStyles[status] ?? 'bg-slate-100 text-slate-800'
}

const syncKindLabels = { scheduled: 'Programada', manual: 'Manual', full: 'Completa', incremental: 'Incremental' }

export function getSyncKindLabel(kind) {
  return syncKindLabels[kind] ?? (typeof kind === 'string' && kind ? kind : EMPTY)
}

export function getSyncStatusLabel(status) {
  if (status === 'started') return 'En curso'
  if (status === 'completed') return 'Completada'
  if (status === 'failed') return 'Con error'
  return EMPTY
}

/** Only https links are rendered as "Abrir en Drive". */
export function getSafeExternalUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch { return null }
}

export function summarizeSyncResult(result) {
  const data = result?.data ?? result ?? {}
  const failed = Number(data.failedDocuments ?? 0)
  const counts = `${data.examined ?? 0} revisados, ${data.created ?? 0} nuevos, ${data.updated ?? 0} actualizados, ${data.renamed ?? 0} renombrados, ${data.archived ?? 0} archivados`
  return failed > 0
    ? { tone: 'warning', message: `Sincronización terminada con ${failed} documento(s) con error. ${counts}.` }
    : { tone: 'success', message: `Sincronización completada. ${counts}.` }
}

export function normalizeTrend(trend) {
  if (!Array.isArray(trend)) return []
  return trend.map((point) => ({
    day: point.day,
    label: formatShortDate(point.day),
    absences: Number(point.absences) || 0,
    chat_queries: point.chat_queries == null ? null : Number(point.chat_queries) || 0,
  }))
}
