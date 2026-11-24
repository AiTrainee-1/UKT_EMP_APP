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
//
// Self-claims (2026-11-19): a current server sends `canClaim` (and `claimWindowDays`, `useBalance`) and marks the items the
// employee may claim (`claimable`, `claimKind`, `claim`, `suggestedShifts`). An OLDER server sends none of these: `canClaim`
// then reads as null and the screen stays the read-only one it was (HR raises everything). The claim flow itself (the
// sheet's choices, the request bodies, "My claims") is compensationClaims.ts.

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
    case 'birthday_credit':
      // A birthday the employee worked: a 1.00 credit to claim (not the paid birthday leave of an absent birthday).
      return { ...COMPENSATION_TONES.birthday, label: 'Birthday credit', icon: 'cake-variant-outline' };
    case 'use_balance':
      return { ...COMPENSATION_TONES.relaxation, label: 'Use balance', icon: 'calendar-arrow-left' };
    default:
      return { ...SLATE, label: prettify(kind) || SLATE.label };
  }
}

// ── claim kinds ─────────────────────────────────────────────────────────────

/** What a claim is for: the `kind` of a claim on the server (one table for all of them, HolidayWorkClaim). */
export type ClaimKind = 'holiday_work' | 'ot_allowance' | 'ot_shift' | 'birthday' | 'use_balance';

export const CLAIM_KINDS: readonly ClaimKind[] = ['holiday_work', 'ot_allowance', 'ot_shift', 'birthday', 'use_balance'];

/** The name of each kind of claim, the same words on the employee's screen and the Department Head's Approvals tab. */
export const CLAIM_KIND_LABEL: Record<ClaimKind, string> = {
  holiday_work: 'Sunday / holiday work',
  ot_allowance: 'OT allowance',
  ot_shift: 'OT credit',
  birthday: 'Birthday credit',
  use_balance: 'Use balance',
};

/** A claim kind in any spelling the server may use ("ot_shift", "otShift", "birthday_credit"), or null. */
export function claimKindFrom(raw: unknown): ClaimKind | null {
  const s = str(raw)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (s === 'birthday_credit') return 'birthday';
  if (s === 'holidaywork' || s === 'holiday') return 'holiday_work';
  return (CLAIM_KINDS as readonly string[]).includes(s) ? (s as ClaimKind) : null;
}

/** The claim kind an item of the list is claimed as, when the server did not name it (`claimKind`). */
function claimKindOfItem(kind: string): ClaimKind | null {
  switch (kind) {
    case 'holiday_work':
    case 'holiday_work_day':
      return 'holiday_work';
    case 'ot_allowance':
      return 'ot_allowance';
    case 'ot_shift':
      return 'ot_shift';
    case 'birthday_credit':
      return 'birthday';
    default:
      return null;
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
  { group: 'birthday', title: 'Birthday', subtitle: 'Your birthday leave, or the credit for working on your birthday' },
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
  // self-claims: the employee can claim it / claimed it and waits / the Department Head decided
  claimable: 'info',
  claim_pending: 'warn',
  claim_approved: 'good',
  claim_rejected: 'bad',
  withdrawn: 'neutral',
};

/** The colour family of a status chip. A status this app does not know is neutral. */
export function statusTone(status: string): StatusTone {
  return STATUS_TONE[status] ?? 'neutral';
}

// ── the reply of GET /employee/compensation ─────────────────────────────────

export interface CompensationItem extends ClaimFields {
  key: string;
  /** ot_allowance | ot_shift | ot_shift_relaxation | ot_shift_pay | holiday_work | redemption | window_late_in |
   *  window_early_out | birthday | birthday_credit, or a kind added later. */
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

/** The claim already made for an item (the `claim` block of an item), as the employee sees it. */
export interface ItemClaim {
  /** The claim's id (the same id a "compensation" notification carries). */
  id: number | null;
  kind: ClaimKind | null;
  /** pending | approved | rejected, or a status added later. */
  status: string;
  statusLabel: string;
  shifts: number | null;
  minutes: number | null;
  /** Who raised it: the employee themselves or HR on their behalf. Null when the server did not say. */
  raisedByRole: 'employee' | 'hr' | null;
}

/** What an item says about claiming it (all "nothing" on an older server). */
export interface ClaimFields {
  /** The server says the employee may claim this item now. */
  claimable: boolean;
  /** What it is claimed as. Null when it is not claimable and the server did not say. */
  claimKind: ClaimKind | null;
  /** The claim already made for it (waiting, approved or not approved), or null. */
  claim: ItemClaim | null;
  /** OT credit: the most the OT earns by the quarters rule (the claim may not ask for more). */
  suggestedShifts: number | null;
  /** OT kinds: the overtime record the claim is for (the server's `overtimeRecordId`, else the item key "ot-<id>"). */
  overtimeRecordId: number | null;
}

/** Reads `raisedByRole` ("employee" / "hr", any case), or null. */
export function readRaisedByRole(raw: unknown): 'employee' | 'hr' | null {
  const s = str(raw).toLowerCase();
  return s === 'employee' || s === 'hr' ? s : null;
}

function readItemClaim(raw: unknown): ItemClaim | null {
  if (!isObject(raw)) return null;
  const status = str(raw.status);
  const id = num(raw.id);
  if (!status && id == null) return null;
  return {
    id: id != null && Number.isInteger(id) && id > 0 ? id : null,
    kind: claimKindFrom(raw.kind),
    status,
    statusLabel: str(raw.statusLabel) || CLAIM_STATUS_LABEL[status] || prettify(status),
    shifts: num(raw.shifts),
    minutes: num(raw.minutes),
    raisedByRole: readRaisedByRole(raw.raisedByRole),
  };
}

/** How a claim's status reads when the server sent no label of its own. */
export const CLAIM_STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting for your Department Head',
  approved: 'Approved',
  rejected: 'Not approved',
  withdrawn: 'Withdrawn',
};

/**
 * The claim fields of an item of either list (the 90-day list and the year history share the item builders on the
 * server). `key` and `kind` are the item's own, for the fall-backs: the overtime record id from "ot-<id>", the claim kind
 * from the item kind. Everything is "nothing" on an older server.
 */
export function readClaimFields(raw: Record<string, unknown>, key: string, kind: string): ClaimFields {
  const claimable = raw.claimable === true;
  const claimKind = claimKindFrom(raw.claimKind) ?? (claimable ? claimKindOfItem(kind) : null);
  const otMatch = /^ot-(\d+)$/.exec(key);
  const recordId = num(raw.overtimeRecordId);
  const suggested = num(raw.suggestedShifts);
  return {
    claimable,
    claimKind,
    claim: readItemClaim(raw.claim),
    suggestedShifts: suggested != null && suggested > 0 ? suggested : null,
    overtimeRecordId:
      recordId != null && Number.isInteger(recordId) && recordId > 0
        ? recordId
        : kind.startsWith('ot_') && otMatch
          ? Number(otMatch[1])
          : null,
  };
}

/** Self-claims' "use my balance": what the employee may still take as a day off. */
export interface UseBalanceInfo {
  /** The server allows a use-balance request now. */
  allowed: boolean;
  balanceShifts: number;
  /** Shifts already asked for in use-balance requests that wait for the Department Head. */
  pendingShifts: number;
  /** balance - pending: what a new request may use. */
  availableShifts: number;
  /** Why it is not allowed (or a note), as the server words it. */
  message: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function readUseBalance(raw: unknown, balance: number): UseBalanceInfo | null {
  if (!isObject(raw)) return null;
  const b = num(raw.balanceShifts);
  const balanceShifts = b != null && b > 0 ? b : balance;
  const p = num(raw.pendingShifts);
  const pendingShifts = p != null && p > 0 ? p : 0;
  const a = num(raw.availableShifts);
  return {
    allowed: raw.allowed === true,
    balanceShifts: round2(balanceShifts),
    pendingShifts: round2(pendingShifts),
    availableShifts: round2(Math.max(0, a != null ? a : balanceShifts - pendingShifts)),
    message: str(raw.message) || null,
  };
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
  /**
   * Self-claims. true: the employee may claim items and use their balance from the app; false: not now (the server says
   * why in its texts); null: an OLDER server that does not know self-claims (keep the read-only screen and its texts).
   */
  canClaim: boolean | null;
  /** How many days back an item may still be claimed (45), when the server says. */
  claimWindowDays: number | null;
  /** "Use my balance", when the server sends it (only with self-claims). */
  useBalance: UseBalanceInfo | null;
}

export const ASK_HR_TITLE = 'Ask Request for Compensation';
export const ASK_HR_FALLBACK_TEXT =
  'The system detects when you work extra hours, or on a Sunday or a company holiday, and shows it on the My Compensation tab. ' +
  'If you worked extra and it is missing from the list, or you want to claim compensation, contact HR.';
/** Said on the Ask tab by an OLDER server (no self-claims): the employee cannot assign compensation to themselves. */
export const ASK_HR_NOT_SELF_SERVICE =
  'Compensation is assigned by HR. You cannot assign or claim it yourself in this app: contact HR, who will check your attendance and give it to you.';
/** Said instead when the server lets the employee claim (`canClaim: true`). */
export const CLAIM_SELF_SERVICE =
  'You can claim compensation yourself: tap Claim on an item marked "Can be claimed" on My Compensation, or use your balance ' +
  'for a day off. Your Department Head approves every claim. HR can also claim for you.';
/** Said when a current server does not let the employee claim right now (`canClaim: false`). */
export const CLAIMS_CLOSED_TEXT =
  'Claiming from the app is not open for you right now. Contact HR if you worked extra and want to claim compensation.';

/** The note on the Ask / My Claims tab for this server: self-service, closed, or HR-only (an older server). */
export function selfServiceNote(canClaim: boolean | null): string {
  if (canClaim === true) return CLAIM_SELF_SERVICE;
  if (canClaim === false) return CLAIMS_CLOSED_TEXT;
  return ASK_HR_NOT_SELF_SERVICE;
}
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
  const key = str(raw.key) || `item-${index}`;
  return {
    ...readClaimFields(raw, key, kind),
    key,
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
  const balanceShifts = balance != null && balance > 0 ? balance : 0;
  const windowDays = num(raw.claimWindowDays);
  const canClaim = typeof raw.canClaim === 'boolean' ? raw.canClaim : null;
  return {
    isStaff: raw.isStaff !== false,
    enabled: readFlags(raw.enabled),
    balanceShifts,
    items,
    todayAllowance: readAllowance(raw.todayAllowance),
    tomorrowAllowance: readAllowance(raw.tomorrowAllowance),
    askHr: readAskHr(raw.askHr),
    message: str(raw.message) || null,
    canClaim,
    claimWindowDays: windowDays != null && windowDays > 0 ? Math.floor(windowDays) : null,
    // only with self-claims: an older server has no "use my balance"
    useBalance: canClaim === null ? null : readUseBalance(raw.useBalance, balanceShifts),
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

// ── a Department Head's compensation claims ─────────────────────────────────
//
// The Approvals tab's "Compensation" category lists EVERY kind of claim (one table on the server): Sunday / holiday work,
// OT allowance, OT credit, birthday credit and use-balance requests, raised by the employee or by HR. An OLDER server
// sends no `kind`: every claim there is a Sunday / holiday work claim HR raised, worded as before.

/** The overtime a claim of an OT kind is about (`overtime` on the Department Head's rows). */
export interface ClaimOvertime {
  /** The OT day (YYYY-MM-DD). */
  date: string | null;
  /** "18:00": the shift end the extra time is counted from. */
  shiftEnd: string | null;
  /** The last punch as the server sent it ("20:45", "02:10", or a date-time). */
  lastPunch: string | null;
  /** True when that last punch was on the morning after the OT day ("02:10" is then 02:10 next day). */
  lastPunchNextDay: boolean;
  extraMinutes: number | null;
}

/** The part of a claim the labels read (a structural subset of TeamHolidayWorkClaim). */
export interface ClaimLike {
  /** holiday_work | ot_allowance | ot_shift | birthday | use_balance; absent on an older server (= holiday_work). */
  kind?: string | null;
  kindLabel?: string | null;
  dayKind?: string | null;
  holidayName?: string | null;
  shifts?: number | null;
  /** OT allowance: the allowance minutes. */
  minutes?: number | null;
  /** The claim's date: the work day, the OT day, the birthday, or the day off of a use-balance request. */
  workDate?: string | null;
  /** Use balance: the day the employee takes off. */
  useDate?: string | null;
  raisedByRole?: string | null;
  requestedBy?: string | null;
  overtime?: unknown;
}

/** The claim's kind; a claim from an older server (no `kind`) is Sunday / holiday work. Null for a kind added later. */
export function claimKindOf(c: ClaimLike): ClaimKind | null {
  if (!str(c.kind)) return 'holiday_work';
  return claimKindFrom(c.kind);
}

/** The `overtime` block of a claim, or null. */
export function readClaimOvertime(raw: unknown): ClaimOvertime | null {
  if (!isObject(raw)) return null;
  const extra = num(raw.extraMinutes);
  const out: ClaimOvertime = {
    date: parseIsoDate(raw.date) ? str(raw.date).slice(0, 10) : null,
    shiftEnd: str(raw.shiftEnd) || null,
    lastPunch: str(raw.lastPunch) || null,
    lastPunchNextDay: raw.lastPunchNextDay === true,
    extraMinutes: extra != null && extra > 0 ? extra : null,
  };
  return out.date || out.shiftEnd || out.lastPunch || out.extraMinutes != null ? out : null;
}

/** A clock time as written on a claim: "HH:MM" from "HH:MM[:SS]" or a date-time ("02:10 next day" when it is on the day
 *  after `day`, or when the server says so with `nextDay`: its `lastPunchNextDay`); anything else as it came. */
export function punchText(value: string | null, day: string | null, nextDay = false): string | null {
  if (!value) return null;
  const dt = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value);
  if (dt) return (day && dt[1] > day) || nextDay ? `${dt[2]} next day` : dt[2];
  const t = /^(\d{1,2}:\d{2})(:\d{2})?$/.exec(value);
  if (!t) return value;
  const clock = t[1].padStart(5, '0');
  return nextDay ? `${clock} next day` : clock;
}

/** "Sunday work" / "Holiday work" for a Sunday / holiday work claim; "OT allowance", "OT credit", "Birthday credit",
 *  "Use balance" for the other kinds; the server's own label (or the kind, prettified) for a kind added later. */
export function claimTypeLabel(c: ClaimLike): string {
  const kind = claimKindOf(c);
  if (kind === 'holiday_work') return c.dayKind === 'sunday' ? 'Sunday work' : 'Holiday work';
  if (kind) return CLAIM_KIND_LABEL[kind];
  return str(c.kindLabel) || prettify(str(c.kind)) || 'Compensation';
}

/** The day a claim is about: the day off of a use-balance request, else the claim's date (work / OT day, birthday). */
function claimDay(c: ClaimLike): string | null | undefined {
  if (claimKindOf(c) === 'use_balance') return c.useDate || c.workDate;
  const ot = readClaimOvertime(c.overtime);
  return c.workDate || ot?.date;
}

/** "Raised by employee" / "Raised by HR": the chip on a card. An older server's claims were all raised by HR. */
export function raisedByLabel(c: ClaimLike): string {
  return readRaisedByRole(c.raisedByRole) === 'employee' ? 'Raised by employee' : 'Raised by HR';
}

/** The "Raised by" row of the sheet: "Employee", "HR (Meena)", "HR"; null when an older server named nobody. */
export function raisedByText(c: ClaimLike): string | null {
  const role = readRaisedByRole(c.raisedByRole);
  const who = str(c.requestedBy);
  if (role === 'employee') return 'Employee';
  if (role === 'hr') return who ? `HR (${who})` : 'HR';
  return who ? `HR (${who})` : null;
}

/** The detail rows of the decision sheet for a claim of any kind, in order ([label, value]). */
export function claimDetailRows(c: ClaimLike): [string, string][] {
  const kind = claimKindOf(c);
  const ot = readClaimOvertime(c.overtime);
  const day = formatLongDate(claimDay(c)) || formatDayMonthYear(claimDay(c)) || '—';
  const shifts = shiftsLabel(c.shifts);
  const rows: ([string, string] | null)[] = [];
  const otRows = (): ([string, string] | null)[] => [
    ['OT date', day],
    ot?.shiftEnd ? ['Shift end', punchText(ot.shiftEnd, null)!] : null,
    ot?.lastPunch
      ? ['Last punch', punchText(ot.lastPunch, ot.date ?? c.workDate ?? null, ot.lastPunchNextDay)!]
      : null,
    minutesText(ot?.extraMinutes) ? ['Extra time', `${minutesText(ot?.extraMinutes)} past shift end`] : null,
  ];
  switch (kind) {
    case 'holiday_work':
      rows.push(['Work date', day], ['Day', claimDayLabel(c)], shifts ? ['Shifts claimed', shifts] : null);
      break;
    case 'ot_allowance':
      rows.push(
        ...otRows(),
        minutesText(c.minutes) ? ['Allowance', `${minutesText(c.minutes)} late-in on the next working day`] : null,
      );
      break;
    case 'ot_shift':
      rows.push(...otRows(), shifts ? ['Credit claimed', shifts] : null);
      break;
    case 'birthday':
      rows.push(['Birthday', day], ['Credit claimed', shifts ?? '1.00 shift']);
      break;
    case 'use_balance':
      rows.push(['Day off', day], shifts ? ['Shifts to use', shifts] : null);
      break;
    default:
      rows.push(['Date', day], shifts ? ['Shifts', shifts] : null);
  }
  const by = raisedByText(c);
  if (by) rows.push(['Raised by', by]);
  return rows.filter((r): r is [string, string] => r !== null);
}

/** What approving does, under the sheet's buttons while the claim waits for this Department Head. */
export function claimPendingHint(c: ClaimLike, employeeName: string): string {
  const shifts = shiftsLabel(c.shifts);
  const day = formatLongDate(claimDay(c));
  switch (claimKindOf(c)) {
    case 'ot_allowance':
      return (
        `Approving lets ${employeeName} arrive up to ${minutesText(c.minutes) ?? 'the allowance'} later on their next working ` +
        `day after ${day || 'the OT day'} without being marked late. Rejecting is final.`
      );
    case 'use_balance':
      return (
        `Approving takes ${shifts ?? 'the shifts'} from ${employeeName}'s compensation balance for ${day || 'the day off'}: ` +
        'that day counts as worked up to that much. Rejecting is final and uses nothing.'
      );
    case 'birthday':
      return `Approving adds ${shifts ?? '1.00 shift'} to ${employeeName}'s compensation balance for working on their birthday. Rejecting is final and adds nothing.`;
    default:
      return `Approving adds ${shifts ?? 'the claimed shifts'} to ${employeeName}'s compensation balance. Rejecting is final and adds nothing.`;
  }
}

/** "Sunday", "Holiday: Diwali", "Holiday". */
export function claimDayLabel(c: ClaimLike): string {
  if (c.dayKind === 'sunday') return 'Sunday';
  return c.holidayName ? `Holiday: ${c.holidayName}` : 'Holiday';
}

/** The card's date line: "12 Oct 2026 · 0.50 shift" (either part left out when it is not known); an OT allowance
 *  "12 Oct 2026 · 30 min allowance"; a use-balance request "Day off 14 Oct 2026 · 0.50 shift". */
export function claimDateLabel(c: ClaimLike): string {
  const kind = claimKindOf(c);
  const date = formatDayMonthYear(claimDay(c));
  if (kind === 'ot_allowance') {
    const minutes = minutesText(c.minutes);
    return [date, minutes ? `${minutes} allowance` : null].filter(Boolean).join(' · ') || '—';
  }
  if (kind === 'use_balance') {
    return [date ? `Day off ${date}` : null, shiftsLabel(c.shifts)].filter(Boolean).join(' · ') || '—';
  }
  return [date, shiftsLabel(c.shifts)].filter(Boolean).join(' · ') || '—';
}

/** The toast after a Department Head approves a claim and the shifts went onto the employee's balance. */
export function claimCreditedMessage(c: ClaimLike & { employeeName?: string | null }): string {
  const shifts = shiftsLabel(c.shifts);
  const who = c.employeeName ? `${c.employeeName}'s` : 'the employee\'s';
  return shifts ? `Approved. ${shifts} added to ${who} compensation balance.` : `Approved. Added to ${who} compensation balance.`;
}

/**
 * The toast after a Department Head approves a claim of any kind, from the PATCH reply (`credited`, `effect`) merged over
 * the row: a credit says what went onto whose balance; otherwise the server's `effect` sentence, else this app's words for
 * the kind. Null when there is nothing claim-specific to say (the caller then uses the approval pipeline's wording).
 */
export function claimApprovedMessage(
  c: ClaimLike & { employeeName?: string | null; credited?: unknown; effect?: unknown },
): string | null {
  if (c.credited === true) return claimCreditedMessage(c);
  const effect = str(c.effect);
  if (effect) return /^approved\b/i.test(effect) ? effect : `Approved. ${effect}`;
  const who = c.employeeName ? `${c.employeeName}'s` : "the employee's";
  const day = formatLongDate(claimDay(c));
  switch (claimKindOf(c)) {
    case 'ot_allowance':
      return `Approved. ${c.employeeName || 'The employee'} gets the late-in allowance on their next working day.`;
    case 'use_balance': {
      const shifts = shiftsLabel(c.shifts);
      return `Approved. ${shifts ?? 'The shifts'} taken from ${who} compensation balance${day ? ` for ${day}` : ''}.`;
    }
    default:
      return null;
  }
}

// ── notifications ───────────────────────────────────────────────────────────

/** The Approvals tab, which only a Department Head has. */
export const APPROVALS_ROUTE = '/(tabs)/approvals';

/**
 * Where a notification of this `type` opens, or null for "just the Notifications list".
 *  * `compensation` goes to the EMPLOYEE whose claim (of any kind: Sunday / holiday work, OT allowance, OT credit,
 *    birthday credit, use balance) the Department Head decided: it opens their own Compensation screen, whoever they are.
 *  * `holiday_work` goes to the DEPARTMENT HEAD when a claim (any kind) waits for their decision (approval_workflow.py::
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
