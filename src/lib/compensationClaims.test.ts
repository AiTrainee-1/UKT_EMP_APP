// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeCompensation, type CompensationItem } from './compensation.ts'
import {
  NO_CONNECTION_MESSAGE,
  QUARTERS,
  REASON_SHORT_MESSAGE,
  availableToUse,
  buildClaimBody,
  buildUseBody,
  canClaimItem,
  claimCounts,
  claimDate,
  claimDraftFor,
  claimErrorMessage,
  claimFilterOf,
  claimFocusIds,
  claimableItems,
  filterClaims,
  floorToQuarter,
  isQuarterShift,
  itemClaimState,
  largestChoice,
  myClaimDecisionLine,
  myClaimFacts,
  myClaimTitle,
  normalizeMyClaims,
  shiftChoices,
  useBalanceChoices,
  useBalanceLine,
  useBalanceState,
} from './compensationClaims.ts'

// A current server's reply (self-claims on), keys camelCase as the app's axios client delivers them.
const REPLY = {
  isStaff: true,
  enabled: { master: true, allowance: true, shift: true, relaxation: true, pay: false, windows: true, holidayWork: true, birthday: true, any: true },
  balanceShifts: 1.5,
  canClaim: true,
  claimWindowDays: 45,
  useBalance: { allowed: true, balanceShifts: 1.5, pendingShifts: 0.5, availableShifts: 1.0, message: null },
  items: [
    { key: 'ot-3625', kind: 'ot_allowance', group: 'detected', date: '2026-11-12', title: 'Late-in allowance to claim: 30 minutes', detail: '...', status: 'claimable', statusLabel: 'Can be claimed', shifts: null, minutes: 30, claimable: true, claimKind: 'ot_allowance', claim: null },
    { key: 'ot-3630', kind: 'ot_shift', group: 'detected', date: '2026-11-09', title: 'Extra hours: claim 0.50 shift', detail: '...', status: 'claimable', statusLabel: 'Can be claimed', shifts: 0.5, minutes: 220, claimable: true, claimKind: 'ot_shift', suggestedShifts: 0.5, overtimeRecordId: 3630, claim: null },
    { key: 'ot-3640', kind: 'ot_shift', group: 'detected', date: '2026-11-10', title: 'Extra hours', detail: '...', status: 'claim_pending', statusLabel: 'Claim waiting for your Department Head', shifts: 0.75, minutes: 300, claimable: false, claimKind: 'ot_shift', suggestedShifts: 0.75, claim: { id: 77, kind: 'ot_shift', status: 'pending', statusLabel: 'Waiting for your Department Head', shifts: 0.75, raisedByRole: 'employee' } },
    { key: 'hwd-2026-11-16', kind: 'holiday_work', group: 'detected', date: '2026-11-16', workDate: '2026-11-16', title: 'Sunday worked: claim it', detail: '...', status: 'claimable', statusLabel: 'Can be claimed', shifts: null, claimable: true, claimKind: 'holiday_work', suggestedShifts: 1, claim: null },
    { key: 'bdc-2026-11-03', kind: 'birthday_credit', group: 'birthday', date: '2026-11-03', title: 'Birthday credit to claim', detail: '...', status: 'claimable', statusLabel: 'Can be claimed', shifts: 1, claimable: true, claimKind: 'birthday', claim: null },
    { key: 'hw-2421', kind: 'holiday_work', group: 'assigned', date: '2026-10-11', workDate: '2026-10-11', title: 'Sunday work: 0.50 shift', detail: '...', status: 'pending_hod', statusLabel: 'Waiting for your Department Head', shifts: 0.5 },
  ],
  todayAllowance: null,
  tomorrowAllowance: null,
  askHr: null,
  message: null,
}

const model = () => normalizeCompensation(REPLY)!
const item = (key: string): CompensationItem => model().items.find((i) => i.key === key)!

test('quarters: floor, check, choices up to a limit', () => {
  assert.deepEqual(QUARTERS, [0.25, 0.5, 0.75, 1])
  assert.equal(floorToQuarter(0.6), 0.5)
  assert.equal(floorToQuarter(0.75), 0.75)
  assert.equal(floorToQuarter(0.7499999999), 0.75)
  assert.equal(floorToQuarter(0.2), 0)
  assert.equal(floorToQuarter(-1), 0)
  assert.equal(floorToQuarter(NaN), 0)
  assert.equal(isQuarterShift(0.5), true)
  assert.equal(isQuarterShift(0.5000001), true)
  assert.equal(isQuarterShift(0.3), false)
  assert.equal(isQuarterShift(1.25), false)
  assert.equal(isQuarterShift('0.5'), false)
  assert.deepEqual(shiftChoices(0.5).map((c) => [c.label, c.enabled]), [['0.25', true], ['0.50', true], ['0.75', false], ['1.00', false]])
  assert.deepEqual(shiftChoices(null).map((c) => c.enabled), [true, true, true, true])
  assert.equal(largestChoice(shiftChoices(0.75)), 0.75)
  assert.equal(largestChoice(shiftChoices(0)), null)
})

test('which items can be claimed: canClaim true, claimable, a known kind, nothing waiting or approved', () => {
  assert.equal(canClaimItem(true, item('ot-3630')), true)
  assert.equal(canClaimItem(true, item('ot-3625')), true, 'the record id comes from the key "ot-3625"')
  assert.equal(item('ot-3625').overtimeRecordId, 3625)
  assert.equal(canClaimItem(true, item('ot-3640')), false, 'a claim already waits')
  assert.equal(canClaimItem(true, item('hw-2421')), false, 'an HR claim row is not claimable')
  assert.equal(canClaimItem(false, item('ot-3630')), false, 'the server closed claims')
  assert.equal(canClaimItem(null, item('ot-3630')), false, 'an older server never shows Claim')
  // an approved claim never shows Claim, even if a server marked the item claimable by mistake
  assert.equal(canClaimItem(true, { ...item('ot-3630'), claim: { id: 1, kind: 'ot_shift', status: 'approved', statusLabel: 'Approved', shifts: 0.5, minutes: null, raisedByRole: 'hr' } }), false)
  // a rejected claim can be claimed again while the server says so
  assert.equal(canClaimItem(true, { ...item('ot-3630'), claim: { id: 1, kind: 'ot_shift', status: 'rejected', statusLabel: 'Not approved', shifts: 0.5, minutes: null, raisedByRole: 'employee' } }), true)
  // an OT kind without any record id cannot be sent
  assert.equal(canClaimItem(true, { ...item('ot-3630'), key: 'x', overtimeRecordId: null }), false)
})

test('item claim state and the "Can be claimed" list (newest first)', () => {
  assert.equal(itemClaimState(item('ot-3630')), 'claimable')
  assert.equal(itemClaimState(item('ot-3640')), 'pending')
  assert.equal(itemClaimState({ claimable: false, claim: { id: 1, kind: null, status: 'approved', statusLabel: 'Approved', shifts: null, minutes: null, raisedByRole: null } }), 'approved')
  assert.equal(itemClaimState({ claimable: false, claim: { id: 1, kind: null, status: 'rejected', statusLabel: 'Not approved', shifts: null, minutes: null, raisedByRole: null } }), 'rejected')
  assert.equal(itemClaimState({ claimable: false, claim: null }), null)
  assert.deepEqual(claimableItems(true, model().items).map((i) => i.key), ['hwd-2026-11-16', 'ot-3625', 'ot-3630', 'bdc-2026-11-03'])
  assert.deepEqual(claimableItems(null, model().items), [])
})

test('the claim date: the day worked for holiday work, else the item date', () => {
  assert.equal(claimDate({ claimKind: 'holiday_work', date: '2026-11-17', workDate: '2026-11-16' }), '2026-11-16')
  assert.equal(claimDate({ claimKind: 'ot_shift', date: '2026-11-09', workDate: null }), '2026-11-09')
  assert.equal(claimDate({ claimKind: 'birthday', date: null, workDate: null }), null)
})

test('an OT credit draft: quarters never above what the OT earns, starting on the most', () => {
  const d = claimDraftFor(item('ot-3630'))!
  assert.equal(d.kind, 'ot_shift')
  assert.equal(d.date, '2026-11-09')
  assert.equal(d.overtimeRecordId, 3630)
  assert.deepEqual(d.shiftOptions!.map((c) => c.enabled), [true, true, false, false])
  assert.equal(d.defaultShifts, 0.5)
  assert.equal(d.title, 'Claim OT credit')
  assert.match(d.summary, /Mon, 9 Nov 2026: 3 h 40 min past your shift end/)
  assert.match(d.note, /up to 0\.50 shift/)
  // a suggestion that is not a quarter is rounded down; below 0.25 there is nothing to claim
  assert.equal(claimDraftFor({ ...item('ot-3630'), suggestedShifts: 0.6 })!.defaultShifts, 0.5)
  assert.equal(claimDraftFor({ ...item('ot-3630'), suggestedShifts: 0.2, shifts: 0.2 }), null)
  // more than one shift is capped at 1.00
  assert.equal(claimDraftFor({ ...item('ot-3630'), suggestedShifts: 1.5 })!.defaultShifts, 1)
})

test('an OT allowance draft has no shifts; holiday work picks any quarter; a birthday credits 1.00', () => {
  const a = claimDraftFor(item('ot-3625'))!
  assert.equal(a.kind, 'ot_allowance')
  assert.equal(a.shiftOptions, null)
  assert.equal(a.fixedShifts, null)
  assert.equal(a.minutes, 30)
  assert.match(a.summary, /a 30 min late-in allowance/)
  assert.match(a.note, /next working day after Thu, 12 Nov 2026/)

  const h = claimDraftFor(item('hwd-2026-11-16'))!
  assert.equal(h.kind, 'holiday_work')
  assert.equal(h.date, '2026-11-16')
  assert.equal(h.overtimeRecordId, null)
  assert.deepEqual(h.shiftOptions!.map((c) => c.enabled), [true, true, true, true])
  assert.equal(h.defaultShifts, 1)
  assert.equal(claimDraftFor({ ...item('hwd-2026-11-16'), suggestedShifts: 0.5 })!.defaultShifts, 0.5)

  const b = claimDraftFor(item('bdc-2026-11-03'))!
  assert.equal(b.kind, 'birthday')
  assert.equal(b.shiftOptions, null)
  assert.equal(b.fixedShifts, 1)
  assert.match(b.note, /1\.00 shift is added/)

  assert.equal(claimDraftFor(item('hw-2421')), null, 'not claimable: no kind')
})

test('the claim body: kind, date, record id, shifts only where picked, a trimmed reason', () => {
  const ot = claimDraftFor(item('ot-3630'))!
  assert.deepEqual(buildClaimBody(ot, 0.5, '  Stayed for the audit  '), {
    ok: true,
    body: { kind: 'ot_shift', date: '2026-11-09', overtimeRecordId: 3630, shifts: 0.5, reason: 'Stayed for the audit' },
  })
  assert.deepEqual(buildClaimBody(ot, 0.75, 'Stayed for the audit'), { ok: false, field: 'shifts', error: 'You can claim up to 0.50 shift.' })
  assert.deepEqual(buildClaimBody(ot, null, 'Stayed for the audit'), { ok: false, field: 'shifts', error: 'Choose how much to claim.' })
  assert.deepEqual(buildClaimBody(ot, 0.3, 'Stayed for the audit'), { ok: false, field: 'shifts', error: 'Choose how much to claim.' })
  assert.deepEqual(buildClaimBody(ot, 0.5, ' ab '), { ok: false, field: 'reason', error: REASON_SHORT_MESSAGE })
  assert.equal(buildClaimBody(ot, 0.5, 'x'.repeat(301)).ok, false)

  const allowance = claimDraftFor(item('ot-3625'))!
  assert.deepEqual(buildClaimBody(allowance, 0.5, 'Line stoppage'), {
    ok: true,
    body: { kind: 'ot_allowance', date: '2026-11-12', overtimeRecordId: 3625, reason: 'Line stoppage' },
  })
  const birthday = claimDraftFor(item('bdc-2026-11-03'))!
  assert.deepEqual(buildClaimBody(birthday, null, 'Worked on my birthday'), {
    ok: true,
    body: { kind: 'birthday', date: '2026-11-03', reason: 'Worked on my birthday' },
  })
  const sunday = claimDraftFor(item('hwd-2026-11-16'))!
  assert.deepEqual(buildClaimBody(sunday, 0.75, 'Dispatch work'), {
    ok: true,
    body: { kind: 'holiday_work', date: '2026-11-16', shifts: 0.75, reason: 'Dispatch work' },
  })
})

test('use my balance: available = balance - waiting, quarters up to it (max 1.00), shown only with self-claims', () => {
  const m = model()
  assert.deepEqual(m.useBalance, { allowed: true, balanceShifts: 1.5, pendingShifts: 0.5, availableShifts: 1, message: null })
  assert.equal(availableToUse(m.useBalance, 1.5), 1)
  assert.equal(availableToUse(null, 0.75), 0.75)
  assert.equal(availableToUse({ allowed: true, balanceShifts: 1, pendingShifts: 2, availableShifts: 0, message: null }, 1), 0)
  assert.deepEqual(useBalanceChoices(0.5).map((c) => c.enabled), [true, true, false, false])
  assert.deepEqual(useBalanceChoices(3).map((c) => c.enabled), [true, true, true, true])
  assert.deepEqual(useBalanceChoices(0.2).map((c) => c.enabled), [false, false, false, false])
  assert.equal(useBalanceLine(m.useBalance, 1.5), 'Balance 1.50 shifts · waiting 0.50 shift · available 1.00 shift')
  assert.equal(useBalanceLine({ allowed: true, balanceShifts: 0.5, pendingShifts: 0, availableShifts: 0.5, message: null }, 0.5), 'Balance 0.50 shift · available 0.50 shift')

  assert.deepEqual(useBalanceState(true, m.useBalance, 1.5), { shown: true, enabled: true, why: null })
  assert.deepEqual(useBalanceState(null, m.useBalance, 1.5), { shown: false, enabled: false, why: null })
  assert.deepEqual(useBalanceState(true, null, 1.5), { shown: false, enabled: false, why: null })
  assert.deepEqual(useBalanceState(true, { ...m.useBalance!, allowed: false, message: 'Using the balance is switched off.' }, 1.5), {
    shown: true, enabled: false, why: 'Using the balance is switched off.',
  })
  assert.equal(useBalanceState(true, { allowed: true, balanceShifts: 0.5, pendingShifts: 0.5, availableShifts: 0, message: null }, 0.5).why,
    'Everything in your balance is already asked for in requests that wait for your Department Head.')
  assert.equal(useBalanceState(true, { allowed: true, balanceShifts: 0, pendingShifts: 0, availableShifts: 0, message: null }, 0).why,
    'Your balance is empty: there is nothing to use yet.')
})

test('the use-balance body: a date in the request window, quarters within what is available, a reason', () => {
  const now = new Date(2026, 10, 19) // 19 Nov 2026: the window is November only
  assert.deepEqual(buildUseBody('2026-11-24', 0.5, ' Family function ', 1, now), {
    ok: true, body: { date: '2026-11-24', shifts: 0.5, reason: 'Family function' },
  })
  const outside = buildUseBody('2026-10-30', 0.5, 'Family function', 1, now)
  assert.equal(outside.ok, false)
  assert.equal(!outside.ok && outside.field, 'date')
  assert.equal(!outside.ok && outside.error, 'You can only request dates in November 2026.')
  assert.deepEqual(buildUseBody('2026-11-24', 0.75, 'Family function', 0.5, now), { ok: false, field: 'shifts', error: 'You have 0.50 shift available to use.' })
  assert.deepEqual(buildUseBody('2026-11-24', 0.3, 'Family function', 1, now), { ok: false, field: 'shifts', error: 'Choose how much of your balance to use.' })
  assert.deepEqual(buildUseBody('2026-11-24', null, 'Family function', 1, now), { ok: false, field: 'shifts', error: 'Choose how much of your balance to use.' })
  assert.deepEqual(buildUseBody('2026-11-24', 0.5, 'no', 1, now), { ok: false, field: 'reason', error: REASON_SHORT_MESSAGE })
  // on the 1st-5th last month is open too
  assert.equal(buildUseBody('2026-10-30', 0.25, 'Family function', 1, new Date(2026, 10, 3)).ok, true)
})

const CLAIMS = {
  items: [
    { id: 77, kind: 'ot_shift', status: 'pending', statusLabel: 'Waiting for your Department Head', date: '2026-11-10', shifts: 0.75, reason: 'Audit', raisedByRole: 'employee', createdAt: '2026-11-11T09:00:00+05:30', overtime: { date: '2026-11-10', shiftEnd: '18:00', lastPunch: '23:00', extraMinutes: 300 } },
    { id: 78, kind: 'use_balance', status: 'pending', date: '2026-11-24', useDate: '2026-11-24', shifts: 0.5, reason: 'Family', raisedByRole: 'employee', createdAt: '2026-11-18T10:00:00+05:30', canWithdraw: true },
    { id: 60, kind: 'holiday_work', status: 'approved', workDate: '2026-11-01', dayKind: 'sunday', shifts: 1, reason: 'Dispatch', raisedByRole: 'hr', requestedBy: 'Meena', createdAt: '2026-11-02T10:00:00+05:30', reviewedBy: 'Kavya' },
    { id: 61, kind: 'ot_allowance', status: 'rejected', date: '2026-11-05', minutes: 30, reason: 'Late', raisedByRole: 'employee', createdAt: '2026-11-06T10:00:00+05:30', reviewedBy: 'Kavya', reviewComment: 'Not on the roster' },
    { id: 62, kind: 'birthday', status: 'pending', date: '2026-11-03', shifts: 1, reason: 'Worked', raisedByRole: 'hr', createdAt: '2026-11-04T10:00:00+05:30' },
    { id: 63, kind: 'night_bonus', kindLabel: 'Night bonus', status: 'withdrawn', date: '2026-11-07', createdAt: '2026-11-08T10:00:00+05:30' },
    { id: 'x', kind: 'ot_shift', status: 'pending' },
    null,
  ],
}

test('My claims: any list shape, rows that do not parse left out, newest first', () => {
  const list = normalizeMyClaims(CLAIMS)!
  assert.deepEqual(list.map((c) => c.id), [78, 77, 63, 61, 62, 60])
  assert.deepEqual(normalizeMyClaims(CLAIMS.items)!.map((c) => c.id), list.map((c) => c.id))
  assert.deepEqual(normalizeMyClaims({ claims: [{ id: 5, status: 'pending' }] })!.map((c) => c.kind), ['holiday_work'])
  assert.deepEqual(normalizeMyClaims({ results: [] }), [])
  for (const bad of [null, undefined, 'Not Found', 404, {}, { items: 'x' }]) assert.equal(normalizeMyClaims(bad), null, String(bad))
  const byId = new Map(list.map((c) => [c.id, c]))
  const ot = byId.get(77)!
  assert.equal(ot.kindLabel, 'OT credit')
  assert.equal(ot.overtime?.extraMinutes, 300)
  assert.equal(ot.canWithdraw, true, 'pending and raised by the employee')
  assert.equal(byId.get(62)!.canWithdraw, false, 'HR raised it: the employee does not withdraw it')
  assert.equal(byId.get(60)!.canWithdraw, false, 'already decided')
  assert.equal(byId.get(78)!.date, '2026-11-24')
  assert.equal(byId.get(63)!.kind, null)
  assert.equal(byId.get(63)!.kindLabel, 'Night bonus')
  assert.equal(byId.get(63)!.statusLabel, 'Withdrawn')
  assert.equal(byId.get(61)!.statusLabel, 'Not approved')
  // the server may say no even to a waiting claim
  assert.equal(normalizeMyClaims([{ id: 9, kind: 'ot_shift', status: 'pending', raisedByRole: 'employee', canWithdraw: false }])![0].canWithdraw, false)
  assert.equal(normalizeMyClaims([{ id: 9, kind: 'ot_shift', status: 'approved', canWithdraw: true }])![0].canWithdraw, false)
})

test('My claims: filters, counts, titles, facts and the decision line', () => {
  const list = normalizeMyClaims(CLAIMS)!
  assert.deepEqual(claimCounts(list), { all: 6, pending: 3, approved: 1, rejected: 1 })
  assert.deepEqual(filterClaims(list, 'pending').map((c) => c.id), [78, 77, 62])
  assert.equal(filterClaims(list, 'all').length, 6)
  assert.equal(claimFilterOf('withdrawn'), 'all')
  const byId = new Map(list.map((c) => [c.id, c]))
  assert.equal(myClaimTitle(byId.get(77)!), 'OT credit: 0.75 shift')
  assert.equal(myClaimTitle(byId.get(61)!), 'OT allowance: 30 min')
  assert.equal(myClaimTitle(byId.get(60)!), 'Sunday work: 1.00 shift')
  assert.equal(myClaimTitle(byId.get(78)!), 'Use balance: 0.50 shift')
  assert.equal(myClaimTitle(byId.get(63)!), 'Night bonus')
  assert.deepEqual(myClaimFacts(byId.get(77)!).map((f) => f.text), ['OT on Tue, 10 Nov 2026', '5 h past shift end', 'Raised by you'])
  assert.deepEqual(myClaimFacts(byId.get(78)!).map((f) => f.text), ['Day off Tue, 24 Nov 2026', 'Raised by you'])
  assert.deepEqual(myClaimFacts(byId.get(60)!).map((f) => f.text), ['Worked Sun, 1 Nov 2026', 'Raised by HR (Meena)'])
  assert.equal(myClaimDecisionLine(byId.get(61)!), 'Not approved by Kavya: Not on the roster')
  assert.equal(myClaimDecisionLine(byId.get(60)!), 'Approved by Kavya.')
  assert.equal(myClaimDecisionLine(byId.get(77)!), null)
})

test('a notification\'s claim id belongs to ONE card: the "hw-<id>" row first, else the item the claim was made for', () => {
  const rows = [
    { key: 'ot-1', claim: { id: 5 } },
    { key: 'hw-5', claim: null },
    { key: 'ot-2', claim: { id: 6 } },
    { key: 'ot-3', claim: { id: 6 } },
    { key: 'win-9' },
    { key: 'hw-7' },
  ]
  const ids = claimFocusIds(rows)
  assert.equal(ids.get('hw-5'), 5)
  assert.equal(ids.get('ot-1'), undefined)
  assert.equal(ids.get('ot-2'), 6)
  assert.equal(ids.get('ot-3'), undefined)
  assert.equal(ids.get('hw-7'), 7)
  assert.equal(ids.get('win-9'), undefined)
  // the item list of a reply: the waiting OT claim 77 is the OT day's card
  assert.equal(claimFocusIds(model().items).get('ot-3640'), 77)
  assert.equal(claimFocusIds(model().items).get('hw-2421'), 2421)
})

test('a refusal is shown in the server\'s words; no answer at all says so', () => {
  assert.equal(claimErrorMessage({ response: { status: 409, data: { error: 'You already claimed this day.', code: 'already_claimed' } } }, 'x'), 'You already claimed this day.')
  assert.equal(claimErrorMessage({ response: { status: 400, data: { message: 'Too old to claim.' } } }, 'x'), 'Too old to claim.')
  assert.equal(claimErrorMessage({ response: { status: 400, data: { detail: 'Not allowed.' } } }, 'x'), 'Not allowed.')
  assert.equal(claimErrorMessage({ response: { status: 500, data: '<html>Server Error</html>' } }, 'Could not send.'), 'Could not send.')
  assert.equal(claimErrorMessage({ response: { status: 500, data: {} } }, 'Could not send.'), 'Could not send.')
  assert.equal(claimErrorMessage({ isAxiosError: true, request: {}, code: 'ERR_NETWORK' }, 'x'), NO_CONNECTION_MESSAGE)
  assert.equal(claimErrorMessage(new Error('boom'), 'Could not send.'), 'Could not send.')
  assert.equal(claimErrorMessage(null, 'Could not send.'), 'Could not send.')
})
