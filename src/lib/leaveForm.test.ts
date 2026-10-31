import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PLAIN_LEAVE_TYPE,
  REASON_CATEGORIES,
  isReasonCategory,
  leaveDayForMonth,
  leaveTitle,
  reasonCategoryLabel,
} from './leaveForm.ts'

test('the four reason categories, and nothing about Casual Leave', () => {
  assert.deepEqual(REASON_CATEGORIES.map((c) => c.label), ['Sick Leave', 'Emergency', 'Personal', 'Other Reasons'])
  assert.ok(REASON_CATEGORIES.every((c) => !/casual/i.test(c.label + c.key + c.hint)))
  assert.ok(isReasonCategory('sick'))
  assert.ok(!isReasonCategory('casual'))
  assert.equal(reasonCategoryLabel('other'), 'Other Reasons')
  assert.equal(reasonCategoryLabel(''), null)
  assert.ok(!/casual/i.test(PLAIN_LEAVE_TYPE))
})

test('a leave card title', () => {
  assert.equal(leaveTitle({ reasonCategory: 'sick', leaveType: 'Leave' }), 'Sick Leave')
  assert.equal(leaveTitle({ reasonCategory: 'emergency', isHalfDay: true }), 'Emergency · Half day')
  assert.equal(leaveTitle({ leaveType: 'casual' }), 'Leave') // the old server default was never Casual Leave
  assert.equal(leaveTitle({ leaveType: 'Annual Leave' }), 'Annual Leave')
  assert.equal(leaveTitle({ isHalfDay: true }), 'Half-Day Leave')
})

test('"taken this month" looks at the days of the leave inside this month', () => {
  const oct = new Date(2026, 9, 31)
  assert.equal(leaveDayForMonth('2026-10-20', '2026-10-21', oct), '2026-10-20')
  assert.equal(leaveDayForMonth('2026-09-29', '2026-10-02', oct), '2026-10-01')
  assert.equal(leaveDayForMonth('2026-09-10', '2026-09-12', oct), '2026-09-10')
  assert.equal(leaveDayForMonth('2026-11-02', null, oct), '2026-11-02')
})
