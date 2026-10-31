/**
 * Pure helpers for the Team Chat screen (no React, no network) so the rules are tested with
 * `npm test`:
 *  - merging the "latest 50" poll with older pages the employee loaded by scrolling up,
 *  - day separators ("Today", "Yesterday", "Mon, 27 Oct", "12 Dec 2025"),
 *  - grouping consecutive messages from one person,
 *  - how many new messages arrived while the employee was reading older ones,
 *  - flipping a reaction on the phone straight away (the server answer replaces it).
 */

export interface ChatReactionLike {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChatMessageLike {
  id: number;
  senderId: number | null;
  senderName: string;
  isHr?: boolean;
  text: string;
  reactions: ChatReactionLike[];
  createdAt: string | null;
}

/** Newest page size the screen polls, and the size of each "load earlier" page. */
export const CHAT_PAGE_SIZE = 50;

/** Longest message the app lets someone type (the server has no limit; this keeps a chat a chat). */
export const CHAT_MAX_LENGTH = 2000;

/** Messages from the same person this close together are drawn as one group. */
const GROUP_GAP_MS = 5 * 60 * 1000;

/**
 * Joins message lists into one list, oldest first, one entry per id. When the same id appears
 * twice the LATER list wins, so pass the freshest data last (older pages first, the newest poll
 * last): a reaction someone added shows up even on a message that was also loaded as history.
 */
export function mergeMessages<T extends { id: number }>(...lists: (readonly T[] | null | undefined)[]): T[] {
  const byId = new Map<number, T>();
  for (const list of lists) {
    if (!list) continue;
    for (const m of list) {
      if (m && typeof m.id === 'number') byId.set(m.id, m);
    }
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Puts one changed message (e.g. the server's answer to a reaction) into a list, if it is there. */
export function replaceMessage<T extends { id: number }>(list: readonly T[] | null | undefined, updated: T): T[] {
  if (!list) return [];
  let changed = false;
  const next = list.map((m) => {
    if (m.id === updated.id) {
      changed = true;
      return updated;
    }
    return m;
  });
  return changed ? next : [...list];
}

/** The id to ask the server for "messages before this one", or null when nothing is loaded. */
export function oldestId(list: readonly { id: number }[]): number | null {
  if (!list.length) return null;
  let min = list[0].id;
  for (const m of list) if (m.id < min) min = m.id;
  return min;
}

export function newestId(list: readonly { id: number }[]): number | null {
  if (!list.length) return null;
  let max = list[0].id;
  for (const m of list) if (m.id > max) max = m.id;
  return max;
}

/**
 * A page shorter than the page size means the server has nothing older. A full page MAY have
 * more, so "Load earlier messages" stays offered until a short (or empty) page comes back.
 */
export function pageMayHaveMore(pageLength: number, pageSize = CHAT_PAGE_SIZE): boolean {
  return pageLength >= pageSize;
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

/** Adds or removes MY reaction on a message, the way the server will once it answers. */
export function toggleReactionLocal<T extends ChatMessageLike>(message: T, emoji: string, remove: boolean): T {
  const reactions = message.reactions.map((r) => ({ ...r }));
  const existing = reactions.find((r) => r.emoji === emoji);
  if (remove) {
    if (!existing || !existing.reactedByMe) return message;
    existing.count -= 1;
    existing.reactedByMe = false;
    return { ...message, reactions: reactions.filter((r) => r.count > 0) };
  }
  if (existing) {
    if (existing.reactedByMe) return message;
    existing.count += 1;
    existing.reactedByMe = true;
    return { ...message, reactions };
  }
  return { ...message, reactions: [...reactions, { emoji, count: 1, reactedByMe: true }] };
}

/** Whether tapping this emoji should remove my reaction (true) or add it (false). */
export function isMyReaction(message: ChatMessageLike, emoji: string): boolean {
  return message.reactions.some((r) => r.emoji === emoji && r.reactedByMe);
}

/** "2 people reacted thumbs-up emoji, you included" style summary for screen readers. */
export function reactionsSummary(reactions: readonly ChatReactionLike[]): string {
  if (!reactions.length) return '';
  return reactions
    .map((r) => `${r.emoji} ${r.count}${r.reactedByMe ? ' including you' : ''}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Days and times (written out by hand so the tests run without a date library)
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local calendar day key, e.g. "2026-10-31". */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Yesterday", "Mon, 27 Oct" (this year) or "12 Dec 2025" (another year). */
export function dayLabel(d: Date, now: Date): string {
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (d.getFullYear() === now.getFullYear()) {
    return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "9:05 AM" */
export function timeLabel(value: string | null | undefined): string {
  const d = parseTime(value);
  if (!d) return '';
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---------------------------------------------------------------------------
// Rows the list draws
// ---------------------------------------------------------------------------

export type ChatRow<T extends ChatMessageLike> =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: T;
      isMine: boolean;
      isHr: boolean;
      /** First message of a run from this sender: show the name. */
      startsGroup: boolean;
      /** Last message of a run: show the avatar and the bubble's "tail". */
      endsGroup: boolean;
    };

function sameGroup(a: ChatMessageLike, b: ChatMessageLike): boolean {
  const sameSender = a.senderId === b.senderId && (a.senderId !== null || a.senderName === b.senderName);
  if (!sameSender) return false;
  const ta = parseTime(a.createdAt);
  const tb = parseTime(b.createdAt);
  if (!ta || !tb) return false;
  if (dayKey(ta) !== dayKey(tb)) return false;
  return Math.abs(tb.getTime() - ta.getTime()) <= GROUP_GAP_MS;
}

/** True for a message HR or management wrote (the server sends `isHr`; older servers: no sender id). */
export function isHrMessage(m: ChatMessageLike): boolean {
  return m.isHr === true || m.senderId === null;
}

/**
 * Turns the messages (any order) into list rows, OLDEST FIRST: a day separator before the
 * first message of each day, then the messages with grouping flags. The screen reverses this
 * for its upside-down (newest-at-the-bottom) list.
 */
export function buildChatRows<T extends ChatMessageLike>(
  messages: readonly T[],
  myEmployeeId: number | null | undefined,
  now: Date,
): ChatRow<T>[] {
  const sorted = [...messages].sort((a, b) => a.id - b.id);
  const rows: ChatRow<T>[] = [];
  let lastDay: string | null = null;
  sorted.forEach((m, i) => {
    const t = parseTime(m.createdAt);
    const key = t ? dayKey(t) : 'unknown';
    if (key !== lastDay) {
      rows.push({ kind: 'day', key: `day-${key}`, label: t ? dayLabel(t, now) : 'Earlier' });
      lastDay = key;
    }
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    rows.push({
      kind: 'message',
      key: `m-${m.id}`,
      message: m,
      isMine: myEmployeeId != null && m.senderId === myEmployeeId,
      isHr: isHrMessage(m),
      startsGroup: !prev || !sameGroup(prev, m),
      endsGroup: !next || !sameGroup(m, next),
    });
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Scrolling and the "new messages" pill
// ---------------------------------------------------------------------------

/**
 * In the upside-down chat list, offset 0 is the newest message. Within this many points of
 * it the employee counts as "at the latest messages", so new ones simply appear.
 */
export const NEAR_LATEST_PX = 120;

export function isNearLatest(offsetFromLatest: number, threshold = NEAR_LATEST_PX): boolean {
  return offsetFromLatest <= threshold;
}

/** Messages from other people newer than the last one the employee saw. */
export function countUnseen(
  messages: readonly ChatMessageLike[],
  lastSeenId: number | null,
  myEmployeeId: number | null | undefined,
): number {
  if (lastSeenId == null) return 0;
  let n = 0;
  for (const m of messages) {
    if (m.id > lastSeenId && !(myEmployeeId != null && m.senderId === myEmployeeId)) n += 1;
  }
  return n;
}

/** "1 new message" / "12 new messages" / "99+ new messages" */
export function unseenLabel(count: number): string {
  if (count <= 0) return 'Latest messages';
  if (count > 99) return '99+ new messages';
  return `${count} new message${count === 1 ? '' : 's'}`;
}

/** What gets sent: trimmed, and never longer than the limit. Empty means "nothing to send". */
export function prepareOutgoing(text: string, max = CHAT_MAX_LENGTH): string {
  return text.trim().slice(0, max);
}
