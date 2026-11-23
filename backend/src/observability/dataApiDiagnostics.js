const networkCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'])
const schemaCodes = new Set(['42P01', '42703', 'PGRST204', 'PGRST205'])

function safeCode(value) {
  return typeof value === 'string' && /^[A-Z0-9]{4,12}$/.test(value) ? value : undefined
}

export function classifyDataApiError(error) {
  if (schemaCodes.has(error?.code)) return 'schema'
  if (error?.status === 401) return 'authentication'
  if (error?.status === 403 || error?.code === '42501') return 'authorization'
  if (error?.status === 400 || error?.code === '23514') return 'validation'
  if (error?.status === 429 || error?.status >= 500) return 'availability'
  if (networkCodes.has(error?.code) || ['AbortError', 'AuthRetryableFetchError'].includes(error?.name)) return 'connectivity'
  return 'unexpected'
}

export function createDataApiDiagnostic(error, operation) {
  return Object.freeze({
    component: 'supabase-data-api',
    operation,
    category: classifyDataApiError(error),
    ...(Number.isInteger(error?.status) ? { upstreamStatus: error.status } : {}),
    ...(safeCode(error?.code) ? { upstreamCode: safeCode(error.code) } : {}),
  })
}

export function reportDataApiFailure(error, { operation, enabled = false, logger = console.error } = {}) {
  if (!enabled) return
  logger(createDataApiDiagnostic(error, operation))
}
