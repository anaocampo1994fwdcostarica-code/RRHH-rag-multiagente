import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import app from '../src/app.js'
import { createDocumentsController } from '../src/controllers/documentsController.js'
import { createRequirePermission } from '../src/middlewares/requirePermission.js'

const auth = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })

function response() {
  return { statusCode: undefined, body: undefined, status(statusCode) { this.statusCode = statusCode; return this }, json(body) { this.body = body } }
}

test('documents.manage is required independently of frontend visibility', async () => {
  let nextError
  await createRequirePermission('documents.manage', { repository: { hasPermission: async () => false } })({ auth }, response(), (error) => { nextError = error })
  assert.equal(nextError.statusCode, 403)

  let nextCalls = 0
  await createRequirePermission('documents.manage', { repository: { hasPermission: async () => true } })({ auth }, response(), () => { nextCalls += 1 })
  assert.equal(nextCalls, 1)
})

test('document administrative routes reject requests without a JWT before data access', async () => {
  const server = http.createServer(app)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  try {
    const { port } = server.address()
    for (const path of ['/api/admin/documents', '/api/admin/documents/sync']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: path.endsWith('sync') ? 'POST' : 'GET' })
      assert.equal(response.status, 401)
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('lists only mapped administrative document metadata and policy links', async () => {
  const controller = createDocumentsController({
    repository: { list: async () => ({ total: 1, rows: [{ id: 'doc', title: 'Documento', mime_type: 'application/pdf', document_status: 'in_review', updated_at: '2026-11-19T00:00:00Z', document_versions: [{ version_label: 'hash', processing_status: 'processed', processing_error: null, processed_at: '2026-11-19T00:00:00Z', policy_versions: [{ is_current: true, hr_policies: { id: 'policy', title: 'Vacaciones', status: 'published', archived_at: null } }] }] }] }) },
    adminService: { sync: async () => { throw new Error('must not run') }, },
  })
  const result = response()
  await controller.list({ auth, query: {} }, result, (error) => { throw error })
  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.body.data[0].policy, { id: 'policy', title: 'Vacaciones', status: 'published', archivedAt: null })
  assert.equal(Object.hasOwn(result.body.data[0], 'externalId'), false)
})

test('sync remains disabled by default and rejects arbitrary folder input', async () => {
  let calls = 0
  const controller = createDocumentsController({ repository: {}, adminService: { sync: async () => { calls += 1 } }, isSyncEnabled: () => false })
  let disabled
  await controller.sync({ auth, body: {} }, response(), (error) => { disabled = error })
  assert.equal(disabled.statusCode, 503)
  assert.equal(calls, 0)

  let invalid
  await controller.sync({ auth, body: { folderId: 'other-folder' } }, response(), (error) => { invalid = error })
  assert.equal(invalid.statusCode, 400)
  assert.equal(calls, 0)
})

test('an enabled sync uses only verified identity and no request-supplied folder', async () => {
  let received
  const controller = createDocumentsController({ repository: {}, adminService: { sync: async (identity) => { received = identity; return { outcomes: [] } } }, isSyncEnabled: () => true })
  const result = response()
  await controller.sync({ auth, body: {} }, result, (error) => { throw error })
  assert.equal(received, auth)
  assert.equal(result.statusCode, 202)
})
