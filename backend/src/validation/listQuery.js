import { createHttpError } from '../errors/httpError.js'

export const maxPageSize = 50

function getSingleQueryValue(value, name) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw createHttpError(400, `${name} must be a single string value.`)
  return value.trim()
}

function parseInteger(value, name, defaultValue, maximum) {
  const normalized = getSingleQueryValue(value, name)
  if (normalized === undefined || normalized === '') return defaultValue
  if (!/^[1-9]\d*$/.test(normalized)) throw createHttpError(400, `${name} must be a positive integer.`)

  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw createHttpError(400, `${name} exceeds the allowed maximum.`)
  }
  return parsed
}

export function parsePagination(query = {}) {
  const page = parseInteger(query.page, 'page', 1, 100000)
  const limit = parseInteger(query.limit, 'limit', 20, maxPageSize)
  return { page, limit, offset: (page - 1) * limit }
}

export function parseOptionalFilter(query, name, { pattern, maxLength }) {
  const value = getSingleQueryValue(query[name], name)
  if (value === undefined || value === '') return undefined
  if (value.length > maxLength || !pattern.test(value)) {
    throw createHttpError(400, `${name} has an invalid format.`)
  }
  return value
}
