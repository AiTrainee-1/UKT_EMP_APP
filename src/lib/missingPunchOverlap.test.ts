import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApprovalProgress } from './approval.ts'
import { overlapNotice, punchOverlap, shortDay } from './missingPunchOverlap.ts'

const waitingFor = (role: 'hod' | 'hr'): ApprovalProgress => ({
  workflow: 'missing_punch',
  label: '',
  enabled: true,
  steps: [{ index: 0, roles: [role], mandatory: true, state: 'pending' }],
  currentStep: 0,
  waitingFor: [role],
  canAct: { hod: role === 'hod', hr: role === 'hr' },
})

const rows = [
  { id: 6, date: '2026-10-30', punchSlot: 'lunch_out', status: 'pending_hod', approval: waitingFor('hod') },
  { id: 5, date: '2026-10-30', punchSlot: 'morning_in', status: 'approved' },
  { id: 4, date: '2026-10-30', punchSlot: 'morning_in', status: 'pending_hr', approval: waitingFor('hr') },
  { id: 3, date: '2026-10-30', punchSlot: 'evening_out', status: 'rejected' },
  { id: 2, date: '2026-10-29', punchSlot: 'lunch_out', status: 'approved' },
  { id: 1, date: '2026-10-30', punchSlot: null, punchType: 'OUT', status: 'pending_hr' },
]

test('same day, same punch; rejected ones and other days are ignored', () => {
  const o = punchOverlap(rows, '2026-10-30', 'lunch_out')
  assert.deepEqual(o.same.map((r) => r.id), [6])
  assert.deepEqual(o.others.map((r) => r.id), [5, 4, 1])
  // only a rejected request for that punch: nothing to remind about
  assert.deepEqual(punchOverlap(rows, '2026-10-30', 'evening_out').same, [])
  assert.deepEqual(punchOverlap(rows, '2026-10-28', 'lunch_out'), { same: [], others: [] })
})

test('the reminder names the punch, the day and where the request is', () => {
  const n = overlapNotice(rows, '2026-10-30', 'lunch_out')
  assert.equal(
    n.repeat,
    'You already sent a request for Lunch out on 30 Oct (waiting for your Department Head). Send another only if something changed.',
  )
  // one mention per other punch (the newest), legacy rows (no slot, no pipeline info) by their type
  assert.equal(n.also, 'Also asked for this day: Morning in (approved), Check-out (waiting for approval)')
})

test('two requests for the same punch: counted, and an approved one is the one described', () => {
  const n = overlapNotice(rows, '2026-10-30', 'morning_in')
  assert.equal(n.repeat, 'You already sent 2 requests for Morning in on 30 Oct (approved). Send another only if something changed.')
})

test('a free day says nothing; a waiting request without pipeline info still reads well', () => {
  assert.deepEqual(overlapNotice(rows, '2026-10-31', 'morning_in'), { repeat: null, also: null })
  const n = overlapNotice([{ id: 9, date: '2026-10-31', punchSlot: 'evening_out', status: 'pending_hod' }], '2026-10-31', 'evening_out')
  assert.match(n.repeat ?? '', /\(waiting for approval\)/)
  assert.equal(shortDay('2026-01-05'), '5 Jan')
})
