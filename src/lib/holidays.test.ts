// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import { holidayTypeOf, toHoliday, toHolidays } from './holidays.ts'

test('the server sends holidayType in lower case; the screen gets National / Regional / Company', () => {
  assert.equal(holidayTypeOf('national'), 'National')
  assert.equal(holidayTypeOf('Regional'), 'Regional')
  assert.equal(holidayTypeOf(' COMPANY '), 'Company')
  assert.equal(holidayTypeOf(undefined), 'Company')
  assert.equal(holidayTypeOf('festival'), 'Company')
})

test('a row exactly as the server sends it (no `type` key) becomes a usable holiday', () => {
  const row = {
    id: 7, name: 'Gandhi Jayanti', date: '2026-10-02', holidayType: 'national', branchId: null, branchName: null,
    departmentId: null, departmentName: null, isRecurring: false, description: null,
  }
  assert.deepEqual(toHoliday(row), { id: 7, name: 'Gandhi Jayanti', date: '2026-10-02', type: 'National' })
})

test('an older shape with `type`, a datetime date and a missing name are all read', () => {
  assert.deepEqual(toHoliday({ id: 1, name: 'Pongal', date: '2026-01-14T00:00:00Z', type: 'Regional' }), {
    id: 1, name: 'Pongal', date: '2026-01-14', type: 'Regional',
  })
  assert.equal(toHoliday({ id: 2, date: '2026-05-01' })?.name, 'Holiday')
})

test('a row with no usable date is dropped instead of crashing the list', () => {
  assert.equal(toHoliday({ id: 3, name: 'x', date: null }), null)
  assert.equal(toHoliday({ id: 3, name: 'x', date: 'soon' }), null)
  assert.equal(toHoliday(null), null)
  assert.deepEqual(toHolidays([{ id: 1, name: 'A', date: '2026-01-01', holidayType: 'company' }, { id: 2 }, null]).map((h) => h.id), [1])
  assert.deepEqual(toHolidays({ error: 'nope' }), [])
})
