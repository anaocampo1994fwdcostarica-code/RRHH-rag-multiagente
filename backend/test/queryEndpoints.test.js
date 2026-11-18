import assert from 'node:assert/strict'
import test from 'node:test'
import { createLeaveTypesController } from '../src/controllers/leaveTypesController.js'
import { createPoliciesController } from '../src/controllers/policiesController.js'
import { throwDataApiError } from '../src/repositories/dataApiError.js'
import { parsePolicyListQuery, parsePolicySlug } from '../src/validation/policies.js'

const auth = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })

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

async function invoke(handler, { query = {}, params = {}, requestAuth = auth } = {}) {
  const response = createResponse()
  let nextError
  await handler({ query, params, auth: requestAuth }, response, (error) => { nextError = error })
  return { response, nextError }
}

test('parses bounded policy filters and pagination', () => {
  assert.deepEqual(parsePolicyListQuery({ category: 'Teletrabajo', q: 'guia interna', page: '2', limit: '10' }), {
    category: 'Teletrabajo',
    search: 'guia interna',
    page: 2,
    limit: 10,
    offset: 10,
  })
  assert.throws(() => parsePolicyListQuery({ limit: '51' }), (error) => error.statusCode === 400)
  assert.throws(() => parsePolicyListQuery({ q: 'contains,postgrest' }), (error) => error.statusCode === 400)
  assert.throws(() => parsePolicySlug('Not a slug'), (error) => error.statusCode === 400)
})

test('lists policy metadata without restricted content', async () => {
  let received
  const controller = createPoliciesController({
    repository: {
      async list(receivedAuth, filters) {
        received = { receivedAuth, filters }
        return {
          total: 1,
          rows: [{ id: 'policy-id', slug: 'teletrabajo', title: 'Teletrabajo', category: 'Horarios', status: 'published', summary: 'Resumen', updated_at: '2026-11-18T00:00:00Z', content: 'must-not-leak' }],
        }
      },
    },
  })

  const { response, nextError } = await invoke(controller.list, { query: { limit: '1' } })
  assert.equal(nextError, undefined)
  assert.equal(response.statusCode, 200)
  assert.equal(received.receivedAuth, auth)
  assert.equal(response.body.data[0].content, undefined)
  assert.deepEqual(Object.keys(response.body.data[0]).sort(), ['category', 'id', 'slug', 'status', 'summary', 'title', 'updatedAt'])
})

test('returns a policy by valid slug and maps an invisible policy to 404', async () => {
  const visibleController = createPoliciesController({
    repository: { findBySlug: async () => ({ id: 'policy-id', slug: 'vacaciones', title: 'Vacaciones', category: 'Permisos', status: 'published', summary: null, updated_at: '2026-11-18T00:00:00Z' }) },
  })
  const visible = await invoke(visibleController.detail, { params: { slug: 'vacaciones' } })
  assert.equal(visible.response.statusCode, 200)
  assert.equal(visible.response.body.data.content, undefined)

  const hiddenController = createPoliciesController({ repository: { findBySlug: async () => null } })
  const hidden = await invoke(hiddenController.detail, { params: { slug: 'not-visible' } })
  assert.equal(hidden.nextError.statusCode, 404)
})

test('rejects invalid endpoint filters before calling repositories', async () => {
  let calls = 0
  const controller = createPoliciesController({ repository: { list: async () => { calls += 1 } } })
  const { nextError } = await invoke(controller.list, { query: { page: '0' } })
  assert.equal(nextError.statusCode, 400)
  assert.equal(calls, 0)
})

test('lists active leave types with an explicit response allow-list', async () => {
  const controller = createLeaveTypesController({
    repository: {
      async listActive(receivedAuth, pagination) {
        assert.equal(receivedAuth, auth)
        assert.equal(pagination.limit, 20)
        return { total: 1, rows: [{ id: 'type-id', code: 'vacaciones', name: 'Vacaciones', requires_attachment: false, internal_note: 'must-not-leak' }] }
      },
    },
  })

  const { response, nextError } = await invoke(controller)
  assert.equal(nextError, undefined)
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body.data[0], { id: 'type-id', code: 'vacaciones', name: 'Vacaciones', requiresAttachment: false })
})

test('maps Data API permission, not-found, and availability errors safely', () => {
  for (const [error, expectedStatus] of [
    [{ code: '42501' }, 403],
    [{ code: 'PGRST116' }, 404],
    [{ status: 503 }, 503],
  ]) {
    assert.throws(() => throwDataApiError(error), (thrown) => thrown.statusCode === expectedStatus)
  }
})
