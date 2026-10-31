// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  amountOf,
  applyErrorMessage,
  dayMonth,
  filterRecords,
  formatAmountInput,
  groupIndian,
  limitMeter,
  monthLabel,
  planSummary,
  purposeProblem,
  recordTotals,
  repaidRatio,
  rupees,
  salaryAdvanceProblem,
  statusCounts,
  statusGroup,
  statusText,
  termAmountProblem,
  termEmi,
  termPlan,
  windowHeadline,
  windowProgress,
  type WindowInfo,
} from './settlement.ts'

test('rupees are grouped the Indian way', () => {
  assert.equal(rupees(123456), '₹1,23,456')
  assert.equal(rupees(1000), '₹1,000')
  assert.equal(rupees(999), '₹999')
  assert.equal(rupees(12345678), '₹1,23,45,678')
  assert.equal(rupees(1500.5), '₹1,500.50')
  assert.equal(rupees(null), '₹0')
  assert.equal(groupIndian(-25000), '-25,000')
})

test('the amount box keeps digits only and groups them while typing', () => {
  assert.equal(formatAmountInput('125000'), '1,25,000')
  assert.equal(formatAmountInput('1,25,0001'), '12,50,001')
  assert.equal(formatAmountInput('00450'), '450')
  assert.equal(formatAmountInput('12.5ab'), '125')
  assert.equal(formatAmountInput(''), '')
  assert.equal(amountOf('1,25,000'), 125000)
  assert.ok(Number.isNaN(amountOf('')))
})

test('month labels', () => {
  assert.equal(monthLabel(11, 2026), 'November 2026')
  assert.equal(monthLabel(1, 2027, true), 'Jan 2027')
  assert.equal(monthLabel(0, 2027), '')
  assert.equal(dayMonth('2026-11-20'), '20 Nov')
  assert.equal(dayMonth(null), '')
})

const closed: WindowInfo = {
  isOpen: false, opensOn: '2026-11-20', closesOn: '2026-11-30', nextOpensOn: '2026-11-20',
  daysUntilOpen: 5, daysLeft: 0, message: '',
}
const open: WindowInfo = { ...closed, isOpen: true, daysUntilOpen: 0, daysLeft: 6, nextOpensOn: '2026-12-20' }

test('the window banner says when it opens or how long it stays open', () => {
  assert.equal(windowHeadline(closed), 'Opens on 20 Nov: in 5 days')
  assert.equal(windowHeadline({ ...closed, daysUntilOpen: 1 }), 'Opens on 20 Nov: tomorrow')
  assert.equal(windowHeadline(open), 'Open now: 6 days left')
  assert.equal(windowHeadline({ ...open, daysLeft: 1 }), 'Open now: last day today')
  assert.equal(windowHeadline(null), '')
  assert.ok(windowProgress(open) > 0 && windowProgress(open) <= 1)
  assert.equal(windowProgress({ ...open, daysLeft: 1 }), 1)
})

test('the 60% meter', () => {
  assert.deepEqual(limitMeter(9000, 18000), { ratio: 0.5, state: 'ok', left: 9000 })
  assert.equal(limitMeter(16000, 18000).state, 'near')
  assert.deepEqual(limitMeter(20000, 18000), { ratio: 1, state: 'over', left: 0 })
  assert.equal(limitMeter(NaN, 18000).state, 'empty')
  assert.equal(limitMeter(100, null).state, 'empty')
})

test('Salary Advance validation matches the server wording', () => {
  assert.equal(salaryAdvanceProblem('', 18000, 30000), 'Enter the amount.')
  assert.equal(salaryAdvanceProblem('0', 18000, 30000), 'The amount must be more than ₹0.')
  assert.equal(
    salaryAdvanceProblem('18,001', 18000, 30000),
    'The most you can ask for is ₹18,000 (60% of your monthly salary of ₹30,000).',
  )
  assert.equal(salaryAdvanceProblem('18,000', 18000, 30000), null)
  assert.equal(purposeProblem(' a '), 'Tell HR briefly what the money is for.')
  assert.equal(purposeProblem('School fees'), null)
  assert.match(purposeProblem('x'.repeat(301)) ?? '', /under 300/)
})

test('Term Loan EMI rounds up to whole rupees and the last EMI absorbs the rest', () => {
  assert.equal(termEmi(10000, 3), 3334)
  assert.equal(termEmi(12000, 12), 1000)
  const plan = termPlan(10000, 3, 12, 2026)
  assert.deepEqual(plan.map((p) => [p.label, p.amount]), [['Dec 2026', 3334], ['Jan 2027', 3334], ['Feb 2027', 3332]])
  assert.equal(planSummary(plan), '3 EMIs of ₹3,334 (last ₹3,332), Dec 2026 to Feb 2027')
  const small = termPlan(1000, 12, 11, 2026)
  assert.equal(small.length, 12)
  assert.equal(small.reduce((s, p) => s + p.amount, 0), 1000)
  assert.equal(planSummary(termPlan(5000, 1, 11, 2026)), '1 deduction of ₹5,000 in November 2026')
  assert.deepEqual(termPlan(0, 3, 11, 2026), [])
  assert.equal(termAmountProblem('999', 1000), 'A Term Loan starts from ₹1,000.')
  assert.equal(termAmountProblem('5,000', 1000), null)
  assert.equal(termAmountProblem('', 1000), 'Enter the amount.')
})

const rows = [
  { advanceType: 'general', status: 'pending', balanceDue: 0, deductedTotal: 0 },
  { advanceType: 'term', status: 'approved', balanceDue: 6000, deductedTotal: 3000 },
  { advanceType: 'general', status: 'closed', balanceDue: 0, deductedTotal: 5000 },
  { advanceType: 'term', status: 'rejected', balanceDue: 0, deductedTotal: 0 },
]

test('records filter by type and status, and only approved ones are owed', () => {
  assert.equal(filterRecords(rows, 'term', 'all').length, 2)
  assert.equal(filterRecords(rows, 'all', 'waiting').length, 1)
  assert.equal(filterRecords(rows, 'general', 'done').length, 1)
  assert.deepEqual(statusCounts(rows, 'all'), { all: 4, waiting: 1, active: 1, done: 1, rejected: 1 })
  assert.deepEqual(statusCounts(rows, 'term'), { all: 2, waiting: 0, active: 1, done: 0, rejected: 1 })
  assert.deepEqual(recordTotals(rows), { owed: 6000, repaid: 8000, waiting: 1, active: 1 })
  assert.equal(statusGroup('weird'), 'waiting')
  assert.equal(statusText({ status: 'approved', advanceType: 'general', deductedTotal: 0 }), 'Approved')
  assert.equal(statusText({ status: 'approved', advanceType: 'term', deductedTotal: 10 }), 'Repaying')
  assert.equal(repaidRatio(9000, 3000), 1 / 3)
  assert.equal(repaidRatio(0, 10), 0)
})

test('server refusals are shown in its own words', () => {
  assert.equal(applyErrorMessage({ response: { data: { error: 'Applications open on 20 November.' } } }), 'Applications open on 20 November.')
  assert.equal(applyErrorMessage(new Error('Network Error')), 'Could not send your application. Please try again.')
})
