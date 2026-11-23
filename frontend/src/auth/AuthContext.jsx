import { useEffect, useMemo, useState } from 'react'
import { configureAccessTokenProvider, configureUnauthorizedHandler } from '../api/session.js'
import { AuthContext } from './authContext.js'
import { getSupabaseAuthClient } from './supabaseAuthClient.js'
import { createSessionManager } from './sessionManager.js'

export function AuthProvider({ children, getClient = getSupabaseAuthClient }) {
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)

  useEffect(() => {
    let active = true
    let subscription
    let manager

    const initialize = async () => {
      try {
        manager = createSessionManager(getClient())
        configureAccessTokenProvider(() => manager.getAccessToken())
        configureUnauthorizedHandler(() => manager.signOut())
        const restoredUser = await manager.restoreUser()
        if (active) { setUser(restoredUser); setStatus('ready') }
        subscription = manager.subscribe((nextUser) => { if (active) { setUser(nextUser); setStatus('ready') } })
      } catch {
        if (active) { setUser(null); setStatus('ready') }
      }
    }

    initialize()
    return () => {
      active = false
      subscription?.unsubscribe()
      configureAccessTokenProvider(async () => undefined)
      configureUnauthorizedHandler(async () => undefined)
    }
  }, [getClient])

  const value = useMemo(() => ({
    status,
    user,
    async signIn({ email, password }) {
      await createSessionManager(getClient()).signIn({ email, password })
    },
    async signOut() {
      await createSessionManager(getClient()).signOut()
    },
  }), [getClient, status, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
