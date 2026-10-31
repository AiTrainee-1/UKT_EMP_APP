// Run with `npm test`. When a stored sign-in survives start-up / reconnect and when it is cleared: only a refusal from
// the server itself signs the employee out; no internet, timeouts and server trouble never do.
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_ROLE,
  classifySessionError,
  classifySessionResponse,
  sessionAction,
  startupPlan,
  storedSessionUser,
  verifiedSessionUser,
} from './networkSession.ts'

const axiosNetworkError = { isAxiosError: true, message: 'Network Error', code: 'ERR_NETWORK' }
const axiosTimeout = { isAxiosError: true, message: 'timeout of 15000ms exceeded', code: 'ECONNABORTED' }
const withStatus = (status: number, data: unknown = {}) => ({ isAxiosError: true, response: { status, data } })

test('401 from the server ends the session', () => {
  assert.equal(classifySessionError(withStatus(401, { error: 'Invalid or expired token' })), 'invalid')
  assert.equal(classifySessionError(withStatus(401, { error: 'Session revoked' })), 'invalid')
  assert.equal(classifySessionError(withStatus(401, '')), 'invalid')
})

test("403 counts only when it is the server's own refusal", () => {
  assert.equal(classifySessionError(withStatus(403, { error: 'This token cannot be used here' })), 'invalid')
  // a proxy / Wi-Fi sign-in page answering 403 with HTML says nothing about the token
  assert.equal(classifySessionError(withStatus(403, '<html>Blocked</html>')), 'unverified')
  assert.equal(classifySessionError(withStatus(403, null)), 'unverified')
})

test('no internet, timeouts, DNS failures and server trouble never sign out', () => {
  assert.equal(classifySessionError(axiosNetworkError), 'unverified')
  assert.equal(classifySessionError(axiosTimeout), 'unverified')
  assert.equal(classifySessionError({ isAxiosError: true, code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' }), 'unverified')
  for (const status of [500, 502, 503, 504, 404, 429, 400]) {
    assert.equal(classifySessionError(withStatus(status)), 'unverified', `status ${status}`)
  }
  assert.equal(classifySessionError({ code: 'ERR_CANCELED', response: { status: 401 } }), 'unverified')
  assert.equal(classifySessionError(new Error('boom')), 'unverified')
  assert.equal(classifySessionError(null), 'unverified')
  assert.equal(classifySessionError('Network Error'), 'unverified')
})

test('a 200 counts only when it looks like /auth/me', () => {
  assert.equal(classifySessionResponse({ role: 'employee', employeeId: 7, name: 'A' }), 'valid')
  assert.equal(classifySessionResponse('<html>Sign in to Wi-Fi</html>'), 'unverified')
  assert.equal(classifySessionResponse({}), 'unverified')
  assert.equal(classifySessionResponse({ role: '' }), 'unverified')
  assert.equal(classifySessionResponse(null), 'unverified')
})

test('stored user needs a real employee id', () => {
  assert.deepEqual(storedSessionUser(12, 'Priya'), { employeeId: 12, name: 'Priya', role: DEFAULT_ROLE })
  assert.deepEqual(storedSessionUser(12, null), { employeeId: 12, name: '', role: DEFAULT_ROLE })
  assert.equal(storedSessionUser(null, 'Priya'), null)
  assert.equal(storedSessionUser(Number.NaN, 'Priya'), null)
  assert.equal(storedSessionUser(0, 'Priya'), null)
})

test('verified user keeps the stored id and name and takes the server role', () => {
  const stored = storedSessionUser(12, 'Priya')
  assert.deepEqual(verifiedSessionUser(stored, { role: 'employee', employeeId: 99, name: 'X' }), {
    employeeId: 12,
    name: 'Priya',
    role: 'employee',
  })
  // the phone lost the id: the server's fills in
  assert.deepEqual(verifiedSessionUser(null, { role: 'employee', employeeId: 31, name: 'Ravi' }), {
    employeeId: 31,
    name: 'Ravi',
    role: 'employee',
  })
  assert.equal(verifiedSessionUser(null, { role: 'employee' }), null)
})

test('start-up plan', () => {
  assert.equal(startupPlan({ hasToken: false, hasStoredUser: false, online: false }), 'login')
  assert.equal(startupPlan({ hasToken: false, hasStoredUser: true, online: true }), 'login')
  // offline with a stored sign-in: straight to Home, no waiting for a request to time out
  assert.equal(startupPlan({ hasToken: true, hasStoredUser: true, online: false }), 'open-stored')
  assert.equal(startupPlan({ hasToken: true, hasStoredUser: false, online: false }), 'login-keep-token')
  assert.equal(startupPlan({ hasToken: true, hasStoredUser: true, online: true }), 'verify')
  // not known yet counts as online
  assert.equal(startupPlan({ hasToken: true, hasStoredUser: true, online: null }), 'verify')
})

test('session action after the check', () => {
  const stored = storedSessionUser(12, 'Priya')
  assert.deepEqual(sessionAction('invalid', stored), { kind: 'sign-out' })
  assert.deepEqual(sessionAction('unverified', stored), { kind: 'signed-in', user: stored })
  assert.deepEqual(sessionAction('valid', stored, { role: 'employee' }), { kind: 'signed-in', user: stored })
  assert.deepEqual(sessionAction('unverified', null), { kind: 'login-keep-token' })
  assert.deepEqual(sessionAction('valid', null, { role: 'employee', employeeId: 5, name: 'K' }), {
    kind: 'signed-in',
    user: { employeeId: 5, name: 'K', role: 'employee' },
  })
})

test('every network-type failure keeps the session (end to end)', () => {
  const stored = storedSessionUser(12, 'Priya')
  for (const err of [axiosNetworkError, axiosTimeout, withStatus(502), withStatus(503), withStatus(500)]) {
    assert.deepEqual(sessionAction(classifySessionError(err), stored), { kind: 'signed-in', user: stored })
  }
  assert.deepEqual(sessionAction(classifySessionError(withStatus(401)), stored), { kind: 'sign-out' })
})
