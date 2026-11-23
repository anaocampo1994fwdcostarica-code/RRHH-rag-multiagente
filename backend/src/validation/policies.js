import { createHttpError } from '../errors/httpError.js'
import { parseOptionalFilter, parsePagination } from './listQuery.js'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const filterPattern = /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u

export function parsePolicyListQuery(query = {}) {
  return {
    ...parsePagination(query),
    category: parseOptionalFilter(query, 'category', { pattern: filterPattern, maxLength: 80 }),
    search: parseOptionalFilter(query, 'q', { pattern: filterPattern, maxLength: 100 }),
  }
}

export function parsePolicySlug(value) {
  if (typeof value !== 'string' || !slugPattern.test(value)) {
    throw createHttpError(400, 'Policy slug has an invalid format.')
  }
  return value
}
