// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  HIDDEN_AMOUNT,
  advanceAttention,
  calendarBucket,
  calendarDaysUntil,
  casualLeaveAttention,
  clockText,
  daysLeftInMonth,
  greetingFor,
  inDaysText,
  lastSalary,
  monthKeyOf,
  onDutyAttention,
  outpassAttention,
  parseLocalDate,
  pendingRequestsAttention,
  sortAttention,
} from './homeAttention.ts'
import { normalizePendingRequests } from './pendingReminders.ts'
import { normalizeInsights } from './salaryInsights.ts'

// Local times throughout, so the tests pass in any time zone.
const at = (y: number, mo: number, d: number, h = 10, mi = 0) => new Date(y, mo - 1, d, h, mi)

test('dates: yyyy-MM-dd is a LOCAL day, never shifted by the UTC parse', () => {
  const d = parseLocalDate('2026-11-01')
  assert.ok(d)
  assert.equal(d!.getFullYear(), 2026)
  assert.equal(d!.getMonth(), 10)
  assert.equal(d!.getDate(), 1)
  assert.equal(d!.getHours(), 0)
  assert.equal(parseLocalDate('nope'), null)
  assert.equal(parseLocalDate(null), null)
})

test('dates: whole calendar days until a holiday, whatever the hour', () => {
  // 8 PM on 31 Oct: tomorrow's holiday is 1 day away, not "Today" (the old UTC + round bug).
  assert.equal(calendarDaysUntil('2026-11-01', at(2026, 10, 31, 20)), 1)
  assert.equal(calendarDaysUntil('2026-11-01', at(2026, 10, 31, 0, 5)), 1)
  assert.equal(calendarDaysUntil('2026-10-31', at(2026, 10, 31, 23, 59)), 0)
  assert.equal(calendarDaysUntil('2026-12-25', at(2026, 10, 31)), 55)
  assert.equal(calendarDaysUntil('2026-10-01', at(2026, 10, 31)), 0, 'a past day reads as today, never negative')
  assert.equal(calendarDaysUntil('', at(2026, 10, 31)), null)
  assert.equal(inDaysText(0), 'Today')
  assert.equal(inDaysText(1), 'Tomorrow')
  assert.equal(inDaysText(9), 'In 9 days')
})

test('dates: greeting, the re-render bucket and days left in the month', () => {
  assert.equal(greetingFor(6), 'Good Morning')
  assert.equal(greetingFor(12), 'Good Afternoon')
  assert.equal(greetingFor(17), 'Good Evening')
  // Same bucket for every second of a greeting period of one day; a new one at noon and at midnight.
  assert.equal(calendarBucket(at(2026, 10, 31, 9, 0)), calendarBucket(at(2026, 10, 31, 11, 59)))
  assert.notEqual(calendarBucket(at(2026, 10, 31, 11, 59)), calendarBucket(at(2026, 10, 31, 12, 0)))
  assert.notEqual(calendarBucket(at(2026, 10, 31, 23, 59)), calendarBucket(at(2026, 11, 1, 0, 0)))
  assert.equal(daysLeftInMonth(at(2026, 10, 31)), 0)
  assert.equal(daysLeftInMonth(at(2026, 10, 24)), 7)
  assert.equal(daysLeftInMonth(at(2028, 2, 1)), 28, 'leap February')
  assert.equal(monthKeyOf(at(2026, 3, 5)), '2026-03')
  assert.equal(clockText(at(2026, 10, 31, 15, 5).toISOString()), '3:05 PM')
  assert.equal(clockText(at(2026, 10, 31, 0, 30).getTime()), '12:30 AM')
  assert.equal(clockText('garbage'), '')
  assert.equal(clockText(null), '')
})

const pendingRow = (id: number, moduleLabel: string, submittedAt: string | null) => ({
  id, module: 'leave', moduleLabel, submittedAt, stage: 'Waiting for HR',
})

test('pending requests: none, one, several', () => {
  const now = Date.parse('2026-10-31T10:00:00Z')
  assert.equal(pendingRequestsAttention(null, now), null)
  assert.equal(pendingRequestsAttention(normalizePendingRequests({ items: [] }), now), null)

  const one = pendingRequestsAttention(normalizePendingRequests({ items: [pendingRow(1, 'Leave', null)] }), now)
  assert.equal(one?.title, '1 request waiting for an answer')
  assert.equal(one?.detail, 'Leave: Waiting for HR')
  assert.equal(one?.href, '/hod-assignment?tab=requests')

  const many = pendingRequestsAttention(
    normalizePendingRequests({
      items: [
        pendingRow(2, 'Permission', '2026-10-31T08:00:00Z'),
        pendingRow(3, 'Missing Punch', '2026-10-28T09:00:00Z'),
        pendingRow(4, 'Outpass', null),
      ],
    }),
    now,
  )
  assert.equal(many?.title, '3 requests waiting for an answer')
  assert.equal(many?.detail, 'Oldest: Missing Punch, waiting 3 days')
})

const NOW = Date.parse('2026-10-31T06:00:00Z')
const iso = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString()

test('gate pass: ready, out with a return time, late, out without a return time, closed', () => {
  const ready = { id: 1, status: 'approved', createdAt: iso(-30), approvedAt: iso(-20), expiresAt: iso(40) }
  const r = outpassAttention(ready, NOW)
  assert.equal(r?.title, 'Gate pass ready')
  assert.equal(r?.detail, 'Show the QR at the gate: 40:00 left to go out')
  assert.equal(r?.tone, 'active')
  assert.ok(r?.progress != null && Math.abs(r.progress - 20 / 60) < 1e-9)

  const out = { id: 2, status: 'approved', createdAt: iso(-90), exitedAt: iso(-30), expectedReturnAt: iso(30) }
  const o = outpassAttention(out, NOW)
  assert.equal(o?.title, 'Out on a gate pass')
  assert.match(o!.detail, /^Back by \d{1,2}:\d{2} [AP]M: 30:00 left$/)
  assert.equal(o?.progress, 0.5)

  const late = outpassAttention(out, NOW + 35 * 60_000)
  assert.equal(late?.title, 'Return time passed')
  assert.equal(late?.tone, 'urgent')
  assert.match(late!.detail, /late by 5:00$/)

  const open = outpassAttention({ ...out, expectedReturnAt: null }, NOW)
  assert.equal(open?.detail, 'Out for 30 min')
  assert.equal(open?.progress, null)

  assert.equal(outpassAttention({ ...out, enteredAt: iso(-1) }, NOW), null, 'back through the gate')
  assert.equal(outpassAttention(ready, NOW + 41 * 60_000), null, 'exit window ran out')
  assert.equal(outpassAttention(null, NOW), null)
})

test('On-Duty: only a running session, worded plainly', () => {
  assert.equal(onDutyAttention(null), null)
  assert.equal(onDutyAttention({ status: 'completed', destination: 'Tiruppur' }), null)
  assert.equal(onDutyAttention({ status: 'rejected' }), null)
  const a = onDutyAttention({ status: 'active', destination: 'Tiruppur mill', isProvisional: false })
  assert.equal(a?.title, 'On-Duty in progress')
  assert.equal(a?.detail, 'Tiruppur mill')
  const p = onDutyAttention({ status: 'active', destination: '', isProvisional: true })
  assert.equal(p?.detail, 'Waiting for approval')
  const started = onDutyAttention({ status: 'pending_hod', destination: 'Bank', startedAt: at(2026, 10, 31, 9, 40).toISOString() })
  assert.equal(started?.detail, 'Bank · started 9:40 AM · waiting for approval')
  assert.equal(onDutyAttention({ status: 'active' })?.detail, 'Tap to add your punches')
})

const eligibility = (over: Record<string, unknown> = {}) => ({
  window: { isOpen: true, closesOn: '2026-10-31', daysLeft: 5 },
  workflowEnabled: true,
  employeeActive: true,
  salaryAdvance: { canApply: true },
  termLoan: { canApply: true },
  ...over,
})

test('advances: only while open and only when this employee can apply', () => {
  assert.equal(advanceAttention(null), null)
  assert.equal(advanceAttention(eligibility({ window: { isOpen: false, closesOn: '2026-10-31', daysLeft: 0 } })), null)
  assert.equal(advanceAttention(eligibility({ workflowEnabled: false })), null)
  assert.equal(advanceAttention(eligibility({ employeeActive: false })), null)
  assert.equal(advanceAttention(eligibility({ salaryAdvance: { canApply: false }, termLoan: { canApply: false } })), null)

  const both = advanceAttention(eligibility())
  assert.equal(both?.title, 'Advance & loan applications are open')
  assert.equal(both?.detail, 'Open until 31 Oct')
  assert.equal(both?.href, '/settlement')
  assert.equal(advanceAttention(eligibility({ salaryAdvance: { canApply: false } }))?.title, 'Term Loan applications are open')
  assert.equal(advanceAttention(eligibility({ termLoan: { canApply: false } }))?.title, 'Salary Advance applications are open')
  const last = advanceAttention(eligibility({ window: { isOpen: true, closesOn: '2026-10-31', daysLeft: 1 } }))
  assert.equal(last?.detail, 'Open today only: last day')
})

test('Casual Leave: unused, in the last week of the month only', () => {
  const months = [
    { month: '2026-09', label: 'September 2026', eligible: true, left: 'full' as const },
    { month: '2026-10', label: 'October 2026', eligible: true, left: 'full' as const },
  ]
  assert.equal(casualLeaveAttention(months, at(2026, 10, 20)), null, 'too early in the month')
  const full = casualLeaveAttention(months, at(2026, 10, 27))
  assert.equal(full?.title, "October's Casual Leave not used yet")
  assert.equal(full?.detail, '1 day left · the month ends in 4 days')
  assert.equal(full?.href, '/casual-leave')
  const half = casualLeaveAttention([{ ...months[1], left: 'one_half' }], at(2026, 10, 30))
  assert.equal(half?.detail, 'Half a day left · the month ends tomorrow')
  assert.equal(casualLeaveAttention([{ ...months[1], left: 'nothing' }], at(2026, 10, 31)), null)
  assert.equal(casualLeaveAttention([{ ...months[1], eligible: false }], at(2026, 10, 31)), null)
  assert.equal(casualLeaveAttention([months[0]], at(2026, 10, 31)), null, 'last month is not this month')
  assert.equal(casualLeaveAttention(undefined, at(2026, 10, 31)), null)
  assert.equal(casualLeaveAttention(months, at(2026, 10, 31))?.detail, '1 day left · the month ends today')
})

test('rows are ordered by urgency and empty sources drop out', () => {
  const rows = sortAttention([
    casualLeaveAttention([{ month: '2026-10', label: 'October 2026', eligible: true, left: 'full' }], at(2026, 10, 31)),
    advanceAttention(eligibility()),
    null,
    onDutyAttention({ status: 'active', destination: 'Bank' }),
    outpassAttention({ id: 1, status: 'approved', createdAt: iso(-30), approvedAt: iso(-20), expiresAt: iso(40) }, NOW),
    undefined,
  ])
  assert.deepEqual(rows.map((r) => r.key), ['outpass', 'onDuty', 'advance', 'casualLeave'])
  for (const r of rows) assert.ok(r.a11y.length > 0)
})

const STAFF_PERIOD = {
  slipId: 11, slipNumber: 'SS/1', kind: 'staff', month: 9, year: 2026,
  period: { label: 'September 2026', shortLabel: 'Sep', start: null, end: null, cycle: null, cycleLabel: null },
  hasDetails: true, allocated: 24000, earnedGross: 21000, absentLoss: 2500, lateDeduction: 500, permissionDeduction: 0,
  attendanceLoss: 3000, otPay: 0, pf: 0, esi: 0, tds: 0, statutory: 0, advance: 0, otherDeductions: 0,
  totalDeductions: 500, netPayable: 20500, counts: {}, notes: {}, steps: [], reconciles: true, payroll: null,
}

const insights = (periods: unknown[]) =>
  normalizeInsights({ employmentType: 'staff', year: 2026, years: [2026], periods, summary: {}, notes: [] })

test('last salary: newest period, loss line, masking', () => {
  assert.equal(lastSalary(null, false), null)
  assert.equal(lastSalary(insights([]), false), null)

  const older = { ...STAFF_PERIOD, slipId: 10, month: 8, period: { ...STAFF_PERIOD.period, label: 'August 2026' } }
  const s = lastSalary(insights([older, STAFF_PERIOD]), false)
  assert.equal(s?.slipId, 11)
  assert.equal(s?.periodLabel, 'September 2026')
  assert.equal(s?.netText, '₹20,500')
  assert.equal(s?.lossText, '₹3,000 lost to attendance')
  assert.equal(s?.lossTone, 'loss')
  assert.equal(s?.paidRatio, 21000 / 24000)
  assert.equal(s?.hrChanged, false)

  const hidden = lastSalary(insights([STAFF_PERIOD]), true)
  assert.equal(hidden?.netText, HIDDEN_AMOUNT)
  assert.equal(hidden?.lossText, `${HIDDEN_AMOUNT} lost to attendance`)
  assert.ok(!hidden!.netText.includes('20'), 'no digits leak while hidden')

  const clean = lastSalary(insights([{ ...STAFF_PERIOD, attendanceLoss: 0, earnedGross: 24000 }]), false)
  assert.equal(clean?.lossText, 'Nothing lost to attendance')
  assert.equal(clean?.lossTone, 'none')
  assert.equal(clean?.paidRatio, 1)

  const production = lastSalary(
    insights([{ ...STAFF_PERIOD, kind: 'production', allocated: null, attendanceLoss: null, lateDeduction: 0 }]),
    false,
  )
  assert.equal(production?.lossText, '')
  assert.equal(production?.paidRatio, null)
  const productionLate = lastSalary(
    insights([{ ...STAFF_PERIOD, kind: 'production', allocated: null, attendanceLoss: null, lateDeduction: 120 }]),
    false,
  )
  assert.equal(productionLate?.lossText, '₹120 late deduction')
})
