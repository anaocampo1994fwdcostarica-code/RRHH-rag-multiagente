const networkCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'])

function safeCode(value) {
  return typeof value === 'string' && /^[A-Z0-9_]{3,32}$/.test(value) ? value : undefined
}

function safeName(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{1,64}$/.test(value) ? value : undefined
}

function nestedTransportCode(error) {
  const candidates = [error?.cause, error?.cause?.cause]
  for (const candidate of candidates) {
    if (networkCodes.has(candidate?.code)) return candidate.code
  }
  return undefined
}

function errorChain(error) {
  const chain = []
  let current = error
  while (current && chain.length < 3) {
    chain.push(current)
    current = current.cause
  }
  return chain
}

function transportCategory(code) {
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns'
  if (code === 'ETIMEDOUT') return 'timeout'
  if (typeof code === 'string' && /(CERT|TLS|SSL)/.test(code)) return 'tls'
  return 'connectivity'
}

export function createAuthTransportDiagnostic(error) {
  const chain = errorChain(error)
  const code = chain.map((item) => safeCode(item?.code)).find(Boolean)
  const name = chain.map((item) => safeName(item?.name)).find(Boolean)
  return Object.freeze({
    component: 'supabase-auth-transport',
    operation: 'auth.fetch',
    category: transportCategory(code),
    ...(name ? { transportErrorName: name } : {}),
    ...(code ? { transportCode: code } : {}),
  })
}

export function createAuthDiagnosticFetch({ fetchImpl = globalThis.fetch, enabled = false, logger = console.error } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required for Supabase Auth.')

  return async function diagnosticFetch(...argumentsList) {
    try {
      return await fetchImpl(...argumentsList)
    } catch (error) {
      if (enabled) logger(createAuthTransportDiagnostic(error))
      throw error
    }
  }
}

export function isAuthVerifierUnavailable(error) {
  return error?.status >= 500
    || error?.status === 429
    || error?.name === 'AbortError'
    || error?.name === 'AuthRetryableFetchError'
    || networkCodes.has(error?.code)
}

export function createAuthVerifierDiagnostic(error) {
  return Object.freeze({
    component: 'supabase-auth',
    operation: 'auth.getClaims',
    category: isAuthVerifierUnavailable(error) ? 'availability' : 'verification',
    ...(Number.isInteger(error?.status) ? { upstreamStatus: error.status } : {}),
    ...(safeCode(error?.code) ? { upstreamCode: safeCode(error.code) } : {}),
    ...(safeName(error?.name) ? { upstreamErrorName: safeName(error.name) } : {}),
    ...(nestedTransportCode(error) ? { transportCode: nestedTransportCode(error) } : {}),
  })
}

export function reportAuthVerifierFailure(error, { enabled = false, logger = console.error } = {}) {
  if (!enabled) return
  logger(createAuthVerifierDiagnostic(error))
}
