// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  arrivalText,
  attendancePct,
  countText,
  daysText,
  durationText,
  gradeFor,
  healthScore,
  insightLines,
  insightsEmpty,
  normalizeMyInsights,
  onTimePct,
  payChart,
  pctText,
  periodsFor,
  scoreParts,
  totalsOf,
  trendBars,
  type MyInsights,
} from './myInsights.ts'
import { HIDDEN_AMOUNT } from './homeAttention.ts'

// A reply as GET /my/analytics sends it (keys already camelCase).
const month = (y: number, m: number, extra: Record<string, unknown> = {}) => ({
  year: y,
  month: m,
  label: `M${m} ${y}`,
  shortLabel: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1],
  current: false,
  days: { recorded: 0, working: 0, present: 0, half: 0, absent: 0, leave: 0, holidays: 0 },
  punctuality: { arrivals: 0, onTime: 0, late: 0, avgArrival: null, avgArrivalDelta: null },
  earlyOut: { days: 0, minutes: 0 },
  overtimeMinutes: 0,
  onDutyDays: 0,
  permissions: 0,
  casualLeave: 0,
  salary: null,
  ...extra,
})

const reply = () => ({
  employmentType: 'staff',
  today: '2026-11-25',
  months: 3,
  shift: { name: 'General', start: '09:00', end: '18:00', graceMinutes: 10 },
  periods: [
    month(2026, 9, {
      days: { recorded: 30, working: 26, present: 22, half: 2, absent: 1, leave: 1, holidays: 4 },
      punctuality: { arrivals: 24, onTime: 20, late: 4, avgArrival: '09:02', avgArrivalDelta: 2 },
      earlyOut: { days: 2, minutes: 40 },
      overtimeMinutes: 120,
      salary: { earned: 22000, lost: 2500, net: 21000, allocated: 24000, otPay: 300, slips: 1 },
    }),
    month(2026, 10, {
      days: { recorded: 31, working: 26, present: 25, half: 0, absent: 0, leave: 1, holidays: 5 },
      punctuality: { arrivals: 25, onTime: 25, late: 0, avgArrival: '08:54', avgArrivalDelta: -6 },
      overtimeMinutes: 30,
      onDutyDays: 2,
      salary: { earned: 24000, lost: 0, net: 23000, allocated: 24000, otPay: 0, slips: 1 },
    }),
    month(2026, 11, {
      current: true,
      days: { recorded: 21, working: 18, present: 16, half: 1, absent: 1, leave: 0, holidays: 3 },
      punctuality: { arrivals: 17, onTime: 15, late: 2, avgArrival: '09:01', avgArrivalDelta: 1.4 },
      earlyOut: { days: 1, minutes: 25 },
    }),
  ],
})

const data = (): MyInsights => normalizeMyInsights(reply())!

test('normalize: a good reply is read, oldest first, the current month marked', () => {
  const d = data()
  assert.equal(d.periods.length, 3)
  assert.deepEqual(d.periods.map((m) => m.key), ['2026-09', '2026-10', '2026-11'])
  assert.equal(d.periods[2].current, true)
  assert.equal(d.shift?.start, '09:00')
  assert.equal(d.periods[0].salary?.lost, 2500)
})

test('normalize: a malformed reply is null, bad fields read as 0 / null, never throws', () => {
  assert.equal(normalizeMyInsights(null), null)
  assert.equal(normalizeMyInsights({}), null)
  assert.equal(normalizeMyInsights({ periods: 'x' }), null)
  const d = normalizeMyInsights({
    periods: [
      { year: 2026, month: 13 }, // not a month: dropped
      { year: '2026', month: '8', days: { working: 'abc', present: -3, recorded: 5, holidays: 1 }, punctuality: { avgArrival: '9am' } },
      { year: 2026, month: 7, salary: { earned: '1000', lost: null } },
    ],
  })!
  assert.equal(d.periods.length, 2)
  assert.deepEqual(d.periods.map((m) => m.key), ['2026-07', '2026-08'])
  assert.equal(d.periods[1].days.present, 0)
  assert.equal(d.periods[1].days.working, 0)
  assert.equal(d.periods[1].punctuality.avgArrival, null)
  assert.equal(d.periods[0].salary?.earned, 1000)
  assert.equal(d.periods[0].salary?.lost, null)
  // no month said current: the newest is
  assert.equal(d.periods[1].current, true)
  assert.equal(d.shift, null)
})

test('per month: attendance and on-time percentages', () => {
  const [sep, , nov] = data().periods
  assert.equal(attendancePct(sep.days), 88.5) // (22 + 1) / 26
  assert.equal(attendancePct(nov.days), 91.7) // 16.5 / 18
  assert.equal(attendancePct({ ...sep.days, working: 0 }), null)
  assert.equal(onTimePct(sep.punctuality), 83.3)
  assert.equal(onTimePct({ ...sep.punctuality, arrivals: 0 }), null)
})

test('scope: this month or the whole window', () => {
  const d = data()
  assert.deepEqual(periodsFor(d, 'month').map((m) => m.key), ['2026-11'])
  assert.equal(periodsFor(d, 'window').length, 3)
  assert.deepEqual(periodsFor(null, 'window'), [])
})

test('totals add the months up; the arrival average is weighted by arrivals', () => {
  const t = totalsOf(data().periods)
  assert.equal(t.working, 70)
  assert.equal(t.attended, 23 + 25 + 16.5)
  assert.equal(t.leave, 2)
  assert.equal(t.arrivals, 66)
  assert.equal(t.onTime, 60)
  assert.equal(t.earlyOutDays, 3)
  assert.equal(t.overtimeMinutes, 150)
  assert.equal(t.salaryMonths, 2)
  assert.equal(t.earned, 46000)
  assert.equal(t.lost, 2500)
  // (2*24 - 6*25 + 1.4*17) / 66 = -1.2
  assert.equal(t.avgArrivalDelta, -1.2)
})

test('score: weighted parts, approved leave never counts against anyone', () => {
  const parts = scoreParts(totalsOf(data().periods))
  assert.equal(parts.attendance, 94.9) // 64.5 / (70 - 2)
  assert.equal(parts.punctuality, 90.9) // 60 / 66
  assert.equal(parts.fullDays, 95.5) // 1 - 3 / 66
  const s = healthScore(data().periods)
  // round((60*94.9 + 25*90.9 + 15*95.5) / 100) = round(94.01)
  assert.equal(s.score, 94)
  assert.equal(s.grade, 'Excellent')
  assert.equal(s.tone, 'great')
})

test('score: the weakest part is named; no working days = no score', () => {
  const late = normalizeMyInsights({
    periods: [
      month(2026, 11, {
        current: true,
        days: { recorded: 20, working: 20, present: 20, half: 0, absent: 0, leave: 0, holidays: 0 },
        punctuality: { arrivals: 20, onTime: 6, late: 14, avgArrival: '09:25', avgArrivalDelta: 25 },
      }),
    ],
  })!
  const s = healthScore(late.periods)
  // round((60*100 + 25*30 + 15*100) / 100) = 83
  assert.equal(s.score, 83)
  assert.equal(s.grade, 'Good')
  assert.equal(s.summary, 'Good going. Late arrivals are pulling your score down.')

  const absent = normalizeMyInsights({
    periods: [month(2026, 11, { days: { recorded: 10, working: 10, present: 4, half: 0, absent: 6, leave: 0, holidays: 0 } })],
  })!
  const a = healthScore(absent.periods)
  // attendance only (no arrivals): 40
  assert.equal(a.score, 40)
  assert.equal(a.tone, 'low')
  assert.equal(a.summary, 'Missed days are pulling your score down.')

  const none = healthScore(normalizeMyInsights({ periods: [month(2026, 11)] })!.periods)
  assert.equal(none.score, null)
  assert.equal(none.tone, 'none')
  // all leave: nothing due
  const leave = healthScore(
    normalizeMyInsights({
      periods: [month(2026, 11, { days: { recorded: 5, working: 5, present: 0, half: 0, absent: 0, leave: 5, holidays: 0 } })],
    })!.periods,
  )
  assert.equal(leave.score, null)
})

test('grades', () => {
  assert.deepEqual(gradeFor(90), { grade: 'Excellent', tone: 'great' })
  assert.deepEqual(gradeFor(89), { grade: 'Good', tone: 'good' })
  assert.deepEqual(gradeFor(75), { grade: 'Good', tone: 'good' })
  assert.deepEqual(gradeFor(60), { grade: 'Fair', tone: 'fair' })
  assert.deepEqual(gradeFor(59), { grade: 'Needs attention', tone: 'low' })
  assert.deepEqual(gradeFor(null), { grade: 'No data yet', tone: 'none' })
})

test('wording helpers', () => {
  assert.equal(countText(2), '2')
  assert.equal(countText(1.5), '1.5')
  assert.equal(daysText(1), '1 day')
  assert.equal(daysText(2), '2 days')
  assert.equal(daysText(0.5), '0.5 days')
  assert.equal(pctText(92.4), '92%')
  assert.equal(pctText(null), '—')
  assert.equal(durationText(0), '0 h')
  assert.equal(durationText(45), '45 min')
  assert.equal(durationText(90), '1.5 h')
  assert.equal(durationText(750), '12.5 h')
  assert.equal(arrivalText(-6), '6 min early')
  assert.equal(arrivalText(4.4), '4 min late')
  assert.equal(arrivalText(0.3), 'right on time')
  assert.equal(arrivalText(null), '—')
})

test('insight sentences, most useful first; pay masked while hidden', () => {
  const lines = insightLines(data(), false)
  assert.deepEqual(
    lines.map((l) => l.key),
    ['onTime', 'trend', 'arrival', 'earlyOut', 'ot', 'onDuty', 'pay'],
  )
  assert.equal(lines[0].text, 'On time 15 of 17 days this month')
  assert.equal(lines[1].text, 'Attendance 92% this month, down from 96% in Oct')
  assert.equal(lines[1].tone, 'warn')
  assert.equal(lines[2].text, 'You arrive 1 min late on average (09:01)')
  assert.equal(lines[3].text, 'Left early on 1 day this month (25 min)')
  assert.equal(lines[4].text, '2.5 h overtime in the last 3 months')
  assert.equal(lines[5].text, '2 days On-Duty in the last 3 months')
  // the newest month with a slip (October) lost nothing
  assert.equal(lines[6].text, 'Nothing lost to attendance in Oct')

  const r = reply()
  ;(r.periods[1] as any).salary.lost = 1500
  const hidden = insightLines(normalizeMyInsights(r), true).find((l) => l.key === 'pay')!
  assert.equal(hidden.text, `${HIDDEN_AMOUNT} lost to attendance in Oct`)
  const shown = insightLines(normalizeMyInsights(r), false).find((l) => l.key === 'pay')!
  assert.equal(shown.text, '₹1,500 lost to attendance in Oct')
  assert.deepEqual(insightLines(null, false), [])
})

test('insight sentences: a perfect month says so', () => {
  const r = reply()
  r.periods[2] = month(2026, 11, {
    current: true,
    days: { recorded: 5, working: 5, present: 5, half: 0, absent: 0, leave: 0, holidays: 0 },
    punctuality: { arrivals: 5, onTime: 5, late: 0, avgArrival: '08:50', avgArrivalDelta: -10 },
  })
  const lines = insightLines(normalizeMyInsights(r), false)
  assert.equal(lines[0].tone, 'good')
  assert.equal(lines.find((l) => l.key === 'arrival')!.text, 'You arrive 10 min early on average (08:50)')
  assert.equal(lines.find((l) => l.key === 'earlyOut')!.text, 'No early outs this month')
})

test('trend bars: one per month, gaps where there is nothing', () => {
  const bars = trendBars(data())
  assert.deepEqual(bars.map((b) => b.label), ['Sep', 'Oct', 'Nov'])
  assert.equal(bars[1].attendance, 96.2)
  assert.equal(bars[1].onTime, 100)
  assert.equal(bars[2].current, true)
  const empty = trendBars(normalizeMyInsights({ periods: [month(2026, 11)] }))
  assert.equal(empty[0].attendance, null)
})

test('pay chart: earned vs lost scaled to the tallest month; masked while hidden', () => {
  const c = payChart(data(), false)
  assert.equal(c.any, true)
  assert.equal(c.bars[0].earnedRatio, 22000 / 24500)
  assert.equal(c.bars[0].lostRatio, 2500 / 24500)
  assert.equal(c.bars[0].earnedText, '₹22K')
  assert.equal(c.bars[0].lostText, '₹2.5K')
  assert.equal(c.bars[1].lostText, '')
  assert.equal(c.bars[2].hasSlip, false)
  assert.equal(c.totalEarnedText, '₹46,000')
  assert.equal(c.totalLostText, '₹2,500')
  assert.equal(c.keptPct, 96) // 46000 / 48000
  const h = payChart(data(), true)
  assert.equal(h.bars[0].earnedText, '•••')
  assert.equal(h.totalEarnedText, HIDDEN_AMOUNT)
  assert.equal(h.bars[0].earnedRatio, c.bars[0].earnedRatio)
  assert.equal(payChart(null, false).any, false)
})

test('empty: nothing at all in the window', () => {
  assert.equal(insightsEmpty(data()), false)
  assert.equal(insightsEmpty(normalizeMyInsights({ periods: [month(2026, 11)] })), true)
  assert.equal(insightsEmpty(null), true)
})
