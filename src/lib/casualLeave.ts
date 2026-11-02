// Casual Leave (CL): the rules the app shows, kept pure so they are tested once (casualLeave.test.ts).
//
// Owner 2026-10-31: the month's one Casual Leave is EITHER one full day OR two half-days (first / second half of the
// shift) on any dates of that month; both halves may even be the same date. A pending or approved full day blocks the
// halves and the other way round; the same date cannot hold the same half twice. The server decides
// (backend api/casual_leave_views.py); this only reads back what it said and words it for the employee.
//
// Owner 2026-11-02: a YEARLY balance replaced "one a month" from the cut-over day (2026-11-02): 12 days a calendar year,
// usable any time and any number in a month while the balance lasts (a half-day counts 1/2; waiting requests hold their
// days, a rejected one gives them back); unused days lapse on 31 December and a fresh 12 starts on 1 January. Casual Leave
// dated before the cut-over kept the old rule and is not counted. The server sends `balance`, `monthsUsage` and per-month
// `rule` / `remaining` / `usedFullDates` (backend api/cl_balance.py); an older server sends none of them and every helper
// here then behaves exactly as before (the one-a-month words).

export type CLPortion = 'full' | 'first_half' | 'second_half';
export type CLStatus = 'pending' | 'approved' | 'rejected';
/** What of a month's Casual Leave is left, as GET /casual-leaves/my-eligibility says it. */
export type CLLeft = 'full' | 'one_half' | 'nothing';

export const CL_PORTIONS: readonly CLPortion[] = ['full', 'first_half', 'second_half'];

export const PORTION_LABEL: Record<CLPortion, string> = {
  full: 'Full day',
  first_half: 'First half',
  second_half: 'Second half',
};

/** The words on a request card / list row. */
export const PORTION_LONG: Record<CLPortion, string> = {
  full: 'Full day',
  first_half: 'Half day (first half)',
  second_half: 'Half day (second half)',
};

export const PORTION_DAYS: Record<CLPortion, number> = { full: 1, first_half: 0.5, second_half: 0.5 };

export function asPortion(value: unknown): CLPortion {
  return value === 'first_half' || value === 'second_half' ? value : 'full';
}

export function asStatus(value: unknown): CLStatus {
  const s = String(value ?? '').toLowerCase();
  return s === 'approved' ? 'approved' : s === 'rejected' ? 'rejected' : 'pending';
}

/** 1 -> "1 day", 0.5 -> "½ day", 1.5 -> "1½ days", 0 -> "0 days". */
export function daysText(days: number): string {
  const whole = Math.floor(days);
  const half = days - whole >= 0.5;
  const num = half ? (whole ? `${whole}½` : '½') : String(whole);
  return `${num} ${days > 0 && days <= 1 ? 'day' : 'days'}`;
}

/** "13:00" -> "1:00 PM"; anything else unchanged. */
export function clock12(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!m) return String(hhmm ?? '');
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

export type ShiftHalves = {
  name?: string | null;
  start: string;
  end: string;
  firstHalfEnd: string;
  secondHalfStart: string;
};

/** What each choice means in clock time, when the shift is known: "9:00 AM - 1:00 PM off, come in for the afternoon". */
export function portionMeaning(portion: CLPortion, shift: ShiftHalves | null | undefined): string {
  if (!shift) {
    if (portion === 'full') return 'The whole day off, paid.';
    if (portion === 'first_half') return 'The morning half off, paid. Work the second half as usual.';
    return 'The afternoon half off, paid. Work the first half as usual.';
  }
  const start = clock12(shift.start);
  const end = clock12(shift.end);
  if (portion === 'full') return `The whole shift off (${start} - ${end}), paid.`;
  if (portion === 'first_half') {
    return `${start} - ${clock12(shift.firstHalfEnd)} off, paid. Come in for the second half from ${clock12(shift.secondHalfStart)}.`;
  }
  return `${clock12(shift.secondHalfStart)} - ${end} off, paid. Work the first half from ${start}.`;
}

// ─── One month, as the server reports it ───

export type CLPart = { id?: number; date: string; portion: CLPortion; status: CLStatus };

/** Which rule a date / month follows: the yearly balance (on/after the cut-over) or the old one-a-month rule. */
export type CLRule = 'yearly_balance' | 'one_per_month';

export type CLMonth = {
  /** 'yyyy-MM' */
  month: string;
  label: string;
  eligible: boolean;
  reason: string | null;
  left: CLLeft;
  /** The pending / approved requests of the month. */
  usedParts: CLPart[];
  /** Which half of which date is already asked for (under the yearly rule also a Casual Leave HR proposed that waits). */
  usedHalves: { date: string; portion: CLPortion }[];
  /** Added 2026-11-02; absent on an older server (= the one-a-month rule). */
  rule?: CLRule;
  /** The yearly days still free for this month's year (null under the old rule). */
  remaining?: number | null;
  /** Dates already taken as a full day (greyed out under the yearly rule). */
  usedFullDates?: string[];
};

/** 'yyyy-MM' of a date in the phone's time. */
export const monthKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-10-05" -> "5 Oct". */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTH_SHORT[Number(m[2]) - 1]}`;
}

/** "2026-10-05" -> "Mon, 5 Oct 2026" (read without time-zone shifts). */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${day}, ${Number(m[3])} ${MONTH_SHORT[Number(m[2]) - 1]} ${m[1]}`;
}

export type MonthCardState = {
  tone: 'open' | 'half' | 'used' | 'closed';
  title: string;
  detail: string;
};

function partText(p: CLPart): string {
  const what = p.portion === 'full' ? 'Full day' : `${PORTION_LABEL[p.portion]}`;
  return `${what} on ${shortDate(p.date)} (${p.status === 'approved' ? 'approved' : 'waiting'})`;
}

/** This month's Casual Leave in a title and a sentence, for the Leave page card and the CL screen. */
export function monthCardState(month: CLMonth | undefined, fallback?: { eligible?: boolean; reason?: string | null }): MonthCardState {
  if (!month) {
    // an older server: only the single `eligible` flag is known
    if (fallback?.eligible === false) {
      return { tone: 'closed', title: 'Not available', detail: fallback.reason || 'Casual Leave is not available this month.' };
    }
    return { tone: 'open', title: 'Available this month', detail: 'One day of Casual Leave a month.' };
  }
  const parts = month.usedParts;
  if (month.left === 'full' && month.eligible) {
    return { tone: 'open', title: 'Full day available', detail: 'Take one full day, or two half-days, this month.' };
  }
  if (month.left === 'one_half' && month.eligible) {
    return {
      tone: 'half',
      title: 'One half-day left',
      detail: parts.length ? `${parts.map(partText).join(' · ')}. You can still take one half-day.` : 'You can still take one half-day.',
    };
  }
  if (parts.length) {
    return { tone: 'used', title: 'Used this month', detail: parts.map(partText).join(' · ') };
  }
  return { tone: 'closed', title: 'Not available', detail: month.reason || 'Casual Leave is not available this month.' };
}

/** The month of the server's list a date belongs to (undefined when it is not one the employee may pick now). */
export function monthOfDate(months: readonly CLMonth[] | undefined, date: string): CLMonth | undefined {
  return months?.find((m) => m.month === date.slice(0, 7));
}

export type PortionChoice = { enabled: boolean; why: string | null };

/** Which of Full day / First half / Second half may be asked for on `date`, and why not. With no month from the server
 *  (an older one) everything is offered and the server answers on Submit. */
export function portionChoices(month: CLMonth | undefined, date: string): Record<CLPortion, PortionChoice> {
  const open: PortionChoice = { enabled: true, why: null };
  if (!month) return { full: open, first_half: open, second_half: open };
  if (!month.eligible || month.left === 'nothing') {
    const why = month.reason || `Casual Leave for ${month.label} is used.`;
    const shut: PortionChoice = { enabled: false, why };
    return { full: shut, first_half: shut, second_half: shut };
  }
  if (month.rule === 'yearly_balance') return yearlyChoices(month, date);
  if (month.left === 'full') return { full: open, first_half: open, second_half: open };
  const taken = (portion: CLPortion) => month.usedHalves.some((h) => h.date === date && h.portion === portion);
  const half = (portion: CLPortion): PortionChoice =>
    taken(portion)
      ? { enabled: false, why: `The ${portion === 'first_half' ? 'first' : 'second'} half of ${shortDate(date)} is already asked for.` }
      : open;
  return {
    full: { enabled: false, why: 'Half a day is already used this month, so only one half-day is left.' },
    first_half: half('first_half'),
    second_half: half('second_half'),
  };
}

/** The yearly rule (any number a month while the balance lasts): a full day needs a whole day left; on one date never the
 *  same half twice, never a full day over a half, nothing over a full day (the same rules as the server's). */
function yearlyChoices(month: CLMonth, date: string): Record<CLPortion, PortionChoice> {
  const open: PortionChoice = { enabled: true, why: null };
  const day = shortDate(date);
  if ((month.usedFullDates ?? []).includes(date)) {
    const shut: PortionChoice = { enabled: false, why: `${day} is already a full day of Casual Leave. Choose another date.` };
    return { full: shut, first_half: shut, second_half: shut };
  }
  const taken = (portion: CLPortion) => month.usedHalves.some((h) => h.date === date && h.portion === portion);
  const halfLeftOnly = typeof month.remaining === 'number' ? month.remaining < 1 : month.left !== 'full';
  const full: PortionChoice = halfLeftOnly
    ? { enabled: false, why: `Only half a day of Casual Leave is left for ${date.slice(0, 4)}. Choose First half or Second half.` }
    : taken('first_half') || taken('second_half')
      ? { enabled: false, why: `Half of ${day} is already asked for, so a full day cannot be added. Choose the other half or another date.` }
      : open;
  const half = (portion: CLPortion): PortionChoice =>
    taken(portion)
      ? { enabled: false, why: `The ${portion === 'first_half' ? 'first' : 'second'} half of ${day} is already asked for. Choose the other half or another date.` }
      : open;
  return { full, first_half: half('first_half'), second_half: half('second_half') };
}

/** The choice the sheet starts on: the first one allowed. */
export function firstAllowed(choices: Record<CLPortion, PortionChoice>): CLPortion | null {
  return CL_PORTIONS.find((p) => choices[p].enabled) ?? null;
}

// ─── A year of Casual Leave ───

export type CLRow = {
  id: number;
  date: string;
  portion: CLPortion;
  status: CLStatus;
  /** Asked for by the employee (or HR on the Casual Leave page), or given by an HR attendance edit. */
  source?: CLSource;
  /** A Casual Leave request, or a Casual Leave HR proposed on an attendance edit that is still waiting. */
  kind?: CLPartKind;
};

export type CLSource = 'employee' | 'hr_edit';
export type CLPartKind = 'casual_leave' | 'attendance_correction';

export type DialSlot = { portion: CLPortion; status: Exclude<CLStatus, 'rejected'>; date: string } | null;

export type YearMonth = {
  /** 1-12 */
  month: number;
  short: string;
  /** Pending and approved requests of the month, by date (rejected ones are not leave). */
  parts: CLRow[];
  approvedDays: number;
  waitingDays: number;
  shape: 'none' | 'full' | 'one_half' | 'two_halves';
  /** The two halves of the month's dial: a full day fills both, each half-day one, in date order. */
  slots: [DialSlot, DialSlot];
  /** Some of the month's Casual Leave was given / proposed by an HR attendance edit. */
  byHr: boolean;
  /** Days dated before the yearly balance's cut-over (the old rule: not counted in the balance). */
  notCountedDays: number;
};

const byDate = (a: CLRow, b: CLRow) => a.date.localeCompare(b.date) || a.id - b.id;

/** The 12 months of `year`: what was taken (or is waiting) in each, for the year view. Under the yearly balance a month may
 *  hold any number of days (no cap); `cutOver` ('yyyy-MM-dd', the balance's first counted day) marks the days before it. */
export function yearMonths(rows: readonly CLRow[], year: number, cutOver?: string | null): YearMonth[] {
  const out: YearMonth[] = [];
  for (let month = 1; month <= 12; month++) {
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const parts = rows.filter((r) => r.status !== 'rejected' && r.date.startsWith(prefix)).sort(byDate);
    const slot = (r: CLRow | undefined): DialSlot =>
      r ? { portion: r.portion, status: r.status === 'approved' ? 'approved' : 'pending', date: r.date } : null;
    const full = parts.find((p) => p.portion === 'full');
    const halves = parts.filter((p) => p.portion !== 'full');
    const slots: [DialSlot, DialSlot] = full ? [slot(full), slot(full)] : [slot(halves[0]), slot(halves[1])];
    const sum = (status: CLStatus) => parts.filter((p) => p.status === status).reduce((n, p) => n + PORTION_DAYS[p.portion], 0);
    out.push({
      month,
      short: MONTH_SHORT[month - 1],
      parts,
      approvedDays: sum('approved'),
      waitingDays: sum('pending'),
      shape: full ? 'full' : halves.length >= 2 ? 'two_halves' : halves.length === 1 ? 'one_half' : 'none',
      slots,
      byHr: parts.some((p) => p.source === 'hr_edit'),
      notCountedDays: cutOver ? parts.filter((p) => p.date < cutOver).reduce((n, p) => n + PORTION_DAYS[p.portion], 0) : 0,
    });
  }
  return out;
}

export type YearTotals = { takenDays: number; waitingDays: number; rejected: number; applications: number; monthsUsed: number };

export function yearTotals(rows: readonly CLRow[], year: number): YearTotals {
  const mine = rows.filter((r) => r.date.startsWith(`${year}-`));
  const months = yearMonths(mine, year);
  return {
    takenDays: months.reduce((n, m) => n + m.approvedDays, 0),
    waitingDays: months.reduce((n, m) => n + m.waitingDays, 0),
    rejected: mine.filter((r) => r.status === 'rejected').length,
    applications: mine.length,
    monthsUsed: months.filter((m) => m.shape !== 'none').length,
  };
}

/** One day cell of the month calendar: which halves of it are Casual Leave and in what state. */
export type DayMark = { first: Exclude<CLStatus, 'rejected'> | null; second: Exclude<CLStatus, 'rejected'> | null };

/** {"2026-10-05": {first, second}} for the pending / approved Casual Leave of a month. */
export function dayMarks(rows: readonly CLRow[]): Record<string, DayMark> {
  const out: Record<string, DayMark> = {};
  const stronger = (a: DayMark['first'], b: DayMark['first']) => (a === 'approved' || b === 'approved' ? 'approved' : a ?? b);
  for (const r of rows) {
    if (r.status === 'rejected') continue;
    const s = r.status === 'approved' ? 'approved' : 'pending';
    const mark = out[r.date] ?? { first: null, second: null };
    if (r.portion !== 'second_half') mark.first = stronger(mark.first, s);
    if (r.portion !== 'first_half') mark.second = stronger(mark.second, s);
    out[r.date] = mark;
  }
  return out;
}

/** The weeks of a month for a Sunday-first calendar: each week 7 cells, a day number or null. */
export function monthWeeks(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The years the year switcher offers: from the first year with a request (or this year) to this year. */
export function yearRange(rows: readonly { date: string }[], thisYear: number): { min: number; max: number } {
  const years = rows.map((r) => Number(r.date.slice(0, 4))).filter((y) => Number.isFinite(y) && y > 2000);
  return { min: Math.min(thisYear - 1, ...years), max: thisYear };
}

// ─── The yearly balance (owner 2026-11-02) ───

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numOr = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const strOr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** GET /casual-leaves/my-eligibility `balance` (also on the history): 12 - approved - waiting days of the year. */
export type CLBalance = {
  total: number;
  /** Approved days that count. */
  used: number;
  /** Days waiting for a decision (they hold their place in the balance). */
  pending: number;
  /** What can still be asked for. */
  remaining: number;
  year: number;
  /** The first counted day of the year ('yyyy-MM-dd': the cut-over in its own year, else 1 January); null = not tracked. */
  since: string | null;
  endsOn: string;
  cutOver: string | null;
  /** False for a year wholly before the cut-over: no balance was kept (the one-a-month rule). */
  tracked: boolean;
};

/** The balance block, or null (not sent: an older server, or not an object). Never throws. */
export function readBalance(raw: unknown): CLBalance | null {
  if (!isObj(raw)) return null;
  const year = numOr(raw.year, new Date().getFullYear());
  const total = numOr(raw.total, 12);
  const used = Math.max(0, numOr(raw.used, 0));
  const pending = Math.max(0, numOr(raw.pending, 0));
  return {
    total,
    used,
    pending,
    remaining: Math.max(0, numOr(raw.remaining, total - used - pending)),
    year,
    since: strOr(raw.since),
    endsOn: strOr(raw.endsOn) ?? `${year}-12-31`,
    cutOver: strOr(raw.cutOver),
    tracked: raw.tracked !== false,
  };
}

export function readRule(raw: unknown): CLRule | undefined {
  return raw === 'yearly_balance' || raw === 'one_per_month' ? raw : undefined;
}

/** 11 -> "11", 10.5 -> "10½", 0.5 -> "½", 0 -> "0". */
export function halvesText(days: number): string {
  const whole = Math.floor(days);
  const half = days - whole >= 0.5;
  return half ? (whole ? `${whole}½` : '½') : String(whole);
}

/** "11 of 12 CL left in 2026 · resets on 1 Jan". */
export function balanceSentence(b: CLBalance): string {
  return `${halvesText(b.remaining)} of ${b.total} CL left in ${b.year} · resets on 1 Jan`;
}

/** "1 day taken · ½ day waiting for approval", or null when nothing is used or waiting. */
export function balanceDetail(b: CLBalance): string | null {
  const bits: string[] = [];
  if (b.used > 0) bits.push(`${daysText(b.used)} taken`);
  if (b.pending > 0) bits.push(`${daysText(b.pending)} waiting for approval`);
  return bits.length ? bits.join(' · ') : null;
}

/**
 * Whether to show the balance at all: a new server sent one for a tracked year, and the employee can have Casual Leave
 * (some month is open, or days are already used / waiting). A production employee, or one before 6 months of service,
 * sees the server's reason instead of a "12 of 12 left" that is not theirs to take.
 */
export function showBalance(input: {
  balance?: CLBalance | null;
  eligible?: boolean;
  months?: readonly { eligible: boolean }[];
}): boolean {
  const b = input.balance;
  if (!b || !b.tracked) return false;
  return !!input.eligible || (input.months ?? []).some((m) => m.eligible) || b.used + b.pending > 0;
}

/** The yearly rule is the one in force: a tracked balance came, and today's (or the month's) rule is the yearly one. */
export function isYearly(input: { balance?: CLBalance | null; rule?: CLRule; month?: Pick<CLMonth, 'rule'> }): boolean {
  if (!input.balance || !input.balance.tracked) return false;
  return input.rule === 'yearly_balance' || input.month?.rule === 'yearly_balance';
}

/**
 * The card's title and sentence under the yearly balance (the Leave page card, the Casual Leave screen's hero). Falls back
 * to the one-a-month words (monthCardState) when the server sent no balance or the old rule is still in force.
 */
export function clCardState(input: {
  balance?: CLBalance | null;
  rule?: CLRule;
  month?: CLMonth;
  eligible?: boolean;
  reason?: string | null;
}): MonthCardState {
  const { balance: b, month } = input;
  if (!b || !isYearly(input)) return monthCardState(month, { eligible: input.eligible, reason: input.reason });
  const eligible = month ? month.eligible : input.eligible !== false;
  const reason = (month ? month.reason : input.reason) || null;
  if (b.remaining <= 0) {
    const waiting = b.pending > 0 ? ` ${daysText(b.pending)} still waiting for approval (a rejected request gives its days back).` : '';
    return {
      tone: 'used',
      title: b.pending > 0 ? 'No days left' : `All ${b.total} days used`,
      detail: `No Casual Leave left for ${b.year}.${waiting} A fresh ${b.total} starts on 1 Jan ${b.year + 1}.`,
    };
  }
  if (!eligible) {
    return { tone: 'closed', title: 'Not available', detail: reason || 'Casual Leave is not available right now.' };
  }
  if (b.remaining < 1) {
    return { tone: 'half', title: '½ day left', detail: `Only a half-day is left for ${b.year}: choose First half or Second half.` };
  }
  return {
    tone: 'open',
    title: `${halvesText(b.remaining)} days left`,
    detail: 'Take full days or half-days on any dates while your balance lasts. Unused days lapse on 31 Dec.',
  };
}

/** One of the 12 boxes of the balance bar, as two halves: used (approved), waiting, or free, filled in that order. */
export type BalanceHalf = 'used' | 'pending' | 'free';

export function balanceCells(b: CLBalance): [BalanceHalf, BalanceHalf][] {
  const units = Math.max(0, Math.round(b.total * 2));
  const used = Math.round(b.used * 2);
  const pending = Math.round(b.pending * 2);
  const at = (i: number): BalanceHalf => (i < used ? 'used' : i < used + pending ? 'pending' : 'free');
  const cells: [BalanceHalf, BalanceHalf][] = [];
  for (let i = 0; i < units; i += 2) cells.push([at(i), at(i + 1)]);
  return cells;
}

/** The rule line under the apply sheet's choices. */
export function applyRuleText(month: CLMonth | undefined, total = 12): string {
  if (month?.rule !== 'yearly_balance') {
    return 'Each month you get one Casual Leave: one full day, or two half-days on any dates of that month.';
  }
  const left = typeof month.remaining === 'number' ? ` ${halvesText(month.remaining)} left in ${month.month.slice(0, 4)}.` : '';
  return `You have ${total} days of Casual Leave a year: full days or half-days, on any dates, as many a month as your balance allows (a half-day counts ½).${left}`;
}

/** "Uses 1 day · 10 of 12 left after this", under the yearly rule when the month's balance is known; else null. */
export function afterApplyText(month: CLMonth | undefined, portion: CLPortion | null, total = 12): string | null {
  if (!month || month.rule !== 'yearly_balance' || typeof month.remaining !== 'number' || !portion) return null;
  const need = PORTION_DAYS[portion];
  if (month.remaining < need) return null;
  return `Uses ${daysText(need)} · ${halvesText(month.remaining - need)} of ${total} left after this`;
}

// ─── The year, month by month (`monthsUsage`) ───

export type CLUsagePart = {
  id: number;
  kind: CLPartKind;
  date: string;
  portion: CLPortion;
  days: number;
  status: Exclude<CLStatus, 'rejected'>;
  source: CLSource;
  /** Counts against the yearly balance (false: dated before the cut-over). */
  counted: boolean;
};

export type CLMonthUsage = {
  /** 'yyyy-MM' */
  month: string;
  label: string;
  used: number;
  pending: number;
  beforeCutOver: number;
  rule: CLRule;
  parts: CLUsagePart[];
};

const asSource = (v: unknown): CLSource => (v === 'hr_edit' ? 'hr_edit' : 'employee');
const asKind = (v: unknown): CLPartKind => (v === 'attendance_correction' ? 'attendance_correction' : 'casual_leave');

function readUsagePart(p: Record<string, unknown>): CLUsagePart {
  const portion = asPortion(p.portion);
  return {
    id: numOr(p.id, 0),
    kind: asKind(p.requestKind),
    date: p.date as string,
    portion,
    days: numOr(p.days, PORTION_DAYS[portion]),
    status: asStatus(p.status) === 'approved' ? 'approved' : 'pending',
    source: asSource(p.source),
    counted: p.counted !== false,
  };
}

/** `monthsUsage`, or undefined when it is not sent (an older server) or not a list. */
export function readMonthsUsage(raw: unknown): CLMonthUsage[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(isObj).filter((m) => typeof m.month === 'string').map((m) => ({
    month: m.month as string,
    label: strOr(m.label) ?? (m.month as string),
    used: numOr(m.used, 0),
    pending: numOr(m.pending, 0),
    beforeCutOver: numOr(m.beforeCutOver, 0),
    rule: readRule(m.rule) ?? 'one_per_month',
    parts: (Array.isArray(m.parts) ? m.parts : [])
      .filter(isObj)
      .filter((p) => typeof p.date === 'string')
      .map(readUsagePart),
  }));
}

/** The year's parts as list rows (for the year grid and the month calendar). */
export function usageRows(usage: readonly CLMonthUsage[]): CLRow[] {
  return usage.flatMap((m) =>
    m.parts.map((p) => ({ id: p.id, date: p.date, portion: p.portion, status: p.status, source: p.source, kind: p.kind })),
  );
}

/**
 * The rows the month calendar and the totals read: the Casual Leave list (rejected ones included), plus the Casual Leave HR
 * proposed on an attendance edit that still waits (only `monthsUsage` has those: they are no Casual Leave request yet).
 */
export function withHrProposals(list: readonly CLRow[], usage: readonly CLMonthUsage[] | undefined): CLRow[] {
  if (!usage) return [...list];
  const proposed = usageRows(usage).filter((r) => r.kind === 'attendance_correction');
  return [...list, ...proposed];
}

/** A stable React key for a row: a Casual Leave and an attendance edit may share an id. */
export const rowKey = (r: Pick<CLRow, 'id' | 'kind'>) => `${r.kind ?? 'casual_leave'}-${r.id}`;

// ─── Balance history (GET /casual-leaves/history?year=) ───

export type CLHistoryKind = 'opening' | 'approved' | 'pending' | 'rejected' | 'lapsed';

export type CLHistoryEntry = {
  kind: CLHistoryKind;
  /** 'yyyy-MM-dd': the day the balance moved. */
  on: string;
  /** The Casual Leave's own date (null for the opening / lapse lines). */
  date: string | null;
  portion: CLPortion | null;
  days: number | null;
  change: number;
  balanceBefore: number | null;
  balanceAfter: number;
  source: CLSource | null;
  /** The server's sentence: "12 → 11 on 05 Nov: Casual Leave approved (Full day, 05 Nov 2026)". */
  text: string;
};

export type CLHistory = { year: number; total: number; balance: CLBalance | null; entries: CLHistoryEntry[] };

const HISTORY_KINDS: readonly CLHistoryKind[] = ['opening', 'approved', 'pending', 'rejected', 'lapsed'];

function readHistoryEntry(e: Record<string, unknown>): CLHistoryEntry {
  return {
    kind: e.kind as CLHistoryKind,
    on: strOr(e.on) ?? '',
    date: strOr(e.date),
    portion: e.portion == null ? null : asPortion(e.portion),
    days: e.days == null ? null : numOr(e.days, 0),
    change: numOr(e.change, 0),
    balanceBefore: e.balanceBefore == null ? null : numOr(e.balanceBefore, 0),
    balanceAfter: numOr(e.balanceAfter, 0),
    source: e.source == null ? null : asSource(e.source),
    text: String(e.text).trim(),
  };
}

/** The history answer, or null when it is not one (never throws). */
export function readHistory(raw: unknown): CLHistory | null {
  if (!isObj(raw) || !Array.isArray(raw.entries)) return null;
  const entries = raw.entries
    .filter(isObj)
    .filter((e) => typeof e.text === 'string' && (HISTORY_KINDS as readonly unknown[]).includes(e.kind))
    .map(readHistoryEntry);
  return {
    year: numOr(raw.year, new Date().getFullYear()),
    total: numOr(raw.total, 12),
    balance: readBalance(raw.balance),
    entries,
  };
}

/** "−1", "−½", "+12", "0": the change a history line made to the balance. */
export function changeText(change: number): string {
  if (change === 0) return '0';
  return `${change > 0 ? '+' : '−'}${halvesText(Math.abs(change))}`;
}

/** Newest first, for the phone (the server tells the story oldest first; each line says "12 → 11" itself). */
export function historyNewestFirst(entries: readonly CLHistoryEntry[]): CLHistoryEntry[] {
  return [...entries].reverse();
}
