// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import { COMPENSATION_TONES, DAY_TONES, RING } from './attendanceVisual.ts'
import {
  HR_BADGE,
  HR_EDIT_TONE,
  cellMarksOf,
  hrBadgeColors,
  hrBadgeOf,
  hrChangeText,
  hrEditA11y,
  hrEditCounts,
  hrEditNote,
  hrEditRows,
  hrEditSummary,
  hrEditTitle,
  hrEditsByDate,
  hrMonthLine,
  hrSideText,
  hrStageTitle,
  hrStageTone,
  hrWhenText,
  isHrColoured,
  readHrEdit,
  type HrEdit,
} from './hrEdit.ts'

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

const raw = (over: Record<string, unknown> = {}) => ({
  requestId: 41,
  status: 'waiting_hr',
  stageLabel: 'Waiting for HR (Department Head Suresh Raj approved on 02 Nov 2026)',
  from: { label: 'Absent', shifts: 0 },
  to: { label: 'Present', shifts: 1 },
  option: 'worked',
  type: 'present',
  typeLabel: 'Present',
  reason: 'Biometric was down, worked the full day',
  comment: null,
  raisedBy: 'Meena',
  raisedAt: at(2026, 11, 2, 10, 5),
  decidedBy: null,
  decidedAt: null,
  ...over,
})

const edit = (over: Record<string, unknown> = {}): HrEdit => readHrEdit(raw(over))!

test('no hrEdit (null, missing, an older server) reads as not edited', () => {
  assert.equal(readHrEdit(null), null)
  assert.equal(readHrEdit(undefined), null)
  assert.equal(readHrEdit('applied'), null)
  assert.equal(readHrEdit([1]), null)
  assert.equal(hrBadgeOf(null), null)
  assert.equal(isHrColoured(undefined), false)
})

test('the server block is read defensively', () => {
  const e = edit()
  assert.equal(e.requestId, 41)
  assert.equal(e.status, 'waiting_hr')
  assert.deepEqual(e.from, { label: 'Absent', shifts: 0 })
  assert.deepEqual(e.to, { label: 'Present', shifts: 1 })
  // wrong types read as not sent; an unknown status is still an edit
  const odd = readHrEdit({ status: 'escalated', from: 'x', to: { label: 'Late', shifts: '1.00' }, reason: '  ', typeLabel: 7 })!
  assert.equal(odd.status, 'unknown')
  assert.deepEqual(odd.from, { label: 'Not recorded', shifts: null })
  assert.deepEqual(odd.to, { label: 'Late', shifts: 1 })
  assert.equal(odd.reason, null)
  assert.equal(odd.typeLabel, 'Late') // falls back on the "to" label
  assert.equal(hrBadgeOf(odd), 'waiting')
  assert.equal(hrStageTitle(odd), 'In approval')
})

test('the "!" is shown for every stage; the colour only once applied', () => {
  assert.equal(hrBadgeOf(edit({ status: 'waiting_hod' })), 'waiting')
  assert.equal(hrBadgeOf(edit({ status: 'waiting_hr' })), 'waiting')
  assert.equal(hrBadgeOf(edit({ status: 'applied' })), 'applied')
  assert.equal(hrBadgeOf(edit({ status: 'rejected' })), 'rejected')
  assert.equal(isHrColoured(edit({ status: 'applied' })), true)
  for (const s of ['waiting_hod', 'waiting_hr', 'rejected']) assert.equal(isHrColoured(edit({ status: s })), false)
})

test('the colours are exactly the web app\'s', () => {
  assert.deepEqual(
    [HR_EDIT_TONE.solidLight, HR_EDIT_TONE.solidDark, HR_EDIT_TONE.fillLight, HR_EDIT_TONE.fillDark, HR_EDIT_TONE.inkLight, HR_EDIT_TONE.inkDark],
    ['#6366F1', '#818CF8', '#E0E7FF', '#6366F138', '#3730A3', '#C7D2FE'],
  )
  assert.deepEqual(HR_BADGE.applied, { light: { bg: '#4F46E5', fg: '#FFFFFF' }, dark: { bg: '#818CF8', fg: '#1E1B4B' } })
})

test('the HR outline and fill are used by no other kind of day, ring or compensation', () => {
  const taken = new Set<string>([
    ...Object.values(DAY_TONES).flatMap((t) => [t.solid, t.fillLight, t.fillDark]),
    ...Object.values(COMPENSATION_TONES).flatMap((t) => [t.solid, t.softLight, t.softDark]),
    RING.late,
    RING.earlyOut,
  ].map((c) => c.toUpperCase()))
  for (const c of [HR_EDIT_TONE.solidLight, HR_EDIT_TONE.solidDark, HR_EDIT_TONE.fillLight, HR_EDIT_TONE.fillDark]) {
    assert.equal(taken.has(c.toUpperCase()), false, `${c} is already used`)
  }
})

test('badge colours: applied indigo, waiting amber, rejected rose (both themes)', () => {
  assert.deepEqual(hrBadgeColors('applied', false), { bg: '#4F46E5', fg: '#FFFFFF', border: '#FFFFFF' })
  assert.deepEqual(hrBadgeColors('applied', true), { bg: '#818CF8', fg: '#1E1B4B', border: '#0F172A' })
  assert.equal(hrBadgeColors('waiting', false).bg, '#F59E0B')
  assert.equal(hrBadgeColors('waiting', true).bg, '#FBBF24')
  assert.equal(hrBadgeColors('rejected', false).bg, '#E11D48')
  assert.equal(hrBadgeColors('rejected', true).bg, '#FB7185')
})

const detect = { lateIn: true, earlyOut: true }

test('cell marks: an ordinary day keeps its ring and dots', () => {
  const late = cellMarksOf({ date: '2026-11-03', status: 'Late-In', isLate: true }, detect)
  assert.deepEqual(late, { ring: RING.late, hrOutline: false, amberDot: false, earlyDot: false })
  const both = cellMarksOf({ date: '2026-11-03', status: 'Late-In', isLate: true, isEarlyOut: true }, detect)
  assert.deepEqual(both, { ring: RING.late, hrOutline: false, amberDot: false, earlyDot: true })
  // a waiting HR edit does not change the look (only the "!")
  const waiting = cellMarksOf({ date: '2026-11-03', status: 'Late-In', isLate: true, hrEdit: edit() }, detect)
  assert.equal(waiting.ring, RING.late)
  assert.equal(waiting.hrOutline, false)
})

test('cell marks: an applied HR edit takes the outline, late / early-out become dots', () => {
  const applied = edit({ status: 'applied' })
  const late = cellMarksOf({ date: '2026-11-03', status: 'Late-In', isLate: true, hrEdit: applied }, detect)
  assert.deepEqual(late, { ring: null, hrOutline: true, amberDot: true, earlyDot: false })
  const early = cellMarksOf({ date: '2026-11-03', status: 'Early-Out', isEarlyOut: true, hrEdit: applied }, detect)
  assert.deepEqual(early, { ring: null, hrOutline: true, amberDot: false, earlyDot: true })
  // a check HR switched off is not drawn, and an absent day is never late
  assert.equal(cellMarksOf({ date: '2026-11-03', status: 'Late-In', isLate: true, hrEdit: applied }, { lateIn: false, earlyOut: true }).amberDot, false)
  assert.deepEqual(
    cellMarksOf({ date: '2026-11-03', status: 'Absent', isLate: true, hrEdit: applied }, detect),
    { ring: null, hrOutline: true, amberDot: false, earlyDot: false },
  )
})

test('from -> to is said with shifts', () => {
  assert.equal(hrSideText({ label: 'Present', shifts: 1 }), 'Present (1.00 shift)')
  assert.equal(hrSideText({ label: 'Half Day', shifts: 0.5 }), 'Half Day (0.50 shift)')
  assert.equal(hrSideText({ label: 'Present', shifts: 1.5 }), 'Present (1.50 shifts)')
  assert.equal(hrSideText({ label: 'Not recorded', shifts: null }), 'Not recorded')
  assert.equal(hrChangeText(edit()), 'Absent (0.00 shift) → Present (1.00 shift)')
})

test('times are read in the phone time', () => {
  assert.equal(hrWhenText(at(2026, 11, 2, 10, 5)), '02 Nov 2026, 10:05 AM')
  assert.equal(hrWhenText(at(2026, 11, 2, 0, 0)), '02 Nov 2026, 12:00 AM')
  assert.equal(hrWhenText(at(2026, 11, 2, 15, 30)), '02 Nov 2026, 3:30 PM')
  assert.equal(hrWhenText('soon'), null)
  assert.equal(hrWhenText(null), null)
})

test('the detail rows of a waiting edit', () => {
  const rows = hrEditRows(edit())
  assert.deepEqual(rows.map((r) => r.key), ['change', 'reason', 'raised', 'stage'])
  assert.equal(rows[2].value, 'Meena · 02 Nov 2026, 10:05 AM')
  assert.equal(rows[3].value, 'Waiting for HR (Department Head Suresh Raj approved on 02 Nov 2026)')
})

test('the detail rows of an applied and a rejected edit', () => {
  const applied = hrEditRows(edit({
    status: 'applied',
    stageLabel: 'Applied - approved by Suresh Raj (Department Head) and Meena (HR) on 02 Nov 2026',
    decidedBy: 'Meena',
    decidedAt: at(2026, 11, 2, 16, 40),
    comment: 'Checked the gate register',
  }))
  assert.deepEqual(applied.map((r) => r.key), ['change', 'reason', 'raised', 'stage', 'decided', 'comment'])
  assert.equal(applied[4].label, 'Approved by')
  assert.equal(applied[4].value, 'Meena · 02 Nov 2026, 4:40 PM')

  // the stage sentence already quotes the comment: it is not said twice
  const rejected = hrEditRows(edit({
    status: 'rejected',
    stageLabel: 'Rejected by Suresh Raj (Department Head) on 02 Nov 2026: Not seen on the floor',
    decidedBy: 'Suresh Raj',
    decidedAt: at(2026, 11, 2, 12, 0),
    comment: 'Not seen on the floor',
    reason: null,
  }))
  assert.deepEqual(rejected.map((r) => r.key), ['change', 'raised', 'stage', 'decided'])
  assert.equal(rejected[3].label, 'Rejected by')
})

test('a missing stage sentence falls back on the short title; no raiser leaves the row out', () => {
  const rows = hrEditRows(edit({ stageLabel: '', raisedBy: null, raisedAt: null, status: 'waiting_hod' }))
  assert.deepEqual(rows.map((r) => r.key), ['change', 'reason', 'stage'])
  assert.equal(rows[2].value, 'Waiting for Department Head')
})

test('short words: stage title, tone, summary, screen reader', () => {
  const e = edit({ typeLabel: 'Mark as Late', status: 'waiting_hod' })
  assert.equal(hrStageTitle(e), 'Waiting for Department Head')
  assert.equal(hrStageTone(e), 'waiting')
  assert.equal(hrStageTone(edit({ status: 'applied' })), 'applied')
  assert.equal(hrStageTone(edit({ status: 'rejected' })), 'rejected')
  assert.equal(hrEditSummary(e), 'Mark as Late · Waiting for Department Head')
  assert.equal(hrEditA11y(e), 'HR edit waiting for approval: Mark as Late. Waiting for Department Head.')
  assert.equal(hrEditA11y(edit({ status: 'applied', typeLabel: 'On-Duty' })), 'Edited by HR: On-Duty. Applied.')
})

test('the section title follows the web popover', () => {
  assert.equal(hrEditTitle(edit({ status: 'applied' })), 'Edited by HR')
  assert.equal(hrEditTitle(edit({ status: 'waiting_hod' })), 'HR edit waiting for approval')
  assert.equal(hrEditTitle(edit({ status: 'waiting_hr' })), 'HR edit waiting for approval')
  assert.equal(hrEditTitle(edit({ status: 'rejected' })), 'HR edit rejected')
  assert.equal(hrEditTitle(edit({ status: 'escalated' })), 'HR edit waiting for approval')
})

test('the note says what the stage means for the day', () => {
  assert.match(hrEditNote(edit()), /^Not applied yet/)
  assert.match(hrEditNote(edit({ status: 'waiting_hod' })), /^Not applied yet/)
  assert.match(hrEditNote(edit({ status: 'applied' })), /^HR changed your attendance/)
  assert.match(hrEditNote(edit({ status: 'rejected' })), /stays as it was/)
})

test('edits by date, with the days the calendar draws empty, and their counts', () => {
  const applied = edit({ status: 'applied' })
  const waiting = edit()
  const byDate = hrEditsByDate(
    [
      { date: '2026-11-03', hrEdit: applied },
      { date: '2026-11-04', hrEdit: null },
      { date: '2026-11-05' },
    ],
    { '2026-11-20': waiting },
  )
  assert.deepEqual(Object.keys(byDate).sort(), ['2026-11-03', '2026-11-20'])
  assert.deepEqual(hrEditCounts(byDate), { total: 2, applied: 1, waiting: 1, rejected: 0 })
  assert.deepEqual(hrEditCounts({}), { total: 0, applied: 0, waiting: 0, rejected: 0 })
})

test('the line under the calendar (the web app\'s words)', () => {
  assert.equal(
    hrMonthLine({ total: 3, applied: 1, waiting: 1, rejected: 1 }),
    'HR changed 3 days this month: 1 applied, 1 waiting for approval, 1 rejected.',
  )
  assert.equal(hrMonthLine({ total: 1, applied: 0, waiting: 1, rejected: 0 }), 'HR changed 1 day this month: 1 waiting for approval.')
  assert.equal(hrMonthLine({ total: 2, applied: 2, waiting: 0, rejected: 0 }), 'HR changed 2 days this month: 2 applied.')
  assert.equal(hrMonthLine({ total: 0, applied: 0, waiting: 0, rejected: 0 }), null)
})
