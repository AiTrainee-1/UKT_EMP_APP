// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cooldownText,
  countBadge,
  durationText,
  moduleIcon,
  normalizePendingRequests,
  readPendingRequest,
  readRemindResult,
  remindErrorText,
  remindLabel,
  secondsUntilRemind,
  shortDateTime,
  stepperSteps,
  waitingSince,
} from './pendingReminders.ts'

const row = {
  key: 'missing_punch-7',
  module: 'missing_punch',
  moduleLabel: 'Missing Punch',
  id: 7,
  title: 'Missing Punch · Morning Check-In',
  summary: '2026-10-30 at 09:05 · Morning Check-In',
  reason: 'Forgot',
  submittedAt: '2026-10-30T04:00:00+00:00',
  stage: 'Waiting for your Department Head (Ravi Shankar)',
  waitingFor: ['hod'],
  approver: { role: 'hod', name: 'Ravi Shankar', label: 'Department Head' },
  steps: [
    { index: 0, roles: ['hod'], label: 'Department Head', state: 'pending', by: null, at: null },
    { index: 1, roles: ['hr'], label: 'HR', state: 'waiting', by: null, at: null },
  ],
  currentStep: 0,
  trail: [],
  workflowEnabled: true,
  reminderCount: 0,
  lastRemindedAt: null,
  canRemind: true,
  nextReminderAt: null,
  remindInSeconds: 0,
}

test('a full reply is read as the server sent it', () => {
  const data = normalizePendingRequests({ items: [row], count: 1, cooldownHours: 24, serverTime: 'x' })
  assert.ok(data)
  assert.equal(data.count, 1)
  assert.equal(data.cooldownHours, 24)
  const item = data.items[0]
  assert.equal(item.key, 'missing_punch-7')
  assert.equal(item.approver.role, 'hod')
  assert.equal(item.approver.name, 'Ravi Shankar')
  assert.deepEqual(item.steps.map((s) => [s.label, s.state]), [['Department Head', 'pending'], ['HR', 'waiting']])
  assert.equal(item.canRemind, true)
  assert.equal(item.remindInSeconds, 0)
})

test('a reply that is not a list is an error; broken rows are dropped', () => {
  assert.equal(normalizePendingRequests(null), null)
  assert.equal(normalizePendingRequests('<html>'), null)
  assert.equal(normalizePendingRequests({ items: 'x' }), null)
  const data = normalizePendingRequests({ items: [row, { id: 'x' }, { module: 'leave' }, 5, null] })
  assert.ok(data)
  assert.equal(data.items.length, 1)
  assert.equal(data.count, 1)
})

test('missing fields fall back to plain words', () => {
  const item = readPendingRequest({ id: 3, module: 'request' })
  assert.ok(item)
  assert.equal(item.key, 'request-3')
  assert.equal(item.approver.role, 'hr')
  assert.equal(item.approver.name, 'HR')
  assert.equal(item.stage, 'Waiting for an answer')
  assert.equal(item.workflowEnabled, true)
  assert.equal(item.canRemind, true)
  assert.deepEqual(item.steps, [])
})

test('a cooldown from the server blocks the button and counts down from the server figure', () => {
  const item = readPendingRequest({ ...row, canRemind: false, remindInSeconds: 5 * 3600 + 12 * 60 })
  assert.ok(item)
  assert.equal(item.canRemind, false)
  const fetched = 1_000_000
  assert.equal(secondsUntilRemind(item, fetched, fetched), 18720)
  assert.equal(secondsUntilRemind(item, fetched, fetched + 60_000), 18660)
  assert.equal(secondsUntilRemind(item, fetched, fetched + 999_999_000), 0)
  // the phone clock running backwards never adds time
  assert.equal(secondsUntilRemind(item, fetched, fetched - 60_000), 18720)
  assert.equal(secondsUntilRemind({ canRemind: true, remindInSeconds: 50 }, fetched, fetched), 0)
  // canRemind true with a wait is contradictory: the wait wins
  assert.equal(readPendingRequest({ ...row, canRemind: true, remindInSeconds: 30 })?.canRemind, false)
})

test('the cooldown sentence', () => {
  assert.equal(cooldownText(5 * 3600 + 12 * 60), 'You can remind again in 5 h 12 m')
  assert.equal(cooldownText(5 * 3600 + 11 * 60 + 1), 'You can remind again in 5 h 12 m') // rounded up
  assert.equal(cooldownText(24 * 3600), 'You can remind again in 24 h 0 m')
  assert.equal(cooldownText(12 * 60), 'You can remind again in 12 m')
  assert.equal(cooldownText(30), 'You can remind again in under a minute')
  assert.equal(cooldownText(0), '')
  assert.equal(durationText(-5), '')
})

test('the button names who is reminded', () => {
  assert.equal(remindLabel({ approver: { role: 'hod', name: 'R', label: 'Department Head' } }), 'Remind Department Head')
  assert.equal(remindLabel({ approver: { role: 'hr', name: 'HR', label: 'HR' } }), 'Remind HR')
})

test('the stepper starts with the employee and marks the current step', () => {
  const item = readPendingRequest(row)
  assert.ok(item)
  assert.deepEqual(stepperSteps(item), [
    { label: 'You', state: 'submitted', current: false },
    { label: 'Department Head', state: 'pending', current: true },
    { label: 'HR', state: 'waiting', current: false },
  ])
  assert.deepEqual(stepperSteps({ steps: [] }).map((s) => s.label), ['You', 'Approver'])
  assert.equal(stepperSteps({ steps: [], raisedBy: 'hr' })[0].label, 'HR (raised it)')
})

test('icons for every kind, a default for a new one', () => {
  for (const m of ['leave', 'permission', 'casual_leave', 'missing_punch', 'on_duty', 'outpass', 'resignation', 'advance', 'request']) {
    assert.notEqual(moduleIcon(m), 'file-document-outline', m)
  }
  assert.equal(moduleIcon('something_new'), 'file-document-outline')
})

test('dates and waiting time', () => {
  assert.equal(shortDateTime(null), '')
  assert.equal(shortDateTime('nope'), '')
  assert.match(shortDateTime('2026-10-31T10:05:00'), /^31 Oct, 10:05$/)
  const now = Date.parse('2026-10-31T10:00:00Z')
  assert.equal(waitingSince('2026-10-31T09:59:30Z', now), 'Sent just now')
  assert.equal(waitingSince('2026-10-31T09:15:00Z', now), 'Waiting 45 min')
  assert.equal(waitingSince('2026-10-31T05:00:00Z', now), 'Waiting 5 h')
  assert.equal(waitingSince('2026-10-30T09:00:00Z', now), 'Waiting 1 day')
  assert.equal(waitingSince('2026-10-28T09:00:00Z', now), 'Waiting 3 days')
  assert.equal(waitingSince(null, now), '')
})

test('the reminder answer and its errors', () => {
  const ok = readRemindResult({ message: 'Reminder sent to Ravi Shankar (Department Head).', item: { ...row, canRemind: false, remindInSeconds: 86400 } })
  assert.equal(ok.message, 'Reminder sent to Ravi Shankar (Department Head).')
  assert.equal(ok.item?.canRemind, false)
  assert.deepEqual(readRemindResult(null), { message: 'Reminder sent.', item: null })

  const tooSoon = { response: { status: 429, data: { error: 'You can remind again in 23 h 59 m (01 Nov 2026, 10:00).', code: 'too_soon' } } }
  assert.equal(remindErrorText(tooSoon), 'You can remind again in 23 h 59 m (01 Nov 2026, 10:00).')
  assert.equal(remindErrorText({ response: { status: 500, data: '<html>' } }), 'The reminder could not be sent. Please try again.')
  assert.equal(remindErrorText(new Error('Network Error')), 'No connection. Check your internet and try again.')
})

test('the tab badge', () => {
  assert.equal(countBadge(0), '')
  assert.equal(countBadge(undefined), '')
  assert.equal(countBadge(3), '3')
  assert.equal(countBadge(120), '99+')
})

test('an attendance change HR raised: chip, change and details', async () => {
  const { normalizePendingRequests: norm, changeText, moduleIcon: icon } = await import('./pendingReminders.ts')
  const data = norm({
    items: [
      {
        ...row,
        key: 'attendance_correction-4',
        module: 'attendance_correction',
        id: 4,
        title: 'Attendance correction',
        raisedBy: 'hr',
        raisedByLabel: 'Raised by HR',
        raisedByName: 'Meena',
        details: [{ label: 'Date', value: '2026-10-08' }, { label: 'Raised by', value: 'Meena' }, { label: '', value: 'x' }],
        change: {
          date: '2026-10-08',
          fromLabel: 'Absent',
          fromShifts: '0.00 shift',
          toLabel: 'Present',
          toShifts: '1.00 shift',
          firstPunch: '09:00',
          lastPunch: '18:00',
          marks: ['Late'],
          text: '2026-10-08: Absent (0.00 shift) → Present (1.00 shift), 09:00 to 18:00, marked Late',
        },
      },
      row,
    ],
  })
  assert.ok(data)
  const [edit, own] = data.items
  assert.deepEqual([edit.raisedBy, edit.raisedByLabel, edit.raisedByName], ['hr', 'Raised by HR', 'Meena'])
  assert.equal(edit.change?.text, '2026-10-08: Absent (0.00 shift) → Present (1.00 shift), 09:00 to 18:00, marked Late')
  assert.equal(edit.details.length, 2)
  assert.deepEqual([own.raisedBy, own.raisedByLabel, own.raisedByName, own.change], ['employee', 'Raised by you', null, null])
  assert.notEqual(icon('attendance_correction'), 'file-document-outline')
  // an older reply without the sentence still gets one; an empty block is no change
  const parts = { date: '2026-10-08', fromLabel: 'Absent', toLabel: 'Half day', fromShifts: null, toShifts: '0.50 shift', firstPunch: null, lastPunch: null, marks: [] }
  assert.equal(changeText(parts), '2026-10-08: Absent → Half day (0.50 shift)')
  assert.equal(norm({ items: [{ ...row, change: { text: '' } }] })?.items[0].change, null)
  // no recent block from an older backend
  assert.deepEqual([data.recentHrEdits, data.recentDays], [[], 30])
})

test('recently decided HR attendance changes', async () => {
  const { normalizePendingRequests: norm, decisionLine } = await import('./pendingReminders.ts')
  const data = norm({
    items: [],
    recentDays: 30,
    recentHrEdits: [
      { id: 9, status: 'approved', statusLabel: 'Approved', decidedBy: 'Meena', decidedByRole: 'hr', decidedAt: '2026-10-30T10:05:00', raisedBy: 'hr', raisedByName: 'Meena', change: { text: '2026-10-08: Absent → Present' } },
      { id: 10, status: 'rejected', decidedByRole: 'hod', comment: 'Punches are there' },
      { id: 11, status: 'pending' },
      { status: 'approved' },
    ],
  })
  assert.ok(data)
  assert.equal(data.count, 0)
  assert.deepEqual(data.recentHrEdits.map((e) => e.id), [9, 10])
  const [a, r] = data.recentHrEdits
  assert.equal(a.raisedBy, 'hr')
  assert.equal(r.raisedByLabel, 'Raised by HR') // only HR raises these, even when the reply forgets to say so
  assert.match(decisionLine(a), /^Approved by Meena \(HR\) on 30 Oct, 10:05$/)
  assert.equal(decisionLine(r), 'Rejected by your Department Head')
  assert.equal(r.comment, 'Punches are there')
})
