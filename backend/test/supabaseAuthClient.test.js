import assert from 'node:assert/strict'
import test from 'node:test'
import { createAuthDiagnosticFetch, createAuthTransportDiagnostic } from '../src/observability/authDiagnostics.js'
import { createSupabaseAuthClient } from '../src/services/supabaseAuthClient.js'

test('preserves successful Auth fetch responses without diagnostics', async () => {
  const calls = []
  const fetchImpl = async (...argumentsList) => {
    calls.push(argumentsList)
    return { ok: true }
  }
  const fetchWithDiagnostics = createAuthDiagnosticFetch({
    fetchImpl,
    enabled: true,
    logger: () => { throw new Error('must not log a successful fetch') },
  })

  const response = await fetchWithDiagnostics('https://example.invalid/auth/v1/user')
  assert.equal(response.ok, true)
  assert.equal(calls.length, 1)
})

test('reports only safe DNS transport metadata before Auth SDK wraps the failure', async () => {
  const rawError = Object.assign(new TypeError('fetch failed with a secret that must not be logged'), {
    cause: Object.assign(new Error('dns detail must not be logged'), { code: 'ENOTFOUND' }),
  })
  const diagnostics = []
  const fetchWithDiagnostics = createAuthDiagnosticFetch({
    fetchImpl: async () => { throw rawError },
    enabled: true,
    logger: (event) => diagnostics.push(event),
  })

  await assert.rejects(() => fetchWithDiagnostics('https://example.invalid/auth/v1/user'), rawError)
  assert.deepEqual(diagnostics, [{
    component: 'supabase-auth-transport',
    operation: 'auth.fetch',
    category: 'dns',
    transportErrorName: 'TypeError',
    transportCode: 'ENOTFOUND',
  }])
  assert.equal(JSON.stringify(diagnostics).includes('secret'), false)
  assert.equal(JSON.stringify(diagnostics).includes('example.invalid'), false)
})

test('classifies TLS and timeout transport failures without messages', () => {
  assert.equal(createAuthTransportDiagnostic({ name: 'TypeError', code: 'SELF_SIGNED_CERT_IN_CHAIN' }).category, 'tls')
  assert.equal(createAuthTransportDiagnostic({ name: 'TypeError', code: 'ETIMEDOUT' }).category, 'timeout')
})

test('creates the Auth client with an isolated diagnostic fetch wrapper', () => {
  let received
  const client = createSupabaseAuthClient({
    createSupabaseClient(url, publishableKey, options) {
      received = { url, publishableKey, options }
      return { auth: {} }
    },
    getAuthConfig: () => ({ url: 'https://bxtetlzjlgoezxcjhdrw.supabase.co', publishableKey: 'sb_publishable_test' }),
    fetchImpl: async () => ({ ok: true }),
    diagnosticFetch: () => 'safe-fetch-wrapper',
  })

  assert.ok(client)
  assert.equal(received.options.global.fetch, 'safe-fetch-wrapper')
  assert.equal(received.options.auth.persistSession, false)
  assert.equal(received.options.auth.autoRefreshToken, false)
})
