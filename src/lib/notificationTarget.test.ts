import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TARGET_KINDS,
  fallbackTarget,
  hrefOf,
  isLongMessage,
  isoDay,
  normalizeTarget,
  positiveId,
  pushNotificationId,
  pushTapHref,
  routeForTarget,
  targetKind,
  viewActionFor,
  type NotificationTarget,
  type TargetKind,
  type TargetViewer,
} from './notificationTarget.ts'

const head = { isManager: true }
const staff = { isManager: false, isStaff: true }

const t = (kind: TargetKind, extra: Partial<NotificationTarget> = {}): NotificationTarget => ({
  kind,
  id: null,
  date: null,
  role: 'self',
  category: null,
  label: 'x',
  ...extra,
})

const hrefFor = (target: NotificationTarget, viewer: TargetViewer = staff) => {
  const r = routeForTarget(target, viewer)
  return r ? hrefOf(r) : null
}

test('the server target is read defensively', () => {
  assert.deepEqual(
    normalizeTarget({ kind: 'leave', id: 12, date: null, role: 'self', category: null, label: 'View leave request' }),
    { kind: 'leave', id: 12, date: null, role: 'self', category: null, label: 'View leave request' },
  )
  // ids as numeric strings, junk ids, padded kinds, an approver, a missing label
  const a = normalizeTarget({ kind: ' Casual_Leave ', id: '7', role: 'APPROVER', category: 'casual_leave' })
  assert.deepEqual(a, { kind: 'casual_leave', id: 7, date: null, role: 'approver', category: 'casual_leave', label: 'Open approvals' })
  assert.equal(normalizeTarget({ kind: 'leave', id: -3 })?.id, null)
  assert.equal(normalizeTarget({ kind: 'leave', id: 1.5 })?.id, null)
  assert.equal(normalizeTarget({ kind: 'leave', id: 'abc' })?.id, null)
  assert.equal(normalizeTarget({ kind: 'leave' })?.label, 'View leave request')
  assert.equal(normalizeTarget({ kind: 'leave', label: '   ' })?.label, 'View leave request')
  // dates: only real calendar days
  assert.equal(normalizeTarget({ kind: 'attendance', date: '2026-10-29' })?.date, '2026-10-29')
  assert.equal(normalizeTarget({ kind: 'attendance', date: '2026-10-29T08:00:00+05:30' })?.date, '2026-10-29')
  assert.equal(normalizeTarget({ kind: 'attendance', date: '2026-02-30' })?.date, null)
  assert.equal(normalizeTarget({ kind: 'attendance', date: 20261029 })?.date, null)
  // "approvals" is always the approver's
  assert.equal(normalizeTarget({ kind: 'approvals', role: 'self' })?.role, 'approver')
  // nothing usable
  for (const bad of [null, undefined, 'leave', 5, [], {}, { kind: 'teleport' }, { kind: 3 }]) {
    assert.equal(normalizeTarget(bad), null, JSON.stringify(bad))
  }
})

test('kinds are read in any spelling, and every contract kind is known', () => {
  for (const k of TARGET_KINDS) assert.equal(targetKind(k), k)
  assert.equal(targetKind('casualLeave'), 'casual_leave')
  assert.equal(targetKind('missing-punch'), 'missing_punch')
  assert.equal(targetKind('On Duty'), 'on_duty')
  assert.equal(targetKind('salary'), 'salary_slip')
  assert.equal(targetKind('employee_request'), 'request')
  assert.equal(targetKind('nope'), null)
})

test('every self kind opens its screen with the params that screen reads', () => {
  const cases: [NotificationTarget, string | null][] = [
    [t('leave', { id: 12 }), '/(tabs)/leave?focus=12'],
    [t('leave'), '/(tabs)/leave'],
    [t('casual_leave', { id: 3 }), '/casual-leave?focus=3'],
    [t('permission', { id: 4 }), '/requests?focus=4'],
    [t('missing_punch', { id: 5 }), '/missing-punch?focus=5'],
    [t('outpass', { id: 6 }), '/outpass?focus=6'],
    [t('on_duty', { id: 7 }), '/on-duty?view=records&focus=7'],
    [t('on_duty'), '/on-duty?view=records'],
    [t('geo_punch', { id: 8 }), '/geo-punch'],
    [t('attendance', { date: '2026-10-29' }), '/(tabs)/attendance?date=2026-10-29'],
    [t('attendance'), '/(tabs)/attendance'],
    [t('salary_slip', { id: 9 }), '/salary/9'],
    [t('salary_slip'), '/salary'],
    [t('documents'), '/documents'],
    [t('id_card'), '/idcard'],
    [t('compensation'), '/compensation'],
    [t('compensation', { id: 2421 }), '/compensation?focus=2421'],
    [t('advance', { id: 10 }), '/settlement/10'],
    [t('advance'), '/settlement'],
    [t('resignation', { id: 11 }), '/(tabs)/profile?section=resignation'],
    [t('chat'), '/chat'],
    [t('my_requests'), '/hod-assignment?tab=requests'],
    // an attendance change HR raised: My Requests keys it "attendance_correction-<id>"
    [t('my_requests', { id: 12, category: 'attendance' }), '/hod-assignment?tab=requests&module=attendance_correction&focus=12'],
    [t('my_requests', { id: 13, category: 'casual_leave' }), '/hod-assignment?tab=requests&module=casual_leave&focus=13'],
    [t('my_requests', { id: 14, category: 'mystery' }), '/hod-assignment?tab=requests&focus=14'],
    [t('request', { id: 2 }), '/hod-assignment?tab=requests&module=request&focus=2'],
    [t('request'), '/hod-assignment?tab=requests'],
    [t('shift'), '/shift'],
    [t('holidays'), '/holidays'],
    [t('profile'), '/(tabs)/profile'],
  ]
  for (const [target, href] of cases) assert.equal(hrefFor(target), href, `${target.kind}#${target.id}`)
})

test('an approver target opens Approvals - for a Department Head only', () => {
  const leave = t('leave', { role: 'approver', id: 21, category: 'leave' })
  assert.equal(hrefFor(leave, head), '/(tabs)/approvals?category=leave&focus=21')
  // no category sent: taken from the kind; an unknown category is dropped
  assert.equal(hrefFor(t('casual_leave', { role: 'approver', id: 2 }), head), '/(tabs)/approvals?category=casual_leave&focus=2')
  assert.equal(hrefFor(t('compensation', { role: 'approver' }), head), '/(tabs)/approvals?category=holiday_work')
  assert.equal(hrefFor(t('leave', { role: 'approver', category: 'teleport' }), head), '/(tabs)/approvals?category=leave')
  assert.equal(hrefFor(t('approvals', { role: 'approver' }), head), '/(tabs)/approvals')
  // an advance / general request reminder: no category, no id -> just the tab
  assert.equal(hrefFor(normalizeTarget({ kind: 'approvals', id: null, role: 'approver', category: null, label: 'Open approvals' })!, head), '/(tabs)/approvals')
  // the backend's own shape for a head: kind "approvals" with the category and the request id
  assert.equal(hrefFor(normalizeTarget({ kind: 'approvals', id: 31, role: 'approver', category: 'missing_punch', label: 'Open approvals' })!, head), '/(tabs)/approvals?category=missing_punch&focus=31')
  // camelCase / compensation spellings of the category are put on the wire spelling
  assert.equal(hrefFor(t('on_duty', { role: 'approver', category: 'onDuty', id: 4 }), head), '/(tabs)/approvals?category=on_duty&focus=4')
  assert.equal(hrefFor(t('approvals', { role: 'approver', category: 'compensation' }), head), '/(tabs)/approvals?category=holiday_work')
  // not a head, or not known yet: the tab would bounce to Home, so no View
  assert.equal(hrefFor(leave, { isManager: false }), null)
  assert.equal(hrefFor(leave, {}), null)
  assert.equal(hrefFor(leave, { isManager: null }), null)
})

test('compensation is hidden once the profile says the reader is not staff', () => {
  assert.equal(hrefFor(t('compensation'), { isStaff: true }), '/compensation')
  assert.equal(hrefFor(t('compensation'), { isStaff: null }), '/compensation')
  assert.equal(hrefFor(t('compensation'), {}), '/compensation')
  assert.equal(hrefFor(t('compensation'), { isStaff: false }), null)
})

test('hrefs encode their params', () => {
  assert.equal(hrefOf({ pathname: '/x', params: { a: 'b c', d: '&' } }), '/x?a=b%20c&d=%26')
  assert.equal(hrefOf({ pathname: '/x', params: {} }), '/x')
})

test('an older server: the type (and the head\'s wording) decides, starting from notificationRoute', () => {
  // the two that routed before View existed keep their screens
  assert.equal(fallbackTarget('compensation', '')?.kind, 'compensation')
  assert.deepEqual(fallbackTarget('holiday_work', '', head), { kind: 'approvals', id: null, date: null, role: 'approver', category: 'holiday_work', label: 'Open approvals' })
  assert.equal(fallbackTarget('holiday_work', '', { isManager: false }), null)
  assert.equal(fallbackTarget('approval_reminder', '', head)?.role, 'approver')
  // a Department Head's "waiting for your approval" notice is an approver one
  const waiting = fallbackTarget('leave', "Asha K's leave request is waiting for your approval.", head)
  assert.deepEqual(waiting, { kind: 'leave', id: null, date: null, role: 'approver', category: 'leave', label: 'Open approvals' })
  // the employee's own updates
  assert.equal(fallbackTarget('leave', 'Your leave was approved')?.role, 'self')
  assert.equal(fallbackTarget('casual_leave', '')?.kind, 'casual_leave')
  assert.equal(fallbackTarget('on_duty', '')?.kind, 'on_duty')
  assert.equal(fallbackTarget('employee_request', '')?.kind, 'request')
  assert.equal(fallbackTarget('offer_letter', '')?.kind, 'documents')
  assert.equal(fallbackTarget('salary_slip', '')?.kind, 'salary_slip')
  // nothing to open
  for (const type of ['general', 'approval', 'visitors', '', null, undefined, 4]) assert.equal(fallbackTarget(type, ''), null, String(type))
})

test('the View action: the server target wins, `target: null` means none, no key means the fallback', () => {
  const a = viewActionFor({ type: 'leave', message: 'm', target: { kind: 'leave', id: 12, label: 'View leave request' } }, staff)
  assert.equal(a?.href, '/(tabs)/leave?focus=12')
  assert.equal(a?.label, 'View leave request')
  assert.equal(a?.source, 'target')
  assert.equal(a?.hint, 'Marks it read and opens your leave requests')
  // the server says there is nothing to open: no guessing from the type
  assert.equal(viewActionFor({ type: 'leave', message: 'm', target: null }, staff), null)
  // an unknown kind from a newer server: nothing (never a wrong screen)
  assert.equal(viewActionFor({ type: 'leave', target: { kind: 'hologram' } }, staff), null)
  // an older server: from the type
  const old = viewActionFor({ type: 'casual_leave', message: 'Your Casual Leave was approved' }, staff)
  assert.equal(old?.href, '/casual-leave')
  assert.equal(old?.source, 'fallback')
  assert.equal(viewActionFor({ type: 'general', message: 'Hello' }, staff), null)
  // approver: only a head gets a button
  const approver = { type: 'leave', target: { kind: 'leave', role: 'approver', category: 'leave', id: 5, label: 'Open approvals' } }
  assert.equal(viewActionFor(approver, head)?.href, '/(tabs)/approvals?category=leave&focus=5')
  assert.equal(viewActionFor(approver, head)?.hint, 'Marks it read and opens approvals')
  assert.equal(viewActionFor(approver, { isManager: false }), null)
  // never throws on junk rows
  for (const bad of [null, undefined, 5, 'x', []]) assert.equal(viewActionFor(bad as any, staff), null)
})

test('long messages are offered "Show more"', () => {
  assert.equal(isLongMessage('Short one', 2), false)
  assert.equal(isLongMessage('x'.repeat(80), 2), false)
  assert.equal(isLongMessage('x'.repeat(100), 2), true)
  assert.equal(isLongMessage('a\nb\nc', 2), true)
  assert.equal(isLongMessage('', 2), false)
  assert.equal(isLongMessage(null, 2), false)
})

test('a tapped push opens the Notifications list on that notification', () => {
  const push = (data: unknown) => ({ request: { content: { data } } })
  assert.equal(pushNotificationId(push({ type: 'leave', notificationId: 42 })), 42)
  assert.equal(pushNotificationId(push({ notificationId: '42' })), 42)
  assert.equal(pushTapHref(push({ type: 'leave', notificationId: 42 })), '/(tabs)/notifications?highlight=42')
  for (const bad of [push({}), push({ notificationId: 0 }), push({ notificationId: 'x' }), { request: {} }, null, 'push']) {
    assert.equal(pushNotificationId(bad), null)
    assert.equal(pushTapHref(bad), '/(tabs)/notifications')
  }
})

test('small readers', () => {
  assert.equal(positiveId(3), 3)
  assert.equal(positiveId(' 3 '), 3)
  assert.equal(positiveId(0), null)
  assert.equal(positiveId(Number.NaN), null)
  assert.equal(isoDay('2024-02-29'), '2024-02-29')
  assert.equal(isoDay('2025-02-29'), null)
})
