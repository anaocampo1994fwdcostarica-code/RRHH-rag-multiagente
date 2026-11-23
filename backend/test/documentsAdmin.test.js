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

test('lists Drive documents from list_drive_documents and the last sync run', async () => {
  const controller = createDocumentsController({
    repository: {
      list: async () => [{ document_id: 'doc', document_code: 'POL-RH-01', title: 'Vacaciones', mime_type: 'application/pdf', format: 'PDF', doc_version: '1.0', version_label: 'hash', document_status: 'published', web_view_link: 'https://drive.google.com/file/d/x/view', source_modified_at: 's', updated_at: 'u' }],
      lastSyncRun: async () => ({ run_id: 'run', run_kind: 'incremental', status: 'completed', started_at: 'a', finished_at: 'b', documents_examined: 11, documents_created: 0, documents_updated: 1, documents_archived: 0, documents_failed: 0, error_message: null }),
    },
    adminService: { sync: async () => { throw new Error('must not run') } },
    isSyncEnabled: () => true,
  })
  const result = response()
  await controller.list({ auth, query: {} }, result, (error) => { throw error })
  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.body.data[0], { id: 'doc', code: 'POL-RH-01', title: 'Vacaciones', format: 'PDF', version: '1.0', status: 'published', driveUrl: 'https://drive.google.com/file/d/x/view', sourceModifiedAt: 's', updatedAt: 'u' })
  const last = response()
  await controller.lastSync({ auth }, last, (error) => { throw error })
  assert.equal(last.body.syncEnabled, true)
  assert.equal(last.body.data.examined, 11)
})

test('a sync already running (55P03) is reported as 409', async () => {
  const busy = Object.assign(new Error('Ya hay una sincronización'), { code: '55P03' })
  const controller = createDocumentsController({ repository: {}, adminService: { sync: async () => { throw busy } }, isSyncEnabled: () => true })
  let error
  await controller.sync({ auth, body: {} }, response(), (nextError) => { error = nextError })
  assert.equal(error.statusCode, 409)
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
