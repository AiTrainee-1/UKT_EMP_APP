import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canGoBack,
  canGoForward,
  clampMonth,
  compareMonths,
  currentMonth,
  daysTouchMonth,
  isCurrentMonth,
  laterMonth,
  latestMonthOf,
  monthBounds,
  monthKey,
  monthLabel,
  monthOf,
  monthsOfDays,
  monthToShow,
  monthViewLabel,
  parseMonthKey,
  sameMonth,
  shiftMonth,
} from './monthSwitch.ts'

const today = new Date(2026, 10, 2) // 2 Nov 2026
const nov = { year: 2026, month: 11 }
const oct = { year: 2026, month: 10 }
const sep = { year: 2026, month: 9 }

test('the current month and its key', () => {
  assert.deepEqual(currentMonth(today), nov)
  assert.equal(monthKey(sep), '2026-09')
  assert.equal(monthKey({ year: 2027, month: 12 }), '2027-12')
  assert.deepEqual(parseMonthKey('2026-09'), sep)
  for (const bad of ['2026-13', '2026-00', '2026-9', '2026-09-01', '', null, 5]) assert.equal(parseMonthKey(bad), null, String(bad))
})

test('the month of a date is read from its text, never shifted by a time zone', () => {
  assert.deepEqual(monthOf('2026-09-30'), sep)
  assert.deepEqual(monthOf('2026-09-30T23:30:00-08:00'), sep)
  assert.equal(monthOf('30/09/2026'), null)
  assert.equal(monthOf(null), null)
})

test('stepping wraps the year both ways', () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 })
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 })
  assert.deepEqual(shiftMonth(nov, -14), { year: 2025, month: 9 })
  assert.deepEqual(shiftMonth(nov, 0), nov)
})

test('comparing months', () => {
  assert.ok(compareMonths(sep, oct) < 0)
  assert.ok(compareMonths({ year: 2027, month: 1 }, { year: 2026, month: 12 }) > 0)
  assert.equal(compareMonths(oct, { year: 2026, month: 10 }), 0)
  assert.ok(sameMonth(oct, { year: 2026, month: 10 }))
  assert.equal(sameMonth(oct, null), false)
  assert.deepEqual(laterMonth(sep, oct), oct)
  assert.ok(isCurrentMonth(nov, today))
  assert.equal(isCurrentMonth(oct, today), false)
})

test('the arrows: never past the max (the current month), back without limit unless a min is given', () => {
  assert.equal(canGoForward(nov, nov), false)
  assert.equal(canGoForward(oct, nov), true)
  assert.equal(canGoBack({ year: 2001, month: 1 }), true)
  assert.equal(canGoBack(sep, sep), false)
  assert.equal(canGoBack(oct, sep), true)
  assert.deepEqual(clampMonth({ year: 2027, month: 2 }, null, nov), nov)
  assert.deepEqual(clampMonth({ year: 2020, month: 2 }, sep, nov), sep)
  assert.deepEqual(clampMonth(oct, sep, nov), oct)
})

test('labels: the month name, and "This month" / "All in Sep" on the second view card', () => {
  assert.equal(monthLabel(sep), 'September 2026')
  assert.equal(monthViewLabel(nov, today), 'This month')
  assert.equal(monthViewLabel(sep, today), 'All in Sep')
  assert.equal(monthViewLabel({ year: 2025, month: 11 }, today), 'All in Nov') // same month name, last year
})

test('month bounds know the length of each month', () => {
  assert.deepEqual(monthBounds({ year: 2026, month: 2 }), { first: '2026-02-01', last: '2026-02-28' })
  assert.deepEqual(monthBounds({ year: 2028, month: 2 }), { first: '2028-02-01', last: '2028-02-29' })
  assert.deepEqual(monthBounds(sep), { first: '2026-09-01', last: '2026-09-30' })
})

test('a record belongs to every month its day or range touches', () => {
  assert.ok(daysTouchMonth('2026-09-30', sep))
  assert.equal(daysTouchMonth('2026-09-30', oct), false)
  // a leave from 30 Sep to 2 Oct shows in both months
  const leave = ['2026-09-30', '2026-10-02'] as const
  assert.ok(daysTouchMonth(leave, sep))
  assert.ok(daysTouchMonth(leave, oct))
  assert.equal(daysTouchMonth(leave, nov), false)
  // a long range covers the months in between
  assert.ok(daysTouchMonth(['2026-08-25', '2026-10-02'], sep))
  // no end date, or an end before the start, is the first day only
  assert.ok(daysTouchMonth(['2026-09-30', null], sep))
  assert.equal(daysTouchMonth(['2026-09-30', '2026-08-01'], { year: 2026, month: 8 }), false)
  // only an end date
  assert.ok(daysTouchMonth([null, '2026-09-05'], sep))
  assert.equal(daysTouchMonth(null, sep), false)
  assert.equal(daysTouchMonth('soon', sep), false)
  // an ISO date-time counts by its date part
  assert.ok(daysTouchMonth('2026-09-30T23:30:00+05:30', sep))
})

test('the month to open for a record: keep the one on screen when it holds the record, else its first month', () => {
  const leave = ['2026-09-30', '2026-10-02'] as const
  assert.deepEqual(monthToShow(leave, oct), oct)
  assert.deepEqual(monthToShow(leave, sep), sep)
  assert.deepEqual(monthToShow(leave, nov), sep)
  assert.deepEqual(monthToShow('2026-07-04', nov), { year: 2026, month: 7 })
  assert.equal(monthToShow(null, nov), null)
  assert.deepEqual(monthsOfDays(leave), { first: sep, last: oct })
})

test('the latest month any record touches', () => {
  const rows = [{ d: '2026-08-02' }, { d: ['2026-11-28', '2026-12-03'] as const }, { d: null }]
  assert.deepEqual(latestMonthOf(rows, (r) => r.d), { year: 2026, month: 12 })
  assert.equal(latestMonthOf([] as { d: string }[], (r) => r.d), null)
})
