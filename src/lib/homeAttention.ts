// Home screen: the "Needs your attention" strip, the "Last salary" card and the small date rules Home uses. Pure (no React
// Native), unit-tested in homeAttention.test.ts.
//
// Every row comes from an answer another screen already relies on; Home only words it:
//   pending requests   GET /my/pending-requests            -> My Requests (/hod-assignment?tab=requests)
//   gate pass open     GET /outpass-requests               -> Outpass (/outpass)
//   On-Duty running    GET /attendance/geo-punch/status    -> On-Duty (/on-duty)
//   Casual Leave left  GET /casual-leaves/my-eligibility   -> Casual Leave (/casual-leave), staff only, last week of month
//   advances open      GET /my/advances/eligibility        -> Advances & Loans (/settlement)
//   last salary        GET /my/salary-insights             -> Salary (/salary)
// A source that failed or is still loading simply gives no row: Home never shows an error for these extras.

import { openPassClock, formatSpan, formatTicker, type OpenPassInput } from './outpassOpen.ts';
import { waitingSince, type PendingRequests } from './pendingReminders.ts';
import { formatInr, latestPeriod, periodTitle, type SalaryInsights } from './salaryInsights.ts';
import { dayMonth, type WindowInfo } from './settlement.ts';

// ── dates ─────────────────────────────────────────────────────────────────

/** A "yyyy-MM-dd" date as local midnight (new Date("yyyy-MM-dd") would read it as UTC midnight). null when not a date. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole calendar days from today to `value` ("yyyy-MM-dd"), 0 for today or a past day, null when not a date. */
export function calendarDaysUntil(value: string | null | undefined, now: Date): number | null {
  const target = parseLocalDate(value);
  if (!target) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Math.round absorbs the hour a daylight-saving change adds or removes.
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
}

/** "Today" / "Tomorrow" / "In 5 days". */
export function inDaysText(days: number): string {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

/** Changes only when the date or the greeting changes: Home re-renders on that, not every second. */
export function calendarBucket(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}|${greetingFor(now.getHours())}`;
}

/** Days left in the month after today (0 on the last day). */
export function daysLeftInMonth(now: Date): number {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return last - now.getDate();
}

/** "3:30 PM" in the phone's own time. '' for a missing or bad time. */
export function clockText(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── the attention rows ────────────────────────────────────────────────────

/** Sets the colour of the row's icon. */
export type AttentionTone = 'urgent' | 'active' | 'waiting' | 'money' | 'leave';

export interface AttentionItem {
  key: string;
  icon: string;
  tone: AttentionTone;
  title: string;
  detail: string;
  /** Where a tap goes (an expo-router path). */
  href: string;
  /** What a screen reader says. */
  a11y: string;
  /** Lower comes first. */
  rank: number;
  /** 0..1 for a small progress bar (the gate pass), or null for none. */
  progress?: number | null;
}

const RANK = { outpass: 0, onDuty: 1, pending: 2, advance: 3, casualLeave: 4 } as const;

function item(fields: Omit<AttentionItem, 'a11y'> & { a11y?: string }): AttentionItem {
  return { ...fields, a11y: fields.a11y ?? `${fields.title}. ${fields.detail}` };
}

/** Requests still waiting for an answer, or null when there are none. */
export function pendingRequestsAttention(data: PendingRequests | null | undefined, nowMs: number): AttentionItem | null {
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  const n = items.length;
  let detail: string;
  if (n === 1) {
    detail = `${items[0].moduleLabel}: ${items[0].stage}`;
  } else {
    // The one waiting longest (a row without a date counts as newest).
    const oldest = [...items].sort((a, b) => stamp(a.submittedAt) - stamp(b.submittedAt))[0];
    const since = waitingSince(oldest.submittedAt, nowMs);
    detail = since ? `Oldest: ${oldest.moduleLabel}, ${since.charAt(0).toLowerCase()}${since.slice(1)}` : 'See where each one stands';
  }
  return item({
    key: 'pending',
    icon: 'progress-clock',
    tone: 'waiting',
    title: n === 1 ? '1 request waiting for an answer' : `${n} requests waiting for an answer`,
    detail,
    href: '/hod-assignment?tab=requests',
    rank: RANK.pending,
  });
}

function stamp(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/**
 * The open gate pass as a row, worded for this moment (the row re-asks every second for its live timer). null once the
 * pass is no longer open (back through the gate, or the 60-minute exit window ran out).
 */
export function outpassAttention(pass: OpenPassInput | null | undefined, nowMs: number): AttentionItem | null {
  if (!pass) return null;
  const clock = openPassClock(pass, nowMs);
  if (!clock) return null;
  if (clock.kind === 'ready') {
    return item({
      key: 'outpass',
      icon: 'qrcode-scan',
      tone: 'active',
      title: 'Gate pass ready',
      detail: `Show the QR at the gate: ${formatTicker(clock.exitWindowMs)} left to go out`,
      a11y: `Gate pass ready. Show the QR at the gate within ${formatSpan(clock.exitWindowMs)}.`,
      href: '/outpass',
      rank: RANK.outpass,
      progress: clock.progress,
    });
  }
  if (clock.returnInMs == null) {
    return item({
      key: 'outpass',
      icon: 'exit-run',
      tone: 'active',
      title: 'Out on a gate pass',
      detail: `Out for ${formatSpan(clock.elapsedMs)}`,
      href: '/outpass',
      rank: RANK.outpass,
      progress: null,
    });
  }
  const back = clockText(pass.expectedReturnAt);
  if (clock.overdue) {
    return item({
      key: 'outpass',
      icon: 'clock-alert-outline',
      tone: 'urgent',
      title: 'Return time passed',
      detail: `You were due back at ${back}: late by ${formatTicker(-(clock.returnInMs))}`,
      a11y: `Return time passed. You were due back at ${back}, ${formatSpan(-(clock.returnInMs))} ago.`,
      href: '/outpass',
      rank: RANK.outpass,
      progress: 1,
    });
  }
  return item({
    key: 'outpass',
    icon: 'exit-run',
    tone: 'active',
    title: 'Out on a gate pass',
    detail: `Back by ${back}: ${formatTicker(clock.returnInMs)} left`,
    a11y: `Out on a gate pass. Back by ${back}, ${formatSpan(clock.returnInMs)} left.`,
    href: '/outpass',
    rank: RANK.outpass,
    progress: clock.progress,
  });
}

export interface OnDutyLike {
  status: string;
  destination?: string | null;
  isProvisional?: boolean;
  startedAt?: string | null;
}

/** A running On-Duty session (submitted or approved, not ended), or null. */
export function onDutyAttention(session: OnDutyLike | null | undefined): AttentionItem | null {
  if (!session) return null;
  if (!['active', 'pending_hod', 'pending_hr'].includes(session.status)) return null;
  const parts: string[] = [];
  const where = (session.destination ?? '').trim();
  if (where) parts.push(where);
  const started = clockText(session.startedAt);
  if (started) parts.push(`started ${started}`);
  const waiting = session.isProvisional || session.status === 'pending_hod' || session.status === 'pending_hr';
  if (waiting) parts.push('waiting for approval');
  const detail = parts.length ? capitalise(parts.join(' · ')) : 'Tap to add your punches';
  return item({
    key: 'onDuty',
    icon: 'briefcase-outline',
    tone: 'active',
    title: 'On-Duty in progress',
    detail,
    href: '/on-duty',
    rank: RANK.onDuty,
  });
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export interface AdvanceEligibilityLike {
  window: Pick<WindowInfo, 'isOpen' | 'closesOn' | 'daysLeft'>;
  workflowEnabled?: boolean;
  employeeActive?: boolean;
  salaryAdvance?: { canApply?: boolean } | null;
  termLoan?: { canApply?: boolean } | null;
}

/** "Advance & loan applications open" while the window is open AND this employee can apply for at least one; else null. */
export function advanceAttention(e: AdvanceEligibilityLike | null | undefined): AttentionItem | null {
  if (!e?.window?.isOpen) return null;
  if (e.workflowEnabled === false || e.employeeActive === false) return null;
  const advance = !!e.salaryAdvance?.canApply;
  const loan = !!e.termLoan?.canApply;
  if (!advance && !loan) return null;
  const what = advance && loan ? 'Advance & loan applications' : advance ? 'Salary Advance applications' : 'Term Loan applications';
  const until = dayMonth(e.window.closesOn);
  const detail = e.window.daysLeft <= 1 ? 'Open today only: last day' : until ? `Open until ${until}` : `Open for ${e.window.daysLeft} more days`;
  return item({
    key: 'advance',
    icon: 'cash-fast',
    tone: 'money',
    title: `${what} are open`,
    detail,
    href: '/settlement',
    rank: RANK.advance,
  });
}

export interface CLMonthLike {
  month: string;
  label: string;
  eligible: boolean;
  left: 'full' | 'one_half' | 'nothing';
}

/** How many days before the month ends Home starts pointing at unused Casual Leave. */
export const CL_REMIND_DAYS = 7;

/** "yyyy-MM" of a date in the phone's time. */
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * This month's Casual Leave still unused, shown only in the month's last week (when it is worth a reminder) and only to
 * staff (the caller checks the profile; production has no CL). null otherwise.
 */
export function casualLeaveAttention(months: readonly CLMonthLike[] | null | undefined, now: Date): AttentionItem | null {
  const left = daysLeftInMonth(now);
  if (left >= CL_REMIND_DAYS) return null;
  const m = (months ?? []).find((x) => x.month === monthKeyOf(now));
  if (!m || !m.eligible || m.left === 'nothing') return null;
  const name = (m.label || '').split(' ')[0] || 'This month';
  const what = m.left === 'full' ? '1 day' : 'half a day';
  const ends = left === 0 ? 'the month ends today' : left === 1 ? 'the month ends tomorrow' : `the month ends in ${left} days`;
  return item({
    key: 'casualLeave',
    icon: 'beach',
    tone: 'leave',
    title: `${name}'s Casual Leave not used yet`,
    detail: `${capitalise(what)} left · ${ends}`,
    href: '/casual-leave',
    rank: RANK.casualLeave,
  });
}

/** The rows in the order they are shown (the most time-critical first). */
export function sortAttention(items: readonly (AttentionItem | null | undefined)[]): AttentionItem[] {
  return items.filter((i): i is AttentionItem => !!i).sort((a, b) => a.rank - b.rank);
}

// ── the "Last salary" card ────────────────────────────────────────────────

export interface LastSalary {
  slipId: number;
  periodLabel: string;
  net: number;
  netText: string;
  /** The attendance line: what was lost (null amount = nothing to show). */
  lossAmount: number | null;
  lossText: string;
  lossTone: 'loss' | 'none' | 'neutral';
  /** earned / allocated, 0..1, for the small bar; null without an allocated salary. */
  paidRatio: number | null;
  hrChanged: boolean;
}

export const HIDDEN_AMOUNT = '₹ • • • • •';

/** The newest pay period as the Home card shows it, or null when there is no slip yet. Amounts masked when `hidden`. */
export function lastSalary(data: SalaryInsights | null | undefined, hidden: boolean): LastSalary | null {
  const p = latestPeriod(data?.periods ?? []);
  if (!p) return null;
  const money = (v: number) => (hidden ? HIDDEN_AMOUNT : formatInr(v));
  let lossAmount: number | null = null;
  let lossText = '';
  let lossTone: LastSalary['lossTone'] = 'neutral';
  if (p.allocated != null) {
    const loss = p.attendanceLoss ?? 0;
    if (loss > 0) {
      lossAmount = loss;
      lossText = `${money(loss)} lost to attendance`;
      lossTone = 'loss';
    } else {
      lossText = 'Nothing lost to attendance';
      lossTone = 'none';
    }
  } else if (p.lateDeduction && p.lateDeduction > 0) {
    // Production pay has no fixed salary to compare with: only a late deduction can be shown.
    lossAmount = p.lateDeduction;
    lossText = `${money(p.lateDeduction)} late deduction`;
    lossTone = 'loss';
  }
  const ratio = p.allocated && p.allocated > 0 ? p.earnedGross / p.allocated : null;
  return {
    slipId: p.slipId,
    periodLabel: periodTitle(p),
    net: p.netPayable,
    netText: money(p.netPayable),
    lossAmount,
    lossText,
    lossTone,
    paidRatio: ratio == null || !Number.isFinite(ratio) ? null : Math.max(0, Math.min(1, ratio)),
    hrChanged: !!p.payroll?.hrChanged,
  };
}
