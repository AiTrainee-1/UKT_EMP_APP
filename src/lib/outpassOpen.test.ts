import assert from 'node:assert/strict'
import test from 'node:test'
import { formatSpan, formatTicker, openKind, openPassClock, outpassRowLabel, pickOpenPass } from './outpassOpen.ts'

const NOW = Date.parse('2026-10-31T06:00:00Z')
const iso = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString()

const pending = { id: 1, status: 'pending', createdAt: iso(-10) }
const ready = { id: 2, status: 'approved', createdAt: iso(-30), approvedAt: iso(-20), expiresAt: iso(40) }
const expired = { id: 3, status: 'approved', createdAt: iso(-200), approvedAt: iso(-180), expiresAt: iso(-120) }
const out = {
  id: 4, status: 'approved', createdAt: iso(-300), approvedAt: iso(-290), expiresAt: iso(-230),
  exitedAt: iso(-280), expectedReturnAt: iso(-40),
}
const back = { ...out, id: 5, enteredAt: iso(-60) }

test('which passes are open', () => {
  assert.equal(openKind(pending, NOW), null)
  assert.equal(openKind(ready, NOW), 'ready')
  assert.equal(openKind(expired, NOW), null)
  // out through the gate long after the exit window: still open until they come back
  assert.equal(openKind(out, NOW), 'out')
  assert.equal(openKind(back, NOW), null)
  assert.equal(openKind({ ...out, status: 'rejected' }, NOW), null)
})

test('a pass that is out wins over one that is ready; newest wins inside a kind', () => {
  assert.equal(pickOpenPass([pending, ready, expired, out, back], NOW)?.id, 4)
  const newer = { ...ready, id: 6, approvedAt: iso(-5), expiresAt: iso(55) }
  assert.equal(pickOpenPass([ready, newer], NOW)?.id, 6)
  assert.equal(pickOpenPass([pending, expired, back], NOW), null)
  // the moment the exit window ends, the ready pass is no longer pinned
  assert.equal(pickOpenPass([ready], NOW + 40 * 60_000), null)
})

test('the clock of an open pass', () => {
  const c = openPassClock(out, NOW)
  assert.ok(c && c.kind === 'out')
  if (c?.kind !== 'out') return
  assert.equal(c.elapsedMs, 280 * 60_000)
  assert.equal(c.returnInMs, -40 * 60_000)
  assert.ok(c.overdue)
  assert.equal(c.progress, 1)
  const onTime = openPassClock({ ...out, expectedReturnAt: iso(40) }, NOW)
  assert.ok(onTime?.kind === 'out' && !onTime.overdue && onTime.progress === 280 / 320)
  const noReturn = openPassClock({ ...out, expectedReturnAt: null }, NOW)
  assert.ok(noReturn?.kind === 'out' && noReturn.returnInMs === null && noReturn.progress === null)
  const r = openPassClock(ready, NOW)
  assert.ok(r?.kind === 'ready' && r.exitWindowMs === 40 * 60_000 && Math.abs(r.progress - 1 / 3) < 1e-9)
  assert.equal(openPassClock(pending, NOW), null)
})

test('list badges say where the pass is at the gate', () => {
  assert.equal(outpassRowLabel({ status: 'pending' }).label, 'Waiting')
  assert.equal(outpassRowLabel({ status: 'rejected' }).label, 'Not Approved')
  assert.equal(outpassRowLabel({ status: 'approved', scanStatus: 'pending_exit' }).label, 'Ready to use')
  for (const s of ['exited', 'pending_return', 'return_expired']) assert.equal(outpassRowLabel({ status: 'approved', scanStatus: s }).label, 'Out now')
  assert.equal(outpassRowLabel({ status: 'approved', scanStatus: 'completed' }).label, 'Returned')
  assert.equal(outpassRowLabel({ status: 'approved', scanStatus: 'expired_unscanned' }).label, 'Not used')
  assert.equal(outpassRowLabel({ status: 'approved', scanStatus: 'not_applicable' }).label, 'Approved')
  // an older backend without scanStatus
  assert.equal(outpassRowLabel({ status: 'approved', exitedAt: iso(-5) }).label, 'Out now')
})

test('plain time words', () => {
  assert.equal(formatSpan(65 * 60_000), '1 h 05 min')
  assert.equal(formatSpan(12 * 60_000 + 30_000), '12 min')
  assert.equal(formatSpan(-45_000), '45 s')
  assert.equal(formatTicker(59 * 60_000 + 5_000), '59:05')
  assert.equal(formatTicker(3_725_000), '1:02:05')
})
