import { createClient } from '@supabase/supabase-js'
import { getSupabaseAuthConfig } from '../config/env.js'

let authClient

export function getSupabaseAuthClient() {
  if (!authClient) {
    const { url, publishableKey } = getSupabaseAuthConfig()
    authClient = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  }

  return authClient
}
