import assert from 'node:assert/strict'
import test from 'node:test'
import { canSubmitLeaveRequest, isLeaveRequestSubmissionEnabled } from '../src/features/leaveRequests/submissionFeature.js'

test('enables employee submission only with explicit configuration and a draft request', () => {
  const disabled = { VITE_ENABLE_LEAVE_REQUEST_SUBMISSION: 'false' }
  const enabled = { VITE_ENABLE_LEAVE_REQUEST_SUBMISSION: 'true' }

  assert.equal(isLeaveRequestSubmissionEnabled(disabled), false)
  assert.equal(canSubmitLeaveRequest({ status: 'draft' }, disabled), false)
  assert.equal(isLeaveRequestSubmissionEnabled(enabled), true)
  assert.equal(canSubmitLeaveRequest({ status: 'draft' }, enabled), true)
  assert.equal(canSubmitLeaveRequest({ status: 'submitted' }, enabled), false)
})
