import assert from 'node:assert/strict'
import test from 'node:test'
import { createVerifiedAuthIdentity, getVerifiedAccessToken } from '../src/security/authIdentity.js'
import { createUserDataClient } from '../src/services/supabaseDataClient.js'

const userId = '11111111-1111-4111-8111-111111111111'

test('creates a request-scoped Data API client with only a verified JWT', () => {
  const auth = createVerifiedAuthIdentity({ userId, role: 'authenticated', accessToken: 'verified-test-token' })
  let received
  const client = createUserDataClient(auth, {
    createSupabaseClient(url, publishableKey, options) {
      received = { url, publishableKey, options }
      return { from: () => { throw new Error('No remote calls are allowed in this unit test.') } }
    },
    getAuthConfig: () => ({ url: 'https://bxtetlzjlgoezxcjhdrw.supabase.co', publishableKey: 'sb_publishable_test' }),
  })

  assert.ok(client)
  assert.equal(received.options.global.headers.Authorization, 'Bearer verified-test-token')
  assert.equal(received.options.auth.persistSession, false)
  assert.equal(received.options.auth.autoRefreshToken, false)
  assert.equal(getVerifiedAccessToken(auth), 'verified-test-token')
})

test('rejects identities without a verified access token before creating a Data API client', () => {
  const auth = createVerifiedAuthIdentity({ userId, role: 'authenticated' })
  assert.throws(
    () => createUserDataClient(auth, { createSupabaseClient: () => { throw new Error('must not run') } }),
    (error) => error.statusCode === 401,
  )
})
