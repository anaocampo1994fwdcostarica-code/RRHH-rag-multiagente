import { createClient } from '@supabase/supabase-js'
import { env, getSupabaseAuthConfig } from '../config/env.js'
import { createAuthDiagnosticFetch } from '../observability/authDiagnostics.js'

let authClient

export function createSupabaseAuthClient({
  createSupabaseClient = createClient,
  getAuthConfig = getSupabaseAuthConfig,
  fetchImpl = globalThis.fetch,
  diagnosticFetch = createAuthDiagnosticFetch,
} = {}) {
  const { url, publishableKey } = getAuthConfig()
  return createSupabaseClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: diagnosticFetch({ fetchImpl, enabled: env.nodeEnv === 'development' }),
    },
  })
}

export function getSupabaseAuthClient() {
  if (!authClient) authClient = createSupabaseAuthClient()
  return authClient
}
