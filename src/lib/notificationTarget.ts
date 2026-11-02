// What a notification's "View" button opens, in ONE place (pure functions, no React Native, unit-tested in
// notificationTarget.test.ts).
//
// The server says what a notification is about: every row of GET /notifications carries
//   target: null | { kind, id, date, role: 'self' | 'approver', category, label }
// (backend serializers.notification_json; the shared contract is the "Notification View target" note of 2026-11-02).
// `target: null` means there is genuinely nothing to open (a free-text message HR typed). An OLDER server sends no
// `target` key at all: then the notification's `type` (and, for a Department Head, its wording) decides, as before.
//
// This file maps a target to a screen of THIS app (expo-router paths under app/) with the query params those screens
// understand: `focus=<id>` (the request to scroll to and highlight), `date=YYYY-MM-DD` (the attendance day to open),
// `view=records` (On-Duty), `category=` (Approvals), `tab=requests` (HOD Assignment), `section=resignation` (Profile).
// It is defensive on purpose: anything missing or of the wrong type reads as "not sent", an unknown kind opens nothing.

import { APPROVALS_ROUTE, notificationRoute } from './compensation.ts';
import { CATEGORY_WIRE, categoryFromWire } from './approvalsHistory.ts';

export const TARGET_KINDS = [
  'leave',
  'casual_leave',
  'permission',
  'missing_punch',
  'outpass',
  'on_duty',
  'geo_punch',
  'attendance',
  'salary_slip',
  'documents',
  'id_card',
  'compensation',
  'advance',
  'resignation',
  'chat',
  'approvals',
  'my_requests',
  'request',
  'shift',
  'holidays',
  'profile',
] as const;

export type TargetKind = (typeof TARGET_KINDS)[number];
export type TargetRole = 'self' | 'approver';

export interface NotificationTarget {
  kind: TargetKind;
  /** The row the notification is about (leave request id, slip id, advance id, ...), when known. */
  id: number | null;
  /** 'YYYY-MM-DD' for a day event (a late / absent / missing-punch alert, an attendance edit). */
  date: string | null;
  /** 'approver': the reader has to act on it (a Department Head) -> the Approvals tab. */
  role: TargetRole;
  /** For an approver: the Approvals category on the wire ("casual_leave", "holiday_work", ...), or null. */
  category: string | null;
  /** The button text ("View leave request", "Open approvals"). */
  label: string;
}

/** Who is reading: decides the targets that only some people can open. Unknown = undefined / null. */
export interface TargetViewer {
  /** GET /manager/me said this person is a Department Head (the Approvals tab exists only then). */
  isManager?: boolean | null;
  /** The employee profile said 'staff' (true) or something else (false); null / undefined = not known yet. */
  isStaff?: boolean | null;
}

export interface TargetRoute {
  pathname: string;
  params: Record<string, string>;
}

/** What the View button of one notification does. */
export interface ViewAction {
  label: string;
  /** The expo-router href, query string included ("/(tabs)/leave?focus=12"). */
  href: string;
  route: TargetRoute;
  /** What a screen reader hears after the label. */
  hint: string;
  /** Where the target came from: the server's `target`, or the type-based fallback for an older server. */
  source: 'target' | 'fallback';
}

// ── small readers ───────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** "casualLeave", "Casual-Leave", " casual leave " -> "casual_leave". */
function snake(v: unknown): string {
  return str(v)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** A positive whole number (or a numeric string of one); anything else is null. */
export function positiveId(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** 'YYYY-MM-DD' that is a real calendar day (a longer ISO string is read by its date part); else null. */
export function isoDay(v: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const KIND_ALIASES: Record<string, TargetKind> = {
  approval: 'approvals',
  approver: 'approvals',
  salary: 'salary_slip',
  payslip: 'salary_slip',
  document: 'documents',
  idcard: 'id_card',
  myrequests: 'my_requests',
  employee_request: 'request',
  holiday: 'holidays',
  geopunch: 'geo_punch',
  onduty: 'on_duty',
  missingpunch: 'missing_punch',
  casualleave: 'casual_leave',
};

/** The kind, in this file's spelling, or null for one this app does not know. */
export function targetKind(v: unknown): TargetKind | null {
  const s = snake(v);
  if ((TARGET_KINDS as readonly string[]).includes(s)) return s as TargetKind;
  return KIND_ALIASES[s] ?? KIND_ALIASES[s.replace(/_/g, '')] ?? null;
}

// ── labels and hints ────────────────────────────────────────────────────────

const DEFAULT_LABEL: Record<TargetKind, string> = {
  leave: 'View leave request',
  casual_leave: 'View Casual Leave',
  permission: 'View permission',
  missing_punch: 'View missing punch',
  outpass: 'View outpass',
  on_duty: 'View On-Duty',
  geo_punch: 'View geo-punch',
  attendance: 'View attendance',
  salary_slip: 'View salary slip',
  documents: 'View documents',
  id_card: 'View ID card',
  compensation: 'View compensation',
  advance: 'View advance',
  resignation: 'View resignation',
  chat: 'Open chat',
  approvals: 'Open approvals',
  my_requests: 'View my requests',
  request: 'View request',
  shift: 'View shift',
  holidays: 'View holidays',
  profile: 'View profile',
};

/** The screen a View button opens, for the screen reader ("Opens your leave requests"). */
const SCREEN_NAME: Record<TargetKind, string> = {
  leave: 'your leave requests',
  casual_leave: 'your Casual Leave',
  permission: 'your permission requests',
  missing_punch: 'your missing punch requests',
  outpass: 'your outpasses',
  on_duty: 'your On-Duty records',
  geo_punch: 'Geo-Punch',
  attendance: 'your attendance',
  salary_slip: 'your salary slip',
  documents: 'your documents',
  id_card: 'your ID card',
  compensation: 'your compensation',
  advance: 'your advance',
  resignation: 'your resignation status',
  chat: 'the chat with HR',
  approvals: 'approvals',
  my_requests: 'your waiting requests',
  request: 'your waiting requests',
  shift: 'your shift',
  holidays: 'the holiday list',
  profile: 'your profile',
};

export function defaultTargetLabel(kind: TargetKind, role: TargetRole = 'self'): string {
  return role === 'approver' ? DEFAULT_LABEL.approvals : DEFAULT_LABEL[kind];
}

// ── the target ──────────────────────────────────────────────────────────────

/** The server's `target`, read defensively; null when it is null, not an object, or of a kind this app does not know. */
export function normalizeTarget(raw: unknown): NotificationTarget | null {
  if (!isObject(raw)) return null;
  const kind = targetKind(raw.kind);
  if (!kind) return null;
  const role: TargetRole = snake(raw.role) === 'approver' || kind === 'approvals' ? 'approver' : 'self';
  const category = str(raw.category) || null;
  return {
    kind,
    id: positiveId(raw.id),
    date: isoDay(raw.date),
    role,
    category,
    label: str(raw.label) || defaultTargetLabel(kind, role),
  };
}

/** For an approver target without a category: the Approvals category a request of this kind is listed under. */
const APPROVAL_CATEGORY_OF_KIND: Partial<Record<TargetKind, string>> = {
  leave: 'leave',
  casual_leave: 'casual_leave',
  permission: 'permission',
  missing_punch: 'missing_punch',
  outpass: 'outpass',
  on_duty: 'on_duty',
  attendance: 'attendance',
  compensation: 'holiday_work',
  resignation: 'resignation',
};

/** The category on the wire, checked against the Approvals tab's own list (an unknown one is dropped: the tab opens as it is). */
function approvalsCategory(t: NotificationTarget): string | null {
  const c = categoryFromWire(t.category ?? '') ?? categoryFromWire(APPROVAL_CATEGORY_OF_KIND[t.kind] ?? '');
  return c ? CATEGORY_WIRE[c] : null;
}

const withFocus = (pathname: string, id: number | null, extra: Record<string, string> = {}): TargetRoute => ({
  pathname,
  params: { ...extra, ...(id != null ? { focus: String(id) } : {}) },
});

/**
 * HOD Assignment -> My Requests keys its rows `<module>-<id>` (src/lib/pendingReminders.ts). A `my_requests` target says
 * which kind of request in the Approvals category words ("attendance" for an attendance change HR raised), so it is put
 * into the module word here; a `request` target is a general request.
 */
const MY_REQUESTS_MODULE: Record<string, string> = {
  attendance: 'attendance_correction',
  attendance_correction: 'attendance_correction',
  leave: 'leave',
  permission: 'permission',
  casual_leave: 'casual_leave',
  missing_punch: 'missing_punch',
  on_duty: 'on_duty',
  outpass: 'outpass',
  resignation: 'resignation',
  advance: 'advance',
  request: 'request',
  holiday_work: 'holiday_work',
};

function myRequestsRoute(t: NotificationTarget): TargetRoute {
  const module = t.kind === 'request' ? 'request' : MY_REQUESTS_MODULE[snake(t.category)];
  if (t.id == null) return { pathname: '/hod-assignment', params: { tab: 'requests' } };
  return withFocus('/hod-assignment', t.id, { tab: 'requests', ...(module ? { module } : {}) });
}

/**
 * The screen of this app a target opens, or null when there is none for this reader:
 *  * an approver target opens the Approvals tab, which only a Department Head has (`isManager === true`: anyone else, or
 *    a profile not loaded yet, would be bounced to Home by the tab bar - see app/(tabs)/_layout.tsx);
 *  * compensation is for staff only: hidden once the profile says the reader is not staff;
 *  * list screens get `focus=<id>` to scroll to and highlight the request; detail screens open the row itself.
 */
export function routeForTarget(t: NotificationTarget, viewer: TargetViewer = {}): TargetRoute | null {
  if (t.role === 'approver') {
    if (viewer.isManager !== true) return null;
    const category = approvalsCategory(t);
    return withFocus(APPROVALS_ROUTE, t.id, category ? { category } : {});
  }
  switch (t.kind) {
    case 'leave':
      return withFocus('/(tabs)/leave', t.id);
    case 'casual_leave':
      return withFocus('/casual-leave', t.id);
    case 'permission':
      return withFocus('/requests', t.id);
    case 'missing_punch':
      return withFocus('/missing-punch', t.id);
    case 'outpass':
      return withFocus('/outpass', t.id);
    case 'on_duty':
      return withFocus('/on-duty', t.id, { view: 'records' });
    case 'geo_punch':
      return { pathname: '/geo-punch', params: {} };
    case 'attendance':
      return { pathname: '/(tabs)/attendance', params: t.date ? { date: t.date } : {} };
    case 'salary_slip':
      return t.id != null ? { pathname: `/salary/${t.id}`, params: {} } : { pathname: '/salary', params: {} };
    case 'documents':
      return { pathname: '/documents', params: {} };
    case 'id_card':
      return { pathname: '/idcard', params: {} };
    case 'compensation':
      // `id` is a holiday / Sunday work claim; the Compensation screen lists it as the row "hw-<id>".
      return viewer.isStaff === false ? null : withFocus('/compensation', t.id);
    case 'advance':
      return t.id != null ? { pathname: `/settlement/${t.id}`, params: {} } : { pathname: '/settlement', params: {} };
    case 'resignation':
      // There is no resignation status screen of its own: the "Resignation & Exit" row of the Profile tab shows where it
      // stands (and opens the details). `section=resignation` scrolls to that row and highlights it.
      return { pathname: '/(tabs)/profile', params: { section: 'resignation' } };
    case 'chat':
      return { pathname: '/chat', params: {} };
    case 'approvals':
      return null; // always an approver target (normalizeTarget), handled above
    case 'my_requests':
    case 'request':
      // My Requests on HOD Assignment: every request still waiting, and the attendance changes HR raised (this app has no
      // screen of its own for a general request either). With an id it scrolls to that row.
      return myRequestsRoute(t);
    case 'shift':
      return { pathname: '/shift', params: {} };
    case 'holidays':
      return { pathname: '/holidays', params: {} };
    case 'profile':
      return { pathname: '/(tabs)/profile', params: {} };
    default:
      return null;
  }
}

/** "/(tabs)/leave?focus=12": the route as one href string (params in the order they were added, URI-encoded). */
export function hrefOf(route: TargetRoute): string {
  const query = Object.entries(route.params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return query ? `${route.pathname}?${query}` : route.pathname;
}

// ── an older server: no `target` ────────────────────────────────────────────

/** The `type` of a notification -> the kind it is about, for a server that sends no `target`. */
const TYPE_KIND: Record<string, TargetKind> = {
  leave: 'leave',
  casual_leave: 'casual_leave',
  permission: 'permission',
  on_duty: 'on_duty',
  missing_punch: 'missing_punch',
  attendance: 'attendance',
  employee_request: 'request',
  resignation: 'resignation',
  advance: 'advance',
  outpass: 'outpass',
  salary_slip: 'salary_slip',
  id_card: 'id_card',
  offer_letter: 'documents',
  experience_letter: 'documents',
  resignation_letter: 'documents',
  other: 'documents',
};

/** The types whose "... is waiting for your approval" notice goes to a Department Head (approval_workflow.notify_hod_of_request). */
const APPROVER_TYPES = new Set(['leave', 'casual_leave', 'permission', 'on_duty', 'missing_punch', 'attendance', 'outpass', 'resignation']);
const WAITING_FOR_YOU = /waiting for your approval/i;

/**
 * The target an older server would have sent, guessed from the notification's `type` (and its wording, for the
 * Department Head's "X's leave is waiting for your approval"). Starts from notificationRoute() in compensation.ts, which
 * decided where a tap went before View existed, so those notifications keep opening the same screens. Null for a type
 * that opens nothing ("general", a WhatsApp "approval" notice that does not say which module, visitors).
 */
export function fallbackTarget(type: unknown, message: unknown, viewer: TargetViewer = {}): NotificationTarget | null {
  const t = snake(type);
  const legacy = notificationRoute(t, viewer);
  if (legacy === '/compensation') return make('compensation', 'self', null);
  if (legacy === APPROVALS_ROUTE) return make('approvals', 'approver', t === 'holiday_work' ? 'holiday_work' : null);
  if (APPROVER_TYPES.has(t) && WAITING_FOR_YOU.test(str(message))) return make(TYPE_KIND[t], 'approver', t);
  const kind = TYPE_KIND[t];
  return kind ? make(kind, 'self', null) : null;
}

function make(kind: TargetKind, role: TargetRole, category: string | null): NotificationTarget {
  return { kind, id: null, date: null, role, category, label: defaultTargetLabel(kind, role) };
}

/** The part of a notification row this file reads. */
export interface NotificationLike {
  type?: unknown;
  message?: unknown;
  target?: unknown;
}

/**
 * The View button of one notification, or null when it has none: the server's `target` when the row has that key (even
 * `null`, which means "nothing to open"), else the type-based fallback of an older server; then routed for this reader.
 */
export function viewActionFor(n: NotificationLike, viewer: TargetViewer = {}): ViewAction | null {
  const fromServer = isObject(n) && Object.prototype.hasOwnProperty.call(n, 'target');
  const target = fromServer ? normalizeTarget(n.target) : fallbackTarget(n?.type, n?.message, viewer);
  if (!target) return null;
  const route = routeForTarget(target, viewer);
  if (!route) return null;
  const screen = target.role === 'approver' ? SCREEN_NAME.approvals : SCREEN_NAME[target.kind];
  return {
    label: target.label,
    href: hrefOf(route),
    route,
    hint: `Marks it read and opens ${screen}`,
    source: fromServer ? 'target' : 'fallback',
  };
}

// ── long messages ───────────────────────────────────────────────────────────

/** Roughly how many characters fit on one line of a notification card on a phone. */
const CHARS_PER_LINE = 44;

/** Whether a message is longer than `lines` lines of a card (then the card offers "Show more"). An estimate: lines are
 *  counted from the text's own line breaks and its length. */
export function isLongMessage(message: unknown, lines: number): boolean {
  const text = str(message);
  if (!text) return false;
  const estimated = text.split('\n').reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / CHARS_PER_LINE)), 0);
  return estimated > lines;
}

// ── a delivered push ────────────────────────────────────────────────────────

/** The notification id a delivered push carries (`data.notificationId`, see backend/api/signals.py), read from the object
 *  expo-notifications hands the tap handler. Null for anything else. */
export function pushNotificationId(notification: unknown): number | null {
  if (!isObject(notification)) return null;
  const request = notification.request;
  if (!isObject(request) || !isObject(request.content) || !isObject(request.content.data)) return null;
  return positiveId(request.content.data.notificationId);
}

export const NOTIFICATIONS_ROUTE = '/(tabs)/notifications';

/** Where a tapped push opens: the Notifications list, scrolled to that notification (`highlight=<id>`) when it says which. */
export function pushTapHref(notification: unknown): string {
  const id = pushNotificationId(notification);
  return id != null ? `${NOTIFICATIONS_ROUTE}?highlight=${id}` : NOTIFICATIONS_ROUTE;
}
