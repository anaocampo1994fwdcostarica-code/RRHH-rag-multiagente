import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, createApiClient } from '../src/api/client.js'
import { createLeaveRequest, getLeaveRequest, listLeaveRequests, listLeaveTypes } from '../src/features/leaveRequests/leaveRequestsApi.js'
import { getPolicy, listPolicies } from '../src/features/policies/policiesApi.js'

function response({ ok = true, status = 200, payload = {} } = {}) {
  return { ok, status, json: async () => payload }
}

test('requires an authenticated token before any fetch call', async () => {
  let calls = 0
  const client = createApiClient({ getToken: async () => undefined, fetchImpl: async () => { calls += 1 } })
  await assert.rejects(() => client.request('/policies'), (error) => error instanceof ApiError && error.status === 401)
  assert.equal(calls, 0)
})

test('sends a bearer token without exposing it in returned data', async () => {
  let captured
  const client = createApiClient({
    baseUrl: 'http://local.test/api',
    getToken: async () => 'synthetic-token',
    fetchImpl: async (url, options) => { captured = { url, options }; return response({ payload: { data: [] } }) },
  })
  const payload = await client.request('/policies')
  assert.equal(captured.url, 'http://local.test/api/policies')
  assert.equal(captured.options.headers.Authorization, 'Bearer synthetic-token')
  assert.deepEqual(payload, { data: [] })
})

test('maps backend errors to safe API errors', async () => {
  for (const status of [400, 401, 403, 404, 409, 503]) {
    const client = createApiClient({ getToken: async () => 'synthetic-token', fetchImpl: async () => response({ ok: false, status, payload: {} }) })
    await assert.rejects(() => client.request('/test'), (error) => error instanceof ApiError && error.status === status && !error.message.includes('synthetic-token'))
  }
})

test('builds only supported policy and leave-request endpoint paths', async () => {
  const requests = []
  const client = { request: async (path, options) => { requests.push({ path, options }); return { data: [] } } }
  await listPolicies({ q: 'vacaciones', category: 'Permisos', page: 2, limit: 10 }, client)
  await getPolicy('vacaciones-2026', client)
  await listLeaveRequests({ status: 'draft', page: 1, limit: 20 }, client)
  await getLeaveRequest('11111111-1111-4111-8111-111111111111', client)
  await listLeaveTypes({ limit: 50 }, client)
  await createLeaveRequest({ leaveTypeId: '33333333-3333-4333-8333-333333333333', startDate: '2026-12-01', endDate: '2026-12-02', reason: 'Synthetic' }, client)
  assert.equal(requests[0].path, '/policies?q=vacaciones&category=Permisos&page=2&limit=10')
  assert.equal(requests[1].path, '/policies/vacaciones-2026')
  assert.equal(requests[2].path, '/leave-requests?status=draft&page=1&limit=20')
  assert.equal(requests[3].path, '/leave-requests/11111111-1111-4111-8111-111111111111')
  assert.equal(requests[4].path, '/leave-types?limit=50')
  assert.deepEqual(requests[5].options.body, { leaveTypeId: '33333333-3333-4333-8333-333333333333', startDate: '2026-12-01', endDate: '2026-12-02', reason: 'Synthetic' })
})
