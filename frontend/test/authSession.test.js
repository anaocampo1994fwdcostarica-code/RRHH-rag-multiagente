import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiClient } from '../src/api/client.js'
import { configureAccessTokenProvider, configureUnauthorizedHandler } from '../src/api/session.js'
import { resetSupabaseAuthClientForTests, getSupabaseAuthClient } from '../src/auth/supabaseAuthClient.js'
import { createSessionManager } from '../src/auth/sessionManager.js'
import { getRouteAccess } from '../src/auth/routeAccess.js'

function createAuthDouble({ session = null, signInError = null, signOutError = null } = {}) {
  let listener
  const calls = []
  return {
    calls,
    emit(eventSession) { listener?.('TOKEN_REFRESHED', eventSession) },
    client: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        signInWithPassword: async (credentials) => { calls.push(['signIn', credentials]); return { error: signInError } },
        signOut: async (options) => { calls.push(['signOut', options]); return { error: signOutError } },
        onAuthStateChange: (callback) => { listener = callback; return { data: { subscription: { unsubscribe: () => { calls.push(['unsubscribe']) } } } } },
      },
    },
  }
}

test('restores a session user and obtains the current token without persisting a second copy', async () => {
  const auth = createAuthDouble({ session: { user: { id: 'user-1', email: 'user@test.invalid' }, access_token: 'synthetic-token' } })
  const manager = createSessionManager(auth.client)
  assert.deepEqual(await manager.restoreUser(), { id: 'user-1', email: 'user@test.invalid' })
  assert.equal(await manager.getAccessToken(), 'synthetic-token')
})

test('handles successful login, invalid credentials, local logout, and session expiration events', async () => {
  const valid = createAuthDouble()
  const manager = createSessionManager(valid.client)
  await manager.signIn({ email: 'user@test.invalid', password: 'synthetic-password' })
  await manager.signOut()
  assert.deepEqual(valid.calls, [['signIn', { email: 'user@test.invalid', password: 'synthetic-password' }], ['signOut', { scope: 'local' }]])
  let nextUser = 'not-called'
  const unsubscribe = manager.subscribe((user) => { nextUser = user })
  valid.emit(null)
  assert.equal(nextUser, null)
  unsubscribe()

  const invalid = createSessionManager(createAuthDouble({ signInError: { message: 'Invalid login credentials' } }).client)
  await assert.rejects(() => invalid.signIn({ email: 'user@test.invalid', password: 'synthetic-password' }), /Invalid login credentials/)
})

test('connects the live session token provider to API requests and clears locally after 401', async () => {
  const auth = createAuthDouble({ session: { user: { id: 'user-1' }, access_token: 'synthetic-token' } })
  const manager = createSessionManager(auth.client)
  configureAccessTokenProvider(() => manager.getAccessToken())
  configureUnauthorizedHandler(() => manager.signOut())
  let authorization
  const client = createApiClient({ fetchImpl: async (_url, options) => { authorization = options.headers.Authorization; return { ok: false, status: 401, json: async () => ({}) } } })
  await assert.rejects(() => client.request('/policies'), (error) => error.status === 401)
  assert.equal(authorization, 'Bearer synthetic-token')
  assert.deepEqual(auth.calls, [['signOut', { scope: 'local' }]])
  configureAccessTokenProvider(async () => undefined)
  configureUnauthorizedHandler(async () => undefined)
})

test('creates an official Supabase Auth client only from public configuration', () => {
  resetSupabaseAuthClientForTests()
  let received
  const client = getSupabaseAuthClient({
    getConfig: () => ({ url: 'https://bxtetlzjlgoezxcjhdrw.supabase.co', publishableKey: 'sb_publishable_test' }),
    createSupabaseClient: (url, key, options) => { received = { url, key, options }; return { auth: {} } },
  })
  assert.ok(client)
  assert.equal(received.options.auth.autoRefreshToken, true)
  assert.equal(received.options.auth.persistSession, true)
  assert.equal(received.options.auth.detectSessionInUrl, true)
  resetSupabaseAuthClientForTests()
})

test('protects private routes while sessions restore or are absent', () => {
  assert.equal(getRouteAccess('loading', null), 'loading')
  assert.equal(getRouteAccess('ready', null), 'redirect-login')
  assert.equal(getRouteAccess('ready', { id: 'user-1' }), 'allow')
})
