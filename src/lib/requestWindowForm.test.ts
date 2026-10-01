// Run with `npm test`. The form glue around the shared request-date rule: picker limits, where a refused range is shown,
// and the Casual Leave per-month eligibility helpers.
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  casualLeaveAvailable,
  casualLeaveClosedReason,
  casualLeaveDefaultDate,
  casualLeaveMonthBlock,
  isoToLocalDate,
  missingPunchHint,
  monthOfDate,
  rangeFieldErrors,
  requestPickerLimits,
  type MonthEligibility,
} from './requestWindowForm.ts'
import { checkRequestDate, checkRequestRange, windowHint, windowMessage, getRequestWindow } from './requestWindow.ts'

const at = (day: string, h = 13, min = 30) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, h, min)
}
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('isoToLocalDate is local midnight of that day', () => {
  const d = isoToLocalDate('2026-10-31')
  assert.equal(ymd(d), '2026-10-31')
  assert.deepEqual([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()], [0, 0, 0, 0])
})

test('picker limits: 1st and 2nd open last month as well, from the 3rd only this month', () => {
  for (const [today, min, max] of [
    ['2026-10-01', '2026-09-01', '2026-10-31'],
    ['2026-10-02', '2026-09-01', '2026-10-31'],
    ['2026-10-03', '2026-10-01', '2026-10-31'],
    ['2026-01-01', '2025-12-01', '2026-01-31'],
    ['2028-03-02', '2028-02-01', '2028-03-31'],
    ['2026-02-28', '2026-02-01', '2026-02-28'],
  ]) {
    const p = requestPickerLimits(at(today))
    assert.equal(ymd(p.minDate), min, today)
    assert.equal(ymd(p.maxDate), max, today)
    assert.equal(p.hint, windowHint(getRequestWindow(at(today))), today)
    assert.equal(p.defaultDate, today, 'today is inside the window, so it is the default')
    assert.deepEqual([p.minDate.getHours(), p.maxDate.getHours()], [0, 0])
  }
})

test('picker limits for Missing Punch (noFuture) end today, not at the end of the month', () => {
  const p = requestPickerLimits(at('2026-10-15'), { noFuture: true })
  assert.equal(ymd(p.minDate), '2026-10-01')
  assert.equal(ymd(p.maxDate), '2026-10-15')
  assert.equal(p.defaultDate, '2026-10-15')
  const grace = requestPickerLimits(at('2026-10-02'), { noFuture: true })
  assert.equal(ymd(grace.minDate), '2026-09-01')
  assert.equal(ymd(grace.maxDate), '2026-10-02')
})

test('every date the picker allows passes the check, and the days just outside it do not', () => {
  for (const today of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-31', '2028-02-29', '2026-12-01']) {
    for (const noFuture of [false, true]) {
      const now = at(today)
      const p = requestPickerLimits(now, { noFuture })
      const before = new Date(p.minDate.getFullYear(), p.minDate.getMonth(), p.minDate.getDate() - 1)
      const after = new Date(p.maxDate.getFullYear(), p.maxDate.getMonth(), p.maxDate.getDate() + 1)
      assert.equal(checkRequestDate(ymd(p.minDate), now, { noFuture }), null, `${today} min`)
      assert.equal(checkRequestDate(ymd(p.maxDate), now, { noFuture }), null, `${today} max`)
      assert.notEqual(checkRequestDate(ymd(before), now, { noFuture }), null, `${today} day before min`)
      assert.notEqual(checkRequestDate(ymd(after), now, { noFuture }), null, `${today} day after max`)
    }
  }
})

test('rangeFieldErrors puts each message under the end that is wrong', () => {
  const now = at('2026-10-15')
  const closed = windowMessage(getRequestWindow(now))
  assert.deepEqual(rangeFieldErrors('2026-10-20', '2026-10-22', now), { start: null, end: null })
  assert.deepEqual(rangeFieldErrors('2026-10-31', '2026-10-31', now), { start: null, end: null })
  assert.deepEqual(rangeFieldErrors('2026-09-30', '2026-10-02', now), { start: closed, end: null })
  assert.deepEqual(rangeFieldErrors('2026-10-30', '2026-11-02', now), { start: null, end: closed })
  assert.deepEqual(rangeFieldErrors('2026-09-01', '2026-11-30', now), { start: closed, end: closed })
  assert.deepEqual(rangeFieldErrors('2026-10-22', '2026-10-20', now), {
    start: null,
    end: 'End date must be on or after start date.',
  })
  assert.deepEqual(rangeFieldErrors('2026-10-10', 'bad', now), { start: null, end: 'Choose a valid date.' })
  assert.deepEqual(rangeFieldErrors('', '2026-10-10', now), { start: 'Choose a valid date.', end: null })
})

test('rangeFieldErrors says "refused" exactly when checkRequestRange does', () => {
  const days = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-15', '2026-10-31', '2026-11-01', 'bad', '']
  for (const today of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-15']) {
    const now = at(today)
    for (const start of days) {
      for (const end of days) {
        const refused = checkRequestRange(start, end, now) !== null
        const e = rangeFieldErrors(start, end, now)
        assert.equal(e.start !== null || e.end !== null, refused, `${today} ${start}..${end}`)
      }
    }
  }
})

const sep: MonthEligibility = { month: '2026-09', label: 'September 2026', eligible: false, reason: 'Already used in September.' }
const oct: MonthEligibility = { month: '2026-10', label: 'October 2026', eligible: true, reason: null }
const octClosed: MonthEligibility = { month: '2026-10', label: 'October 2026', eligible: false, reason: 'Not eligible this month.' }

test('casualLeaveAvailable: months decide when present, the old yes / no otherwise', () => {
  assert.equal(casualLeaveAvailable(false, [sep, oct]), true, 'the grace month is the only one left open')
  assert.equal(casualLeaveAvailable(true, [sep, octClosed]), false, 'months say none is eligible')
  assert.equal(casualLeaveAvailable(undefined, [oct]), true)
  assert.equal(casualLeaveAvailable(false, undefined), false, 'no months: today\'s behaviour from `eligible`')
  assert.equal(casualLeaveAvailable(true, undefined), true)
  assert.equal(casualLeaveAvailable(undefined, undefined), true, 'still loading: not blocked')
  assert.equal(casualLeaveAvailable(false, []), false, 'an empty list is read as absent')
  assert.equal(casualLeaveAvailable(true, []), true)
})

test('casualLeaveClosedReason prefers the latest month, then the fallback', () => {
  assert.equal(casualLeaveClosedReason([sep, octClosed], 'x'), 'Not eligible this month.')
  assert.equal(casualLeaveClosedReason([{ ...octClosed, reason: null }], 'fallback'), 'fallback')
  assert.equal(casualLeaveClosedReason(undefined, 'fallback'), 'fallback')
  assert.equal(casualLeaveClosedReason([], 'fallback'), 'fallback')
})

test('casualLeaveMonthBlock blocks only a listed, not eligible month', () => {
  assert.equal(casualLeaveMonthBlock('2026-09-30', [sep, oct]), 'Already used in September.')
  assert.equal(casualLeaveMonthBlock('2026-10-05', [sep, oct]), null)
  assert.equal(casualLeaveMonthBlock('2026-08-31', [sep, oct]), null, 'a month that is not listed is not blocked here')
  assert.equal(casualLeaveMonthBlock('2026-09-30', undefined), null)
  assert.equal(casualLeaveMonthBlock('2026-09-30', [{ ...sep, reason: null }]), 'Casual leave is not available for September 2026.')
})

test('missingPunchHint says the window ends today, and requestPickerLimits uses it for Missing Punch only', () => {
  const w = (day: string) => getRequestWindow(at(day))
  assert.equal(missingPunchHint(w('2026-10-15')), 'Any day in October 2026, up to today')
  assert.equal(missingPunchHint(w('2026-10-03')), 'Any day in October 2026, up to today')
  assert.equal(missingPunchHint(w('2026-10-01')), '1 September 2026 to today')
  assert.equal(missingPunchHint(w('2026-10-02')), '1 September 2026 to today')
  assert.equal(missingPunchHint(w('2026-01-02')), '1 December 2025 to today')
  assert.equal(requestPickerLimits(at('2026-10-15'), { noFuture: true }).hint, 'Any day in October 2026, up to today')
  assert.equal(requestPickerLimits(at('2026-10-02'), { noFuture: true }).hint, '1 September 2026 to today')
  assert.equal(requestPickerLimits(at('2026-10-15')).hint, 'Any day in October 2026', 'the other forms keep the window hint')
  assert.equal(requestPickerLimits(at('2026-10-02')).hint, '1 September 2026 to 31 October 2026')
})

test('monthOfDate reads the month of a real day, else the fallback', () => {
  const fallback = at('2026-10-15')
  assert.deepEqual(monthOfDate('2026-09-30', fallback), { month: 9, year: 2026 })
  assert.deepEqual(monthOfDate('2025-12-01', fallback), { month: 12, year: 2025 })
  assert.deepEqual(monthOfDate('', fallback), { month: 10, year: 2026 })
  assert.deepEqual(monthOfDate(undefined, fallback), { month: 10, year: 2026 })
  assert.deepEqual(monthOfDate('2026-02-31', fallback), { month: 10, year: 2026 }, 'not a real day')
})

test('casualLeaveDefaultDate: today, unless only last month is open on a grace day', () => {
  const sepOpen: MonthEligibility = { month: '2026-09', label: 'September 2026', eligible: true, reason: null }
  const octUsed: MonthEligibility = { month: '2026-10', label: 'October 2026', eligible: false, reason: 'Already used in October.' }
  // The current month is open (or not listed, or the server sent no list): today, whatever last month says.
  assert.equal(casualLeaveDefaultDate(at('2026-10-01'), [sep, oct]), '2026-10-01', 'this month eligible: prefer it')
  assert.equal(casualLeaveDefaultDate(at('2026-10-01'), [sepOpen, oct]), '2026-10-01')
  assert.equal(casualLeaveDefaultDate(at('2026-10-15'), [octUsed]), '2026-10-15', 'no grace: nothing else to offer')
  assert.equal(casualLeaveDefaultDate(at('2026-10-15'), undefined), '2026-10-15')
  assert.equal(casualLeaveDefaultDate(at('2026-10-15'), []), '2026-10-15')
  assert.equal(casualLeaveDefaultDate(at('2026-10-01'), [sepOpen]), '2026-10-01', 'this month is not listed: today')
  // The grace days with only last month open: its last day (the latest day of it that is not after today).
  assert.equal(casualLeaveDefaultDate(at('2026-10-01'), [sepOpen, octUsed]), '2026-09-30')
  assert.equal(casualLeaveDefaultDate(at('2026-10-02'), [octUsed, sepOpen]), '2026-09-30', 'list order does not matter')
  assert.equal(casualLeaveDefaultDate(at('2026-03-01'), [{ month: '2026-02', label: 'February 2026', eligible: true, reason: null },
    { month: '2026-03', label: 'March 2026', eligible: false, reason: 'x' }]), '2026-02-28')
  assert.equal(casualLeaveDefaultDate(at('2028-03-02'), [{ month: '2028-02', label: 'February 2028', eligible: true, reason: null },
    { month: '2028-03', label: 'March 2028', eligible: false, reason: 'x' }]), '2028-02-29', 'leap year')
  assert.equal(casualLeaveDefaultDate(at('2026-01-01'), [{ month: '2025-12', label: 'December 2025', eligible: true, reason: null },
    { month: '2026-01', label: 'January 2026', eligible: false, reason: 'x' }]), '2025-12-31', 'across the new year')
  // Both months closed: today (the red reason is then the truth).
  assert.equal(casualLeaveDefaultDate(at('2026-10-01'), [sep, octUsed]), '2026-10-01')
  // A listed month outside the window is never offered.
  assert.equal(casualLeaveDefaultDate(at('2026-10-15'), [{ month: '2026-09', label: 'September 2026', eligible: true, reason: null }, octUsed]), '2026-10-15')
  // Whatever it returns can be picked: it is inside the window.
  for (const today of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-31']) {
    const d = casualLeaveDefaultDate(at(today), [sepOpen, octUsed])
    assert.equal(checkRequestDate(d, at(today)), null, today)
  }
})
