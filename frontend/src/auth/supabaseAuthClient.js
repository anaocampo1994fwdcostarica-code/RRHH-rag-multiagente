import { createClient } from '@supabase/supabase-js'

let authClient

function getAuthConfig() {
  const url = import.meta.env?.VITE_SUPABASE_URL
  const publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) throw new Error('Authentication is not configured.')
  return { url, publishableKey }
}

export function getSupabaseAuthClient({ createSupabaseClient = createClient, getConfig = getAuthConfig } = {}) {
  if (!authClient) {
    const { url, publishableKey } = getConfig()
    authClient = createSupabaseClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  }
  return authClient
}

export function resetSupabaseAuthClientForTests() {
  authClient = undefined
}
