import { createHttpError } from '../errors/httpError.js'
import { classifyDataApiError, reportDataApiFailure } from '../observability/dataApiDiagnostics.js'

export function throwDataApiError(error, options) {
  if (!error) return
  reportDataApiFailure(error, options)

  const category = classifyDataApiError(error)
  if (category === 'authentication') {
    throw createHttpError(401, 'Unauthorized')
  }
  if (category === 'authorization') {
    throw createHttpError(403, 'Forbidden')
  }
  if (error.code === 'PGRST116') {
    throw createHttpError(404, 'Not found')
  }
  if (error.code === '23505' || error.code === '23503') {
    throw createHttpError(409, 'Conflict')
  }
  if (category === 'validation') {
    throw createHttpError(400, 'Invalid data')
  }
  if (category === 'availability' || category === 'connectivity') {
    throw createHttpError(503, 'Data service unavailable')
  }
  if (category === 'schema') {
    throw createHttpError(500, 'Data service schema mismatch')
  }
  throw createHttpError(500, 'Data service request failed')
}
