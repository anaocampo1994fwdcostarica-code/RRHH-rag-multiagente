import { createHttpError } from '../errors/httpError.js'

export function throwDataApiError(error) {
  if (!error) return
  if (error.code === '42501' || error.status === 401 || error.status === 403) {
    throw createHttpError(403, 'Forbidden')
  }
  if (error.code === 'PGRST116') {
    throw createHttpError(404, 'Not found')
  }
  if (error.code === '23505' || error.code === '23503') {
    throw createHttpError(409, 'Conflict')
  }
  if (error.code === '23514' || error.status === 400) {
    throw createHttpError(400, 'Invalid data')
  }
  if (error.status === 429 || error.status >= 500 || error.name === 'AuthRetryableFetchError') {
    throw createHttpError(503, 'Data service unavailable')
  }
  throw createHttpError(500, 'Data service request failed')
}
