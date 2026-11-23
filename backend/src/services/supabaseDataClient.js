import { createClient } from '@supabase/supabase-js'
import { getVerifiedAccessToken } from '../security/authIdentity.js'
import { getSupabaseAuthConfig } from '../config/env.js'
import { createHttpError } from '../errors/httpError.js'

export function createUserDataClient(auth, {
  createSupabaseClient = createClient,
  getAuthConfig = getSupabaseAuthConfig,
  getAccessToken = getVerifiedAccessToken,
} = {}) {
  const accessToken = getAccessToken(auth)
  if (!accessToken) {
    throw createHttpError(401, 'Unauthorized')
  }

  const { url, publishableKey } = getAuthConfig()
  return createSupabaseClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}
