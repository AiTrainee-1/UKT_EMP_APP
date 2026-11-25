// Run with `npm test`. The Login screen's message for a refused password sign-in (src/lib/loginErrors.ts).
import assert from 'node:assert/strict'
import test from 'node:test'

import { GENERIC_LOGIN_TITLE, loginFailure } from './loginErrors.ts'

const refused = (data: unknown, status = 401) => ({ response: { status, data } })

test('a wrong password says so and marks the Password field', () => {
  const f = loginFailure(refused({ error: 'Incorrect password.', code: 'wrong_password' }))
  assert.equal(f.kind, 'wrong_password')
  assert.equal(f.title, 'Incorrect password')
  assert.equal(f.message, 'Incorrect password.')
  assert.equal(f.field, 'password')
  assert.ok(f.fieldNote)
})

test('an unknown employee code says so and marks the Employee Code field', () => {
  const f = loginFailure(refused({ error: 'This employee code does not exist in HRMS.', code: 'unknown_employee' }))
  assert.equal(f.kind, 'unknown_employee')
  assert.equal(f.title, 'Employee code not found')
  assert.equal(f.message, 'This employee code does not exist in HRMS.')
  assert.equal(f.field, 'identifier')
})

test('no password yet has its own title and marks no field', () => {
  const f = loginFailure(refused({ error: 'No password set. Please set your password first.', code: 'no_password' }))
  assert.equal(f.kind, 'no_password')
  assert.equal(f.title, 'Password not set')
  assert.equal(f.field, null)
})

test('the code is read whatever its case', () => {
  assert.equal(loginFailure(refused({ error: 'x', code: ' Wrong_Password ' })).kind, 'wrong_password')
})

test("an older server (no code) and anything else keep 'Authentication Failed' with the server's sentence", () => {
  const old = loginFailure(refused({ error: 'Invalid password' }))
  assert.equal(old.kind, 'other')
  assert.equal(old.title, GENERIC_LOGIN_TITLE)
  assert.equal(old.message, 'Invalid password')
  assert.equal(old.field, null)
  assert.equal(loginFailure(refused({ detail: 'Blocked by HR', code: 'something_else' }, 403)).message, 'Blocked by HR')
  assert.equal(loginFailure(refused({})).message, 'Invalid credentials. Please try again.')
  assert.equal(loginFailure(null).kind, 'other')
})
