function throwSafeAuthError(error) {
  const message = typeof error?.message === 'string' && error.message.length <= 160 ? error.message : 'No fue posible completar la autenticación.'
  throw new Error(message)
}

export function createSessionManager(client) {
  return {
    async restoreUser() {
      const { data, error } = await client.auth.getSession()
      if (error) throwSafeAuthError(error)
      return data.session?.user ?? null
    },
    async getAccessToken() {
      const { data, error } = await client.auth.getSession()
      if (error) return undefined
      return data.session?.access_token
    },
    async signIn({ email, password }) {
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throwSafeAuthError(error)
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) throwSafeAuthError(error)
    },
    subscribe(onUserChange) {
      const listener = client.auth.onAuthStateChange((_event, session) => onUserChange(session?.user ?? null))
      return () => listener.data.subscription.unsubscribe()
    },
  }
}
