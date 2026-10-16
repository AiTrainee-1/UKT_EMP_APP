// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import { readCompensationMarker, readDayFlags } from './attendanceFlags.ts'

test('a day exactly as the server sends it carries its compensation marker', () => {
  const m = readCompensationMarker({
    compensationKind: 'ot_allowance',
    compensationMinutes: 18,
    compensationNote: 'You arrived 18 minutes after your usual time, inside the 30-minute late-in allowance.',
  })
  assert.deepEqual(m, {
    kind: 'ot_allowance',
    minutes: 18,
    note: 'You arrived 18 minutes after your usual time, inside the 30-minute late-in allowance.',
  })
})

test('an older backend sends no marker: nothing is marked, nothing throws', () => {
  assert.deepEqual(readCompensationMarker({}), { kind: null, minutes: 0, note: null })
  assert.deepEqual(readCompensationMarker(undefined), { kind: null, minutes: 0, note: null })
  assert.deepEqual(readCompensationMarker(null), { kind: null, minutes: 0, note: null })
  assert.deepEqual(readCompensationMarker({ compensationKind: null, compensationMinutes: 0, compensationNote: null }), {
    kind: null,
    minutes: 0,
    note: null,
  })
})

test('values that are not the promised type read as not sent', () => {
  assert.deepEqual(readCompensationMarker({ compensationKind: 7, compensationMinutes: 'soon', compensationNote: {} }), {
    kind: null,
    minutes: 0,
    note: null,
  })
  assert.deepEqual(readCompensationMarker({ compensationKind: '   ', compensationMinutes: -5, compensationNote: '  ' }), {
    kind: null,
    minutes: 0,
    note: null,
  })
  assert.equal(readCompensationMarker({ compensationMinutes: 12.4 }).minutes, 12)
  assert.equal(readCompensationMarker({ compensationMinutes: '30' }).minutes, 30)
})

test('the marker rides along on readDayFlags and does not disturb the late / permission flags', () => {
  const f = readDayFlags({
    isLate: true,
    morningPermissionApplied: true,
    compensationKind: 'window_late_in',
    compensationMinutes: 0,
    compensationNote: 'Company late-in time 10:30',
  })
  assert.equal(f.isLate, true)
  assert.equal(f.morningPermissionApplied, true)
  assert.equal(f.compensationKind, 'window_late_in')
  assert.equal(f.compensationNote, 'Company late-in time 10:30')
  // an older backend: the old keys alone still read as before
  const old = readDayFlags({ isLate: false, permissionMorning: true })
  assert.equal(old.morningPermissionApplied, true)
  assert.equal(old.compensationKind, null)
  assert.equal(old.compensationMinutes, 0)
})
