// The Notifications page as a to-do list (owner 2026-11-25): pure helpers, no React Native, unit-tested in
// notificationList.test.ts. The screen is app/(tabs)/notifications.tsx; the rows and the detail sheet are in
// src/components/notifications/.
//
// - every notification falls in one of three groups by the day it arrived: Today, Yesterday, Earlier;
// - the rows show one line of the message and a short time ("5 min ago", "9:14 am", "12 Nov");
// - the detail sheet shows the whole message and the full time ("Tuesday, 25 Nov 2026 at 3:42 pm");
// - each notification type has its own icon, colour tone and headline (a WhatsApp-made one brings its own headline).

export type NotificationFilter = 'all' | 'unread';
export type DayGroup = 'today' | 'yesterday' | 'earlier';

export const DAY_GROUP_ORDER: readonly DayGroup[] = ['today', 'yesterday', 'earlier'];
export const DAY_GROUP_LABEL: Record<DayGroup, string> = { today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' };

/** What these helpers read of a notification (src/hooks/useAppNotifications.ts AppNotification). */
export interface ListNotification {
  id: number;
  isRead: boolean;
  createdAt: string;
  title?: string;
  message: string;
  type?: string;
}

export type NotificationListRow<T> =
  | { kind: 'header'; key: string; group: DayGroup; label: string; count: number; unread: number }
  | { kind: 'item'; key: string; group: DayGroup; item: T; first: boolean; last: boolean };

// ── time ────────────────────────────────────────────────────────────────────

/** The time a notification arrived, or null when the server sent something that is not a date. */
export function parseTime(createdAt: unknown): Date | null {
  if (typeof createdAt !== 'string' || createdAt.trim() === '') return null;
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Today / Yesterday / Earlier, by the phone's own calendar day. A time a little in the future (the server's clock ahead
 *  of the phone's) counts as today; an unreadable one as earlier. */
export function dayGroup(createdAt: unknown, now: Date): DayGroup {
  const d = parseTime(createdAt);
  if (!d) return 'earlier';
  const today = startOfDay(now);
  const day = startOfDay(d);
  if (day >= today) return 'today';
  // Yesterday is the calendar day before today (not "24 hours"), daylight-saving days included.
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  return day >= y ? 'yesterday' : 'earlier';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "9:05 am", "12:30 pm". */
export function clockTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** The short time on a row: "Just now", "5 min ago", "3 h ago" today; the clock time yesterday (the group already says
 *  which day); "12 Nov" earlier this year and "12 Nov 2025" before that. */
export function shortTime(createdAt: unknown, now: Date): string {
  const d = parseTime(createdAt);
  if (!d) return '';
  const group = dayGroup(createdAt, now);
  if (group === 'today') {
    const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)} h ago`;
  }
  if (group === 'yesterday') return clockTime(d);
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/** The detail sheet's time: "Today at 3:42 pm", "Yesterday at 9:05 am", "Tuesday, 18 Nov 2026 at 3:42 pm". */
export function fullTime(createdAt: unknown, now: Date): string {
  const d = parseTime(createdAt);
  if (!d) return '';
  const group = dayGroup(createdAt, now);
  if (group === 'today') return `Today at ${clockTime(d)}`;
  if (group === 'yesterday') return `Yesterday at ${clockTime(d)}`;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} at ${clockTime(d)}`;
}

// ── text ────────────────────────────────────────────────────────────────────

/** The message on one line: line breaks and runs of spaces become single spaces. */
export function previewLine(message: unknown): string {
  return typeof message === 'string' ? message.replace(/\s+/g, ' ').trim() : '';
}

// ── the list ────────────────────────────────────────────────────────────────

/**
 * The notifications a filter shows, in the server's order (newest first). `keep`: ids that stay on the Unread list a
 * moment after they were ticked, so the tick can be seen before the row leaves.
 */
export function visibleNotifications<T extends ListNotification>(
  items: readonly T[] | undefined,
  filter: NotificationFilter,
  keep: ReadonlySet<number> = new Set(),
): T[] {
  return (items ?? []).filter((n) => filter === 'all' || !n.isRead || keep.has(n.id));
}

/** How many are unread. */
export function unreadCount(items: readonly ListNotification[] | undefined): number {
  return (items ?? []).reduce((sum, n) => sum + (n.isRead ? 0 : 1), 0);
}

/**
 * The list's rows: a header for each day group that has notifications (Today, Yesterday, Earlier, in that order), then
 * its notifications in the server's order. `first` / `last` mark a group's ends (the rows of a group are drawn as one
 * card).
 */
export function groupNotifications<T extends ListNotification>(items: readonly T[], now: Date): NotificationListRow<T>[] {
  const groups: Record<DayGroup, T[]> = { today: [], yesterday: [], earlier: [] };
  for (const n of items) groups[dayGroup(n.createdAt, now)].push(n);
  const rows: NotificationListRow<T>[] = [];
  for (const group of DAY_GROUP_ORDER) {
    const list = groups[group];
    if (!list.length) continue;
    rows.push({
      kind: 'header',
      key: `h-${group}`,
      group,
      label: DAY_GROUP_LABEL[group],
      count: list.length,
      unread: unreadCount(list),
    });
    list.forEach((item, i) => {
      rows.push({ kind: 'item', key: `n-${item.id}`, group, item, first: i === 0, last: i === list.length - 1 });
    });
  }
  return rows;
}

/** Where the row of notification `id` is in `rows`, or -1. */
export function rowIndexOf<T extends ListNotification>(rows: readonly NotificationListRow<T>[], id: number): number {
  return rows.findIndex((r) => r.kind === 'item' && r.item.id === id);
}

// ── the kinds ───────────────────────────────────────────────────────────────

/** Which palette colours a kind uses (the component maps a tone onto the theme). */
export type NotificationTone = 'blue' | 'green' | 'yellow' | 'red' | 'neutral';

export interface NotificationKind {
  /** A MaterialCommunityIcons name. */
  icon: string;
  tone: NotificationTone;
  /** The headline of a notification that has none of its own, and the kind's name in the detail sheet. */
  title: string;
}

// The real `type` values the backend creates (every Notification.objects.create() call site, and the WhatsApp-made ones
// of backend/api/push_messages.py); anything else is a plain "Notification".
const KINDS: Record<string, NotificationKind> = {
  leave: { icon: 'umbrella-outline', tone: 'blue', title: 'Leave update' },
  casual_leave: { icon: 'calendar-heart', tone: 'blue', title: 'Casual Leave update' },
  permission: { icon: 'hand-wave-outline', tone: 'blue', title: 'Permission update' },
  on_duty: { icon: 'briefcase-check-outline', tone: 'blue', title: 'On-Duty update' },
  missing_punch: { icon: 'fingerprint', tone: 'yellow', title: 'Missing punch update' },
  attendance: { icon: 'calendar-check-outline', tone: 'green', title: 'Attendance update' },
  employee_request: { icon: 'file-document-outline', tone: 'blue', title: 'Request update' },
  enquiry: { icon: 'message-question-outline', tone: 'blue', title: 'Enquiry update' },
  resignation: { icon: 'file-sign', tone: 'red', title: 'Resignation update' },
  // to the employee: the Department Head decided one of their compensation claims
  compensation: { icon: 'briefcase-clock-outline', tone: 'green', title: 'Compensation update' },
  // to the Department Head: a compensation claim waits for their decision
  holiday_work: { icon: 'clipboard-clock-outline', tone: 'yellow', title: 'Compensation approval' },
  advance: { icon: 'cash-fast', tone: 'blue', title: 'Advance update' },
  approval: { icon: 'check-decagram-outline', tone: 'blue', title: 'Request update' },
  approval_reminder: { icon: 'bell-ring-outline', tone: 'yellow', title: 'Reminder' },
  outpass: { icon: 'exit-run', tone: 'yellow', title: 'Outpass' },
  visitors: { icon: 'account-group-outline', tone: 'blue', title: 'Visitor' },
  salary_slip: { icon: 'cash-multiple', tone: 'green', title: 'Salary slip' },
  id_card: { icon: 'card-account-details-outline', tone: 'blue', title: 'ID card' },
  offer_letter: { icon: 'file-document-outline', tone: 'blue', title: 'Offer letter' },
  experience_letter: { icon: 'file-document-outline', tone: 'blue', title: 'Experience letter' },
  resignation_letter: { icon: 'file-sign', tone: 'red', title: 'Resignation letter' },
  other: { icon: 'paperclip', tone: 'blue', title: 'Document' },
  general: { icon: 'bell-outline', tone: 'neutral', title: 'Notification' },
};

/** The icon, tone and name of a notification type ("leave", "enquiry", ...); unknown types are a plain notification. */
export function notificationKind(type: unknown): NotificationKind {
  const key = typeof type === 'string' ? type.trim().toLowerCase() : '';
  return KINDS[key] ?? KINDS.general;
}

/** The headline a row shows: the notification's own title (WhatsApp-made ones have one), else its kind's name. */
export function notificationHeadline(n: { title?: unknown; type?: unknown }): string {
  const own = typeof n.title === 'string' ? n.title.trim() : '';
  return own || notificationKind(n.type).title;
}
