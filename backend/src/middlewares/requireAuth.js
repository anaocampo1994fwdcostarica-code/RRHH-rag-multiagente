import { getSupabaseAuthClient } from '../services/supabaseAuthClient.js'
import { createVerifiedAuthIdentity } from '../security/authIdentity.js'
import { env } from '../config/env.js'
import { isAuthVerifierUnavailable, reportAuthVerifierFailure } from '../observability/authDiagnostics.js'

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

export function createRequireAuth({
  getClient = getSupabaseAuthClient,
  reportVerifierFailure = (error) => reportAuthVerifierFailure(error, { enabled: env.nodeEnv === 'development' }),
} = {}) {
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
      const unavailable = isAuthVerifierUnavailable(error)
      if (unavailable) reportVerifierFailure(error)
      sendAuthError(response, unavailable ? 503 : 401, unavailable ? 'Authentication service unavailable' : 'Unauthorized')
      return
    }

    if (verification.error || !verification.data?.claims) {
      const unavailable = isAuthVerifierUnavailable(verification.error)
      if (unavailable) reportVerifierFailure(verification.error)
      sendAuthError(response, unavailable ? 503 : 401, unavailable ? 'Authentication service unavailable' : 'Unauthorized')
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
