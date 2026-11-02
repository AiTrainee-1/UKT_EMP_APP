// Run with `npm test` (Node's built-in test runner). Home's "Right now / Today's punches" panel (lib/homePunches.ts).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  axisNow,
  barFraction,
  clock12,
  dayBarModel,
  dayOffOf,
  geoPunchesGrew,
  hourLabel,
  minutesOf,
  pickShiftDay,
  presenceLine,
  punchA11y,
  punchMeta,
  punchStory,
  punchesA11y,
  shiftProgress,
  shiftProgressAt,
  shiftStatusText,
  shiftTitle,
  shiftWindow,
  spanText,
  to12h,
  visiblePunches,
  type PunchLike,
} from './homePunches.ts'

const p = (time: string, type: 'IN' | 'OUT', sourceLabel = 'Biometric', extra: Partial<PunchLike> = {}): PunchLike => ({
  time,
  type,
  sourceLabel,
  ...extra,
})
const labels = (steps: { label: string }[]) => steps.map((s) => s.label)

test('clock text', () => {
  assert.equal(minutesOf('09:05'), 545)
  assert.equal(minutesOf('18:00:30'), 1080)
  assert.equal(minutesOf('—'), null)
  assert.equal(minutesOf('25:00'), null)
  assert.equal(minutesOf(undefined), null)
  assert.equal(to12h('09:05'), '9:05 AM')
  assert.equal(to12h('00:10'), '12:10 AM')
  assert.equal(to12h('12:00'), '12:00 PM')
  assert.equal(to12h('18:01:59'), '6:01 PM')
  assert.equal(to12h('later'), 'later')
  assert.equal(clock12(1440 + 362), '6:02 AM')
  assert.equal(hourLabel(9 * 60), '9 AM')
  assert.equal(hourLabel(12 * 60), '12 PM')
  assert.equal(hourLabel(24 * 60), '12 AM')
  assert.equal(hourLabel(27 * 60), '3 AM')
  assert.equal(spanText(25), '25 min')
  assert.equal(spanText(65), '1 h 5 min')
  assert.equal(spanText(180), '3 h')
})

test('shift window and title', () => {
  assert.deepEqual(shiftWindow('09:00', '18:00'), { start: 540, end: 1080, overnight: false })
  assert.deepEqual(shiftWindow('22:00:00', '06:00:00'), { start: 1320, end: 1800, overnight: true })
  assert.equal(shiftWindow('—', '18:00'), null)
  assert.equal(shiftTitle('A'), 'Shift A')
  assert.equal(shiftTitle('General Shift'), 'General Shift')
  assert.equal(shiftTitle(''), 'Your shift')
})

test('punches are labelled by what they are, never by their slot', () => {
  // The owner's complaint: with two punches the old tracker called the second "Lunch Out".
  const two = punchStory([p('09:02', 'IN'), p('13:00', 'OUT')], { shiftStart: '09:00', shiftEnd: '18:00' })
  assert.deepEqual(labels(two), ['Arrived', 'Punched out'])

  const day = punchStory([p('09:02', 'IN'), p('13:00', 'OUT'), p('13:40', 'IN'), p('18:02', 'OUT')], { shiftStart: '09:00', shiftEnd: '18:00' })
  assert.deepEqual(labels(day), ['Arrived', 'Stepped out', 'Came back', 'Left for the day'])
  assert.equal(day[0].time, '9:02 AM')
  assert.equal(day[0].source, 'Biometric')
  assert.equal(day[0].minutes, 542)
  assert.equal(day[3].kind, 'left')
})

test('a last OUT is "left" only near or after the shift end (or when the day is over)', () => {
  assert.equal(punchStory([p('09:00', 'IN'), p('17:10', 'OUT')], { shiftEnd: '18:00' })[1].label, 'Left for the day')
  assert.equal(punchStory([p('09:00', 'IN'), p('16:59', 'OUT')], { shiftEnd: '18:00' })[1].label, 'Punched out')
  assert.equal(punchStory([p('09:00', 'IN'), p('13:00', 'OUT')], { shiftEnd: '18:00', dayIsOver: true })[1].label, 'Left for the day')
  assert.equal(punchStory([p('09:00', 'IN'), p('17:10', 'OUT')], {})[1].label, 'Punched out')
})

test('odd days', () => {
  assert.deepEqual(labels(punchStory([p('09:00', 'IN'), p('09:01', 'IN')])), ['Arrived', 'Punched in again'])
  assert.deepEqual(punchStory([p('18:00', 'OUT')]).map((s) => s.kind), ['out'])
  assert.deepEqual(punchStory(null), [])
  assert.deepEqual(punchStory([]), [])
  // A punch with no clock time keeps its text and gets no place on the bar.
  const odd = punchStory([p('—', 'IN')])
  assert.equal(odd[0].time, '—')
  assert.equal(odd[0].minutes, null)
  // The source falls back to the raw source, then to nothing.
  assert.equal(punchStory([{ time: '09:00', type: 'IN', source: 'geo' }])[0].source, 'geo')
  assert.equal(punchStory([{ time: '09:00', type: 'in' }])[0].source, '')
  assert.equal(punchStory([{ time: '09:00', type: 'in' }])[0].isIn, true)
})

test('more than four punches: every one labelled, in order', () => {
  const steps = punchStory(
    [p('08:58', 'IN'), p('11:00', 'OUT'), p('11:15', 'IN'), p('13:00', 'OUT'), p('13:45', 'IN'), p('16:00', 'OUT'), p('16:10', 'IN'), p('18:05', 'OUT')],
    { shiftStart: '09:00', shiftEnd: '18:00' },
  )
  assert.deepEqual(labels(steps), [
    'Arrived', 'Stepped out', 'Came back', 'Stepped out', 'Came back', 'Stepped out', 'Came back', 'Left for the day',
  ])
  const collapsed = visiblePunches(steps, false)
  assert.equal(collapsed.hiddenCount, 4)
  assert.deepEqual(labels(collapsed.shown), ['Came back', 'Stepped out', 'Came back', 'Left for the day'])
  assert.equal(visiblePunches(steps, true).shown.length, 8)
  assert.equal(visiblePunches(steps.slice(0, 4), false).hiddenCount, 0)
})

test('night shift crossing midnight', () => {
  // Shift 22:00-06:00; the closing punch is marked nextDay by the server.
  const night = punchStory([p('22:01', 'IN'), p('02:00', 'OUT', 'Biometric', { nextDay: true }), p('02:30', 'IN', 'Biometric', { nextDay: true }), p('06:03', 'OUT', 'Biometric', { nextDay: true })], {
    shiftStart: '22:00',
    shiftEnd: '06:00',
  })
  assert.deepEqual(labels(night), ['Arrived', 'Stepped out', 'Came back', 'Left for the day'])
  assert.deepEqual(night.map((s) => s.minutes), [1321, 1440 + 120, 1440 + 150, 1440 + 363])
  assert.deepEqual(night.map((s) => s.nextDay), [false, true, true, true])
  assert.equal(night[3].time, '6:03 AM')

  // Time going backwards means midnight was crossed, even without the nextDay mark.
  const unmarked = punchStory([p('22:01', 'IN'), p('05:58', 'OUT')], { shiftStart: '22:00', shiftEnd: '06:00' })
  assert.equal(unmarked[1].minutes, 1440 + 358)
  assert.equal(unmarked[1].label, 'Left for the day')

  // A break at 23:00 on the night is NOT "left for the day" (the clock-only rule would have said so).
  const brk = punchStory([p('22:01', 'IN'), p('23:00', 'OUT')], { shiftStart: '22:00', shiftEnd: '06:00' })
  assert.equal(brk[1].label, 'Punched out')

  assert.equal(shiftProgress('22:00', '06:00', 2 * 60), 0.5)
  assert.equal(shiftProgress('22:00', '06:00', 23 * 60), 0.125)
  // Before tonight's start: not started (not "over"), and after the night's end too.
  assert.equal(shiftProgress('22:00', '06:00', 21 * 60), 0)
  assert.equal(shiftProgress('22:00', '06:00', 7 * 60), 0)
  // Shown as yesterday's night (carried): 07:00 the next morning is over, 02:00 is halfway.
  const win = shiftWindow('22:00', '06:00')!
  assert.equal(shiftProgressAt(win, axisNow(7 * 60, true)), 1)
  assert.equal(shiftProgressAt(win, axisNow(2 * 60, true)), 0.5)
})

test('shiftProgress and the line under it', () => {
  assert.equal(shiftProgress('09:00', '17:00', 13 * 60), 0.5)
  assert.equal(shiftProgress('09:00', '17:00', 8 * 60), 0)
  assert.equal(shiftProgress('09:00', '17:00', 20 * 60), 1)
  assert.equal(shiftProgress('—', '17:00', 600), null)

  assert.equal(shiftStatusText(0.4, { start: '09:00', nowMinutes: 12 * 60, graceMinutes: 11 }), '40% of the shift done · 11 min grace')
  assert.equal(shiftStatusText(1, { start: '09:00', nowMinutes: 20 * 60 }), 'Shift time is over')
  assert.equal(shiftStatusText(0, { start: '09:00', nowMinutes: 8 * 60 + 35 }), 'Starts in 25 min')
  assert.equal(shiftStatusText(0, { start: '22:00', nowMinutes: 15 * 60 }), 'Starts in 7 h')
  assert.equal(shiftStatusText(0, { start: '—', nowMinutes: 600, graceMinutes: 0 }), 'Shift not started yet')
})

test('presence line', () => {
  assert.equal(presenceLine([]), 'No punch yet today')
  assert.equal(presenceLine(punchStory([p('09:02', 'IN')])), 'In since 9:02 AM')
  assert.equal(presenceLine(punchStory([p('09:02', 'IN'), p('13:00', 'OUT')], { shiftEnd: '18:00' })), 'Punched out at 1:00 PM')
  assert.equal(presenceLine(punchStory([p('09:02', 'IN'), p('13:00', 'OUT'), p('13:30', 'IN')])), 'Back in since 1:30 PM')
  assert.equal(presenceLine(punchStory([p('09:02', 'IN'), p('18:05', 'OUT')], { shiftEnd: '18:00' })), 'Left at 6:05 PM')
  assert.equal(presenceLine(punchStory([p('09:02', 'IN'), p('09:03', 'IN')])), 'In since 9:02 AM')
  // No punch: before / during the shift, after it, and on a day off.
  assert.equal(presenceLine([], { shiftStart: '09:00', shiftEnd: '18:00', nowMinutes: 8 * 60 }), 'No punch yet today')
  assert.equal(presenceLine([], { shiftStart: '09:00', shiftEnd: '18:00', nowMinutes: 19 * 60 }), 'No punch recorded today')
  assert.equal(presenceLine([], { dayOff: dayOffOf({ date: 'x', status: 'On Leave' }), nowMinutes: 19 * 60, shiftStart: '09:00', shiftEnd: '18:00' }), 'On leave today')
})

test('day off: leave, Casual Leave, holiday, weekly off (mapped and raw statuses)', () => {
  assert.equal(dayOffOf(null), null)
  assert.equal(dayOffOf({ date: 'x', status: 'Present' }), null)
  assert.equal(dayOffOf({ date: 'x', status: 'Absent' }), null)
  assert.equal(dayOffOf({ date: 'x', status: 'On Leave' })?.kind, 'leave')
  assert.equal(dayOffOf({ date: 'x', status: 'on_leave' })?.title, 'On leave today')
  assert.equal(dayOffOf({ date: 'x', status: 'Casual Leave' })?.kind, 'casual_leave')
  assert.equal(dayOffOf({ date: 'x', status: 'present', isCasualLeave: true })?.short, 'Casual Leave')
  assert.deepEqual(dayOffOf({ date: 'x', status: 'Holiday', dayKind: 'holiday', holidayName: 'Diwali' }), {
    kind: 'holiday',
    title: 'Holiday today (Diwali)',
    short: 'Diwali',
  })
  assert.equal(dayOffOf({ date: 'x', status: 'holiday' })?.title, 'Holiday today')
  assert.equal(dayOffOf({ date: 'x', status: 'Weekend', dayKind: 'weekly_off' })?.kind, 'weekly_off')
  assert.equal(dayOffOf({ date: 'x', status: 'holiday', dayKind: 'weekly_off' })?.title, 'Weekly off today')
  // A worked holiday is still a holiday (the punches show; the chip says why the day is special).
  assert.equal(dayOffOf({ date: 'x', status: 'present', dayKind: 'holiday', holidayName: 'Pongal' })?.short, 'Pongal')
})

test('which day a night worker is in', () => {
  const records = [
    { date: '2026-11-01', status: 'present', punches: [p('22:01', 'IN'), p('05:30', 'OUT', 'Biometric', { nextDay: true })] },
    { date: '2026-11-02', status: 'absent', punches: [] as PunchLike[] },
  ]
  const opts = { today: '2026-11-02', yesterday: '2026-11-01', shiftStart: '22:00', shiftEnd: '06:00' }
  // 02:00 and 08:30: still last night's shift.
  assert.equal(pickShiftDay(records, { ...opts, nowMinutes: 2 * 60 }).carried, true)
  assert.equal(pickShiftDay(records, { ...opts, nowMinutes: 8 * 60 + 30 }).record?.date, '2026-11-01')
  // 09:00 onwards: today (tonight's shift).
  assert.deepEqual(pickShiftDay(records, { ...opts, nowMinutes: 9 * 60 }), { record: records[1], carried: false })
  // A day shift never carries.
  assert.equal(pickShiftDay(records, { ...opts, shiftStart: '09:00', shiftEnd: '18:00', nowMinutes: 2 * 60 }).carried, false)
  // Once today has a punch, today wins.
  const punched = [records[0], { ...records[1], punches: [p('01:00', 'IN')] }]
  assert.equal(pickShiftDay(punched, { ...opts, nowMinutes: 2 * 60 }).carried, false)
  // Yesterday not loaded (the 1st of the month): today, as it is.
  assert.equal(pickShiftDay([records[1]], { ...opts, nowMinutes: 2 * 60 }).record?.date, '2026-11-02')
  assert.deepEqual(pickShiftDay(undefined, { ...opts, nowMinutes: 600 }), { record: null, carried: false })
  assert.equal(axisNow(120, true), 1560)
  assert.equal(axisNow(120, false), 120)
})

test('day bar: axis, shift window, time inside, dots, now, ticks', () => {
  const steps = punchStory([p('09:02', 'IN'), p('13:00', 'OUT'), p('13:40', 'IN')], { shiftStart: '09:00', shiftEnd: '18:00' })
  const m = dayBarModel(steps, { shiftStart: '09:00', shiftEnd: '18:00', nowAxis: 15 * 60 })
  assert.equal(m.lo, 8 * 60)
  assert.equal(m.hi, 19 * 60)
  assert.equal(m.span, 11 * 60)
  assert.deepEqual(m.shift, { from: 540, to: 1080 })
  // 09:02 -> 13:00 inside, 13:40 -> now (15:00) inside.
  assert.deepEqual(m.inside, [{ from: 542, to: 780 }, { from: 820, to: 900 }])
  assert.deepEqual(m.dots.map((d) => [d.at, d.isIn]), [[542, true], [780, false], [820, true]])
  assert.equal(m.now, 900)
  assert.deepEqual(m.ticks, [540, 720, 900, 1080])
  assert.equal(barFraction(m, 8 * 60), 0)
  assert.equal(barFraction(m, 30 * 60), 1)
  assert.equal(barFraction(m, 13 * 60 + 30), 0.5)

  // IN, IN: only the second one starts a stretch inside. The last OUT closes it; nothing runs to now.
  const twice = punchStory([p('09:00', 'IN'), p('09:05', 'IN'), p('12:00', 'OUT')])
  assert.deepEqual(dayBarModel(twice, { nowAxis: 14 * 60 }).inside, [{ from: 545, to: 720 }])

  // No shift: the axis fits the punches and now only; never past midnight on a day shift.
  const late = dayBarModel(punchStory([p('09:00', 'IN')]), { nowAxis: 23 * 60 + 50 })
  assert.equal(late.hi, 24 * 60)
  assert.equal(late.shift, null)
  assert.deepEqual(late.inside, [{ from: 540, to: 1430 }])
})

test('day bar for a night shift runs past midnight', () => {
  const steps = punchStory([p('22:01', 'IN'), p('02:00', 'OUT', 'Biometric', { nextDay: true })], { shiftStart: '22:00', shiftEnd: '06:00' })
  const m = dayBarModel(steps, { shiftStart: '22:00', shiftEnd: '06:00', nowAxis: axisNow(3 * 60, true) })
  assert.equal(m.lo, 21 * 60)
  assert.equal(m.hi, 31 * 60) // 07:00 the next morning
  assert.deepEqual(m.shift, { from: 1320, to: 1800 })
  assert.deepEqual(m.inside, [{ from: 1321, to: 1560 }])
  assert.equal(m.now, 1620)
  assert.deepEqual(m.ticks.map(hourLabel), ['10 PM', '12 AM', '2 AM', '4 AM', '6 AM'])
})

test('words for screen readers and the meta line', () => {
  const steps = punchStory([p('09:02', 'IN'), p('13:00', 'OUT', '')], { shiftEnd: '18:00' })
  assert.equal(punchA11y(steps[0]), 'Arrived at 9:02 AM, from Biometric')
  assert.equal(punchA11y(steps[1]), 'Punched out at 1:00 PM')
  assert.equal(punchesA11y(steps), '2 punches today: Arrived at 9:02 AM, from Biometric. Punched out at 1:00 PM.')
  assert.equal(punchesA11y([]), 'No punches today')
  assert.equal(punchMeta(steps[0]), 'Biometric')
  assert.equal(punchMeta(steps[1]), '')
  const night = punchStory([p('22:00', 'IN'), p('06:01', 'OUT', 'Biometric', { nextDay: true })], { shiftStart: '22:00', shiftEnd: '06:00' })
  assert.equal(punchMeta(night[1]), 'Biometric · next day')
  assert.equal(punchA11y(night[1]), 'Left for the day at 6:01 AM the next day, from Biometric')
})

test('a new punch in the geo status re-reads the month once', () => {
  const today = '2026-11-02'
  assert.equal(geoPunchesGrew(null, { date: today, count: 2 }, today), false)
  assert.equal(geoPunchesGrew({ date: today, count: 1 }, { date: today, count: 2 }, today), true)
  assert.equal(geoPunchesGrew({ date: today, count: 2 }, { date: today, count: 2 }, today), false)
  assert.equal(geoPunchesGrew({ date: '2026-11-01', count: 4 }, { date: today, count: 5 }, today), false)
  assert.equal(geoPunchesGrew({ date: '2026-11-01', count: 1 }, { date: '2026-11-01', count: 2 }, today), false)
})
