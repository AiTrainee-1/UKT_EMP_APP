import assert from 'node:assert/strict'
import test from 'node:test'
import {
  afterApplyText,
  applyRuleText,
  asPortion,
  asStatus,
  balanceCells,
  balanceDetail,
  balanceSentence,
  changeText,
  clCardState,
  clock12,
  dayMarks,
  daysText,
  firstAllowed,
  halvesText,
  historyNewestFirst,
  isYearly,
  longDate,
  monthCardState,
  monthOfDate,
  monthWeeks,
  portionChoices,
  portionMeaning,
  readBalance,
  readHistory,
  readMonthsUsage,
  rowKey,
  showBalance,
  usageRows,
  withHrProposals,
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

// ─── The yearly balance (owner 2026-11-02): 12 a year, any number a month while it lasts ───

const balanceRaw = (over: Record<string, unknown> = {}) => ({
  total: 12, used: 1, pending: 0, remaining: 11, year: 2026,
  since: '2026-11-02', endsOn: '2026-12-31', cutOver: '2026-11-02', tracked: true,
  ...over,
})
const bal = (over: Record<string, unknown> = {}) => readBalance(balanceRaw(over))!

test('the balance block is read defensively; an older server sends none', () => {
  assert.deepEqual(bal(), {
    total: 12, used: 1, pending: 0, remaining: 11, year: 2026,
    since: '2026-11-02', endsOn: '2026-12-31', cutOver: '2026-11-02', tracked: true,
  })
  assert.equal(readBalance(undefined), null)
  assert.equal(readBalance('11'), null)
  // a missing remaining is worked out; a half-day stays a half
  assert.equal(readBalance({ total: 12, used: 1.5, pending: 0.5, year: 2026 })!.remaining, 10)
  assert.equal(readBalance({ year: 2025, tracked: false, since: null })!.tracked, false)
})

test('the balance in words: "11 of 12 CL left in 2026 · resets on 1 Jan"', () => {
  assert.equal(halvesText(11), '11')
  assert.equal(halvesText(10.5), '10½')
  assert.equal(halvesText(0.5), '½')
  assert.equal(halvesText(0), '0')
  assert.equal(balanceSentence(bal()), '11 of 12 CL left in 2026 · resets on 1 Jan')
  assert.equal(balanceSentence(bal({ used: 1, pending: 0.5, remaining: 10.5 })), '10½ of 12 CL left in 2026 · resets on 1 Jan')
  assert.equal(balanceDetail(bal({ used: 1, pending: 0.5 })), '1 day taken · ½ day waiting for approval')
  assert.equal(balanceDetail(bal({ used: 0, pending: 0, remaining: 12 })), null)
})

test('the balance is shown only to someone who can have Casual Leave', () => {
  const open = [month()]
  const shut = [month({ eligible: false, left: 'nothing', reason: 'Casual Leave is available only for staff employees' })]
  assert.equal(showBalance({ balance: bal(), eligible: true, months: open }), true)
  // production / before 6 months: no "12 of 12 left" that is not theirs
  assert.equal(showBalance({ balance: bal({ used: 0, remaining: 12 }), eligible: false, months: shut }), false)
  // all used (so not eligible): still shown, it is the answer
  assert.equal(showBalance({ balance: bal({ used: 11, pending: 1, remaining: 0 }), eligible: false, months: shut }), true)
  // an older server, or a year before the cut-over
  assert.equal(showBalance({ balance: null, eligible: true, months: open }), false)
  assert.equal(showBalance({ balance: bal({ tracked: false }), eligible: true, months: open }), false)
})

test('the card under the yearly rule: days left, half left, none left, not available', () => {
  const yearly = month({ month: '2026-11', label: 'November 2026', rule: 'yearly_balance', remaining: 11 })
  const open = clCardState({ balance: bal(), rule: 'yearly_balance', month: yearly })
  assert.equal(open.tone, 'open')
  assert.equal(open.title, '11 days left')
  assert.match(open.detail, /any dates while your balance lasts/)

  const half = clCardState({ balance: bal({ used: 11.5, remaining: 0.5 }), rule: 'yearly_balance', month: { ...yearly, left: 'one_half', remaining: 0.5 } })
  assert.deepEqual([half.tone, half.title], ['half', '½ day left'])

  const none = clCardState({
    balance: bal({ used: 12, remaining: 0 }),
    rule: 'yearly_balance',
    month: { ...yearly, eligible: false, left: 'nothing', reason: 'No Casual Leave left for 2026', remaining: 0 },
  })
  assert.deepEqual([none.tone, none.title], ['used', 'All 12 days used'])
  assert.match(none.detail, /A fresh 12 starts on 1 Jan 2027/)
  const waiting = clCardState({ balance: bal({ used: 11, pending: 1, remaining: 0 }), rule: 'yearly_balance', month: { ...yearly, eligible: false } })
  assert.equal(waiting.title, 'No days left')
  assert.match(waiting.detail, /1 day still waiting for approval/)

  const closed = clCardState({
    balance: bal({ used: 0, remaining: 12 }),
    rule: 'yearly_balance',
    month: { ...yearly, eligible: false, left: 'nothing', reason: 'Eligible after 6 months of service (currently 4)' },
  })
  assert.deepEqual([closed.tone, closed.detail], ['closed', 'Eligible after 6 months of service (currently 4)'])
})

test('the card keeps the one-a-month words without a balance (older server) or under the old rule', () => {
  assert.deepEqual(clCardState({ month: month() }), monthCardState(month()))
  assert.deepEqual(clCardState({ eligible: false, reason: 'No' }).tone, 'closed')
  assert.deepEqual(clCardState({ balance: bal(), rule: 'one_per_month', month: month() }), monthCardState(month()))
  assert.equal(isYearly({ balance: bal(), rule: 'yearly_balance' }), true)
  assert.equal(isYearly({ balance: bal({ tracked: false }), rule: 'yearly_balance' }), false)
  assert.equal(isYearly({ balance: bal(), month: { rule: 'yearly_balance' } }), true)
})

test('yearly rule: any number a month; same-date half rules; a full day needs a whole day left', () => {
  // two Casual Leave already this month (a full day and a half): more are still offered on other dates
  const nov = month({
    month: '2026-11', label: 'November 2026', rule: 'yearly_balance', remaining: 10.5, left: 'full',
    usedParts: [
      { date: '2026-11-05', portion: 'full', status: 'approved' },
      { date: '2026-11-12', portion: 'first_half', status: 'pending' },
    ],
    usedHalves: [{ date: '2026-11-12', portion: 'first_half' }],
    usedFullDates: ['2026-11-05'],
  })
  const other = portionChoices(nov, '2026-11-20')
  assert.deepEqual([other.full.enabled, other.first_half.enabled, other.second_half.enabled], [true, true, true])
  // a date that is already a full day: nothing more on it
  const fullDay = portionChoices(nov, '2026-11-05')
  assert.deepEqual([fullDay.full.enabled, fullDay.first_half.enabled, fullDay.second_half.enabled], [false, false, false])
  assert.match(fullDay.full.why ?? '', /5 Nov is already a full day/)
  // a date with one half asked for: the other half only
  const halfDay = portionChoices(nov, '2026-11-12')
  assert.equal(halfDay.full.enabled, false)
  assert.match(halfDay.full.why ?? '', /Half of 12 Nov is already asked for/)
  assert.equal(halfDay.first_half.enabled, false)
  assert.equal(halfDay.second_half.enabled, true)
  assert.equal(firstAllowed(halfDay), 'second_half')
  // half a day left in the year: halves only
  const halfLeft = portionChoices({ ...nov, remaining: 0.5, left: 'one_half' }, '2026-11-20')
  assert.equal(halfLeft.full.enabled, false)
  assert.match(halfLeft.full.why ?? '', /Only half a day of Casual Leave is left for 2026/)
  assert.equal(halfLeft.first_half.enabled, true)
  // nothing left: closed with the server's words
  const none = portionChoices({ ...nov, eligible: false, left: 'nothing', remaining: 0, reason: 'No Casual Leave left for 2026' }, '2026-11-20')
  assert.equal(none.second_half.why, 'No Casual Leave left for 2026')
  // no `remaining` sent: read from `left`
  assert.equal(portionChoices({ ...nov, remaining: null, left: 'one_half' }, '2026-11-20').full.enabled, false)
})

test('the balance bar: 12 boxes, approved first, then waiting, halves on their half', () => {
  const cells = balanceCells(bal({ used: 1, pending: 0.5, remaining: 10.5 }))
  assert.equal(cells.length, 12)
  assert.deepEqual(cells[0], ['used', 'used'])
  assert.deepEqual(cells[1], ['pending', 'free'])
  assert.deepEqual(cells[2], ['free', 'free'])
  assert.ok(balanceCells(bal({ used: 12, remaining: 0 })).every((c) => c[0] === 'used' && c[1] === 'used'))
})

test('the apply sheet words: the rule, and what is left after this request', () => {
  const nov = month({ month: '2026-11', rule: 'yearly_balance', remaining: 11 })
  assert.match(applyRuleText(month()), /^Each month you get one Casual Leave/)
  assert.match(applyRuleText(undefined), /^Each month/)
  assert.match(applyRuleText(nov), /12 days of Casual Leave a year/)
  assert.match(applyRuleText(nov), /11 left in 2026\.$/)
  assert.equal(afterApplyText(nov, 'full'), 'Uses 1 day · 10 of 12 left after this')
  assert.equal(afterApplyText(nov, 'second_half'), 'Uses ½ day · 10½ of 12 left after this')
  assert.equal(afterApplyText({ ...nov, remaining: 0.5 }, 'full'), null)
  assert.equal(afterApplyText(month(), 'full'), null) // the old rule: no balance words
  assert.equal(afterApplyText(nov, null), null)
})

const usageRaw = [
  {
    month: '2026-10', label: 'October 2026', used: 0, pending: 0, beforeCutOver: 1, rule: 'one_per_month',
    parts: [{ id: 3, requestKind: 'casual_leave', date: '2026-10-14', portion: 'full', days: 1, status: 'approved', source: 'employee', counted: false }],
  },
  {
    month: '2026-11', label: 'November 2026', used: 1.5, pending: 1, beforeCutOver: 0, rule: 'yearly_balance',
    parts: [
      { id: 7, requestKind: 'casual_leave', date: '2026-11-05', portion: 'full', days: 1, status: 'approved', source: 'employee', counted: true },
      { id: 9, requestKind: 'casual_leave', date: '2026-11-06', portion: 'first_half', days: 0.5, status: 'approved', source: 'hr_edit', counted: true },
      { id: 7, requestKind: 'attendance_correction', date: '2026-11-20', portion: 'full', days: 1, status: 'pending', source: 'hr_edit', counted: true },
      { bogus: true },
    ],
  },
  'not a month',
]

test('monthsUsage: read, as rows, HR proposals merged into the list, months with any number of days', () => {
  assert.equal(readMonthsUsage(undefined), undefined)
  const usage = readMonthsUsage(usageRaw)!
  assert.equal(usage.length, 2)
  assert.equal(usage[1].parts.length, 3)
  assert.deepEqual(usage[1].parts[2], {
    id: 7, kind: 'attendance_correction', date: '2026-11-20', portion: 'full', days: 1, status: 'pending', source: 'hr_edit', counted: true,
  })
  const rows = usageRows(usage)
  assert.equal(rows.length, 4)
  // the CL list holds the requests (rejected too); only monthsUsage holds what HR proposed and still waits
  const list: CLRow[] = [
    { id: 7, date: '2026-11-05', portion: 'full', status: 'approved', source: 'employee' },
    { id: 8, date: '2026-11-10', portion: 'full', status: 'rejected', source: 'employee' },
  ]
  const merged = withHrProposals(list, usage)
  assert.equal(merged.length, 3)
  assert.equal(merged[2].kind, 'attendance_correction')
  assert.equal(rowKey(merged[2]), 'attendance_correction-7')
  assert.equal(rowKey(list[0]), 'casual_leave-7')
  assert.equal(withHrProposals(list, undefined).length, 2)

  const months = yearMonths(rows, 2026, '2026-11-02')
  // no cap of one a month any more: 1 + ½ approved, 1 waiting in November
  assert.deepEqual([months[10].approvedDays, months[10].waitingDays], [1.5, 1])
  assert.equal(months[10].byHr, true)
  assert.equal(months[9].byHr, false)
  // October is before the cut-over: not counted
  assert.equal(months[9].notCountedDays, 1)
  assert.equal(months[10].notCountedDays, 0)
  assert.equal(yearMonths(rows, 2026)[9].notCountedDays, 0) // no cut-over known: nothing marked
  assert.deepEqual(yearTotals(merged, 2026), { takenDays: 1, waitingDays: 1, rejected: 1, applications: 3, monthsUsed: 1 })
})

test('balance history: read, newest first, the change in words', () => {
  const history = readHistory({
    employeeId: 5,
    year: 2026,
    total: 12,
    balance: balanceRaw({ used: 1, pending: 0.5, remaining: 10.5 }),
    entries: [
      { kind: 'opening', on: '2026-11-02', date: null, portion: null, days: null, change: 12, balanceBefore: null, balanceAfter: 12, source: null, text: '12 Casual Leave days for 2026, from 02 Nov 2026' },
      { kind: 'approved', on: '2026-11-05', date: '2026-11-05', portion: 'full', days: 1, change: -1, balanceBefore: 12, balanceAfter: 11, source: 'employee', text: '12 → 11 on 05 Nov: Casual Leave approved (Full day, 05 Nov 2026)' },
      { kind: 'pending', on: '2026-11-06', date: '2026-11-20', portion: 'first_half', days: 0.5, change: -0.5, balanceBefore: 11, balanceAfter: 10.5, source: 'hr_edit', text: '11 → 10.5 on 06 Nov: Casual Leave proposed by HR (attendance edit), waiting for approval (Half day (first half), 20 Nov 2026)' },
      { kind: 'weird', text: 'skipped' },
      { kind: 'approved' },
    ],
  })!
  assert.equal(history.entries.length, 3)
  assert.equal(history.balance?.remaining, 10.5)
  assert.equal(history.entries[2].source, 'hr_edit')
  assert.equal(history.entries[2].portion, 'first_half')
  assert.equal(history.entries[0].portion, null)
  assert.deepEqual(historyNewestFirst(history.entries).map((e) => e.kind), ['pending', 'approved', 'opening'])
  assert.equal(history.entries.map((e) => e.kind).join(), 'opening,approved,pending') // not reordered in place
  assert.equal(readHistory({ year: 2026 }), null)
  assert.equal(readHistory(null), null)
  assert.equal(changeText(12), '+12')
  assert.equal(changeText(-1), '−1')
  assert.equal(changeText(-0.5), '−½')
  assert.equal(changeText(0), '0')
})

test('the year switcher reaches back to the first request', () => {
  assert.deepEqual(yearRange(rows, 2026), { min: 2025, max: 2026 })
  assert.deepEqual(yearRange([{ date: '2023-05-01' }], 2026), { min: 2023, max: 2026 })
  assert.deepEqual(yearRange([], 2026), { min: 2025, max: 2026 })
})
