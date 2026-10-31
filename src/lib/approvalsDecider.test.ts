// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import { deciderForAdvance, deciderFromApproval, deciderFromFields, deciderFromStamps, deciderText, roleOf } from './approvalsDecider.ts'

const W = (iso: string) => `@${iso.slice(11, 16)}`
const step = (o: Record<string, unknown>) => ({ roles: ['hod'], mandatory: true, index: 0, state: 'waiting', ...o })
const block = (steps: unknown[], o: Record<string, unknown> = {}) =>
  ({ workflow: 'leave', label: 'Leave', enabled: true, steps, currentStep: null, waitingFor: [], canAct: { hod: false, hr: false }, ...o }) as any

test('the final approver: the step decided last, with its role, name and time', () => {
  const a = block([
    step({ index: 0, roles: ['hod'], state: 'approved', by: 'Kavya', at: '2026-10-30T09:00:00Z', decidedBy: 'hod' }),
    step({ index: 1, roles: ['hr'], state: 'approved', by: 'Meena', at: '2026-10-31T10:05:00Z', decidedBy: 'hr' }),
  ])
  const d = deciderFromApproval(a)!
  assert.deepEqual(d, { decision: 'approved', role: 'hr', name: 'Meena', at: '2026-10-31T10:05:00Z' })
  assert.equal(deciderText(d, W), 'Approved by HR (Meena) · @10:05')
})

test('a shared "HOD or HR" step says which of the two decided', () => {
  const a = block([step({ roles: ['hod', 'hr'], state: 'approved', by: 'Kavya', decidedBy: 'hod' })])
  assert.equal(deciderText(deciderFromApproval(a)!, W), 'Approved by Department Head (Kavya)')
})

test('a rejection names the step that rejected', () => {
  const a = block([
    step({ index: 0, state: 'approved', by: 'Kavya', at: '2026-10-30T09:00:00Z' }),
    step({ index: 1, roles: ['hr'], state: 'rejected', by: 'Meena', at: '2026-10-31T10:05:00Z' }),
  ])
  assert.equal(deciderText(deciderFromApproval(a)!, W), 'Rejected by HR (Meena) · @10:05')
})

test('nothing while the request waits, without a block, or when the block cannot say', () => {
  assert.equal(deciderFromApproval(null), null)
  assert.equal(deciderFromApproval(block([step({ state: 'pending' })], { currentStep: 0, waitingFor: ['hod'] })), null)
  // An old row: every step skipped, nobody named.
  assert.equal(deciderFromApproval(block([step({ state: 'skipped' })])), null)
  // An old REJECTED row whose stamps only kept approvals: never "Approved by ...".
  assert.equal(
    deciderFromApproval(block([step({ index: 0, state: 'approved', by: 'Kavya' }), step({ index: 1, roles: ['hr'], state: 'waiting' })])),
    null,
  )
})

test('old requests: the fields they kept', () => {
  assert.deepEqual(deciderFromFields({ status: 'approved', name: 'Meena', role: 'hr', at: '2026-10-31T10:05:00Z' }), {
    decision: 'approved',
    role: 'hr',
    name: 'Meena',
    at: '2026-10-31T10:05:00Z',
  })
  assert.deepEqual(deciderFromFields({ status: 'rejected', name: 'dept_head' }), { decision: 'rejected', role: 'hod', name: null, at: null })
  assert.equal(deciderFromFields({ status: 'pending', name: 'Meena' }), null)
  assert.equal(deciderFromFields({ status: 'approved' }), null)
  assert.equal(deciderFromFields({ status: 'approved', name: 'system' }), null)
  assert.equal(deciderFromFields({ status: 'closed', name: 'Meena' })!.decision, 'approved')
  assert.equal(roleOf('DEPT_HEAD'), 'hod')
  assert.equal(roleOf('system'), null)
})

test('the wording', () => {
  assert.equal(deciderText({ decision: 'approved', role: null, name: null, at: null, you: true }), 'Approved by you')
  assert.equal(deciderText({ decision: 'rejected', role: 'hod', name: null, at: null }), 'Rejected by Department Head')
  assert.equal(deciderText({ decision: 'approved', role: null, name: 'Old Boss', at: null }), 'Approved by Old Boss')
  assert.equal(deciderText({ decision: 'approved', role: null, name: null, at: null }), 'Approved')
  assert.equal(deciderText({ decision: 'approved', role: 'hr', name: 'Meena', at: 'bad' }), 'Approved by HR (Meena)')
})

test('old Missing Punch / On-Duty stamps and settlements', () => {
  assert.deepEqual(deciderFromStamps({ status: 'rejected', hodBy: 'Kavya', hodAt: 'x' }), { decision: 'rejected', role: 'hod', name: 'Kavya', at: 'x' })
  assert.deepEqual(deciderFromStamps({ status: 'approved', hodBy: 'Kavya', hrBy: 'Meena' }), { decision: 'approved', role: 'hr', name: 'Meena', at: null })
  assert.equal(deciderFromStamps({ status: 'pending_hr', hodBy: 'Kavya' }), null)
  assert.equal(deciderFromStamps({ status: 'completed', hrBy: 'Meena' })!.decision, 'approved')
  assert.deepEqual(deciderForAdvance({ status: 'closed', approvedBy: 'Meena', approvedAt: 't' }), { decision: 'approved', role: 'hr', name: 'Meena', at: 't' })
  assert.deepEqual(
    deciderForAdvance({ status: 'rejected', approvedBy: null, timeline: [{ kind: 'applied' }, { kind: 'rejected', by: 'Meena', at: 't2' }] }),
    { decision: 'rejected', role: 'hr', name: 'Meena', at: 't2' },
  )
  // HR alone decides: even without a name it is "Approved by HR".
  assert.equal(deciderText(deciderForAdvance({ status: 'approved' })!), 'Approved by HR')
  assert.equal(deciderForAdvance({ status: 'pending', approvedBy: 'Meena' }), null)
})
