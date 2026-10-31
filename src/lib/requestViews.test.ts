import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultView, rowsForView, statusGroup, viewCounts, yearMonthOf, type ViewOptions } from './requestViews.ts'

type Row = { id: number; status: string; date: string; createdAt: string }
const today = new Date(2026, 9, 31) // 31 Oct 2026
const rows: Row[] = [
  { id: 1, status: 'pending', date: '2026-10-30', createdAt: '2026-10-29T10:00:00+05:30' },
  { id: 2, status: 'approved', date: '2026-10-05', createdAt: '2026-09-30T23:30:00+05:30' },
  { id: 3, status: 'approved', date: '2026-09-12', createdAt: '2026-09-10T09:00:00+05:30' },
  { id: 4, status: 'rejected', date: '2026-10-20', createdAt: '2026-10-19T09:00:00+05:30' },
  { id: 5, status: 'hod_approved', date: '2026-11-02', createdAt: '2026-10-31T08:00:00+05:30' },
]
const taken: ViewOptions<Row> = { statusOf: (r) => r.status, month: { dateOf: (r) => r.date, kind: 'taken' }, today }
const submitted: ViewOptions<Row> = { statusOf: (r) => r.status, month: { dateOf: (r) => r.createdAt, kind: 'submitted' }, today }

test('every module spelling falls in the right group', () => {
  for (const s of ['pending', 'PENDING', 'hod_approved', 'in_review']) assert.equal(statusGroup(s), 'waiting', s)
  for (const s of ['approved', 'out', 'returned', 'completed']) assert.equal(statusGroup(s), 'approved', s)
  for (const s of ['rejected', 'cancelled', 'expired']) assert.equal(statusGroup(s), 'rejected', s)
  assert.equal(statusGroup(''), 'other')
  assert.equal(statusGroup(null), 'other')
})

test('waiting, approved and rejected follow the status', () => {
  assert.deepEqual(rowsForView(rows, 'waiting', taken).map((r) => r.id), [1, 5])
  assert.deepEqual(rowsForView(rows, 'approved', taken).map((r) => r.id), [2, 3])
  assert.deepEqual(rowsForView(rows, 'rejected', taken).map((r) => r.id), [4])
})

test('"taken this month" is approved rows whose day is in this month', () => {
  assert.deepEqual(rowsForView(rows, 'month', taken).map((r) => r.id), [2])
})

test('"submitted this month" is every row sent this month, read without time-zone shifts', () => {
  // row 2 was sent at 23:30 IST on 30 Sep: still September even though it is 18:00 UTC
  assert.deepEqual(rowsForView(rows, 'month', submitted).map((r) => r.id), [1, 4, 5])
})

test('counts and the opening view', () => {
  assert.deepEqual(viewCounts(rows, taken), { waiting: 2, month: 1, approved: 2, rejected: 1 })
  assert.equal(defaultView({ waiting: 0, month: 3, approved: 1, rejected: 0 }), 'month')
  assert.equal(defaultView({ waiting: 1, month: 0, approved: 0, rejected: 0 }), 'waiting')
})

test('a screen can overrule the group of a row', () => {
  const opts: ViewOptions<Row> = { ...taken, groupOf: (r) => (r.id === 4 ? 'approved' : null) }
  assert.deepEqual(rowsForView(rows, 'approved', opts).map((r) => r.id), [2, 3, 4])
})

test('yearMonthOf reads only the date part', () => {
  assert.deepEqual(yearMonthOf('2026-10-07'), [2026, 10])
  assert.deepEqual(yearMonthOf('2026-10-07T23:59:00-08:00'), [2026, 10])
  assert.equal(yearMonthOf('07/10/2026'), null)
  assert.equal(yearMonthOf(undefined), null)
})
