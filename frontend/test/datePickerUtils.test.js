import test from 'node:test'
import assert from 'node:assert/strict'
import { dateKey, displayDate, parseDateKey } from '../src/components/datePickerUtils.js'

test('date picker uses ISO keys and Spanish long dates', () => {
  const date = parseDateKey('2026-11-22')
  assert.equal(dateKey(date), '2026-11-22')
  assert.equal(displayDate('2026-11-22'), '22 de noviembre de 2026')
})

test('date picker rejects invalid values', () => {
  assert.equal(parseDateKey('2026-02-31'), undefined)
  assert.equal(dateKey(undefined), '')
})
