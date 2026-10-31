// Casual Leave (CL): the rules the app shows, kept pure so they are tested once (casualLeave.test.ts).
//
// Owner 2026-10-31: the month's one Casual Leave is EITHER one full day OR two half-days (first / second half of the
// shift) on any dates of that month; both halves may even be the same date. A pending or approved full day blocks the
// halves and the other way round; the same date cannot hold the same half twice. The server decides
// (backend api/casual_leave_views.py); this only reads back what it said and words it for the employee.

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

export type CLMonth = {
  /** 'yyyy-MM' */
  month: string;
  label: string;
  eligible: boolean;
  reason: string | null;
  left: CLLeft;
  /** The pending / approved requests of the month. */
  usedParts: CLPart[];
  /** Which half of which date is already asked for. */
  usedHalves: { date: string; portion: CLPortion }[];
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
};

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
};

const byDate = (a: CLRow, b: CLRow) => a.date.localeCompare(b.date) || a.id - b.id;

/** The 12 months of `year`: what was taken (or is waiting) in each, for the year view. */
export function yearMonths(rows: readonly CLRow[], year: number): YearMonth[] {
  const out: YearMonth[] = [];
  for (let month = 1; month <= 12; month++) {
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const parts = rows.filter((r) => r.status !== 'rejected' && r.date.startsWith(prefix)).sort(byDate);
    const slot = (r: CLRow | undefined): DialSlot =>
      r ? { portion: r.portion, status: r.status === 'approved' ? 'approved' : 'pending', date: r.date } : null;
    const full = parts.find((p) => p.portion === 'full');
    const halves = parts.filter((p) => p.portion !== 'full');
    const slots: [DialSlot, DialSlot] = full ? [slot(full), slot(full)] : [slot(halves[0]), slot(halves[1])];
    const sum = (status: CLStatus) =>
      Math.min(1, parts.filter((p) => p.status === status).reduce((n, p) => n + PORTION_DAYS[p.portion], 0));
    out.push({
      month,
      short: MONTH_SHORT[month - 1],
      parts,
      approvedDays: sum('approved'),
      waitingDays: sum('pending'),
      shape: full ? 'full' : halves.length >= 2 ? 'two_halves' : halves.length === 1 ? 'one_half' : 'none',
      slots,
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
