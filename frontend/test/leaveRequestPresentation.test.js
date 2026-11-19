import assert from 'node:assert/strict'
import test from 'node:test'
import { createLeaveTypeNameResolver, formatCostaRicaDate, getLeaveRequestStatusLabel, leaveRequestStatuses, toLeaveRequestPresentation } from '../src/features/leaveRequests/presentation.js'

test('translates only the leave-request statuses defined by the backend contract', () => {
  assert.deepEqual(leaveRequestStatuses, ['', 'draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled'])
  assert.equal(getLeaveRequestStatusLabel('draft'), 'Borrador')
  assert.equal(getLeaveRequestStatusLabel('in_review'), 'En revisión')
  assert.equal(getLeaveRequestStatusLabel('approved'), 'Aprobada')
  assert.equal(getLeaveRequestStatusLabel('unexpected'), 'Estado no disponible')
})

test('formats date-only API values for Costa Rica without timezone conversion', () => {
  assert.equal(formatCostaRicaDate('2026-11-26'), '26/11/2026')
  assert.equal(formatCostaRicaDate('2026-02-29'), 'Fecha no disponible')
  assert.equal(formatCostaRicaDate('2026-11-26T00:00:00Z'), 'Fecha no disponible')
})

test('resolves leave-type names and uses a neutral fallback for unavailable types', () => {
  const resolve = createLeaveTypeNameResolver([{ id: 'leave-vacations', name: 'Vacaciones' }, { id: 'leave-medical', name: 'Permiso médico' }])
  assert.equal(resolve('leave-vacations'), 'Vacaciones')
  assert.equal(resolve('unknown-id'), 'Tipo de permiso no disponible')
})

test('builds list and detail presentation while preserving internal values for filters and API calls', () => {
  const request = { id: 'request-1', leaveTypeId: 'leave-vacations', status: 'draft', startDate: '2026-11-26', endDate: '2026-11-28', reason: 'Vacaciones' }
  const display = toLeaveRequestPresentation(request, createLeaveTypeNameResolver([{ id: 'leave-vacations', name: 'Vacaciones' }]))
  assert.equal(display.leaveTypeName, 'Vacaciones')
  assert.equal(display.statusLabel, 'Borrador')
  assert.equal(display.startDateLabel, '26/11/2026')
  assert.equal(display.endDateLabel, '28/11/2026')
  assert.equal(display.status, 'draft')
  assert.equal(display.leaveTypeId, 'leave-vacations')
})
