import assert from 'node:assert/strict'
import test from 'node:test'
import { validateDraftRequest } from '../src/features/leaveRequests/validation.js'

test('accepts a valid draft request form', () => {
  assert.deepEqual(validateDraftRequest({ leaveTypeId: 'id', startDate: '2026-12-01', endDate: '2026-12-02', reason: 'Synthetic' }), {})
})

test('rejects absent type, invalid dates, reverse ranges, and long reasons', () => {
  const invalid = validateDraftRequest({ leaveTypeId: '', startDate: '2026-02-30', endDate: '2026-03-01', reason: 'x'.repeat(1001) })
  assert.ok(invalid.leaveTypeId)
  assert.ok(invalid.startDate)
  assert.ok(invalid.reason)
  assert.ok(validateDraftRequest({ leaveTypeId: 'id', startDate: '2026-03-02', endDate: '2026-03-01', reason: '' }).endDate)
})
