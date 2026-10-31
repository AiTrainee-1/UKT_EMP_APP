import assert from 'node:assert/strict'
import test from 'node:test'
import {
  asPortion,
  asStatus,
  clock12,
  dayMarks,
  daysText,
  firstAllowed,
  longDate,
  monthCardState,
  monthOfDate,
  monthWeeks,
  portionChoices,
  portionMeaning,
  yearMonths,
  yearRange,
  yearTotals,
  type CLMonth,
  type CLRow,
} from './casualLeave.ts'

const month = (over: Partial<CLMonth> = {}): CLMonth => ({
  month: '2026-10',
  label: 'October 2026',
  eligible: true,
  reason: null,
  left: 'full',
  usedParts: [],
  usedHalves: [],
  ...over,
})

test('unknown values fall back to a full day / pending', () => {
  assert.equal(asPortion(undefined), 'full')
  assert.equal(asPortion('second_half'), 'second_half')
  assert.equal(asStatus('APPROVED'), 'approved')
  assert.equal(asStatus('weird'), 'pending')
})

test('days are said with halves', () => {
  assert.equal(daysText(0), '0 days')
  assert.equal(daysText(0.5), '½ day')
  assert.equal(daysText(1), '1 day')
  assert.equal(daysText(1.5), '1½ days')
  assert.equal(daysText(12), '12 days')
})

test('clock times read as 12-hour', () => {
  assert.equal(clock12('09:00'), '9:00 AM')
  assert.equal(clock12('13:30'), '1:30 PM')
  assert.equal(clock12('00:15'), '12:15 AM')
  assert.equal(clock12('12:00'), '12:00 PM')
})

test('what each part means, with and without a shift', () => {
  const shift = { start: '09:00', end: '18:00', firstHalfEnd: '13:00', secondHalfStart: '14:00' }
  assert.equal(portionMeaning('full', shift), 'The whole shift off (9:00 AM - 6:00 PM), paid.')
  assert.match(portionMeaning('first_half', shift), /^9:00 AM - 1:00 PM off, paid\. Come in for the second half from 2:00 PM/)
  assert.match(portionMeaning('second_half', shift), /^2:00 PM - 6:00 PM off, paid\. Work the first half from 9:00 AM/)
  assert.match(portionMeaning('first_half', null), /morning half off/)
})

test('dates read without time-zone shifts', () => {
  assert.equal(longDate('2026-10-05'), 'Mon, 5 Oct 2026')
})

test('the month card: full, one half left, used, closed', () => {
  assert.equal(monthCardState(month()).tone, 'open')
  const half = monthCardState(
    month({ left: 'one_half', usedParts: [{ date: '2026-10-05', portion: 'first_half', status: 'pending' }] }),
  )
  assert.equal(half.tone, 'half')
  assert.equal(half.title, 'One half-day left')
  assert.match(half.detail, /First half on 5 Oct \(waiting\)/)
  const used = monthCardState(
    month({
      eligible: false,
      left: 'nothing',
      reason: 'Casual Leave already used this month (limit: 1 per month)',
      usedParts: [{ date: '2026-10-14', portion: 'full', status: 'approved' }],
    }),
  )
  assert.equal(used.tone, 'used')
  assert.equal(used.detail, 'Full day on 14 Oct (approved)')
  const closed = monthCardState(month({ eligible: false, left: 'nothing', reason: 'Eligible after 6 months of service (currently 4)' }))
  assert.equal(closed.tone, 'closed')
  assert.equal(closed.detail, 'Eligible after 6 months of service (currently 4)')
})

test('an older server: only the eligible flag', () => {
  assert.equal(monthCardState(undefined, { eligible: false, reason: 'No' }).tone, 'closed')
  assert.equal(monthCardState(undefined, { eligible: true }).tone, 'open')
})

test('the parts on offer follow the owner rules', () => {
  // nothing used: all three
  const all = portionChoices(month(), '2026-10-20')
  assert.deepEqual([all.full.enabled, all.first_half.enabled, all.second_half.enabled], [true, true, true])
  // one half used: never a full day, and not the same half of the same date
  const one = month({ left: 'one_half', usedHalves: [{ date: '2026-10-20', portion: 'first_half' }] })
  const same = portionChoices(one, '2026-10-20')
  assert.equal(same.full.enabled, false)
  assert.equal(same.first_half.enabled, false)
  assert.match(same.first_half.why ?? '', /first half of 20 Oct is already asked for/)
  assert.equal(same.second_half.enabled, true) // both halves of one date are allowed
  assert.equal(firstAllowed(same), 'second_half')
  const other = portionChoices(one, '2026-10-21')
  assert.deepEqual([other.first_half.enabled, other.second_half.enabled], [true, true])
  // nothing left: all closed with the server's words
  const none = portionChoices(month({ left: 'nothing', eligible: false, reason: 'Both used' }), '2026-10-21')
  assert.equal(none.full.why, 'Both used')
  assert.equal(firstAllowed(none), null)
  // an older server: everything is offered, the server answers on Submit
  assert.equal(portionChoices(undefined, '2026-10-21').full.enabled, true)
})

test('the month of a date', () => {
  const months = [month({ month: '2026-09', label: 'September 2026' }), month()]
  assert.equal(monthOfDate(months, '2026-09-30')?.label, 'September 2026')
  assert.equal(monthOfDate(months, '2026-11-01'), undefined)
})

const rows: CLRow[] = [
  { id: 1, date: '2026-01-12', portion: 'full', status: 'approved' },
  { id: 2, date: '2026-03-05', portion: 'first_half', status: 'approved' },
  { id: 3, date: '2026-03-20', portion: 'second_half', status: 'pending' },
  { id: 4, date: '2026-04-09', portion: 'full', status: 'rejected' },
  { id: 5, date: '2026-05-14', portion: 'second_half', status: 'approved' },
  { id: 6, date: '2026-06-02', portion: 'first_half', status: 'approved' },
  { id: 7, date: '2026-06-02', portion: 'second_half', status: 'approved' },
  { id: 8, date: '2025-12-01', portion: 'full', status: 'approved' },
]

test('the year: 12 months, each full / one half / two halves / none', () => {
  const months = yearMonths(rows, 2026)
  assert.equal(months.length, 12)
  assert.deepEqual(
    months.slice(0, 6).map((m) => m.shape),
    ['full', 'none', 'two_halves', 'none', 'one_half', 'two_halves'],
  )
  // a rejected request is not leave
  assert.equal(months[3].parts.length, 0)
  // a full day fills both halves of the dial; halves fill one each, in date order
  assert.deepEqual(months[0].slots.map((s) => s?.portion), ['full', 'full'])
  assert.deepEqual(months[2].slots.map((s) => s?.status), ['approved', 'pending'])
  assert.deepEqual([months[2].approvedDays, months[2].waitingDays], [0.5, 0.5])
  assert.deepEqual(months[4].slots.map((s) => s?.portion ?? null), ['second_half', null])
})

test('year totals count half-days as half', () => {
  assert.deepEqual(yearTotals(rows, 2026), { takenDays: 3, waitingDays: 0.5, rejected: 1, applications: 7, monthsUsed: 4 })
  assert.equal(yearTotals(rows, 2025).takenDays, 1)
})

test('day marks: which halves of a date are Casual Leave', () => {
  const marks = dayMarks(rows)
  assert.deepEqual(marks['2026-01-12'], { first: 'approved', second: 'approved' })
  assert.deepEqual(marks['2026-03-05'], { first: 'approved', second: null })
  assert.deepEqual(marks['2026-03-20'], { first: null, second: 'pending' })
  assert.deepEqual(marks['2026-06-02'], { first: 'approved', second: 'approved' })
  assert.equal(marks['2026-04-09'], undefined)
})

test('month weeks start on Sunday and hold every day', () => {
  const weeks = monthWeeks(2026, 10) // 1 Oct 2026 is a Thursday
  assert.deepEqual(weeks[0], [null, null, null, null, 1, 2, 3])
  assert.equal(weeks.flat().filter((d) => d !== null).length, 31)
  assert.ok(weeks.every((w) => w.length === 7))
})

test('the year switcher reaches back to the first request', () => {
  assert.deepEqual(yearRange(rows, 2026), { min: 2025, max: 2026 })
  assert.deepEqual(yearRange([{ date: '2023-05-01' }], 2026), { min: 2023, max: 2026 })
  assert.deepEqual(yearRange([], 2026), { min: 2025, max: 2026 })
})
