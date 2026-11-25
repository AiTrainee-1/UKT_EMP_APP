import assert from 'node:assert/strict'
import test from 'node:test'
import { BLOCKED_TITLE, CONFIRM_MESSAGE, decideSignOut, signOutConfirmMessage } from './signOutGuard.ts'

test('an active On-Duty track on the server blocks signing out', () => {
  const d = decideSignOut({ server: { supported: true, active: true }, collectorRunning: false })
  assert.equal(d.allowed, false)
  if (!d.allowed) {
    assert.equal(d.title, BLOCKED_TITLE)
    assert.match(d.message, /mark it Done/)
  }
})

test('no active track on the server allows it, even if a leftover recorder is still running', () => {
  assert.deepEqual(decideSignOut({ server: { supported: true, active: false }, collectorRunning: true }), { allowed: true })
})

test('offline: the phone recorder decides', () => {
  assert.equal(decideSignOut({ server: null, collectorRunning: true }).allowed, false)
  assert.equal(decideSignOut({ server: null, collectorRunning: false }).allowed, true)
  assert.equal(decideSignOut({ server: null, collectorRunning: null }).allowed, true)
})

test('a server without tracking falls back to the phone too', () => {
  assert.equal(decideSignOut({ server: { supported: false, active: false }, collectorRunning: true }).allowed, false)
  assert.equal(decideSignOut({ server: { supported: false, active: false }, collectorRunning: false }).allowed, true)
})

test('the confirmation warns about offline items still waiting, else asks plainly', () => {
  assert.equal(signOutConfirmMessage(0), CONFIRM_MESSAGE)
  assert.match(signOutConfirmMessage(3), /^3 item\(s\) you did offline are still saved on this phone/)
  assert.match(signOutConfirmMessage(3), /Logout anyway\?$/)
})
