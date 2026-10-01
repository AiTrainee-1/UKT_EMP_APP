// Run with `npm test` (Node's built-in test runner; Node 22.18+ / 24 runs .ts directly).
// Asserts ALL 83 shared vectors against the rule, so this app, the web apps and the backend cannot drift apart.
// TypeScript 6 no longer loads @types/* on its own, and the app itself needs no Node typings: only the tests do.
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  GRACE_DAYS,
  checkRequestDate,
  checkRequestRange,
  getRequestWindow,
  isIsoDate,
  windowHint,
  windowMessage,
} from './requestWindow.ts'
import { requestWindowVectors as V } from './requestWindow.vectors.ts'

/** The `now` of a vector: that calendar day at 13:30 local time (the time the vectors were generated with). */
const at = (day: string, h = 13, min = 30, s = 0, ms = 0) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, h, min, s, ms)
}

test('the vector set is complete (22 windows + 47 dates + 14 ranges = 83)', () => {
  assert.equal(V.windows.length, 22)
  assert.equal(V.dates.length, 47)
  assert.equal(V.ranges.length, 14)
  assert.equal(V.windows.length + V.dates.length + V.ranges.length, 83)
})

test('GRACE_DAYS matches the vectors', () => {
  assert.equal(GRACE_DAYS, V.graceDays)
  assert.equal(GRACE_DAYS, 2)
})

for (const v of V.windows) {
  test(`window on ${v.today}: min / max / grace / month names / message / hint`, () => {
    const w = getRequestWindow(at(v.today))
    assert.deepEqual(
      {
        today: w.today,
        min: w.min,
        max: w.max,
        graceOpen: w.graceOpen,
        currentMonth: w.currentMonth,
        previousMonth: w.previousMonth,
        message: windowMessage(w),
        hint: windowHint(w),
      },
      v,
    )
  })
}

for (const v of V.dates) {
  test(`date ${JSON.stringify(v.date)} on ${v.today}`, () => {
    const now = at(v.today)
    assert.equal(checkRequestDate(v.date, now), v.error)
    assert.equal(checkRequestDate(v.date, now, { noFuture: true }), v.errorNoFuture)
  })
}

for (const v of V.ranges) {
  test(`range ${JSON.stringify(v.start)}..${JSON.stringify(v.end)} on ${v.today}`, () => {
    assert.equal(checkRequestRange(v.start, v.end, at(v.today)), v.error)
  })
}

test('the time of day never moves the window (00:00:00 and 23:59:59.999 give the vector result)', () => {
  for (const v of V.windows) {
    for (const now of [at(v.today, 0, 0, 0, 0), at(v.today, 23, 59, 59, 999)]) {
      const w = getRequestWindow(now)
      assert.equal(w.today, v.today)
      assert.equal(w.min, v.min)
      assert.equal(w.max, v.max)
      assert.equal(w.graceOpen, v.graceOpen)
    }
  }
})

test('"now" is an argument: the same module answers differently for a different day (no start-up capture)', () => {
  assert.equal(getRequestWindow(at('2026-10-02')).min, '2026-09-01')
  assert.equal(getRequestWindow(at('2026-10-03')).min, '2026-10-01')
  assert.equal(getRequestWindow(at('2026-11-01')).min, '2026-10-01')
  assert.equal(getRequestWindow(at('2026-11-30')).max, '2026-11-30')
  // The rule must not read the clock itself.
  const source = readFileSync(new URL('./requestWindow.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /new Date\(\s*\)|Date\.now\s*\(/)
})

test('isIsoDate accepts real calendar days only', () => {
  assert.equal(isIsoDate('2026-10-31'), true)
  assert.equal(isIsoDate('2028-02-29'), true)
  assert.equal(isIsoDate('2026-02-29'), false)
  assert.equal(isIsoDate('2026-13-01'), false)
  assert.equal(isIsoDate('2026-10-1'), false)
  assert.equal(isIsoDate(''), false)
  assert.equal(isIsoDate(null), false)
  assert.equal(isIsoDate(undefined), false)
})
