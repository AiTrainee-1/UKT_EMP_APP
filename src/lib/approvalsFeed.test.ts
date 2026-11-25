// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  feedOrder,
  feedRows,
  feedStart,
  filterCaption,
  filterFromParam,
  headerTitle,
  nextFeedCursor,
  rowStatus,
  toggleFilter,
} from './approvalsFeed.ts'

test('the all-statuses list walks Pending, then Approved, then Rejected, page by page', () => {
  assert.deepEqual(feedOrder('all'), ['pending', 'approved', 'rejected'])
  assert.deepEqual(feedOrder('approved'), ['approved'])
  assert.deepEqual(feedStart('all'), { status: 'pending', page: 1 })
  assert.deepEqual(feedStart('rejected'), { status: 'rejected', page: 1 })

  const order = feedOrder('all')
  assert.deepEqual(nextFeedCursor({ status: 'pending', page: 1 }, true, order), { status: 'pending', page: 2 })
  assert.deepEqual(nextFeedCursor({ status: 'pending', page: 2 }, false, order), { status: 'approved', page: 1 })
  assert.deepEqual(nextFeedCursor({ status: 'approved', page: 1 }, false, order), { status: 'rejected', page: 1 })
  assert.equal(nextFeedCursor({ status: 'rejected', page: 3 }, false, order), undefined)
  // one status chosen: only its own pages
  assert.equal(nextFeedCursor({ status: 'approved', page: 1 }, false, feedOrder('approved')), undefined)
  assert.deepEqual(nextFeedCursor({ status: 'approved', page: 1 }, true, feedOrder('approved')), { status: 'approved', page: 2 })
})

test('a tile filters, the same tile again shows everything', () => {
  assert.equal(toggleFilter('all', 'pending'), 'pending')
  assert.equal(toggleFilter('pending', 'pending'), 'all')
  assert.equal(toggleFilter('pending', 'rejected'), 'rejected')
  assert.equal(filterFromParam('all'), 'all')
  assert.equal(filterFromParam('approved'), 'approved')
  assert.equal(filterFromParam('maybe'), null)
  assert.equal(filterFromParam(undefined), null)
})

test('a row knows its status from the list it came from', () => {
  assert.equal(rowStatus({ listStatus: 'approved' }), 'approved')
  assert.equal(rowStatus({ historyStatus: 'rejected' }), 'rejected')
  assert.equal(rowStatus({ listStatus: 'rejected', historyStatus: 'approved' }), 'rejected')
  assert.equal(rowStatus({}), 'pending')
  assert.equal(rowStatus(null), 'pending')
})

const rows = [
  { id: 7, listStatus: 'approved' },
  { id: 1, listStatus: 'pending' },
  { id: 9, listStatus: 'rejected' },
  { id: 2, listStatus: 'pending' },
]

test('pending rows come first under their header, then approved, then rejected', () => {
  const out = feedRows(rows, { headers: true, counts: { pending: 2, approved: 5, rejected: 1 } })
  assert.deepEqual(
    out.map((r) => (r.kind === 'header' ? `[${r.status} ${r.count}]` : `${r.status}:${r.item.id}`)),
    ['[pending 2]', 'pending:1', 'pending:2', '[approved 5]', 'approved:7', '[rejected 1]', 'rejected:9'],
  )
  // a request listed twice (it moved while the pages were being fetched) is shown once, where it came first
  const twice = feedRows(
    [{ id: 1, listStatus: 'pending' }, { id: 1, listStatus: 'approved' }, { id: 1, listStatus: 'pending' }],
    { headers: true },
  )
  assert.deepEqual(twice.map((r) => r.key), ['h-pending', 'pending-1'])
})

test('one status chosen: no headers, only its rows', () => {
  const out = feedRows(rows.filter((r) => r.listStatus === 'approved'), { headers: false })
  assert.deepEqual(out.map((r) => r.kind), ['item'])
})

test('nothing waiting is said at the top when other requests are listed', () => {
  const decided = [{ id: 3, listStatus: 'approved' }]
  const out = feedRows(decided, { headers: true, counts: { pending: 0, approved: 1, rejected: 0 } })
  assert.deepEqual(out[0], { kind: 'header', key: 'h-pending', status: 'pending', count: 0, empty: true })
  // unknown counts or an empty list: no such header
  assert.equal(feedRows(decided, { headers: true }).some((r) => r.kind === 'header' && r.status === 'pending'), false)
  assert.deepEqual(feedRows([], { headers: true, counts: { pending: 0 } }), [])
})

test('a header never says fewer than the rows it leads', () => {
  const out = feedRows(rows, { headers: true, counts: { pending: 1 } })
  assert.equal(out[0].kind === 'header' && out[0].count, 2)
})

test('wording', () => {
  assert.equal(headerTitle('pending'), 'Waiting for your decision')
  assert.equal(headerTitle('approved'), 'Approved')
  assert.match(filterCaption('all'), /waiting ones first/)
  assert.equal(filterCaption('rejected'), 'Showing rejected requests only.')
})

test('the empty all-statuses list', async () => {
  const { emptyCopy } = await import('./approvalsHistory.ts')
  assert.equal(emptyCopy('leave', 'all').title, 'All caught up!')
  assert.equal(emptyCopy('leave', 'all').subtitle, 'No leave requests from your team yet.')
  assert.equal(emptyCopy('leave', 'all', { hodInPipeline: false }).title, 'Nothing for you here')
  assert.equal(emptyCopy('casualLeave', 'all', { search: 'ravi' }).subtitle, 'No casual leave requests for "ravi".')
  assert.equal(emptyCopy('leave', 'approved', { search: 'ravi' }).subtitle, 'No approved leave requests for "ravi".')
})
