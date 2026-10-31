import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyViewText,
  istDateOf,
  missingPunchViewOptions,
  monthSections,
  onDutyGroup,
  onDutyRowLabel,
  onDutyViewOptions,
  outpassDay,
  outpassViewOptions,
  permissionViewOptions,
  permissionsUsedThisMonth,
} from './myRequests.ts'
import { rowsForView, viewCounts } from './requestViews.ts'

const today = new Date(2026, 9, 31) // 31 Oct 2026
const ids = (rows: { id: number }[]) => rows.map((r) => r.id)

test('istDateOf reads server times in India time and leaves plain dates alone', () => {
  assert.equal(istDateOf('2026-10-07'), '2026-10-07')
  assert.equal(istDateOf('2026-09-30T19:00:00+00:00'), '2026-10-01') // 00:30 IST
  assert.equal(istDateOf('2026-09-30T18:00:00Z'), '2026-09-30') // 23:30 IST
  assert.equal(istDateOf('2026-10-01T00:10:00+05:30'), '2026-10-01')
  assert.equal(istDateOf('2026-10-01T00:10:00'), '2026-10-01')
  assert.equal(istDateOf('yesterday'), null)
  assert.equal(istDateOf(null), null)
})

test('missing punch: pending_hod / pending_hr wait, "sent this month" counts every status by the India send date', () => {
  const rows = [
    { id: 1, status: 'pending_hod', date: '2026-10-29', createdAt: '2026-10-29T05:00:00+00:00' },
    { id: 2, status: 'pending_hr', date: '2026-09-29', createdAt: '2026-09-30T19:30:00+00:00' }, // sent 1 Oct IST
    { id: 3, status: 'approved', date: '2026-09-20', createdAt: '2026-09-21T05:00:00+00:00' },
    { id: 4, status: 'rejected', date: '2026-10-02', createdAt: '2026-10-02T05:00:00+00:00' },
    { id: 5, status: 'approved', date: '2026-10-03', createdAt: null },
  ]
  const opts = missingPunchViewOptions<(typeof rows)[number]>(today)
  assert.deepEqual(ids(rowsForView(rows, 'waiting', opts)), [1, 2])
  assert.deepEqual(ids(rowsForView(rows, 'month', opts)), [1, 2, 4, 5])
  assert.deepEqual(ids(rowsForView(rows, 'approved', opts)), [3, 5])
  assert.deepEqual(ids(rowsForView(rows, 'rejected', opts)), [4])
  assert.deepEqual(viewCounts(rows, opts), { waiting: 2, month: 4, approved: 2, rejected: 1 })
})

test('outpass: "taken this month" is approved passes by the day they went out', () => {
  const rows = [
    { id: 1, status: 'pending', createdAt: '2026-10-30T04:00:00Z' },
    // approved on 30 Sep, went out 1 Oct (IST): taken in October
    { id: 2, status: 'approved', createdAt: '2026-09-30T04:00:00Z', approvedAt: '2026-09-30T05:00:00Z', exitedAt: '2026-09-30T19:00:00Z' },
    // approved in October, never used: still counted by its approval day
    { id: 3, status: 'approved', createdAt: '2026-10-10T04:00:00Z', approvedAt: '2026-10-10T05:00:00Z' },
    { id: 4, status: 'approved', createdAt: '2026-09-10T04:00:00Z', approvedAt: '2026-09-10T05:00:00Z', exitedAt: '2026-09-10T06:00:00Z' },
    { id: 5, status: 'rejected', createdAt: '2026-10-11T04:00:00Z' },
  ]
  const opts = outpassViewOptions<(typeof rows)[number]>(today)
  assert.deepEqual(ids(rowsForView(rows, 'waiting', opts)), [1])
  assert.deepEqual(ids(rowsForView(rows, 'month', opts)), [2, 3])
  assert.deepEqual(ids(rowsForView(rows, 'approved', opts)), [2, 3, 4])
  assert.deepEqual(ids(rowsForView(rows, 'rejected', opts)), [5])
  assert.equal(outpassDay(rows[1]), '2026-10-01')
})

test('permission: "taken this month" is approved ones for a day this month, excess included', () => {
  const rows = [
    { id: 1, status: 'Pending', date: '2026-10-30' },
    { id: 2, status: 'Approved', date: '2026-10-05' },
    { id: 3, status: 'Approved', date: '2026-09-29' },
    { id: 4, status: 'Rejected', date: '2026-10-06' },
  ]
  const opts = permissionViewOptions<(typeof rows)[number]>(today)
  assert.deepEqual(ids(rowsForView(rows, 'waiting', opts)), [1])
  assert.deepEqual(ids(rowsForView(rows, 'month', opts)), [2])
  assert.deepEqual(ids(rowsForView(rows, 'approved', opts)), [2, 3])
  assert.deepEqual(ids(rowsForView(rows, 'rejected', opts)), [4])
  assert.equal(permissionsUsedThisMonth(rows, today), 2) // pending + approved this month
})

test('on-duty: sorted by the true approval state, never by the "active" the employee is shown', () => {
  const rows = [
    // still with HR, being worked: the app shows "active", but it is WAITING
    { id: 1, status: 'active', approvalStatus: 'pending_hr', date: '2026-10-31', createdAt: '2026-10-31T03:00:00Z' },
    // still with the Department Head, day ended: shown "completed", still WAITING
    { id: 2, status: 'completed', approvalStatus: 'pending_hod', date: '2026-10-30', createdAt: '2026-10-30T03:00:00Z' },
    { id: 3, status: 'active', approvalStatus: 'active', date: '2026-10-29', createdAt: '2026-10-29T03:00:00Z' },
    { id: 4, status: 'completed', approvalStatus: 'completed', date: '2026-09-29', createdAt: '2026-09-29T03:00:00Z' },
    { id: 5, status: 'rejected', approvalStatus: 'rejected', date: '2026-10-02', createdAt: '2026-10-02T03:00:00Z' },
    // an older backend row with no `date`: falls back to the India date of createdAt (1 Oct here)
    { id: 6, status: 'rejected', approvalStatus: 'rejected', createdAt: '2026-09-30T20:00:00Z' },
  ]
  const opts = onDutyViewOptions<(typeof rows)[number]>(today)
  assert.deepEqual(ids(rowsForView(rows, 'waiting', opts)), [1, 2])
  assert.deepEqual(ids(rowsForView(rows, 'approved', opts)), [3, 4])
  assert.deepEqual(ids(rowsForView(rows, 'rejected', opts)), [5, 6])
  assert.deepEqual(ids(rowsForView(rows, 'month', opts)), [1, 2, 3, 5, 6])
  // without approvalStatus (never on the new endpoint) the status is all there is
  assert.equal(onDutyGroup({ status: 'rejected' }), 'rejected')
})

test('on-duty row labels follow the true state', () => {
  assert.deepEqual(onDutyRowLabel({ status: 'active', approvalStatus: 'pending_hr' }), {
    label: 'Waiting', variant: 'pending', detail: 'Day in progress, waiting for approval',
  })
  assert.equal(onDutyRowLabel({ status: 'completed', approvalStatus: 'pending_hod' }).detail, 'Day ended, waiting for approval')
  assert.equal(onDutyRowLabel({ status: 'active', approvalStatus: 'active' }).detail, 'Day in progress')
  assert.equal(
    onDutyRowLabel({ status: 'completed', approvalStatus: 'completed', completionReason: 'auto_4th_punch' }).detail,
    'Day completed (all 4 punches)',
  )
  assert.equal(onDutyRowLabel({ status: 'rejected', approvalStatus: 'rejected' }).label, 'Rejected')
})

test('month headings keep the order and name each month', () => {
  const rows = [{ d: '2026-10-30' }, { d: '2026-10-02' }, { d: '2026-09-15' }, { d: null }]
  const sections = monthSections(rows, (r) => r.d)
  assert.deepEqual(sections.map((s) => [s.title, s.rows.length]), [['October 2026', 2], ['September 2026', 1], ['Earlier', 1]])
})

test('every view has its own empty wording', () => {
  assert.equal(emptyViewText('month', 'outpasses', 'taken this month').title, 'No outpasses taken this month')
  assert.equal(emptyViewText('waiting', 'requests', 'x').title, 'No requests waiting')
})
