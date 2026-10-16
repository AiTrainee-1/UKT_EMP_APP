// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMPENSATION_LEGEND,
  COMPENSATION_ORDER,
  COMPENSATION_TONES,
  DAY_TONES,
  OFF_DAY_ORDER,
  OUTCOME_ORDER,
  RING,
  attendanceRate,
  compensationKeyOf,
  compensationLabelOf,
  hasCompensationMarker,
  isCompensatedWholeDay,
  marksOf,
  tally,
  tallyCompensation,
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

// ── compensation days ───────────────────────────────────────────────────────

/** WCAG relative luminance of '#RRGGBB'. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05)

test('the five compensation kinds have a colour AND a symbol of their own, and none can be mistaken for a status or a ring', () => {
  assert.deepEqual([...COMPENSATION_ORDER].sort(), ['birthday', 'ot_allowance', 'relaxation', 'window_early_out', 'window_late_in'])
  const tones = COMPENSATION_ORDER.map((k) => COMPENSATION_TONES[k])
  for (const field of ['solid', 'softLight', 'softDark', 'icon', 'label'] as const) {
    assert.equal(new Set(tones.map((t) => t[field])).size, 5, `${field} must be unique per compensation kind`)
  }
  const statusSolids = [...OUTCOME_ORDER, ...OFF_DAY_ORDER].map((k) => DAY_TONES[k].solid)
  const statusIcons = [...OUTCOME_ORDER, ...OFF_DAY_ORDER].map((k) => DAY_TONES[k].icon)
  for (const t of tones) {
    assert.ok(!statusSolids.includes(t.solid), `${t.label} reuses a status colour`)
    assert.ok(!statusIcons.includes(t.icon), `${t.label} reuses a status symbol`)
    assert.notEqual(t.solid, RING.late)
    assert.notEqual(t.solid, RING.earlyOut)
  }
  assert.equal(Object.keys(COMPENSATION_LEGEND).length, 5)
  for (const k of COMPENSATION_ORDER) assert.ok(COMPENSATION_LEGEND[k].length > 3, `legend text for ${k}`)
})

test('the white number and symbol on a compensation cell are readable (WCAG AA, 4.5:1)', () => {
  for (const k of COMPENSATION_ORDER) {
    assert.ok(contrastWithWhite(COMPENSATION_TONES[k].solid) >= 4.5, `${k} ${contrastWithWhite(COMPENSATION_TONES[k].solid).toFixed(2)}`)
  }
})

test('compensationKeyOf knows the five kinds the server sends and nothing else', () => {
  assert.equal(compensationKeyOf('ot_allowance'), 'ot_allowance')
  assert.equal(compensationKeyOf('window_late_in'), 'window_late_in')
  assert.equal(compensationKeyOf('window_early_out'), 'window_early_out')
  assert.equal(compensationKeyOf('birthday'), 'birthday')
  assert.equal(compensationKeyOf('relaxation'), 'relaxation')
  assert.equal(compensationKeyOf(' Birthday '), 'birthday')
  for (const bad of ['holiday_work', '', '   ', null, undefined, 7, {}, ['birthday']]) assert.equal(compensationKeyOf(bad), null, String(bad))
})

test('a kind added after this app was built is still a compensation day in words, never a crash', () => {
  assert.equal(hasCompensationMarker('holiday_work'), true)
  assert.equal(hasCompensationMarker(''), false)
  assert.equal(hasCompensationMarker(null), false)
  assert.equal(compensationLabelOf('holiday_work'), 'Compensation')
  assert.equal(compensationLabelOf('birthday'), 'Birthday leave')
  assert.equal(compensationLabelOf(undefined), null)
})

test('only a birthday and a relaxation day are made up by the compensation itself', () => {
  assert.equal(isCompensatedWholeDay('birthday'), true)
  assert.equal(isCompensatedWholeDay('relaxation'), true)
  for (const k of ['ot_allowance', 'window_late_in', 'window_early_out', 'holiday_work', null, undefined]) assert.equal(isCompensatedWholeDay(k), false, String(k))
})

test('a relaxation day is a half day with no punches and no ring: the status stays readable, nothing is flagged', () => {
  const d = day('2026-10-12', 'Half Day', { compensationKind: 'relaxation' })
  assert.equal(visualKeyOf(d.status), 'halfDay')
  assert.deepEqual(marksOf(d, ON), { ring: null, earlyDot: false, excessDot: false })
})

test('a window day that is still late after the announced time keeps its Late-In ring on top of the compensation fill', () => {
  const d = day('2026-10-12', 'Late-In', { isLate: true, compensationKind: 'window_late_in' })
  assert.equal(marksOf(d, ON).ring, RING.late)
})

test('the month tally counts each known kind once per day, ignores unknown kinds and days that have not happened', () => {
  const days: DayLike[] = [
    day('2026-10-01', 'Present', { compensationKind: 'ot_allowance' }),
    day('2026-10-02', 'Present', { compensationKind: 'ot_allowance' }),
    day('2026-10-05', 'Present', { compensationKind: 'birthday' }),
    day('2026-10-06', 'Half Day', { compensationKind: 'relaxation' }),
    day('2026-10-07', 'Present', { compensationKind: 'window_late_in' }),
    day('2026-10-08', 'Present', { compensationKind: 'window_early_out' }),
    day('2026-10-09', 'Present', { compensationKind: 'holiday_work' }), // unknown to this app
    day('2026-10-10', 'Present', { compensationKind: null }),
    day('2026-10-11', 'Present'),
    day('2026-10-20', 'Present', { compensationKind: 'birthday' }), // not yet
  ]
  assert.deepEqual(tallyCompensation(days, '2026-10-12'), { ot_allowance: 2, window_late_in: 1, window_early_out: 1, relaxation: 1, birthday: 1 })
  assert.equal(tallyCompensation(days).birthday, 2) // no `today`: every day counts
  assert.deepEqual(tallyCompensation([]), { ot_allowance: 0, window_late_in: 0, window_early_out: 0, relaxation: 0, birthday: 0 })
})

test('the status tally and the rate are untouched by compensation markers', () => {
  const days: DayLike[] = [
    day('2026-10-01', 'Present', { compensationKind: 'birthday' }),
    day('2026-10-02', 'Half Day', { compensationKind: 'relaxation' }),
    day('2026-10-03', 'Absent'),
  ]
  const c = tally(days, ON, '2026-10-10')
  assert.deepEqual({ p: c.present, h: c.halfDay, a: c.absent }, { p: 1, h: 1, a: 1 })
})
