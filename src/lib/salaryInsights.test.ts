// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  comparisonBars,
  formatCount,
  formatInr,
  formatInrShort,
  latestPeriod,
  lossSentence,
  normalizeInsights,
  normalizePeriod,
  periodTitle,
  slipCycleLabel,
  slipPdfFileName,
  slipPeriodLabel,
  sortSlipsNewestFirst,
  waterfallRows,
} from './salaryInsights.ts'

// A period exactly as GET /my/salary-insights sends it (the backend test world: Feb 2026, 24,000 a month, 21.25 days paid).
const STAFF = {
  slipId: 11, slipNumber: 'SS/S100/2026/02', kind: 'staff', month: 2, year: 2026, weekNumber: null,
  period: { label: 'February 2026', shortLabel: 'Feb', start: null, end: null, cycle: null, cycleLabel: null },
  hasDetails: true, allocated: 24000, earnedGross: 21250, absentLoss: 2750, lateDeduction: 500, permissionDeduction: 0,
  attendanceLoss: 3250, otPay: 0, incentives: 0, bonuses: 0, pf: 0, esi: 0, tds: 0, tdsPercent: null, statutory: 0,
  advance: 0, otherDeductions: 0, totalDeductions: 500, netPayable: 20750,
  counts: { workingDays: 24, paidDays: 21.25, absentDays: 1, dailyRate: 1000, lateMarks: 3 },
  notes: {},
  steps: [
    { key: 'allocated', label: 'Monthly salary', amount: 24000, op: 'start', note: 'Your full salary.' },
    { key: 'absent_loss', label: 'Not paid: days not worked', amount: 2750, op: 'minus', note: 'x' },
    { key: 'earned', label: 'Salary earned', amount: 21250, op: 'subtotal', note: 'y' },
    { key: 'late', label: 'Late deduction', amount: 500, op: 'minus', note: 'z' },
    { key: 'permission', label: 'Permission deduction', amount: 0, op: 'minus', note: 'p' },
    { key: 'net', label: 'Final payable salary', amount: 20750, op: 'total', note: 'n' },
  ],
  reconciles: true,
  payroll: { status: 'pending', statusLabel: 'Not paid yet', bonus: 0, deductionChange: 0, net: 20750, matchesSlip: true },
  emailedAt: null,
}

const PROD = {
  ...STAFF, slipId: 12, kind: 'production',
  period: { label: '2 Feb - 8 Feb 2026', shortLabel: '2-8 Feb', start: '2026-02-02', end: '2026-02-08', cycle: 'weekly', cycleLabel: 'Weekly' },
  allocated: null, absentLoss: null, permissionDeduction: null, earnedGross: 3000, lateDeduction: 250, attendanceLoss: 250,
  netPayable: 2750, notes: { allocated: 'Production pay is per shift, so there is no fixed salary to compare with.' },
}

test('rupees are grouped the Indian way, paise only when there are some', () => {
  assert.equal(formatInr(123456), '₹1,23,456')
  assert.equal(formatInr(1234567.5), '₹12,34,567.50')
  assert.equal(formatInr(999), '₹999')
  assert.equal(formatInr(0), '₹0')
  assert.equal(formatInr(-500), '-₹500')
  assert.equal(formatInr(384.62), '₹384.62')
  assert.equal(formatInr(null), '—')
  assert.equal(formatInr(Number.NaN), '—')
  assert.equal(formatInrShort(125000), '₹1.3L')
  assert.equal(formatInrShort(24000), '₹24K')
  assert.equal(formatInrShort(2750), '₹2.8K')
  assert.equal(formatCount(21.25), '21.25')
  assert.equal(formatCount(24), '24')
})

test('a reply is read defensively; a malformed one is null', () => {
  const data = normalizeInsights({ employmentType: 'staff', year: 2026, years: [2025], periods: [STAFF, { junk: 1 }], summary: { periods: 1, allocated: 24000 }, notes: ['', 'n'] })
  assert.ok(data)
  assert.deepEqual(data!.years, [2026, 2025])
  assert.equal(data!.periods.length, 1)
  assert.equal(data!.summary.allocated, 24000)
  assert.equal(data!.summary.absentLoss, null)
  assert.deepEqual(data!.notes, ['n'])
  assert.equal(normalizeInsights('<html>'), null)
  assert.equal(normalizeInsights({ year: 2026 }), null)
  assert.equal(normalizeInsights({ periods: [] }), null)
  const p = normalizePeriod({ ...STAFF, allocated: 'oops', steps: [{ op: 'sideways' }, STAFF.steps[0]] })!
  assert.equal(p.allocated, null)
  assert.equal(p.steps.length, 1)
  assert.equal(normalizePeriod({ kind: 'staff' }), null)
  assert.equal(normalizePeriod(STAFF)!.payroll!.hrChanged, false)
  assert.equal(normalizePeriod({ ...STAFF, payroll: { ...STAFF.payroll, bonus: 500 } })!.payroll!.hrChanged, true)
  assert.equal(normalizePeriod({ ...STAFF, payroll: { ...STAFF.payroll, net: 1, hrChanged: false } })!.payroll!.hrChanged, false)
})

test('the loss line names each part, production says there is no fixed salary', () => {
  assert.equal(
    lossSentence(normalizePeriod(STAFF)!),
    'You lost ₹3,250 in February 2026: ₹2,750 for 2.75 days not paid, ₹500 late deduction.',
  )
  assert.equal(
    lossSentence(normalizePeriod({ ...STAFF, absentLoss: 0, lateDeduction: 0, attendanceLoss: 0 })!),
    'You lost nothing to attendance in February 2026.',
  )
  assert.equal(
    lossSentence(normalizePeriod(PROD)!),
    'Production pay is per shift, so there is no fixed salary to compare with. Attendance cost you ₹250 late deduction in 2 Feb - 8 Feb 2026.',
  )
  assert.equal(periodTitle(normalizePeriod(PROD)!), '2 Feb - 8 Feb 2026 · Weekly')
})

test('comparison bars share one scale; production uses its earned pay as the track', () => {
  const bars = comparisonBars([normalizePeriod(STAFF)!, normalizePeriod(PROD)!])
  assert.equal(bars[0].allocatedRatio, 1)
  assert.equal(bars[0].earnedRatio, 21250 / 24000)
  assert.equal(bars[0].lost, 3250)
  assert.equal(bars[1].allocated, null)
  assert.equal(bars[1].allocatedRatio, 3000 / 24000)
  assert.equal(latestPeriod([normalizePeriod(STAFF)!, normalizePeriod(PROD)!])!.slipId, 12)
  assert.equal(latestPeriod([]), null)
})

test('the waterfall runs from the allocated salary down to the net pay', () => {
  const rows = waterfallRows(normalizePeriod(STAFF)!.steps)
  assert.deepEqual(rows.map((r) => r.amountText), ['₹24,000', '- ₹2,750', '= ₹21,250', '- ₹500', '₹0', '= ₹20,750'])
  assert.equal(rows[0].from, 0)
  assert.equal(rows[0].to, 1)
  assert.equal(rows[1].from, 21250 / 24000)
  assert.equal(rows[1].to, 1)
  assert.equal(rows[1].tone, 'loss')
  assert.equal(rows[5].tone, 'result')
  const unknown = waterfallRows([{ key: 'late', label: 'Late', amount: null, op: 'minus', note: 'n' }])
  assert.equal(unknown[0].amountText, 'Not recorded')
})

test('slip labels, order and PDF names keep weekly slips apart', () => {
  const weekly = [
    { id: 1, month: 10, year: 2026, periodStart: '2026-10-05', periodEnd: '2026-10-11', payCycle: 'weekly', slipNumber: 'SS/P1/2026-10-05_2026-10-11' },
    { id: 2, month: 10, year: 2026, periodStart: '2026-10-12', periodEnd: '2026-10-18', payCycle: 'weekly', slipNumber: 'SS/P1/2026-10-12_2026-10-18' },
    { id: 3, month: 9, year: 2026 },
    { id: 4, month: 12, year: 2025, periodStart: '2025-12-29', periodEnd: '2026-01-04', payCycle: 'weekly' },
  ]
  assert.equal(slipPeriodLabel(weekly[0]), '5 Oct - 11 Oct 2026')
  assert.equal(slipPeriodLabel(weekly[2]), 'September 2026')
  assert.equal(slipPeriodLabel(weekly[3]), '29 Dec 2025 - 4 Jan 2026')
  assert.equal(slipPeriodLabel({ id: 5, month: 3, year: 2025, weekNumber: 2 }), 'Week 2 of March 2025')
  assert.equal(slipCycleLabel(weekly[0]), 'Weekly pay')
  assert.equal(slipCycleLabel(weekly[2]), null)
  assert.deepEqual(sortSlipsNewestFirst(weekly).map((s) => s.id), [2, 1, 3, 4])
  assert.notEqual(slipPdfFileName(weekly[0]), slipPdfFileName(weekly[1]))
  assert.equal(slipPdfFileName(weekly[0]), 'salary-slip-SS-P1-2026-10-05_2026-10-11.pdf')
  assert.equal(slipPdfFileName({ id: 9, month: 2, year: 2026 }), 'salary-slip-2026-2-9.pdf')
})
