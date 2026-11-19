import assert from 'node:assert/strict'
import test from 'node:test'
import { createAdminLeaveRequestsController } from '../src/controllers/adminLeaveRequestsController.js'
import { createRequirePermission } from '../src/middlewares/requirePermission.js'

const auth = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })
const requestId = '44444444-4444-4444-8444-444444444444'

function response() {
  return { statusCode: null, body: null, status(statusCode) { this.statusCode = statusCode; return this }, json(body) { this.body = body } }
}

test('requires requests.manage before an administrative request route proceeds', async () => {
  const deny = createRequirePermission('requests.manage', { repository: { hasPermission: async () => false } })
  let error
  await deny({ auth }, response(), (nextError) => { error = nextError })
  assert.equal(error.statusCode, 403)

  const allow = createRequirePermission('requests.manage', { repository: { hasPermission: async (receivedAuth, permission) => receivedAuth === auth && permission === 'requests.manage' } })
  let called = false
  await allow({ auth }, response(), () => { called = true })
  assert.equal(called, true)
})

test('maps administrative leave requests with authorized employee metadata only', async () => {
  const controller = createAdminLeaveRequestsController({
    repository: {
      list: async () => ({ total: 1, rows: [{ id: requestId, leave_type_id: 'type-id', start_date: '2026-12-01', end_date: '2026-12-02', reason: 'Synthetic', status: 'submitted', submitted_at: '2026-11-20T00:00:00Z', resolved_at: null, created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-20T00:00:00Z', employee: { employee_code: 'RLS-TEST-EMP-A', profile: { display_name: 'Empleado de prueba' } }, leave_type: { name: 'Vacaciones' }, internal_field: 'must-not-leak' }] }),
    },
  })
  const result = response()
  let error
  await controller.list({ auth, query: {} }, result, (nextError) => { error = nextError })
  assert.equal(error, undefined)
  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.body.data[0].employee, { employeeCode: 'RLS-TEST-EMP-A', displayName: 'Empleado de prueba' })
  assert.equal(result.body.data[0].internal_field, undefined)
})
