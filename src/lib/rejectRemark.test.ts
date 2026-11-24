// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  REJECT_REMARK_MAX,
  REJECT_REMARK_MESSAGE,
  REJECT_REMARK_MIN,
  cleanRejectRemark,
  decisionComment,
  isRemarkRequiredError,
  rejectRemarkProblem,
} from './rejectRemark.ts'

test('the message and minimum are the ones the server uses', () => {
  assert.equal(REJECT_REMARK_MIN, 3)
  assert.equal(REJECT_REMARK_MESSAGE, 'Write the reason for rejecting (at least 3 characters).')
})

test('cleaning trims, collapses every run of spaces / new lines, and cuts at the server limit', () => {
  assert.equal(cleanRejectRemark('  not   on\n\n duty \t '), 'not on duty')
  assert.equal(cleanRejectRemark(null), '')
  assert.equal(cleanRejectRemark(undefined), '')
  assert.equal(cleanRejectRemark('x'.repeat(REJECT_REMARK_MAX + 50)).length, REJECT_REMARK_MAX)
})

test('a reason shorter than 3 characters after cleaning is refused; 3 or more is fine', () => {
  for (const short of ['', '   ', 'no', ' a   ', '\n\nok\n', ' \t ok \n ']) {
    assert.equal(rejectRemarkProblem(short), REJECT_REMARK_MESSAGE, JSON.stringify(short))
  }
  assert.equal(rejectRemarkProblem(null), REJECT_REMARK_MESSAGE)
  assert.equal(rejectRemarkProblem(undefined), REJECT_REMARK_MESSAGE)
  assert.equal(rejectRemarkProblem('a b'), null, 'the single space between counts, as on the server')
  assert.equal(rejectRemarkProblem(' a    b '), null, 'collapsed to "a b": 3 characters')
  assert.equal(rejectRemarkProblem('  bad  '), null)
  assert.equal(rejectRemarkProblem('Not on the duty roster'), null)
})

test("the server's refusal is recognised by its code, not by its status alone", () => {
  const refusal = { response: { status: 400, data: { error: REJECT_REMARK_MESSAGE, code: 'remark_required' } } }
  assert.equal(isRemarkRequiredError(refusal), true)
  assert.equal(isRemarkRequiredError({ response: { status: 400, data: { error: 'Already decided.' } } }), false)
  assert.equal(isRemarkRequiredError({ code: 'ERR_BAD_REQUEST', response: { status: 400, data: '<html>' } }), false)
  assert.equal(isRemarkRequiredError(new Error('Network Error')), false)
  assert.equal(isRemarkRequiredError(null), false)
  assert.equal(isRemarkRequiredError(undefined), false)
})

test('the comment sent: the cleaned reason when rejecting, what was typed (or nothing) when approving', () => {
  assert.equal(decisionComment('rejected', '  wrong   date \n'), 'wrong date')
  assert.equal(decisionComment('rejected', '   '), undefined)
  assert.equal(decisionComment('approved', '  fine\nthanks '), '  fine\nthanks ')
  assert.equal(decisionComment('approved', '   '), undefined)
  assert.equal(decisionComment('approved', ''), undefined)
})
