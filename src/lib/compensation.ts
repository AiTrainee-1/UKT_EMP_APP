// What the Compensation screen and the Department Head's Approvals tab show, in ONE place (pure functions, no React
// Native, unit-tested in compensation.test.ts).
//
// The server is the authority on everything here (backend/api/employee_compensation_views.py): which compensations were
// detected for the employee, which HR assigned, the balance in shifts, the announced company windows, the birthday leave.
// This file only READS what it sends and words it for the phone. It is defensive on purpose:
//   * a field that is missing or of the wrong type reads as "not sent" (never throws);
//   * an item of a kind this app has never heard of is shown generically (the server's own title and detail);
//   * a malformed reply as a whole is `null`, which the hook turns into an error state with a Retry button.
//
// Compensation is for STAFF only. A production employee's reply has `isStaff: false`, nothing listed and a message.

import type { ContactBlock } from './supportContact.ts';
import { COMPENSATION_TONES } from './attendanceVisual.ts';
import type { CompensationTone } from './attendanceVisual.ts';

// ── small readers ───────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A string field, trimmed; anything else (missing, null, a number, an object) is "". */
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A number field: a finite number, or a numeric string; anything else is null. */
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const bool = (v: unknown): boolean => v === true;

/** "pending_hod" -> "Pending hod": the fallback for a status the server sent without its own label. */
export function prettify(raw: string): string {
  const s = raw.replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ── dates and quantities ────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'YYYY-MM-DD' (a longer ISO string is read by its date part) as a local calendar date, or null. No time zone is
 *  involved: these are calendar dates, and `new Date('2026-10-12')` would be UTC midnight. */
export function parseIsoDate(iso: unknown): Date | null {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
}

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The ISO date `n` days after `iso` (negative: before). '' for a date that does not parse. */
export function addDaysIso(iso: string, n: number): string {
  const d = parseIsoDate(iso);
  if (!d) return '';
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** "Mon, 12 Oct 2026", or '' when the date does not parse. */
export function formatLongDate(iso: unknown): string {
  const d = parseIsoDate(iso);
  return d ? `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}

/** "12 Oct 2026", or '' when the date does not parse. */
export function formatDayMonthYear(iso: unknown): string {
  const d = parseIsoDate(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}

/** Shifts written the way the HRMS writes them everywhere (the server's shifts_text, the web app): two decimals, "0.25",
 *  "0.50", "1.00", "1.25". Never 0.500000001. The same text on every title, fact and the balance, so one card never says
 *  "0.50" in its title and "0.5" in its chip. */
export function shiftsText(n: number): string {
  return n.toFixed(2);
}

/** "shift" up to and including 1, "shifts" above it (the web app's rule: "0.50 shift", "1.00 shift", "1.50 shifts").
 *  Read from the rounded value, so the unit always agrees with the text printed next to it. */
export function shiftsUnit(n: number): 'shift' | 'shifts' {
  return Number(n.toFixed(2)) > 1 ? 'shifts' : 'shift';
}

/** "0.25 shift", "0.50 shift", "1.00 shift", "1.50 shifts"; null when there is no number. */
export function shiftsLabel(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `${shiftsText(n)} ${shiftsUnit(n)}`;
}

/** "30 min", "1 h", "1 h 30 min"; null when there is no (positive) number. */
export function minutesText(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m) || m <= 0) return null;
  const total = Math.round(m);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const r = total % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

// ── kinds, groups, statuses ─────────────────────────────────────────────────

/** Colours and a symbol for a kind of item. The five kinds the calendar draws share its colours exactly, so one colour
 *  means one thing everywhere in the app. */
export type KindTone = CompensationTone;

const AMBER: KindTone = { label: 'Extra hours', solid: '#B45309', softLight: '#FEF3C7', softDark: '#D9770638', inkLight: '#92400E', inkDark: '#FCD34D', icon: 'briefcase-clock-outline' };
const GREEN: KindTone = { label: 'Overtime pay', solid: '#15803D', softLight: '#DCFCE7', softDark: '#16A34A38', inkLight: '#166534', inkDark: '#86EFAC', icon: 'cash-plus' };
const VIOLET: KindTone = { label: 'Sunday / holiday work', solid: '#6D28D9', softLight: '#EDE9FE', softDark: '#7C3AED38', inkLight: '#5B21B6', inkDark: '#C4B5FD', icon: 'calendar-star' };
const SLATE: KindTone = { label: 'Compensation', solid: '#475569', softLight: '#E2E8F0', softDark: '#94A3B833', inkLight: '#334155', inkDark: '#CBD5E1', icon: 'star-four-points-outline' };

/** How an item of this `kind` looks. A kind this app does not know gets a neutral tone and its own name, so a newer
 *  backend never shows up as a blank or a crash. */
export function kindTone(kind: string): KindTone {
  switch (kind) {
    case 'ot_allowance':
      return COMPENSATION_TONES.ot_allowance;
    case 'ot_shift':
      return AMBER;
    case 'ot_shift_relaxation':
      return COMPENSATION_TONES.relaxation;
    case 'ot_shift_pay':
      return GREEN;
    case 'holiday_work':
      return VIOLET;
    case 'redemption':
      return { ...COMPENSATION_TONES.relaxation, label: 'Compensation day taken', icon: 'calendar-check-outline' };
    case 'window_late_in':
      return COMPENSATION_TONES.window_late_in;
    case 'window_early_out':
      return COMPENSATION_TONES.window_early_out;
    case 'birthday':
      return COMPENSATION_TONES.birthday;
    default:
      return { ...SLATE, label: prettify(kind) || SLATE.label };
  }
}

export interface GroupMeta {
  group: string;
  title: string;
  subtitle: string;
}

/** The sections of "My Compensation", in the order they are shown. */
export const GROUPS: GroupMeta[] = [
  { group: 'detected', title: 'Detected for you', subtitle: 'Found automatically from your attendance' },
  { group: 'assigned', title: 'Assigned by HR', subtitle: 'Given to you by HR' },
  { group: 'company', title: 'Company announcements', subtitle: 'Late-in and early-out times for everybody' },
  { group: 'birthday', title: 'Birthday leave', subtitle: 'Paid leave on your birthday' },
  { group: 'balance', title: 'Balance used', subtitle: 'Compensation days HR took from your balance' },
];

export type StatusTone = 'good' | 'info' | 'warn' | 'bad' | 'neutral';

const STATUS_TONE: Record<string, StatusTone> = {
  used: 'good',
  applied: 'good',
  approved: 'good',
  paid: 'good',
  available: 'good',
  assigned: 'info',
  scheduled: 'info',
  upcoming: 'info',
  taken: 'info',
  auto: 'info',
  today: 'warn',
  pending: 'warn',
  pending_hod: 'warn',
  detected: 'warn',
  rejected: 'bad',
  not_used: 'neutral',
  not_applied: 'neutral',
  not_applicable: 'neutral',
};

/** The colour family of a status chip. A status this app does not know is neutral. */
export function statusTone(status: string): StatusTone {
  return STATUS_TONE[status] ?? 'neutral';
}

// ── the reply of GET /employee/compensation ─────────────────────────────────

export interface CompensationItem {
  key: string;
  /** ot_allowance | ot_shift | ot_shift_relaxation | ot_shift_pay | holiday_work | redemption | window_late_in |
   *  window_early_out | birthday, or a kind added later. */
  kind: string;
  /** detected | assigned | company | birthday | balance, or a group added later. */
  group: string;
  /** The date the item is filed under (YYYY-MM-DD), or null. */
  date: string | null;
  title: string;
  detail: string;
  status: string;
  statusLabel: string;
  shifts: number | null;
  minutes: number | null;
  minutesUsed: number | null;
  used: boolean | null;
  /** An announced window's time (HH:MM). */
  time: string | null;
  /** The day the extra / holiday work was done, when it differs from `date`. */
  workDate: string | null;
  legacy: boolean;
}

export interface AllowanceNotice {
  /** The working day the allowance applies on. */
  date: string;
  minutes: number;
  workDate: string | null;
  /** The latest arrival that is still on time that day ("09:45"). */
  onTimeUntil: string | null;
  note: string;
}

export interface CompensationFlags {
  master: boolean;
  allowance: boolean;
  shift: boolean;
  relaxation: boolean;
  pay: boolean;
  windows: boolean;
  holidayWork: boolean;
  birthday: boolean;
  any: boolean;
}

export interface AskHr {
  title: string;
  text: string;
  points: string[];
  contact: ContactBlock | null;
}

export interface EmployeeCompensation {
  isStaff: boolean;
  enabled: CompensationFlags;
  /** The balance in shifts: Sunday / holiday work approved by the Department Head, less what HR already took. */
  balanceShifts: number;
  items: CompensationItem[];
  todayAllowance: AllowanceNotice | null;
  tomorrowAllowance: AllowanceNotice | null;
  askHr: AskHr | null;
  /** Why there is nothing to show (production employees). */
  message: string | null;
}

export const ASK_HR_TITLE = 'Ask Request for Compensation';
export const ASK_HR_FALLBACK_TEXT =
  'The system detects when you work extra hours, or on a Sunday or a company holiday, and shows it on the My Compensation tab. ' +
  'If you worked extra and it is missing from the list, or you want to claim compensation, contact HR.';
/** Said on the Ask tab whatever the server sends: the employee cannot assign compensation to themselves. */
export const ASK_HR_NOT_SELF_SERVICE =
  'Compensation is assigned by HR. You cannot assign or claim it yourself in this app: contact HR, who will check your attendance and give it to you.';
export const STAFF_ONLY_MESSAGE = 'Compensation is for staff employees only.';

const NO_FLAGS: CompensationFlags = {
  master: false, allowance: false, shift: false, relaxation: false, pay: false, windows: false, holidayWork: false, birthday: false, any: false,
};

function readFlags(raw: unknown): CompensationFlags {
  if (!isObject(raw)) return { ...NO_FLAGS };
  const f = {
    master: bool(raw.master),
    allowance: bool(raw.allowance),
    shift: bool(raw.shift),
    relaxation: bool(raw.relaxation),
    pay: bool(raw.pay),
    windows: bool(raw.windows),
    holidayWork: bool(raw.holidayWork),
    birthday: bool(raw.birthday),
  };
  const any = typeof raw.any === 'boolean' ? raw.any : f.allowance || f.shift || f.windows || f.holidayWork || f.birthday;
  return { ...f, any };
}

function readItem(raw: unknown, index: number): CompensationItem | null {
  if (!isObject(raw)) return null;
  const kind = str(raw.kind);
  const status = str(raw.status);
  const tone = kindTone(kind);
  return {
    key: str(raw.key) || `item-${index}`,
    kind,
    group: str(raw.group) || 'other',
    date: parseIsoDate(raw.date) ? str(raw.date).slice(0, 10) : null,
    title: str(raw.title) || tone.label,
    detail: str(raw.detail),
    status,
    statusLabel: str(raw.statusLabel) || prettify(status),
    shifts: num(raw.shifts),
    minutes: num(raw.minutes),
    minutesUsed: num(raw.minutesUsed),
    used: typeof raw.used === 'boolean' ? raw.used : null,
    time: str(raw.time) || null,
    workDate: parseIsoDate(raw.workDate) ? str(raw.workDate).slice(0, 10) : null,
    legacy: bool(raw.legacy),
  };
}

function readAllowance(raw: unknown): AllowanceNotice | null {
  if (!isObject(raw)) return null;
  const date = parseIsoDate(raw.date) ? str(raw.date).slice(0, 10) : '';
  const minutes = num(raw.minutes);
  if (!date || minutes == null || minutes <= 0) return null;
  return {
    date,
    minutes,
    workDate: parseIsoDate(raw.workDate) ? str(raw.workDate).slice(0, 10) : null,
    onTimeUntil: /^\d{1,2}:\d{2}/.test(str(raw.onTimeUntil)) ? str(raw.onTimeUntil).slice(0, 5) : null,
    note: str(raw.note),
  };
}

/** The same rules as supportContact.ts, kept here so this file has no React Native import and can be unit-tested. */
export function readContact(raw: unknown): ContactBlock | null {
  if (!isObject(raw)) return null;
  const phone = str(raw.phone);
  const whatsapp = str(raw.whatsapp);
  const email = str(raw.email);
  return {
    label: str(raw.label) || 'HR Department',
    phone,
    phoneDial: str(raw.phoneDial),
    whatsapp,
    whatsappNumber: str(raw.whatsappNumber),
    email,
    hours: str(raw.hours),
    hasContact: phone !== '' || whatsapp !== '' || email !== '',
    usesHrFallback: raw.usesHrFallback === true,
  };
}

function readAskHr(raw: unknown): AskHr | null {
  if (!isObject(raw)) return null;
  return {
    title: str(raw.title) || ASK_HR_TITLE,
    text: str(raw.text) || ASK_HR_FALLBACK_TEXT,
    points: (Array.isArray(raw.points) ? raw.points : []).map(str).filter((p) => p !== ''),
    contact: readContact(raw.contact),
  };
}

/**
 * The reply of GET /employee/compensation as the screen uses it, or null when it is not an object (an older backend's
 * 404 page, a proxy's error page): nothing malformed can reach a screen. Items that do not parse are left out.
 */
export function normalizeCompensation(raw: unknown): EmployeeCompensation | null {
  if (!isObject(raw)) return null;
  const seen = new Map<string, number>();
  const items: CompensationItem[] = [];
  (Array.isArray(raw.items) ? raw.items : []).forEach((r, i) => {
    const item = readItem(r, i);
    if (!item) return;
    // React needs unique keys; the server's are, but one repeated key must not drop a row or warn.
    const n = seen.get(item.key) ?? 0;
    seen.set(item.key, n + 1);
    items.push(n === 0 ? item : { ...item, key: `${item.key}#${n}` });
  });
  const balance = num(raw.balanceShifts);
  return {
    isStaff: raw.isStaff !== false,
    enabled: readFlags(raw.enabled),
    balanceShifts: balance != null && balance > 0 ? balance : 0,
    items,
    todayAllowance: readAllowance(raw.todayAllowance),
    tomorrowAllowance: readAllowance(raw.tomorrowAllowance),
    askHr: readAskHr(raw.askHr),
    message: str(raw.message) || null,
  };
}

/** The Ask tab's content: the server's, or the standard wording when it sent none. */
export function askHrOf(data: Pick<EmployeeCompensation, 'askHr'>): AskHr {
  return data.askHr ?? { title: ASK_HR_TITLE, text: ASK_HR_FALLBACK_TEXT, points: [], contact: null };
}

// ── sections, facts, banners ────────────────────────────────────────────────

export interface ItemSection extends GroupMeta {
  items: CompensationItem[];
}

const byDateDesc = (a: CompensationItem, b: CompensationItem) => {
  if (a.date !== b.date) return (b.date ?? '').localeCompare(a.date ?? '');
  return b.key.localeCompare(a.key);
};

/** The items grouped by the server's `group`, in the order the screen shows them (known groups first; a group added later
 *  comes after them, named after itself), each newest first. Empty groups are left out. */
export function groupItems(items: CompensationItem[]): ItemSection[] {
  const known = new Set(GROUPS.map((g) => g.group));
  const extra: GroupMeta[] = [];
  for (const it of items) {
    if (!known.has(it.group) && !extra.some((g) => g.group === it.group)) {
      extra.push({ group: it.group, title: prettify(it.group) || 'Other', subtitle: '' });
    }
  }
  return [...GROUPS, ...extra]
    .map((g) => ({ ...g, items: items.filter((it) => it.group === g.group).sort(byDateDesc) }))
    .filter((s) => s.items.length > 0);
}

export interface ItemFact {
  icon: string;
  text: string;
}

/** The small facts under an item: shifts, minutes, minutes used, the announced time, the day the work was done. */
export function itemFacts(item: CompensationItem): ItemFact[] {
  const facts: ItemFact[] = [];
  const shifts = shiftsLabel(item.shifts);
  if (shifts) facts.push({ icon: 'timer-sand', text: shifts });
  const minutes = minutesText(item.minutes);
  if (item.kind === 'ot_allowance') {
    if (minutes) facts.push({ icon: 'clock-plus-outline', text: `${minutes} allowance` });
    const used = minutesText(item.minutesUsed);
    if (used) facts.push({ icon: 'check-circle-outline', text: `Used ${used}` });
  } else if (minutes && (item.kind === 'ot_shift' || item.kind === 'ot_shift_relaxation' || item.kind === 'ot_shift_pay')) {
    facts.push({ icon: 'clock-outline', text: `${minutes} past shift end` });
  }
  if (item.time) facts.push({ icon: 'clock-outline', text: `At ${item.time}` });
  if (item.workDate && item.workDate !== item.date) {
    const worked = formatLongDate(item.workDate);
    if (worked) facts.push({ icon: 'briefcase-outline', text: `Worked ${worked}` });
  }
  return facts;
}

/** The chip text on a record from before the compensation overhaul (the server flags it `legacy: true`; the web app draws
 *  the same words). */
export const EARLIER_RECORD_LABEL = 'Earlier record';

/** "Earlier record" for a legacy item, else null. */
export function earlierRecordLabel(item: Pick<CompensationItem, 'legacy'>): string | null {
  return item.legacy === true ? EARLIER_RECORD_LABEL : null;
}

export interface AllowanceView {
  title: string;
  body: string;
  /** "09:45": the latest arrival that is still on time. */
  until: string | null;
}

/** The banner for the next-day late-in allowance. `todayIso` is the phone's today (the server's `date` is the working day
 *  it applies on, which for "tomorrow" can be a Monday). */
export function allowanceView(n: AllowanceNotice, which: 'today' | 'tomorrow', todayIso: string): AllowanceView {
  const amount = minutesText(n.minutes) ?? `${n.minutes} min`;
  let when = 'today';
  if (which === 'tomorrow') {
    const longDate = formatLongDate(n.date);
    when = n.date === addDaysIso(todayIso, 1) || !longDate ? 'tomorrow' : `on ${longDate}`;
  }
  const worked = n.workDate ? formatLongDate(n.workDate) : '';
  return {
    title: `Late-in allowance ${when}: ${amount}`,
    body:
      n.note ||
      `${worked ? `You worked late on ${worked}. ` : ''}You can arrive up to ${amount} later than usual without being marked late.`,
    until: n.onTimeUntil,
  };
}

/** The big figure on the balance card: "0.50 shift", "1.00 shift", "1.50 shifts" (the same words as every item). */
export function balanceView(balance: number): { value: string; unit: string } {
  return { value: shiftsText(balance), unit: shiftsUnit(balance) };
}

// ── a Department Head's holiday / Sunday work claims ────────────────────────

/** The part of a claim the labels read (a structural subset of TeamHolidayWorkClaim). */
export interface ClaimLike {
  dayKind?: string | null;
  holidayName?: string | null;
  shifts?: number | null;
  workDate?: string | null;
}

/** "Sunday work" / "Holiday work". */
export function claimTypeLabel(c: ClaimLike): string {
  return c.dayKind === 'sunday' ? 'Sunday work' : 'Holiday work';
}

/** "Sunday", "Holiday: Diwali", "Holiday". */
export function claimDayLabel(c: ClaimLike): string {
  if (c.dayKind === 'sunday') return 'Sunday';
  return c.holidayName ? `Holiday: ${c.holidayName}` : 'Holiday';
}

/** "12 Oct 2026 · 0.5 shift" (either part left out when it is not known). */
export function claimDateLabel(c: ClaimLike): string {
  return [formatDayMonthYear(c.workDate), shiftsLabel(c.shifts)].filter(Boolean).join(' · ') || '—';
}

/** The toast after a Department Head approves a claim and the shifts went onto the employee's balance. */
export function claimCreditedMessage(c: ClaimLike & { employeeName?: string | null }): string {
  const shifts = shiftsLabel(c.shifts);
  const who = c.employeeName ? `${c.employeeName}'s` : 'the employee\'s';
  return shifts ? `Approved. ${shifts} added to ${who} compensation balance.` : `Approved. Added to ${who} compensation balance.`;
}

// ── notifications ───────────────────────────────────────────────────────────

/** The Approvals tab, which only a Department Head has. */
export const APPROVALS_ROUTE = '/(tabs)/approvals';

/**
 * Where a notification of this `type` opens, or null for "just the Notifications list".
 *  * `compensation` goes to the EMPLOYEE whose claim the Department Head decided (holiday_work_views.py::decide_claim): it
 *    opens their own Compensation screen, whoever they are.
 *  * `holiday_work` goes to the DEPARTMENT HEAD when a claim waits for their decision (approval_workflow.py::
 *    notify_hod_of_request): it opens the Approvals tab. `viewer.isManager === false` (the profile says this person is no
 *    longer a head, so the tab is gone) keeps it on the Notifications list; an unknown profile still routes, because only
 *    a head is ever sent this type.
 */
export function notificationRoute(type: unknown, viewer?: { isManager?: boolean | null }): string | null {
  const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
  if (t === 'compensation') return '/compensation';
  if (t === 'holiday_work') return viewer?.isManager === false ? null : APPROVALS_ROUTE;
  // An employee reminding their Department Head of a waiting request (backend mobile_reminder_views.py).
  if (t === 'approval_reminder') return viewer?.isManager === false ? null : APPROVALS_ROUTE;
  return null;
}

/** What a screen reader hears when a notification opens a page ("Opens your compensation"); undefined when it opens none. */
export function notificationHint(type: unknown, viewer?: { isManager?: boolean | null }): string | undefined {
  const route = notificationRoute(type, viewer);
  if (route === '/compensation') return 'Opens your compensation';
  if (route === APPROVALS_ROUTE) return 'Opens approvals';
  return undefined;
}

/** The `type` a delivered push carries (`data.type`, see backend/api/signals.py), read from the notification object
 *  expo-notifications hands the tap handler. Null for anything else. */
export function pushNotificationType(notification: unknown): string | null {
  if (!isObject(notification)) return null;
  const request = notification.request;
  if (!isObject(request) || !isObject(request.content) || !isObject(request.content.data)) return null;
  const type = request.content.data.type;
  return typeof type === 'string' && type.trim() !== '' ? type : null;
}
