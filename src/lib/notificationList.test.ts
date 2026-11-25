// Run with `npm test`. The Notifications page as a to-do list (owner 2026-11-25): Today / Yesterday / Earlier groups,
// the short and full times, the one-line preview, the Unread filter keeping a just-ticked row, and the kinds.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clockTime,
  dayGroup,
  fullTime,
  groupNotifications,
  notificationHeadline,
  notificationKind,
  parseTime,
  previewLine,
  rowIndexOf,
  shortTime,
  unreadCount,
  visibleNotifications,
  type ListNotification,
} from './notificationList.ts'

// 25 Nov 2026, 3:42 pm on the phone's clock.
const NOW = new Date(2026, 10, 25, 15, 42)
const at = (y: number, mo: number, d: number, h = 10, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString()

const n = (id: number, createdAt: string, isRead = false, extra: Partial<ListNotification> = {}): ListNotification => ({
  id,
  createdAt,
  isRead,
  message: `message ${id}`,
  ...extra,
})

test('parseTime reads ISO times and refuses anything else', () => {
  assert.ok(parseTime(at(2026, 11, 25)) instanceof Date)
  assert.equal(parseTime('not a date'), null)
  assert.equal(parseTime(''), null)
  assert.equal(parseTime(undefined), null)
  assert.equal(parseTime(42), null)
})

test('dayGroup: today, yesterday (the calendar day before), earlier', () => {
  assert.equal(dayGroup(at(2026, 11, 25, 0, 1), NOW), 'today')
  assert.equal(dayGroup(at(2026, 11, 25, 15, 41), NOW), 'today')
  assert.equal(dayGroup(at(2026, 11, 24, 23, 59), NOW), 'yesterday')
  assert.equal(dayGroup(at(2026, 11, 24, 0, 0), NOW), 'yesterday')
  assert.equal(dayGroup(at(2026, 11, 23, 23, 59), NOW), 'earlier')
  assert.equal(dayGroup(at(2025, 1, 1), NOW), 'earlier')
})

test('dayGroup: a server clock a little ahead still reads as today; an unreadable time as earlier', () => {
  assert.equal(dayGroup(at(2026, 11, 25, 15, 45), NOW), 'today')
  assert.equal(dayGroup('garbage', NOW), 'earlier')
})

test('dayGroup: yesterday across a month and a year boundary', () => {
  const firstOfMonth = new Date(2026, 11, 1, 8, 0)
  assert.equal(dayGroup(at(2026, 11, 30, 22, 0), firstOfMonth), 'yesterday')
  const newYear = new Date(2027, 0, 1, 8, 0)
  assert.equal(dayGroup(at(2026, 12, 31, 9, 0), newYear), 'yesterday')
  assert.equal(dayGroup(at(2026, 12, 30, 9, 0), newYear), 'earlier')
})

test('clockTime is a 12-hour clock with am / pm', () => {
  assert.equal(clockTime(new Date(2026, 0, 1, 0, 5)), '12:05 am')
  assert.equal(clockTime(new Date(2026, 0, 1, 9, 5)), '9:05 am')
  assert.equal(clockTime(new Date(2026, 0, 1, 12, 30)), '12:30 pm')
  assert.equal(clockTime(new Date(2026, 0, 1, 23, 59)), '11:59 pm')
})

test('shortTime: minutes and hours ago today, the clock yesterday, the date earlier', () => {
  assert.equal(shortTime(at(2026, 11, 25, 15, 42), NOW), 'Just now')
  assert.equal(shortTime(at(2026, 11, 25, 15, 37), NOW), '5 min ago')
  assert.equal(shortTime(at(2026, 11, 25, 12, 10), NOW), '3 h ago')
  assert.equal(shortTime(at(2026, 11, 25, 15, 50), NOW), 'Just now')
  assert.equal(shortTime(at(2026, 11, 24, 9, 14), NOW), '9:14 am')
  assert.equal(shortTime(at(2026, 11, 12), NOW), '12 Nov')
  assert.equal(shortTime(at(2025, 11, 12), NOW), '12 Nov 2025')
  assert.equal(shortTime('nope', NOW), '')
})

test('fullTime: today / yesterday / the whole date', () => {
  assert.equal(fullTime(at(2026, 11, 25, 15, 42), NOW), 'Today at 3:42 pm')
  assert.equal(fullTime(at(2026, 11, 24, 9, 5), NOW), 'Yesterday at 9:05 am')
  assert.equal(fullTime(at(2026, 11, 18, 15, 42), NOW), 'Wednesday, 18 Nov 2026 at 3:42 pm')
  assert.equal(fullTime(undefined, NOW), '')
})

test('previewLine puts the message on one line', () => {
  assert.equal(previewLine('Hello\n\nworld   again '), 'Hello world again')
  assert.equal(previewLine(undefined), '')
})

test('the Unread filter shows unread ones, and keeps a just-ticked one for a moment', () => {
  const list = [n(1, at(2026, 11, 25), false), n(2, at(2026, 11, 25), true), n(3, at(2026, 11, 24), true)]
  assert.deepEqual(visibleNotifications(list, 'all').map((x) => x.id), [1, 2, 3])
  assert.deepEqual(visibleNotifications(list, 'unread').map((x) => x.id), [1])
  assert.deepEqual(visibleNotifications(list, 'unread', new Set([3])).map((x) => x.id), [1, 3])
  assert.deepEqual(visibleNotifications(undefined, 'all'), [])
  assert.equal(unreadCount(list), 1)
  assert.equal(unreadCount(undefined), 0)
})

test('groupNotifications: a header per day group that has rows, in order, rows in the server order', () => {
  const list = [
    n(5, at(2026, 11, 25, 14), false),
    n(4, at(2026, 11, 25, 9), true),
    n(3, at(2026, 11, 24, 18), false),
    n(2, at(2026, 11, 10), true),
    n(1, at(2026, 11, 9), true),
  ]
  const rows = groupNotifications(list, NOW)
  assert.deepEqual(
    rows.map((r) => (r.kind === 'header' ? `[${r.label} ${r.count}/${r.unread}]` : `${r.item.id}${r.first ? '^' : ''}${r.last ? '$' : ''}`)),
    ['[Today 2/1]', '5^', '4$', '[Yesterday 1/1]', '3^$', '[Earlier 2/0]', '2^', '1$'],
  )
  assert.equal(rowIndexOf(rows, 3), 4)
  assert.equal(rowIndexOf(rows, 99), -1)
  // unique keys for the list
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length)
})

test('groupNotifications: no rows, no headers; a group with nothing in it is left out', () => {
  assert.deepEqual(groupNotifications([], NOW), [])
  const rows = groupNotifications([n(1, at(2026, 11, 1))], NOW)
  assert.deepEqual(rows.map((r) => r.kind), ['header', 'item'])
  assert.equal(rows[0].kind === 'header' && rows[0].label, 'Earlier')
})

test('kinds: each type has an icon, a tone and a name; the enquiry type is known; unknown is a plain notification', () => {
  assert.equal(notificationKind('leave').title, 'Leave update')
  assert.equal(notificationKind('enquiry').icon, 'message-question-outline')
  assert.equal(notificationKind('resignation').tone, 'red')
  assert.equal(notificationKind(' Salary_Slip ').title, 'Salary slip')
  assert.deepEqual(notificationKind('something_new'), notificationKind('general'))
  assert.deepEqual(notificationKind(undefined), notificationKind('general'))
})

test('the headline is the notification own title, else its kind', () => {
  assert.equal(notificationHeadline({ title: ' Request Approved ', type: 'leave' }), 'Request Approved')
  assert.equal(notificationHeadline({ title: '', type: 'leave' }), 'Leave update')
  assert.equal(notificationHeadline({ type: 'enquiry' }), 'Enquiry update')
})
