import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FOCUS_MAX_MORE_PAGES,
  REQUEST_FOCUS_ORDER,
  chooseFocusView,
  idFromKey,
  indexOfItem,
  planFocus,
  readFocusId,
  readIsoDateParam,
  readWordParam,
  requestViewHas,
  requestViewHasInItsMonth,
  yearMonthOfDay,
} from './focusItem.ts'
import type { RequestView, ViewOptions } from './requestViews.ts'

type Row = { id: number; status: string; date: string }
const today = new Date(2026, 10, 2) // 2 Nov 2026
const opts: ViewOptions<Row> = { statusOf: (r) => r.status, month: { dateOf: (r) => r.date, kind: 'taken' }, today }
const rows: Row[] = [
  { id: 1, status: 'pending', date: '2026-11-03' },
  { id: 2, status: 'approved', date: '2026-11-01' },
  { id: 3, status: 'approved', date: '2026-09-12' },
  { id: 4, status: 'rejected', date: '2026-10-20' },
  { id: 5, status: 'mystery', date: '2026-10-20' },
]
const classify = (id: number, current: RequestView | null, list: readonly Row[] | undefined = rows) =>
  planFocus<Row, RequestView>({
    id,
    rows: list,
    idOf: (r) => r.id,
    views: REQUEST_FOCUS_ORDER,
    current,
    has: (r, v) => requestViewHas(r, v, opts),
  })

test('route params', () => {
  assert.equal(readFocusId('12'), 12)
  assert.equal(readFocusId(['12', '13']), 12)
  assert.equal(readFocusId(12), 12)
  for (const bad of ['0', '-3', '1.5', 'abc', '', undefined, null, {}, '12abc']) assert.equal(readFocusId(bad), null, String(bad))
  assert.equal(readIsoDateParam('2026-10-29'), '2026-10-29')
  assert.equal(readIsoDateParam(['2026-10-29']), '2026-10-29')
  for (const bad of ['2026-02-30', '29-10-2026', '2026-10-29T00:00', '', undefined, 5]) assert.equal(readIsoDateParam(bad), null, String(bad))
  assert.equal(readWordParam('Resignation'), 'resignation')
  assert.equal(readWordParam('two words'), null)
  assert.equal(readWordParam(undefined), null)
  assert.deepEqual(yearMonthOfDay('2026-01-31'), [2026, 1])
  assert.equal(idFromKey('hw-2421', 'hw'), 2421)
  assert.equal(idFromKey('ot-3600', 'hw'), null)
  assert.equal(idFromKey('hw-', 'hw'), null)
  assert.equal(idFromKey(undefined, 'hw'), null)
})

test('the view on screen is kept when it already shows the row', () => {
  assert.equal(chooseFocusView(['a', 'b'], 'b', () => true), 'b')
  assert.equal(chooseFocusView(['a', 'b'], 'b', (v) => v === 'a'), 'a')
  assert.equal(chooseFocusView(['a', 'b'], null, (v) => v === 'b'), 'b')
  assert.equal(chooseFocusView(['a', 'b'], 'a', () => false), null)
})

test('classify mode: the row decides the view', () => {
  assert.deepEqual(classify(1, 'month'), { kind: 'found', row: rows[0], view: 'waiting' })
  assert.deepEqual(classify(3, 'waiting'), { kind: 'found', row: rows[2], view: 'approved' })
  assert.deepEqual(classify(4, null), { kind: 'found', row: rows[3], view: 'rejected' })
  // an approved row of this month is in "This month" too: stay there if that is what is on screen
  assert.deepEqual(classify(2, 'month'), { kind: 'found', row: rows[1], view: 'month' })
  assert.deepEqual(classify(2, 'waiting'), { kind: 'found', row: rows[1], view: 'approved' })
  // gone, or a status no view lists
  assert.deepEqual(classify(99, 'waiting'), { kind: 'missing' })
  assert.deepEqual(classify(5, 'waiting'), { kind: 'missing' })
  // still loading
  assert.deepEqual(planFocus({ id: 1, rows: undefined, idOf: (r: Row) => r.id, views: REQUEST_FOCUS_ORDER }), { kind: 'wait' })
  // ids compared as numbers (a server sending "1")
  assert.equal(planFocus({ id: 1, rows: [{ id: '1' }], idOf: (r) => r.id }).kind, 'found')
})

test('a screen with one list', () => {
  assert.deepEqual(planFocus({ id: 2, rows: [{ id: 1 }, { id: 2 }], idOf: (r) => r.id }), { kind: 'found', row: { id: 2 }, view: null })
  assert.deepEqual(planFocus({ id: 3, rows: [{ id: 1 }], idOf: (r) => r.id }), { kind: 'missing' })
})

test('a paged list loads more pages before giving up, up to the cap', () => {
  const base = { id: 9, rows: [{ id: 1 }], idOf: (r: { id: number }) => r.id }
  assert.deepEqual(planFocus({ ...base, hasMore: true, moreTried: 0 }), { kind: 'more' })
  assert.deepEqual(planFocus({ ...base, hasMore: true, moreTried: FOCUS_MAX_MORE_PAGES }), { kind: 'missing' })
  assert.deepEqual(planFocus({ ...base, hasMore: false }), { kind: 'missing' })
  assert.deepEqual(planFocus({ ...base, rows: [{ id: 9 }], hasMore: true }).kind, 'found')
})

test('seek mode: each view is its own list, opened one by one (Approvals)', () => {
  const views = ['pending', 'approved', 'rejected'] as const
  const seek = (list: { id: number }[] | undefined, current: (typeof views)[number], tried: (typeof views)[number][] = [], more = {}) =>
    planFocus({ id: 7, rows: list, idOf: (r) => r.id, views, current, tried, ...more })
  assert.deepEqual(seek([{ id: 7 }], 'pending'), { kind: 'found', row: { id: 7 }, view: 'pending' })
  assert.deepEqual(seek([{ id: 1 }], 'pending'), { kind: 'switch', view: 'approved' })
  assert.deepEqual(seek([{ id: 1 }], 'approved', ['pending']), { kind: 'switch', view: 'rejected' })
  assert.deepEqual(seek([{ id: 1 }], 'rejected', ['pending', 'approved']), { kind: 'missing' })
  // started on Approved (the head had it open): Pending is still tried
  assert.deepEqual(seek([], 'approved'), { kind: 'switch', view: 'pending' })
  // the next page of this view comes before the next view
  assert.deepEqual(seek([{ id: 1 }], 'approved', ['pending'], { hasMore: true, moreTried: 1 }), { kind: 'more' })
  assert.deepEqual(seek(undefined, 'approved'), { kind: 'wait' })
})

test('the index of an item among headings and items', () => {
  const data: { kind: string; id?: number }[] = [{ kind: 'heading' }, { kind: 'item', id: 4 }, { kind: 'item', id: 5 }]
  assert.equal(indexOfItem(data, (r) => r.kind === 'item' && r.id === 5), 2)
  assert.equal(indexOfItem(data, (r) => r.kind === 'item' && r.id === 6), -1)
})

test('a month-switcher screen finds a row of another month, and the view that lists it there', () => {
  // On screen: November. Row 3 is an approved request for 12 Sep, row 4 a rejected one for 20 Oct.
  const scoped: ViewOptions<Row> = { statusOf: (r) => r.status, today, scope: { year: 2026, month: 11, daysOf: (r) => r.date } }
  // the plain check says no view of November lists them...
  assert.equal(requestViewHas(rows[2], 'approved', scoped), false)
  // ...but once their own month is shown they are found, in their status view
  assert.equal(requestViewHasInItsMonth(rows[2], 'approved', scoped), true)
  assert.equal(requestViewHasInItsMonth(rows[2], 'waiting', scoped), false)
  const plan = (id: number, current: RequestView) =>
    planFocus<Row, RequestView>({
      id,
      rows,
      idOf: (r) => r.id,
      views: REQUEST_FOCUS_ORDER,
      current,
      has: (r, v) => requestViewHasInItsMonth(r, v, scoped),
    })
  assert.deepEqual(plan(3, 'waiting'), { kind: 'found', row: rows[2], view: 'approved' })
  assert.deepEqual(plan(4, 'waiting'), { kind: 'found', row: rows[3], view: 'rejected' })
  // the month view lists every row of its month: already on it, stay there
  assert.deepEqual(plan(4, 'month'), { kind: 'found', row: rows[3], view: 'month' })
  // without a switcher it is the plain check
  assert.equal(requestViewHasInItsMonth(rows[2], 'month', opts), requestViewHas(rows[2], 'month', opts))
})
