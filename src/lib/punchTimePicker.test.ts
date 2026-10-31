import assert from 'node:assert/strict'
import test from 'node:test'
import {
  barPosition,
  buildTimeChips,
  clampMinutes,
  dayBarRange,
  from12h,
  hourCells,
  minuteCells,
  nowMinutesIfToday,
  nudge,
  parseClock,
  slotTargets,
  slotTimeHint,
  startTimeFor,
  timeProblem,
  to12h,
  to12hLabel,
  toHHmm,
} from './punchTimePicker.ts'

const shift = { startTime: '08:30', endTime: '17:30:00', firstHalfEnd: '12:30', lunchDurationMinutes: 30 }

test('parseClock reads every spelling the app meets', () => {
  assert.equal(parseClock('09:00'), 540)
  assert.equal(parseClock('9:05:00'), 545)
  assert.equal(parseClock('09:00 AM'), 540)
  assert.equal(parseClock('12:15 am'), 15)
  assert.equal(parseClock('12:15 PM'), 735)
  assert.equal(parseClock('01:45 PM'), 825)
  for (const bad of ['', '—', '24:00', '9:60', '13:00 PM', null, undefined]) assert.equal(parseClock(bad as any), null, String(bad))
})

test('12-hour conversions round-trip', () => {
  for (const m of [0, 1, 59, 720, 721, 779, 1439]) {
    const { hour12, minute, meridiem } = to12h(m)
    assert.equal(from12h(hour12, minute, meridiem), m)
  }
  assert.equal(to12hLabel(0), '12:00 AM')
  assert.equal(to12hLabel(12 * 60 + 5), '12:05 PM')
  assert.equal(toHHmm(18 * 60 + 7), '18:07')
})

test('nudges never leave the day', () => {
  assert.equal(nudge(3, -5), 0)
  assert.equal(nudge(1437, 5), 1439)
  assert.equal(nudge(600, -15), 585)
  assert.equal(clampMinutes(Number.NaN), 0)
})

test('slot targets come from the shift, with the old usual times when it says nothing', () => {
  const t = slotTargets(shift)
  assert.deepEqual(
    [t.morning_in.minutes, t.lunch_out.minutes, t.lunch_in.minutes, t.evening_out.minutes],
    [510, 750, 780, 1050],
  )
  assert.ok(t.morning_in.fromShift && t.lunch_in.fromShift)
  const d = slotTargets(null)
  assert.deepEqual([d.morning_in.minutes, d.lunch_out.minutes, d.lunch_in.minutes, d.evening_out.minutes], [540, 780, 825, 1080])
  assert.ok(!d.morning_in.fromShift)
  // the flat assignment has no lunch: start/end from the shift, lunch from the usual times
  const flat = slotTargets({ startTime: '06:00', endTime: '14:00', firstHalfEnd: null, lunchDurationMinutes: null })
  assert.deepEqual([flat.morning_in.minutes, flat.lunch_out.minutes, flat.evening_out.minutes], [360, 780, 840])
})

test('chips put the reported slot first and offer Now only today', () => {
  const chips = buildTimeChips(shift, 'evening_out', null)
  assert.deepEqual(chips.map((c) => c.key), ['evening_out', 'morning_in', 'lunch_out', 'lunch_in'])
  assert.ok(chips[0].suggested)
  assert.ok(chips.every((c) => !c.disabled))
  const today = buildTimeChips(shift, 'morning_in', 12 * 60 + 40)
  assert.equal(today.at(-1)?.key, 'now')
  assert.equal(today.at(-1)?.minutes, 760)
  // 1:00 PM lunch back and 5:30 PM shift end have not come yet at 12:40
  assert.deepEqual(today.filter((c) => c.disabled).map((c) => c.key), ['lunch_in', 'evening_out'])
})

test('a slot starts at its usual time, pulled back to now when that is still to come today', () => {
  assert.equal(startTimeFor(shift, 'evening_out', null), 1050)
  assert.equal(startTimeFor(shift, 'evening_out', 600), 600)
  assert.equal(startTimeFor(shift, 'morning_in', 600), 510)
})

test('grids disable what has not happened yet today', () => {
  const now = 10 * 60 + 12 // 10:12 AM
  assert.deepEqual(hourCells('AM', now).filter((c) => c.disabled).map((c) => c.hour12), [11])
  assert.ok(hourCells('PM', now).every((c) => c.disabled))
  assert.ok(hourCells('PM', null).every((c) => !c.disabled))
  assert.deepEqual(minuteCells(10, 'AM', now).filter((c) => !c.disabled).map((c) => c.minute), [0, 5, 10])
})

test('today is read from the phone date; a future time today blocks submit', () => {
  const now = new Date(2026, 9, 31, 14, 5)
  assert.equal(nowMinutesIfToday('2026-10-31', now), 845)
  assert.equal(nowMinutesIfToday('2026-10-30', now), null)
  assert.equal(timeProblem(900, 845), 'That time has not come yet today. Pick 2:05 PM or earlier.')
  assert.equal(timeProblem(845, 845), null)
  assert.equal(timeProblem(1400, null), null)
  assert.ok(timeProblem(null, null))
})

test('a time far from the slot gets a gentle hint', () => {
  assert.equal(slotTimeHint('morning_in', 540, shift), null)
  assert.match(slotTimeHint('morning_in', 18 * 60, shift) ?? '', /usual shift start \(8:30 AM\)/)
})

test('the day bar spans whole hours around everything shown', () => {
  assert.deepEqual(dayBarRange([510, 1050, 600]), { start: 420, end: 1140 })
  assert.deepEqual(dayBarRange([10]), { start: 0, end: 120 })
  assert.deepEqual(dayBarRange([]), { start: 480, end: 1140 })
  assert.equal(barPosition(780, { start: 420, end: 1140 }), 0.5)
  assert.equal(barPosition(0, { start: 420, end: 1140 }), 0)
})
