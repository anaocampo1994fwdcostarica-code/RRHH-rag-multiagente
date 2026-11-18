import { getSupabaseAuthClient } from '../services/supabaseAuthClient.js'
import { createVerifiedAuthIdentity } from '../security/authIdentity.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function sendAuthError(response, statusCode, message) {
  response.status(statusCode).json({ error: message })
}

function getBearerToken(request) {
  const authorization = request.get('authorization')
  if (typeof authorization !== 'string') return undefined

  const match = authorization.match(/^Bearer\s+(\S+)$/i)
  return match?.[1]
}

function isVerifierUnavailable(error) {
  return error?.status >= 500
    || error?.status === 429
    || error?.name === 'AbortError'
    || error?.name === 'AuthRetryableFetchError'
    || ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'].includes(error?.code)
}

export function createRequireAuth({ getClient = getSupabaseAuthClient } = {}) {
  return async function requireAuth(request, response, next) {
    const token = getBearerToken(request)
    if (!token) {
      sendAuthError(response, 401, 'Unauthorized')
      return
    }

    let verification
    try {
      verification = await getClient().auth.getClaims(token)
    } catch (error) {
      sendAuthError(response, isVerifierUnavailable(error) ? 503 : 401, isVerifierUnavailable(error) ? 'Authentication service unavailable' : 'Unauthorized')
      return
    }

    if (verification.error || !verification.data?.claims) {
      sendAuthError(response, isVerifierUnavailable(verification.error) ? 503 : 401, isVerifierUnavailable(verification.error) ? 'Authentication service unavailable' : 'Unauthorized')
      return
    }

    const { claims } = verification.data
    if (!uuidPattern.test(claims.sub ?? '')) {
      sendAuthError(response, 401, 'Unauthorized')
      return
    }

    if (claims.role !== 'authenticated') {
      sendAuthError(response, 403, 'Forbidden')
      return
    }

    request.auth = createVerifiedAuthIdentity({
      userId: claims.sub,
      role: claims.role,
      accessToken: token,
    })
    next()
  }
}

export const requireAuth = createRequireAuth()
