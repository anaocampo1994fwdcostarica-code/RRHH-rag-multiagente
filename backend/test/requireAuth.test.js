import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequireAuth } from '../src/middlewares/requireAuth.js'
import { getVerifiedAccessToken } from '../src/security/authIdentity.js'

const validUserId = '11111111-1111-4111-8111-111111111111'

function createResponse() {
  return {
    statusCode: undefined,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

function createRequest(authorization) {
  return {
    get(name) {
      return name === 'authorization' ? authorization : undefined
    },
  }
}

function createMiddleware(result) {
  return createRequireAuth({
    getClient: () => ({
      auth: {
        getClaims: async () => result,
      },
    }),
  })
}

async function invoke({ authorization, result }) {
  const response = createResponse()
  const request = createRequest(authorization)
  let nextCalls = 0
  await createMiddleware(result)(request, response, () => { nextCalls += 1 })
  return { request, response, nextCalls }
}

const validClaims = {
  sub: validUserId,
  role: 'authenticated',
}

test('rejects a request without Authorization', async () => {
  const { response, nextCalls } = await invoke({ result: {} })
  assert.equal(response.statusCode, 401)
  assert.equal(nextCalls, 0)
})

test('rejects an empty Bearer token', async () => {
  const { response, nextCalls } = await invoke({ authorization: 'Bearer   ', result: {} })
  assert.equal(response.statusCode, 401)
  assert.equal(nextCalls, 0)
})

test('rejects an unsupported authorization scheme', async () => {
  const { response, nextCalls } = await invoke({ authorization: 'Basic token', result: {} })
  assert.equal(response.statusCode, 401)
  assert.equal(nextCalls, 0)
})

test('rejects an invalid token', async () => {
  const { response, nextCalls } = await invoke({ authorization: 'Bearer invalid-token', result: { data: { claims: null }, error: new Error('invalid') } })
  assert.equal(response.statusCode, 401)
  assert.equal(nextCalls, 0)
})

test('rejects an expired token', async () => {
  const error = new Error('expired')
  error.status = 401
  const { response, nextCalls } = await invoke({ authorization: 'Bearer expired-token', result: { data: { claims: null }, error } })
  assert.equal(response.statusCode, 401)
  assert.equal(nextCalls, 0)
})

test('rejects a valid token with a non-authenticated role', async () => {
  const { response, nextCalls } = await invoke({ authorization: 'Bearer valid-token', result: { data: { claims: { ...validClaims, role: 'anon' } }, error: null } })
  assert.equal(response.statusCode, 403)
  assert.equal(nextCalls, 0)
})

test('rejects a token without a subject claim', async () => {
  const { response, nextCalls } = await invoke({ authorization: 'Bearer valid-token', result: { data: { claims: { role: 'authenticated' } }, error: null } })
  assert.equal(response.statusCode, 401)
  assert.equal(nextCalls, 0)
})

test('rejects a token with an invalid subject claim', async () => {
  const { response, nextCalls } = await invoke({ authorization: 'Bearer valid-token', result: { data: { claims: { ...validClaims, sub: 'not-a-uuid' } }, error: null } })
  assert.equal(response.statusCode, 401)
  assert.equal(nextCalls, 0)
})

test('returns 503 when the verifier is temporarily unavailable', async () => {
  const error = new Error('timeout')
  error.code = 'ETIMEDOUT'
  const { response, nextCalls } = await invoke({ authorization: 'Bearer valid-token', result: { data: { claims: null }, error } })
  assert.equal(response.statusCode, 503)
  assert.equal(nextCalls, 0)
})

test('attaches only verified identity data for an authenticated token', async () => {
  const { request, response, nextCalls } = await invoke({ authorization: 'Bearer valid-token', result: { data: { claims: { ...validClaims, email: 'ignored@example.test', app_metadata: { role: 'admin' } } }, error: null } })
  assert.equal(response.statusCode, undefined)
  assert.equal(nextCalls, 1)
  assert.deepEqual(request.auth, { userId: validUserId, role: 'authenticated' })
  assert.equal(getVerifiedAccessToken(request.auth), 'valid-token')
})
