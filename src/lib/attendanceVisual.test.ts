// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DAY_TONES,
  OFF_DAY_ORDER,
  OUTCOME_ORDER,
  RING,
  attendanceRate,
  marksOf,
  tally,
  visualKeyOf,
  weeksOf,
} from './attendanceVisual.ts'
import type { DayLike } from './attendanceVisual.ts'

const ON = { lateIn: true, earlyOut: true }
const day = (date: string, status: string, extra: Partial<DayLike> = {}): DayLike => ({ date, status, ...extra })

test('every kind of day has its own fill, and Sunday and a declared holiday are different colours', () => {
  const keys = [...OUTCOME_ORDER, ...OFF_DAY_ORDER]
  assert.equal(keys.length, 8)
  for (const field of ['solid', 'fillLight', 'fillDark'] as const) {
    assert.equal(new Set(keys.map((k) => DAY_TONES[k][field])).size, 8, `${field} must be unique per kind`)
  }
  assert.notEqual(DAY_TONES.sunday.solid, DAY_TONES.holiday.solid)
  assert.notEqual(RING.late, RING.earlyOut)
})

test('statuses map to a colour; Late-In and Early-Out are not colours of their own', () => {
  const expected: Record<string, string> = {
    Present: 'present', 'Late-In': 'present', 'Early-Out': 'present', Absent: 'absent', 'Half Day': 'halfDay',
    Permission: 'permission', 'On Leave': 'onLeave', 'Casual Leave': 'casualLeave', Weekend: 'sunday', Holiday: 'holiday',
  }
  for (const [status, key] of Object.entries(expected)) assert.equal(visualKeyOf(status), key, status)
  assert.equal(visualKeyOf('something new'), 'present')
})

test('a late day keeps its colour and gets a ring; early-out has its own ring; both show the second as a dot', () => {
  assert.deepEqual(marksOf(day('2026-10-01', 'Late-In', { isLate: true }), ON), { ring: RING.late, earlyDot: false, excessDot: false })
  assert.deepEqual(marksOf(day('2026-10-01', 'Early-Out', { isEarlyOut: true }), ON), { ring: RING.earlyOut, earlyDot: false, excessDot: false })
  assert.deepEqual(marksOf(day('2026-10-01', 'Present', { isLate: true, isEarlyOut: true }), ON), { ring: RING.late, earlyDot: true, excessDot: false })
  assert.deepEqual(marksOf(day('2026-10-01', 'Present'), ON), { ring: null, earlyDot: false, excessDot: false })
})

test('a half day or permission day can carry the ring too; absent, leave, Sunday and holiday never do', () => {
  assert.equal(marksOf(day('2026-10-01', 'Half Day', { isLate: true }), ON).ring, RING.late)
  assert.equal(marksOf(day('2026-10-01', 'Permission', { isEarlyOut: true }), ON).ring, RING.earlyOut)
  for (const status of ['Absent', 'On Leave', 'Casual Leave', 'Weekend', 'Holiday']) {
    assert.equal(marksOf(day('2026-10-01', status, { isLate: true }), ON).ring, null, status)
  }
})

test('a check HR has switched off draws no ring', () => {
  assert.equal(marksOf(day('2026-10-01', 'Late-In', { isLate: true }), { lateIn: false, earlyOut: true }).ring, null)
  assert.equal(marksOf(day('2026-10-01', 'Early-Out', { isEarlyOut: true }), { lateIn: true, earlyOut: false }).ring, null)
})

test('an excess permission is a dot unless a late ring already says it', () => {
  assert.equal(marksOf(day('2026-10-01', 'Present', { morningPermissionExcess: true }), ON).excessDot, true)
  assert.equal(marksOf(day('2026-10-01', 'Present', { eveningPermissionExcess: true }), ON).excessDot, true)
  assert.equal(marksOf(day('2026-10-01', 'Late-In', { isLate: true, morningPermissionExcess: true }), ON).excessDot, false)
})

const OCT: DayLike[] = [
  day('2026-10-01', 'Late-In', { isLate: true }),
  day('2026-10-02', 'Holiday'),
  day('2026-10-03', 'Absent'),
  day('2026-10-04', 'Weekend'),
  day('2026-10-05', 'Half Day'),
  day('2026-10-06', 'Present'),
  day('2026-10-07', 'Casual Leave'),
  day('2026-10-08', 'On Leave'),
  day('2026-10-09', 'Permission'),
  day('2026-10-10', 'Early-Out', { isEarlyOut: true }),
  day('2026-10-11', 'Weekend'),
  day('2026-10-29', 'Holiday'), // upcoming
]

test('tally counts each kind, the rings, and only days that have happened (but all Sundays and holidays)', () => {
  const c = tally(OCT, ON, '2026-10-10')
  assert.deepEqual(
    { p: c.present, a: c.absent, h: c.halfDay, perm: c.permission, l: c.onLeave, cl: c.casualLeave, sun: c.sunday, hol: c.holiday, late: c.late, early: c.earlyOut },
    { p: 3, a: 1, h: 1, perm: 1, l: 1, cl: 1, sun: 2, hol: 2, late: 1, early: 1 },
  )
  assert.equal(tally(OCT, { lateIn: false, earlyOut: false }, '2026-10-10').late, 0)
})

test('the attendance rate leaves out Sundays, holidays and approved leave, and counts a half day as half', () => {
  const c = tally(OCT, ON, '2026-10-10')
  // expected = present 3 + half 1 + permission 1 + casual 1 + absent 1 = 7; attended = 3 + 1 + 1 + 0.5 = 5.5
  assert.equal(attendanceRate(c), Math.round((5.5 / 7) * 100))
  assert.equal(attendanceRate(tally([day('2026-10-04', 'Weekend')], ON)), null)
  assert.equal(attendanceRate(tally([day('2026-10-01', 'On Leave')], ON)), null)
})

test('weeks follow the calendar rows (Sunday first) and cover every day of the month once', () => {
  const weeks = weeksOf(OCT, 10, 2026, ON, '2026-10-10')
  // Oct 2026 starts on a Thursday: 1-3 | 4-10 | 11-17 | 18-24 | 25-31
  assert.deepEqual(weeks.map((w) => [w.from, w.to]), [
    ['2026-10-01', '2026-10-03'], ['2026-10-04', '2026-10-10'], ['2026-10-11', '2026-10-17'],
    ['2026-10-18', '2026-10-24'], ['2026-10-25', '2026-10-31'],
  ])
  assert.deepEqual(weeks.map((w) => w.index), [1, 2, 3, 4, 5])
  assert.equal(weeks[0].counts.present, 1)
  assert.equal(weeks[0].counts.absent, 1)
  assert.equal(weeks[0].counts.holiday, 1)
  assert.equal(weeks[0].total, 2) // the holiday is not an outcome
  assert.equal(weeks[1].counts.halfDay + weeks[1].counts.present + weeks[1].counts.permission, 4) // half day, Present x2 (one early-out), permission
  assert.equal(weeks[4].counts.holiday, 1) // the upcoming holiday is in its week
})

test('weeks of a month that starts on a Sunday and of February', () => {
  const nov = weeksOf([], 11, 2026, ON) // 1-Nov-2026 is a Sunday
  assert.equal(nov[0].from, '2026-11-01')
  assert.equal(nov[0].to, '2026-11-07')
  assert.equal(nov[nov.length - 1].to, '2026-11-30')
  const feb = weeksOf([], 2, 2026, ON) // 1-Feb-2026 Sunday, 28 days = exactly four rows
  assert.equal(feb.length, 4)
  assert.equal(feb[3].to, '2026-02-28')
})
