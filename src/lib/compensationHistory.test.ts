// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  filterBySource,
  groupByMonth,
  historyFacts,
  historyKindTone,
  monthLabel,
  normalizeHistory,
  otPayLine,
} from './compensationHistory.ts'

const item = (over: Record<string, unknown>) => ({
  key: 'k', kind: 'ot_shift_pay', group: 'assigned', date: '2026-03-10', month: '2026-03', title: 'Overtime pay assigned by HR: 0.50 shift',
  detail: 'd', status: 'assigned', statusLabel: 'Assigned by HR', shifts: 0.5, minutes: 300, minutesUsed: null, used: null,
  workDate: '2026-03-10', source: 'hr', sourceLabel: 'Given by HR', givenByHr: true, ...over,
})

const REPLY = {
  isStaff: true, year: 2026, years: [2026, 2025],
  balance: { shifts: 2.25, creditedThisYear: 1.75, takenThisYear: 0.5, alternativeDaysAvailable: 1 },
  totals: { items: 4, givenByHr: 2, company: 1, automatic: 1, shiftsGivenByHr: 1.5, otPay: 384.62 },
  otPayByMonth: [{ month: '2026-03', label: 'March 2026', amount: 384.62, shifts: 0.5, slipId: 7 }, { month: 'bad', amount: 1 }],
  items: [
    item({ key: 'ot-1' }),
    item({ key: 'ot-2', kind: 'ot_allowance', status: 'used', source: 'automatic', sourceLabel: 'Automatic', givenByHr: false, date: '2026-03-02', month: '2026-03', shifts: null, minutes: 30, minutesUsed: 20, workDate: null }),
    item({ key: 'hw-1', kind: 'holiday_work', status: 'approved', date: '2026-05-03', month: '2026-05', shifts: 1 }),
    item({ key: 'cd-1', kind: 'compensation_day', status: 'announced', source: 'company', sourceLabel: 'Announced by HR for everyone', date: '2026-08-15', month: '2026-08', shifts: null, minutes: null, time: '13:00', workDate: null }),
    item({ key: 'ot-1' }),
    'junk',
  ],
  message: null,
}

test('the reply is read defensively', () => {
  const h = normalizeHistory(REPLY)!
  assert.equal(h.items.length, 5)
  assert.equal(h.items[4].key, 'ot-1#1')
  assert.equal(h.otPayByMonth.length, 1)
  assert.equal(h.balance!.shifts, 2.25)
  assert.deepEqual(h.years, [2026, 2025])
  assert.equal(normalizeHistory(null), null)
  assert.equal(normalizeHistory({ items: [] }), null)
  const prod = normalizeHistory({ isStaff: false, year: 2026, items: [], message: 'Compensation is for staff employees only.' })!
  assert.equal(prod.isStaff, false)
  assert.equal(prod.balance, null)
  // a missing source reads as HR's, a missing givenByHr follows the source
  const bare = normalizeHistory({ year: 2026, items: [{ kind: 'birthday', source: 'automatic', date: '2026-04-01' }] })!
  assert.equal(bare.items[0].givenByHr, false)
  assert.equal(bare.items[0].month, '2026-04')
})

test('grouped by month, newest first, with the month\'s overtime pay', () => {
  const h = normalizeHistory(REPLY)!
  const groups = groupByMonth(h.items, h.otPayByMonth)
  assert.deepEqual(groups.map((g) => g.month), ['2026-08', '2026-05', '2026-03'])
  const march = groups[2]
  assert.equal(march.label, 'March 2026')
  assert.equal(march.otPay!.amount, 384.62)
  assert.equal(march.hrShifts, 1) // the two 0.50 pay items (one repeated key kept)
  assert.equal(groups[1].hrShifts, 1)
  // filters
  assert.deepEqual(filterBySource(h.items, 'company').map((i) => i.key), ['cd-1'])
  const auto = groupByMonth(h.items, h.otPayByMonth, 'automatic')
  assert.deepEqual(auto.map((g) => g.month), ['2026-03'])
  assert.equal(auto[0].otPay, null)
  const hr = groupByMonth(h.items, h.otPayByMonth, 'hr')
  assert.deepEqual(hr.map((g) => g.month), ['2026-05', '2026-03'])
})

test('facts, looks and wording', () => {
  const h = normalizeHistory(REPLY)!
  assert.deepEqual(historyFacts(h.items[1]).map((f) => f.text), ['30 min allowance', 'Used 20 min'])
  assert.deepEqual(historyFacts(h.items[0]).map((f) => f.text), ['0.50 shift', '5 h past shift end'])
  assert.deepEqual(historyFacts(h.items[3]).map((f) => f.text), ['At 13:00'])
  assert.equal(historyKindTone('compensation_day').label, 'Compensation day')
  assert.equal(historyKindTone('balance_credit').label, 'Added to balance')
  assert.equal(historyKindTone('ot_shift_pay').label, 'Overtime pay')
  assert.equal(historyKindTone('something_new').label, 'Something new')
  assert.equal(monthLabel('2026-12'), 'December 2026')
  assert.equal(monthLabel('2026-13'), '')
  assert.equal(otPayLine(h.otPayByMonth[0]), 'Overtime pay in your March 2026 salary: ₹384.62 (0.50 shift)')
})
