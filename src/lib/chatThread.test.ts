// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildChatRows,
  countUnseen,
  dayLabel,
  isHrMessage,
  isMyReaction,
  isNearLatest,
  mergeMessages,
  newestId,
  oldestId,
  pageMayHaveMore,
  prepareOutgoing,
  reactionsSummary,
  replaceMessage,
  timeLabel,
  toggleReactionLocal,
  unseenLabel,
  CHAT_MAX_LENGTH,
  type ChatMessageLike,
} from './chatThread.ts'

function msg(id: number, over: Partial<ChatMessageLike> = {}): ChatMessageLike {
  return {
    id,
    senderId: 7,
    senderName: 'Priya R',
    text: `message ${id}`,
    reactions: [],
    createdAt: new Date(2026, 9, 31, 9, id).toISOString(),
    ...over,
  }
}

test('older pages and the newest poll merge into one list, oldest first, no duplicates', () => {
  const older = [msg(1), msg(2), msg(3)]
  const latest = [msg(3, { text: 'fresh copy' }), msg(4), msg(5)]
  const merged = mergeMessages(older, latest)
  assert.deepEqual(merged.map((m) => m.id), [1, 2, 3, 4, 5])
  // the later list wins for an id that is in both (a reaction added since history was loaded)
  assert.equal(merged.find((m) => m.id === 3)?.text, 'fresh copy')
  assert.deepEqual(mergeMessages(null, undefined, []), [])
})

test('oldest/newest id and whether an older page may exist', () => {
  assert.equal(oldestId([msg(9), msg(4), msg(6)]), 4)
  assert.equal(newestId([msg(9), msg(4), msg(6)]), 9)
  assert.equal(oldestId([]), null)
  assert.equal(pageMayHaveMore(50), true)
  assert.equal(pageMayHaveMore(49), false)
  assert.equal(pageMayHaveMore(0), false)
})

test('the server answer to a reaction replaces that one message only', () => {
  const list = [msg(1), msg(2)]
  const updated = msg(2, { reactions: [{ emoji: '👍', count: 1, reactedByMe: true }] })
  const next = replaceMessage(list, updated)
  assert.equal(next[1].reactions.length, 1)
  assert.equal(next[0], list[0])
  assert.deepEqual(replaceMessage(list, msg(99)).map((m) => m.id), [1, 2])
  assert.deepEqual(replaceMessage(null, msg(1)), [])
})

test('adding and removing my reaction on the phone mirrors what the server will do', () => {
  const m = msg(1, { reactions: [{ emoji: '👍', count: 2, reactedByMe: false }] })
  const added = toggleReactionLocal(m, '👍', false)
  assert.deepEqual(added.reactions, [{ emoji: '👍', count: 3, reactedByMe: true }])
  assert.equal(isMyReaction(added, '👍'), true)
  const removed = toggleReactionLocal(added, '👍', true)
  assert.deepEqual(removed.reactions, [{ emoji: '👍', count: 2, reactedByMe: false }])
  // a brand-new emoji, and removing the last one drops the pill
  const heart = toggleReactionLocal(msg(2), '❤️', false)
  assert.deepEqual(heart.reactions, [{ emoji: '❤️', count: 1, reactedByMe: true }])
  assert.deepEqual(toggleReactionLocal(heart, '❤️', true).reactions, [])
  // asking to remove a reaction that is not mine changes nothing
  assert.equal(toggleReactionLocal(m, '👍', true), m)
  // the original is never changed in place
  assert.equal(m.reactions[0].count, 2)
})

test('reaction summary for screen readers', () => {
  assert.equal(reactionsSummary([]), '')
  assert.equal(
    reactionsSummary([{ emoji: '👍', count: 3, reactedByMe: true }, { emoji: '😂', count: 1, reactedByMe: false }]),
    '👍 3 including you, 😂 1',
  )
})

test('day labels: Today, Yesterday, a date this year, a date in another year', () => {
  const now = new Date(2026, 9, 31, 10, 0)
  assert.equal(dayLabel(new Date(2026, 9, 31, 0, 5), now), 'Today')
  assert.equal(dayLabel(new Date(2026, 9, 30, 23, 59), now), 'Yesterday')
  assert.equal(dayLabel(new Date(2026, 9, 27, 12, 0), now), 'Tue, 27 Oct')
  assert.equal(dayLabel(new Date(2025, 11, 12, 12, 0), now), '12 Dec 2025')
  // new year's day: yesterday is in the previous year but is still "Yesterday"
  assert.equal(dayLabel(new Date(2026, 11, 31, 20, 0), new Date(2027, 0, 1, 8, 0)), 'Yesterday')
})

test('time label is 12-hour with AM/PM and empty for a missing or broken date', () => {
  assert.equal(timeLabel(new Date(2026, 9, 31, 0, 5).toISOString()), '12:05 AM')
  assert.equal(timeLabel(new Date(2026, 9, 31, 13, 30).toISOString()), '1:30 PM')
  assert.equal(timeLabel(null), '')
  assert.equal(timeLabel('not a date'), '')
})

test('rows: one day separator per day, grouping by sender within five minutes', () => {
  const now = new Date(2026, 9, 31, 18, 0)
  const messages = [
    msg(1, { createdAt: new Date(2026, 9, 30, 17, 0).toISOString() }),
    msg(2, { createdAt: new Date(2026, 9, 31, 9, 0).toISOString() }),
    msg(3, { createdAt: new Date(2026, 9, 31, 9, 2).toISOString() }),
    msg(4, { createdAt: new Date(2026, 9, 31, 9, 20).toISOString() }),
    msg(5, { senderId: 12, senderName: 'Me', createdAt: new Date(2026, 9, 31, 9, 21).toISOString() }),
  ]
  const rows = buildChatRows([...messages].reverse(), 12, now)
  assert.deepEqual(
    rows.map((r) => (r.kind === 'day' ? r.label : r.message.id)),
    ['Yesterday', 1, 'Today', 2, 3, 4, 5],
  )
  const byId = (id: number) => rows.find((r) => r.kind === 'message' && r.message.id === id)
  const r2 = byId(2), r3 = byId(3), r4 = byId(4), r5 = byId(5)
  assert.ok(r2 && r2.kind === 'message' && r2.startsGroup && !r2.endsGroup)
  assert.ok(r3 && r3.kind === 'message' && !r3.startsGroup && r3.endsGroup)
  // 18 minutes later starts a new group
  assert.ok(r4 && r4.kind === 'message' && r4.startsGroup)
  assert.ok(r5 && r5.kind === 'message' && r5.isMine && !r5.isHr && r5.startsGroup)
})

test('HR and management messages are recognised (isHr, or no sender on older servers)', () => {
  assert.equal(isHrMessage(msg(1, { isHr: true, senderId: null })), true)
  assert.equal(isHrMessage(msg(1, { senderId: null })), true)
  assert.equal(isHrMessage(msg(1)), false)
  const rows = buildChatRows([msg(1, { isHr: true, senderId: null, senderName: 'HR Admin' })], 7, new Date())
  const row = rows[1]
  assert.ok(row.kind === 'message' && row.isHr && !row.isMine)
})

test('two HR people never merge into one group just because both have no employee id', () => {
  const t = new Date(2026, 9, 31, 9, 0).getTime()
  const rows = buildChatRows(
    [
      msg(1, { senderId: null, isHr: true, senderName: 'HR Admin', createdAt: new Date(t).toISOString() }),
      msg(2, { senderId: null, isHr: true, senderName: 'Managing Director', createdAt: new Date(t + 60_000).toISOString() }),
    ],
    7,
    new Date(2026, 9, 31, 10, 0),
  )
  const second = rows[2]
  assert.ok(second.kind === 'message' && second.startsGroup)
})

test('new-message pill: counts only other people\'s messages after the last one seen', () => {
  const list = [msg(1), msg(2), msg(3, { senderId: 12 }), msg(4)]
  assert.equal(countUnseen(list, 1, 12), 2)
  assert.equal(countUnseen(list, 4, 12), 0)
  assert.equal(countUnseen(list, null, 12), 0)
  assert.equal(unseenLabel(1), '1 new message')
  assert.equal(unseenLabel(12), '12 new messages')
  assert.equal(unseenLabel(140), '99+ new messages')
  assert.equal(unseenLabel(0), 'Latest messages')
})

test('near-latest threshold and outgoing text clean-up', () => {
  assert.equal(isNearLatest(0), true)
  assert.equal(isNearLatest(120), true)
  assert.equal(isNearLatest(121), false)
  assert.equal(prepareOutgoing('   hello  \n'), 'hello')
  assert.equal(prepareOutgoing('   '), '')
  assert.equal(prepareOutgoing('x'.repeat(CHAT_MAX_LENGTH + 50)).length, CHAT_MAX_LENGTH)
})
