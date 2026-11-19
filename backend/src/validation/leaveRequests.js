import { createHttpError } from '../errors/httpError.js'
import { parseOptionalFilter, parsePagination } from './listQuery.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const statuses = new Set(['draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled'])

export function parseUuid(value, name) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw createHttpError(400, `${name} must be a valid UUID.`)
  }
  return value
}

export function parseIsoDate(value, name) {
  if (typeof value !== 'string' || !datePattern.test(value)) {
    throw createHttpError(400, `${name} must use YYYY-MM-DD.`)
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw createHttpError(400, `${name} must be a real calendar date.`)
  }
  return value
}

export function parseLeaveRequestListQuery(query = {}) {
  const pagination = parsePagination(query)
  const status = parseOptionalFilter(query, 'status', { pattern: /^[a-z_]+$/, maxLength: 20 })
  if (status && !statuses.has(status)) {
    throw createHttpError(400, 'status is not supported.')
  }

  const startDateFrom = query.startDateFrom === undefined ? undefined : parseIsoDate(query.startDateFrom, 'startDateFrom')
  const startDateTo = query.startDateTo === undefined ? undefined : parseIsoDate(query.startDateTo, 'startDateTo')
  if (startDateFrom && startDateTo && startDateFrom > startDateTo) {
    throw createHttpError(400, 'startDateFrom must not be after startDateTo.')
  }

  return { ...pagination, status, startDateFrom, startDateTo }
}

export function parseCreateLeaveRequestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype) {
    throw createHttpError(400, 'Request body must be a JSON object.')
  }

  const allowedKeys = new Set(['leaveTypeId', 'startDate', 'endDate', 'reason'])
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      throw createHttpError(400, `Unexpected property: ${key}`)
    }
  }

  const leaveTypeId = parseUuid(body.leaveTypeId, 'leaveTypeId')
  const startDate = parseIsoDate(body.startDate, 'startDate')
  const endDate = parseIsoDate(body.endDate, 'endDate')
  if (endDate < startDate) {
    throw createHttpError(400, 'endDate must not be before startDate.')
  }

  let reason = null
  if (body.reason !== undefined && body.reason !== null) {
    // Rechazar caracteres de control es intencional: la regex los busca a propósito.
    // eslint-disable-next-line no-control-regex
    if (typeof body.reason !== 'string' || body.reason.length > 1000 || /[\u0000-\u001F\u007F]/.test(body.reason)) {
      throw createHttpError(400, 'reason has an invalid format.')
    }
    reason = body.reason.trim() || null
  }

  return { leaveTypeId, startDate, endDate, reason }
}
