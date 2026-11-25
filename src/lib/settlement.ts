// Salary Advance and Term Loan (the Settlement screen): the rules the phone shows, in ONE place (pure, no React).
//
// The server decides everything (backend api/mobile_settlement_views.py): when applications are open (owner 2026-11-25: a
// Salary Advance only from the 20th to the 22nd of each month, a Term Loan on any day; factory date), the 60% limit of
// the monthly fixed salary, the 1-12 month Term Loan, the whole-rupee EMI, and what HR approved. This file only words those answers and gives the forms a LIVE preview that
// matches what the server will store, so an employee sees the same EMI and months before and after they submit.
//
// Tested by settlement.test.ts (npm test).

export type AdvanceType = 'general' | 'term';
export type AdvanceStatus = 'pending' | 'approved' | 'rejected' | 'closed';
export type ScheduleState = 'planned' | 'due' | 'upcoming' | 'deducted';

export const TYPE_LABEL: Record<AdvanceType, string> = { general: 'Salary Advance', term: 'Term Loan' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "November 2026", or "Nov 2026" when short. "" for a missing month. */
export function monthLabel(month: number | null | undefined, year: number | null | undefined, short = false): string {
  if (!month || !year || month < 1 || month > 12) return '';
  const name = MONTHS[month - 1];
  return `${short ? name.slice(0, 3) : name} ${year}`;
}

export function nextMonth(month: number, year: number): [number, number] {
  return month === 12 ? [1, year + 1] : [month + 1, year];
}

// ─── Money ─────────────────────────────────────────────────────────────────────

/** Indian digit grouping without the symbol: 123456 -> "1,23,456". Paise only when there are some. */
export function groupIndian(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const negative = value < 0;
  const abs = Math.abs(value);
  let whole = Math.floor(abs);
  let paise = Math.round((abs - whole) * 100);
  if (paise === 100) {
    whole += 1;
    paise = 0;
  }
  const digits = String(whole);
  let grouped = digits;
  if (digits.length > 3) {
    let head = digits.slice(0, -3);
    const tail = digits.slice(-3);
    const groups: string[] = [];
    while (head.length > 2) {
      groups.unshift(head.slice(-2));
      head = head.slice(0, -2);
    }
    if (head) groups.unshift(head);
    grouped = `${groups.join(',')},${tail}`;
  }
  return `${negative ? '-' : ''}${grouped}${paise ? `.${String(paise).padStart(2, '0')}` : ''}`;
}

/** "₹1,23,456" (paise only when there are some). A missing value reads "₹0". */
export function rupees(value: number | null | undefined): string {
  return `₹${groupIndian(Number(value ?? 0))}`;
}

/** What the amount box shows while typing: digits only, grouped the Indian way ("125000" -> "1,25,000"). */
export function formatAmountInput(text: string): string {
  const digits = text.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
  return digits ? groupIndian(Number(digits)) : '';
}

/** The number in the amount box ("1,25,000" -> 125000); NaN when it is empty. */
export function amountOf(text: string): number {
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : NaN;
}

// ─── The application window ────────────────────────────────────────────────────

export interface WindowInfo {
  isOpen: boolean;
  opensOn: string;
  /** null for a form that is open every day (a Term Loan since 2026-11-25). */
  closesOn: string | null;
  nextOpensOn: string | null;
  daysUntilOpen: number;
  /** null for a form that is open every day. */
  daysLeft: number | null;
  message: string;
  // Additive (2026-11-25), absent on an older server:
  type?: AdvanceType;
  label?: string;
  /** Open every day: no dates (a Term Loan). */
  alwaysOpen?: boolean;
  /** The days of the month the window runs (20 and 22 for a Salary Advance). */
  opensOnDay?: number | null;
  closesOnDay?: number | null;
}

/** Each form's own window (GET /my/advances/eligibility `windows`, 2026-11-25). */
export interface WindowsInfo {
  general: WindowInfo;
  term: WindowInfo;
}

/** What the window helpers need from the eligibility reply. */
export interface WindowSource {
  window: WindowInfo;
  windows?: Partial<WindowsInfo> | null;
}

/** The Salary Advance window: `windows.general`, else (an older server) the one shared `window`. */
export function salaryAdvanceWindow(e: WindowSource): WindowInfo {
  return e.windows?.general ?? e.window;
}

/**
 * The Term Loan window, or null when a Term Loan can be applied for on any day (the current server: `windows.term` is
 * `alwaysOpen`). An older server has one window for both forms, so that window applies.
 */
export function termLoanWindow(e: WindowSource): WindowInfo | null {
  const term = e.windows?.term;
  if (term) return term.alwaysOpen ? null : term;
  return e.window;
}

const MONTH_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** "20 Nov" from "2026-11-20" (never shifted by time zone). */
export function dayMonth(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return '';
  return `${Number(m[3])} ${MONTH_SHORT[Number(m[2]) - 1]}`;
}

/** The headline of the window banner: "Open now: 2 days left", "Opens on 20 Dec: in 25 days", "Last day today",
 *  "Open every day". */
export function windowHeadline(w: WindowInfo | null | undefined): string {
  if (!w) return '';
  if (w.alwaysOpen) return 'Open every day';
  if (w.isOpen) {
    if ((w.daysLeft ?? 0) <= 1) return 'Open now: last day today';
    return `Open now: ${w.daysLeft} days left`;
  }
  const when = w.daysUntilOpen === 1 ? 'tomorrow' : `in ${w.daysUntilOpen} days`;
  return `Opens on ${dayMonth(w.opensOn)}: ${when}`;
}

/** The short line on a form's card / tab: "Open · 2 days left", "Last day today", "Opens 20 Dec · in 25 days",
 *  "Any day". `open` false = the form cannot be sent today because of its window. */
export function windowChip(w: WindowInfo | null | undefined): { open: boolean; text: string } {
  if (!w || w.alwaysOpen) return { open: true, text: 'Any day' };
  if (w.isOpen) {
    const left = w.daysLeft ?? 0;
    return { open: true, text: left <= 1 ? 'Last day today' : `Open · ${left} days left` };
  }
  const when = w.daysUntilOpen === 1 ? 'tomorrow' : `in ${w.daysUntilOpen} days`;
  return { open: false, text: `Opens ${dayMonth(w.opensOn)} · ${when}` };
}

/** "Opens on 20 Dec" for a closed window (a disabled button), '' otherwise. */
export function opensOnText(w: WindowInfo | null | undefined): string {
  return w && !w.alwaysOpen && !w.isOpen && dayMonth(w.opensOn) ? `Opens on ${dayMonth(w.opensOn)}` : '';
}

function dayOf(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? Number(m[3]) : null;
}

/** Days in the month of a "YYYY-MM-DD" (30 when it is not a date). */
export function daysInMonthOf(iso: string | null | undefined): number {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso ?? ''));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate() : 30;
}

export interface WindowStrip {
  /** The month's last day (the strip runs 1 .. lastDay). */
  lastDay: number;
  /** The open days, as day numbers and as % positions along the strip. */
  fromDay: number;
  toDay: number;
  startPct: number;
  endPct: number;
  /** Today's position, 0-100 (kept on the strip). */
  todayPct: number;
}

/** The banner's strip of today's month with the window's days lit (the 20th to the 22nd for a Salary Advance; an older
 *  server's 20th to the month end), or null for a form with no window. */
export function windowStrip(w: WindowInfo | null | undefined, today: string | null | undefined): WindowStrip | null {
  if (!w || w.alwaysOpen) return null;
  const lastDay = daysInMonthOf(today);
  const fromDay = Math.min(lastDay, w.opensOnDay ?? dayOf(w.opensOn) ?? 20);
  const toDay = Math.min(lastDay, Math.max(fromDay, w.closesOnDay ?? dayOf(w.closesOn) ?? lastDay));
  const span = Math.max(1, lastDay - 1);
  const pct = (d: number) => clamp01((d - 1) / span) * 100;
  return {
    lastDay,
    fromDay,
    toDay,
    startPct: pct(fromDay),
    endPct: pct(toDay),
    todayPct: pct(dayOf(today) ?? 1),
  };
}

/** How far through the waiting period or the open period we are, 0-1, for a progress bar. */
export function windowProgress(w: WindowInfo | null | undefined): number {
  if (!w) return 0;
  if (w.alwaysOpen) return 1;
  const from = w.opensOnDay ?? dayOf(w.opensOn) ?? 20;
  const to = w.closesOnDay ?? dayOf(w.closesOn) ?? 30;
  const openDays = Math.max(1, to - from + 1);
  if (w.isOpen) return clamp01((openDays - (w.daysLeft ?? 0) + 1) / openDays);
  const waitDays = Math.max(1, 31 - openDays);
  return clamp01((waitDays - w.daysUntilOpen + 1) / waitDays);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ─── Salary Advance ────────────────────────────────────────────────────────────

export type MeterState = 'empty' | 'ok' | 'near' | 'over';

/** The 60% meter: how much of the limit the typed amount uses. `near` from 85%, `over` above the limit. */
export function limitMeter(amount: number, limit: number | null | undefined): { ratio: number; state: MeterState; left: number } {
  if (!limit || limit <= 0) return { ratio: 0, state: 'empty', left: 0 };
  if (!Number.isFinite(amount) || amount <= 0) return { ratio: 0, state: 'empty', left: limit };
  const ratio = amount / limit;
  return {
    ratio: Math.min(ratio, 1),
    state: ratio > 1 ? 'over' : ratio >= 0.85 ? 'near' : 'ok',
    left: Math.max(0, limit - amount),
  };
}

export const MIN_PURPOSE = 3;
export const MAX_PURPOSE = 300;

/** The message under the Salary Advance amount, or null when it can be sent. Same rules and wording as the server. */
export function salaryAdvanceProblem(text: string, limit: number | null | undefined, salary: number | null | undefined): string | null {
  const amount = amountOf(text);
  if (!Number.isFinite(amount)) return 'Enter the amount.';
  if (amount <= 0) return 'The amount must be more than ₹0.';
  if (limit != null && amount > limit) {
    return `The most you can ask for is ${rupees(limit)}${salary ? ` (60% of your monthly salary of ${rupees(salary)})` : ''}.`;
  }
  return null;
}

/** The message under the purpose, or null. */
export function purposeProblem(text: string): string | null {
  const t = text.trim();
  if (t.length < MIN_PURPOSE) return 'Tell HR briefly what the money is for.';
  if (t.length > MAX_PURPOSE) return `Keep the purpose under ${MAX_PURPOSE} characters.`;
  return null;
}

// ─── Term Loan ─────────────────────────────────────────────────────────────────

export interface PlanItem {
  month: number;
  year: number;
  label: string;
  amount: number;
}

/** The monthly EMI: amount / months rounded UP to whole rupees (settlement_views.whole_rupee_emi). */
export function termEmi(amount: number, months: number): number {
  if (!(amount > 0) || !(months > 0)) return 0;
  return Math.ceil(amount / months);
}

/** The deductions a Term Loan would make: the EMI each month and a smaller last one that absorbs the rest, from the
 *  first deduction month. Twin of the server's schedule (mobile_settlement_views.schedule_plan). */
export function termPlan(amount: number, months: number, startMonth: number, startYear: number): PlanItem[] {
  const emi = termEmi(amount, months);
  if (!emi) return [];
  const out: PlanItem[] = [];
  let remaining = amount;
  let m = startMonth;
  let y = startYear;
  for (let i = 0; i < months && remaining > 0; i += 1) {
    const pay = Math.min(emi, remaining);
    out.push({ month: m, year: y, label: monthLabel(m, y, true), amount: pay });
    remaining -= pay;
    [m, y] = nextMonth(m, y);
  }
  return out;
}

/** "3 EMIs of ₹3,334 (last ₹3,332), Nov 2026 to Jan 2027". */
export function planSummary(plan: PlanItem[]): string {
  if (plan.length === 0) return '';
  const first = plan[0];
  const last = plan[plan.length - 1];
  if (plan.length === 1) return `1 deduction of ${rupees(first.amount)} in ${monthLabel(first.month, first.year)}`;
  const tail = last.amount !== first.amount ? ` (last ${rupees(last.amount)})` : '';
  return `${plan.length} EMIs of ${rupees(first.amount)}${tail}, ${first.label} to ${last.label}`;
}

/** The message under the Term Loan amount, or null when it can be sent. */
export function termAmountProblem(text: string, minAmount: number, maxAmount?: number | null): string | null {
  const amount = amountOf(text);
  if (!Number.isFinite(amount)) return 'Enter the amount.';
  if (amount < minAmount) return `A Term Loan starts from ${rupees(minAmount)}.`;
  if (maxAmount && amount > maxAmount) return `The amount cannot be more than ${rupees(maxAmount)}.`;
  return null;
}

// ─── Records ───────────────────────────────────────────────────────────────────

export type StatusFilter = 'all' | 'waiting' | 'active' | 'done' | 'rejected';
export type TypeFilter = 'all' | AdvanceType;

export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'active', label: 'Repaying' },
  { key: 'done', label: 'Repaid' },
  { key: 'rejected', label: 'Rejected' },
];

export const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'Both' },
  { key: 'general', label: 'Salary Advance' },
  { key: 'term', label: 'Term Loan' },
];

const STATUS_GROUP: Record<AdvanceStatus, Exclude<StatusFilter, 'all'>> = {
  pending: 'waiting',
  approved: 'active',
  closed: 'done',
  rejected: 'rejected',
};

export function statusGroup(status: string | null | undefined): Exclude<StatusFilter, 'all'> {
  return STATUS_GROUP[(status ?? 'pending') as AdvanceStatus] ?? 'waiting';
}

/** The words on a record's status pill. An approved Salary Advance not yet deducted reads "Approved"; once something has
 *  been deducted (or for a Term Loan under way) "Repaying". */
export function statusText(r: { status: string; advanceType: string; deductedTotal?: number }): string {
  switch (r.status) {
    case 'pending':
      return 'Waiting for HR';
    case 'rejected':
      return 'Rejected';
    case 'closed':
      return 'Fully repaid';
    default:
      return (r.deductedTotal ?? 0) > 0 ? 'Repaying' : 'Approved';
  }
}

export interface RecordLike {
  advanceType: string;
  status: string;
  balanceDue?: number;
  deductedTotal?: number;
}

export function filterRecords<T extends RecordLike>(rows: readonly T[], type: TypeFilter, status: StatusFilter): T[] {
  return rows.filter(
    (r) => (type === 'all' || r.advanceType === type) && (status === 'all' || statusGroup(r.status) === status),
  );
}

/** How many records each status chip would show with the type filter applied. */
export function statusCounts<T extends RecordLike>(rows: readonly T[], type: TypeFilter): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: 0, waiting: 0, active: 0, done: 0, rejected: 0 };
  for (const r of rows) {
    if (type !== 'all' && r.advanceType !== type) continue;
    counts.all += 1;
    counts[statusGroup(r.status)] += 1;
  }
  return counts;
}

/** The figures at the top of the records: still owed (approved only: a pending or rejected application owes nothing),
 *  repaid so far, and how many are waiting for HR. */
export function recordTotals<T extends RecordLike>(rows: readonly T[]): { owed: number; repaid: number; waiting: number; active: number } {
  let owed = 0;
  let repaid = 0;
  let waiting = 0;
  let active = 0;
  for (const r of rows) {
    if (r.status === 'approved') {
      owed += r.balanceDue ?? 0;
      active += 1;
    }
    if (r.status === 'pending') waiting += 1;
    repaid += r.deductedTotal ?? 0;
  }
  return { owed: round2(owed), repaid: round2(repaid), waiting, active };
}

/** How much of the approved amount is repaid, 0-1, for the progress ring. */
export function repaidRatio(approved: number, deducted: number): number {
  if (!(approved > 0)) return 0;
  return clamp01(deducted / approved);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The server's error sentence for a refused application, or a plain fallback. */
export function applyErrorMessage(err: unknown, fallback = 'Could not send your application. Please try again.'): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  const text = data?.error ?? data?.message;
  return typeof text === 'string' && text.trim() ? text : fallback;
}
