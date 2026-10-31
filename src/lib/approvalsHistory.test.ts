// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CATEGORY_ORDER,
  CATEGORY_WIRE,
  categoryFromWire,
  countsFromProfile,
  emptyCopy,
  fmtDay,
  matchesSearch,
  nextPageParam,
  normalizeCategoryCounts,
  normalizeHistoryPage,
  normalizeItem,
  normalizeOutcome,
  outcomeLine,
  parseDay,
  statusFromParam,
  visibleCategories,
  waitTone,
  waitingFor,
} from './approvalsHistory.ts'
import { shownApprovalTabs } from './approvalBadge.ts'

test('category keys round-trip through the server spelling, camel or snake', () => {
  for (const c of CATEGORY_ORDER) {
    assert.equal(categoryFromWire(CATEGORY_WIRE[c]), c)
    assert.equal(categoryFromWire(c), c)
  }
  assert.equal(categoryFromWire('missing-punch'), 'missingPunch')
  assert.equal(categoryFromWire('attendance_correction'), 'attendance')
  assert.equal(categoryFromWire('compensation'), 'holidayWork')
  assert.equal(categoryFromWire('on_duty'), 'onDuty')
  assert.equal(categoryFromWire('advance'), null)
  assert.equal(categoryFromWire(7), null)
  assert.equal(statusFromParam('approved'), 'approved')
  assert.equal(statusFromParam('cancelled'), null)
  assert.equal(statusFromParam(undefined), null)
})

test('visible categories follow the per-person switches; Leave and Permission always', () => {
  assert.deepEqual(visibleCategories(shownApprovalTabs({})), ['leave', 'permission'])
  assert.deepEqual(
    visibleCategories(shownApprovalTabs({ canApprovePermissions: true, canApproveResignations: true })),
    ['leave', 'permission', 'outpass', 'resignation'],
  )
  const all = shownApprovalTabs({
    canApprovePermissions: true,
    canApproveResignations: true,
    canApproveCasualLeave: true,
    canApproveAttendance: true,
    canApproveMissingPunch: true,
    canApproveCompensation: true,
  })
  assert.deepEqual(visibleCategories(all), CATEGORY_ORDER.filter((c) => c !== 'onDuty'))
  assert.deepEqual(visibleCategories({ ...all, onDuty: true }), [...CATEGORY_ORDER])
})

test('summary counts: the camelized reply, junk dropped, bad numbers read as 0', () => {
  const counts = normalizeCategoryCounts({
    categories: [
      { key: 'leave', workflow: 'leave', label: 'Leave', pending: 2, approved: 10, rejected: 1 },
      { key: 'casual_leave', pending: -1, approved: 'x', rejected: 3.7 },
      { key: 'on_duty', pending: 4 },
      { key: 'advance', pending: 9 },
      null,
    ],
    total: { pending: 2 },
  })
  assert.deepEqual(counts, {
    leave: { pending: 2, approved: 10, rejected: 1 },
    casualLeave: { pending: 0, approved: 0, rejected: 3 },
    onDuty: { pending: 4, approved: 0, rejected: 0 },
  })
  assert.equal(normalizeCategoryCounts('<html>404</html>'), null)
  assert.equal(normalizeCategoryCounts({}), null)
})

test('an older backend: pending counts come from /manager/me', () => {
  const c = countsFromProfile({ pendingLeavesCount: 3, pendingCasualLeaveCount: 1, pendingOutpassCount: 2 })
  assert.deepEqual(c.leave, { pending: 3, approved: 0, rejected: 0 })
  assert.equal(c.casualLeave?.pending, 1)
  assert.equal(c.outpass?.pending, 2)
  assert.equal(c.resignation?.pending, 0)
})

test('a page of a list and the next page', () => {
  const p = normalizeHistoryPage({ items: [{ id: 1 }], page: 2, total: 41, hasMore: true, counts: { pending: 1 } }, 2)
  assert.equal(p.items.length, 1)
  assert.equal(nextPageParam(p), 3)
  assert.deepEqual(p.counts, { pending: 1, approved: 0, rejected: 0 })
  const empty = normalizeHistoryPage(null, 1)
  assert.deepEqual([empty.items, empty.page, empty.total, empty.hasMore], [[], 1, 0, false])
  assert.equal(nextPageParam(empty), undefined)
  assert.equal(nextPageParam(undefined), undefined)
})

test('permission rows get the `time` the decision sheet reads', () => {
  assert.equal(normalizeItem('permission', { id: 1, permissionTime: '09:30' } as Record<string, any>).time, '09:30')
  assert.equal(normalizeItem('permission', { id: 1, time: '10:00', permissionTime: '09:30' }).time, '10:00')
  const leave = { id: 2, permissionTime: 'x' }
  assert.equal(normalizeItem('leave', leave), leave)
})

test('search: every word in the name or code, flat or nested employee', () => {
  const flat = { employeeName: 'Asha Kumar', employeeCode: 'E101' }
  const nested = { employee: { name: 'Bala Raj', employeeCode: 'E202' } }
  assert.ok(matchesSearch(flat, ''))
  assert.ok(matchesSearch(flat, 'asha'))
  assert.ok(matchesSearch(flat, ' kumar  e101 '))
  assert.ok(!matchesSearch(flat, 'asha raj'))
  assert.ok(matchesSearch(nested, 'e202'))
  assert.ok(!matchesSearch({}, 'x'))
})

const outcome = (o: Record<string, unknown>) => normalizeOutcome({ decisions: [], ...o })

const W = (iso: string) => `@${iso.slice(11, 16)}`

test('who decided, as one prominent line', () => {
  assert.equal(outcomeLine(outcome({ state: 'pending' })), null)
  assert.equal(outcomeLine(null), null)
  const mine = outcomeLine(
    outcome({ state: 'approved', decidedByYou: true, yourDecision: 'approved', decidedByRole: 'hod', decidedAt: '2026-10-31T10:05:00Z' }),
    W,
  )!
  assert.deepEqual([mine.text, mine.note, mine.tone, mine.icon], ['Approved by you · @10:05', null, 'approved', 'check-decagram'])
  assert.equal(outcomeLine(outcome({ state: 'rejected', decidedByYou: true, yourDecision: 'rejected' }), W)!.text, 'Rejected by you')

  const forwarded = outcomeLine(outcome({ state: 'in_progress', yourDecision: 'approved', yourDecisionAt: '2026-10-30T09:00:00Z' }), W)!
  assert.deepEqual([forwarded.text, forwarded.note, forwarded.tone], ['Approved by you · @09:00', "Waiting for HR's final decision", 'waiting'])
  assert.equal(
    outcomeLine(outcome({ state: 'in_progress', decisions: [{ role: 'hod', decision: 'approved', by: 'Kavya', at: null }] }), W)!.text,
    'Approved by Department Head (Kavya)',
  )

  const hrNo = outcomeLine(
    outcome({ state: 'rejected', yourDecision: 'approved', decidedByRole: 'hr', decidedByName: 'Meena', decidedAt: '2026-10-31T10:05:00Z' }),
    W,
  )!
  assert.deepEqual([hrNo.text, hrNo.note], ['Rejected by HR (Meena) · @10:05', 'You approved it first'])
  assert.equal(
    outcomeLine(outcome({ state: 'approved', yourDecision: 'approved', decidedByRole: 'hr', decidedByName: 'Meena' }), W)!.note,
    'You approved it first',
  )
  assert.equal(outcomeLine(outcome({ state: 'approved', decidedByRole: 'hr' }), W)!.text, 'Approved by HR')
  assert.equal(
    outcomeLine(outcome({ state: 'rejected', decidedByRole: 'hod', decidedByName: 'Kavya' }), W)!.text,
    'Rejected by Department Head (Kavya)',
  )
  assert.equal(outcomeLine(outcome({ state: 'approved', decidedByName: 'Old Boss' }), W)!.text, 'Approved by Old Boss')
  assert.equal(outcomeLine(outcome({ state: 'approved' }), W)!.text, 'Approved')
})

test('outcome blocks that are not the contract shape', () => {
  assert.equal(normalizeOutcome(undefined), null)
  assert.equal(normalizeOutcome('x'), null)
  const o = normalizeOutcome({ state: 'weird', decidedByRole: 'boss', yourDecision: 'maybe', decisions: [null, { role: 'hod', decision: 'approved', by: ' A ' }] })!
  assert.equal(o.state, null)
  assert.equal(o.decidedByRole, null)
  assert.equal(o.yourDecision, null)
  assert.deepEqual(o.decisions, [{ role: 'hod', decision: 'approved', by: 'A', at: null, comment: null }])
  assert.equal(normalizeOutcome({ state: 'inProgress' })!.state, 'in_progress')
})

test('a calendar day is never shifted by the time zone', () => {
  const d = parseDay('2026-10-06')!
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 9, 6])
  assert.equal(fmtDay('2026-10-06'), '06 Oct 2026')
  assert.equal(fmtDay('2026-10-06', 'dd MMM'), '06 Oct')
  assert.equal(fmtDay(null), '—')
  assert.equal(fmtDay('not a date'), 'not a date')
  assert.equal(parseDay(''), null)
  assert.ok(parseDay('2026-10-06T09:15:00+05:30'))
})

test('how long a request has waited', () => {
  const now = new Date('2026-10-31T12:00:00Z')
  assert.equal(waitingFor('2026-10-31T11:59:40Z', now), 'Just now')
  assert.equal(waitingFor('2026-10-31T11:35:00Z', now), 'Waiting 25 min')
  assert.equal(waitingFor('2026-10-31T11:00:00Z', now), 'Waiting 1 hour')
  assert.equal(waitingFor('2026-10-31T02:00:00Z', now), 'Waiting 10 hours')
  assert.equal(waitingFor('2026-10-30T11:00:00Z', now), 'Waiting 1 day')
  assert.equal(waitingFor('2026-10-20T11:00:00Z', now), 'Waiting 11 days')
  assert.equal(waitingFor(undefined, now), null)
  assert.equal(waitTone('2026-10-31T02:00:00Z', now), 'fresh')
  assert.equal(waitTone('2026-10-29T02:00:00Z', now), 'aging')
  assert.equal(waitTone('2026-10-20T02:00:00Z', now), 'old')
  assert.equal(waitTone(null, now), 'fresh')
})

test('empty states per status, search and pipeline', () => {
  assert.equal(emptyCopy('leave', 'pending').title, 'All caught up!')
  assert.equal(emptyCopy('leave', 'pending').subtitle, 'No leave requests are waiting for you.')
  assert.equal(emptyCopy('leave', 'pending', { hodInPipeline: false }).subtitle, 'These requests go to HR only, so none come to you.')
  assert.equal(emptyCopy('resignation', 'approved').subtitle, 'Approved resignation requests from your team will show here.')
  assert.equal(emptyCopy('missingPunch', 'rejected').title, 'No rejected requests')
  assert.equal(emptyCopy('leave', 'approved', { search: ' asha ' }).subtitle, 'No approved leave requests for "asha".')
})
