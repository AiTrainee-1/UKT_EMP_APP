// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import { isStaffEmployee, showsForEmployee } from './employmentType.ts'

test('isStaffEmployee is true only once the profile says staff', () => {
  assert.equal(isStaffEmployee('staff'), true)
  assert.equal(isStaffEmployee('production'), false)
  // Still loading: no profile yet, so nothing is known and nothing is shown.
  assert.equal(isStaffEmployee(undefined), false)
  assert.equal(isStaffEmployee(null), false)
  assert.equal(isStaffEmployee(''), false)
  assert.equal(isStaffEmployee('Staff'), false)
  assert.equal(isStaffEmployee('contractor'), false)
})

test('a staff-profile-only entry (Compensation) is hidden while loading and from production, shown to staff', () => {
  const compensation = { staffProfileOnly: true }
  assert.equal(showsForEmployee(compensation, undefined), false, 'must not flash while the profile loads')
  assert.equal(showsForEmployee(compensation, 'production'), false)
  assert.equal(showsForEmployee(compensation, 'staff'), true)
})

test('a staff-only entry (Leave, Permissions) keeps the older rule: hidden once production is known', () => {
  const leave = { staffOnly: true }
  assert.equal(showsForEmployee(leave, undefined), true)
  assert.equal(showsForEmployee(leave, 'staff'), true)
  assert.equal(showsForEmployee(leave, 'production'), false)
})

test('an entry with no gate is shown to everybody, loading or not', () => {
  for (const type of [undefined, 'staff', 'production']) assert.equal(showsForEmployee({}, type), true)
})

test('the stricter gate wins when both are set', () => {
  const both = { staffOnly: true, staffProfileOnly: true }
  assert.equal(showsForEmployee(both, undefined), false)
  assert.equal(showsForEmployee(both, 'staff'), true)
})
