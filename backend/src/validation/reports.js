import { createHttpError } from '../errors/httpError.js'

// Fecha AAAA-MM-DD real (rechaza 2026-02-30). Vacía => null (la base usa hoy en Costa Rica).
export function parseReportDate(value) {
  if (value === undefined || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw createHttpError(400, 'Invalid report date')
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw createHttpError(400, 'Invalid report date')
  return value
}

export function parseHistoryQuery(query = {}) {
  const limit = query.limit === undefined ? 30 : Number(query.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 366) throw createHttpError(400, 'Invalid limit')
  return { limit, before: parseReportDate(query.before) }
}
