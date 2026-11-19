import assert from 'node:assert/strict'
import test from 'node:test'
import { createLeaveRequestsController } from '../src/controllers/leaveRequestsController.js'
import { throwDataApiError } from '../src/repositories/dataApiError.js'
import { createLeaveRequestsRepository } from '../src/repositories/leaveRequestsRepository.js'
import { parseCreateLeaveRequestBody, parseLeaveRequestListQuery } from '../src/validation/leaveRequests.js'

const authA = Object.freeze({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })
const authB = Object.freeze({ userId: '22222222-2222-4222-8222-222222222222', role: 'authenticated' })
const leaveTypeId = '33333333-3333-4333-8333-333333333333'
const requestId = '44444444-4444-4444-8444-444444444444'

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

async function invoke(handler, { query = {}, params = {}, body = {}, requestAuth = authA } = {}) {
  const response = createResponse()
  let nextError
  await handler({ query, params, body, auth: requestAuth }, response, (error) => { nextError = error })
  return { response, nextError }
}

function requestRow(overrides = {}) {
  return {
    id: requestId,
    leave_type_id: leaveTypeId,
    start_date: '2026-12-01',
    end_date: '2026-12-02',
    reason: 'Synthetic reason',
    status: 'draft',
    submitted_at: null,
    resolved_at: null,
    created_at: '2026-11-18T00:00:00Z',
    updated_at: '2026-11-18T00:00:00Z',
    employee_id: 'must-not-leak',
    deleted_at: null,
    ...overrides,
  }
}

test('validates leave-request list filters, date ranges, and page limits', () => {
  assert.deepEqual(parseLeaveRequestListQuery({ status: 'draft', startDateFrom: '2026-01-01', startDateTo: '2026-12-31', page: '2', limit: '10' }), {
    status: 'draft', startDateFrom: '2026-01-01', startDateTo: '2026-12-31', page: 2, limit: 10, offset: 10,
  })
  assert.throws(() => parseLeaveRequestListQuery({ status: 'unknown' }), (error) => error.statusCode === 400)
  assert.throws(() => parseLeaveRequestListQuery({ startDateFrom: '2026-02-30' }), (error) => error.statusCode === 400)
  assert.throws(() => parseLeaveRequestListQuery({ startDateFrom: '2026-12-01', startDateTo: '2026-01-01' }), (error) => error.statusCode === 400)
  assert.throws(() => parseLeaveRequestListQuery({ limit: '51' }), (error) => error.statusCode === 400)
})

test('lists visible leave requests without employee identifiers or internal fields', async () => {
  const controller = createLeaveRequestsController({
    repository: {
      async list(receivedAuth, filters) {
        assert.equal(receivedAuth, authA)
        assert.equal(filters.status, 'draft')
        return { total: 1, rows: [requestRow()] }
      },
    },
  })
  const { response, nextError } = await invoke(controller.list, { query: { status: 'draft' } })
  assert.equal(nextError, undefined)
  assert.equal(response.statusCode, 200)
  assert.equal(response.body.data[0].employeeId, undefined)
  assert.equal(response.body.data[0].deletedAt, undefined)
  assert.equal(response.body.data[0].status, 'draft')
})

test('returns 404 for an invisible leave request without exposing ownership', async () => {
  const controller = createLeaveRequestsController({ repository: { findVisibleById: async () => null } })
  const { nextError } = await invoke(controller.detail, { params: { id: requestId }, requestAuth: authB })
  assert.equal(nextError.statusCode, 404)
})

test('rejects invalid request ids before querying a repository', async () => {
  let calls = 0
  const controller = createLeaveRequestsController({ repository: { findVisibleById: async () => { calls += 1 } } })
  const { nextError } = await invoke(controller.detail, { params: { id: 'not-a-uuid' } })
  assert.equal(nextError.statusCode, 400)
  assert.equal(calls, 0)
})

test('validates a draft creation body and rejects privileged or unexpected properties', () => {
  assert.deepEqual(parseCreateLeaveRequestBody({
    leaveTypeId,
    startDate: '2026-12-01',
    endDate: '2026-12-02',
    reason: 'Need time off',
  }), { leaveTypeId, startDate: '2026-12-01', endDate: '2026-12-02', reason: 'Need time off' })

  for (const body of [
    { leaveTypeId, startDate: '2026-12-01', endDate: '2026-12-02', employeeId: 'foreign' },
    { leaveTypeId, startDate: '2026-12-01', endDate: '2026-12-02', status: 'approved' },
    { leaveTypeId: 'bad', startDate: '2026-12-01', endDate: '2026-12-02' },
    { leaveTypeId, startDate: '2026-12-03', endDate: '2026-12-02' },
  ]) {
    assert.throws(() => parseCreateLeaveRequestBody(body), (error) => error.statusCode === 400)
  }
})

test('resolves the employee internally and creates only a draft request', async () => {
  const calls = []
  const controller = createLeaveRequestsController({
    repository: {
      async resolveCurrentEmployeeId(receivedAuth) {
        calls.push(['employee', receivedAuth])
        return 'employee-for-auth-a'
      },
      async findActiveLeaveType(receivedAuth, receivedLeaveTypeId) {
        calls.push(['leaveType', receivedAuth, receivedLeaveTypeId])
        return { id: leaveTypeId, is_active: true, requires_attachment: false }
      },
      async createDraft(receivedAuth, payload) {
        calls.push(['create', receivedAuth, payload])
        return requestRow()
      },
    },
  })
  const { response, nextError } = await invoke(controller.create, {
    body: { leaveTypeId, startDate: '2026-12-01', endDate: '2026-12-02', reason: 'Synthetic reason' },
  })

  assert.equal(nextError, undefined)
  assert.equal(response.statusCode, 201)
  assert.equal(calls[0][1], authA)
  assert.deepEqual(calls[2][2], {
    employeeId: 'employee-for-auth-a',
    leaveTypeId,
    startDate: '2026-12-01',
    endDate: '2026-12-02',
    reason: 'Synthetic reason',
  })
  assert.equal(response.body.data.status, 'draft')
  assert.equal(response.body.data.employeeId, undefined)
})

test('rejects invisible and attachment-required leave types before creating a request', async () => {
  const input = { leaveTypeId, startDate: '2026-12-01', endDate: '2026-12-02' }
  const invisible = createLeaveRequestsController({
    repository: {
      resolveCurrentEmployeeId: async () => 'employee-a',
      findActiveLeaveType: async () => null,
      createDraft: async () => { throw new Error('must not run') },
    },
  })
  const invisibleResult = await invoke(invisible.create, { body: input })
  assert.equal(invisibleResult.nextError.statusCode, 404)

  const attachment = createLeaveRequestsController({
    repository: {
      resolveCurrentEmployeeId: async () => 'employee-a',
      findActiveLeaveType: async () => ({ id: leaveTypeId, requires_attachment: true }),
      createDraft: async () => { throw new Error('must not run') },
    },
  })
  const attachmentResult = await invoke(attachment.create, { body: input })
  assert.equal(attachmentResult.nextError.statusCode, 409)
})

test('submits a visible own draft through the repository without accepting transition data from the client', async () => {
  let submitCall
  const controller = createLeaveRequestsController({
    repository: {
      resolveCurrentEmployeeId: async () => 'employee-a',
      findSubmissionCandidate: async () => ({ id: requestId, employee_id: 'employee-a', status: 'draft' }),
      submitDraft: async (receivedAuth, receivedId, receivedEmployeeId, submittedAt) => {
        submitCall = { receivedAuth, receivedId, receivedEmployeeId, submittedAt }
        return requestRow({ status: 'submitted', submitted_at: submittedAt })
      },
    },
  })
  const { response, nextError } = await invoke(controller.submit, { params: { id: requestId } })
  assert.equal(nextError, undefined)
  assert.equal(response.statusCode, 200)
  assert.equal(response.body.data.status, 'submitted')
  assert.equal(submitCall.receivedAuth, authA)
  assert.equal(submitCall.receivedId, requestId)
  assert.equal(submitCall.receivedEmployeeId, 'employee-a')
  assert.match(submitCall.submittedAt, /^\d{4}-\d{2}-\d{2}T/)
})

test('does not submit an invisible, foreign, non-draft, or duplicate request', async () => {
  let calls = 0
  const invisible = createLeaveRequestsController({
    repository: {
      resolveCurrentEmployeeId: async () => 'employee-b',
      findSubmissionCandidate: async () => null,
      submitDraft: async () => { calls += 1 },
    },
  })
  const invisibleResult = await invoke(invisible.submit, { params: { id: requestId }, requestAuth: authB })
  assert.equal(invisibleResult.nextError.statusCode, 404)

  const submitted = createLeaveRequestsController({
    repository: {
      resolveCurrentEmployeeId: async () => 'employee-a',
      findSubmissionCandidate: async () => ({ id: requestId, employee_id: 'employee-a', status: 'submitted' }),
      submitDraft: async () => { calls += 1 },
    },
  })
  const duplicateResult = await invoke(submitted.submit, { params: { id: requestId } })
  assert.equal(duplicateResult.nextError.statusCode, 409)

  const foreign = createLeaveRequestsController({
    repository: {
      resolveCurrentEmployeeId: async () => 'employee-a',
      findSubmissionCandidate: async () => ({ id: requestId, employee_id: 'employee-b', status: 'draft' }),
      submitDraft: async () => { calls += 1 },
    },
  })
  const foreignResult = await invoke(foreign.submit, { params: { id: requestId } })
  assert.equal(foreignResult.nextError.statusCode, 404)
  assert.equal(calls, 0)
})

test('handles an update that no longer matches a draft without reporting success', async () => {
  const controller = createLeaveRequestsController({
    repository: {
      resolveCurrentEmployeeId: async () => 'employee-a',
      findSubmissionCandidate: async () => ({ id: requestId, employee_id: 'employee-a', status: 'draft' }),
      submitDraft: async () => null,
    },
  })
  const { nextError } = await invoke(controller.submit, { params: { id: requestId } })
  assert.equal(nextError.statusCode, 409)
})

test('limits the submission Data API update to its status, timestamp, draft, and owner predicates', async () => {
  const operations = []
  const builder = {
    from(table) { operations.push(['from', table]); return this },
    update(payload) { operations.push(['update', payload]); return this },
    eq(column, value) { operations.push(['eq', column, value]); return this },
    is(column, value) { operations.push(['is', column, value]); return this },
    select(columns) { operations.push(['select', columns]); return this },
    async maybeSingle() { return { data: requestRow({ status: 'submitted' }), error: null } },
  }
  const repository = createLeaveRequestsRepository({ createDataClient: () => builder })
  await repository.submitDraft(authA, requestId, 'employee-a', '2026-11-20T00:00:00.000Z')

  assert.deepEqual(operations[1], ['update', { status: 'submitted', submitted_at: '2026-11-20T00:00:00.000Z' }])
  assert.deepEqual(operations.filter(([operation]) => operation === 'eq'), [
    ['eq', 'id', requestId],
    ['eq', 'employee_id', 'employee-a'],
    ['eq', 'status', 'draft'],
  ])
  assert.deepEqual(operations.find(([operation]) => operation === 'is'), ['is', 'deleted_at', null])
})

test('maps conflict and invalid Data API errors safely', () => {
  for (const [error, expectedStatus] of [
    [{ code: '23505' }, 409],
    [{ code: '23503' }, 409],
    [{ code: '23514' }, 400],
  ]) {
    assert.throws(() => throwDataApiError(error), (thrown) => thrown.statusCode === expectedStatus)
  }
})
