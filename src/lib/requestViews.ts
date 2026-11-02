// The four views every request screen offers (owner brief 2026-10-31): Waiting, This month, Approved, Rejected.
//
// Pure so every screen sorts its requests the same way and the rules are tested once (requestViews.test.ts). A screen
// passes how to read the status and the date of one of its rows; "This month" means what the owner asked for on that
// screen: leave/outpass/permission TAKEN this month (approved, by the day it is for), missing punch/on-duty SUBMITTED
// this month (any status, by the day it was sent) - the caller picks with `month`.
//
// Month switcher (owner 2026-11-02): a screen with the switcher passes `scope` (the month on screen and the day(s) each
// row is FOR). Then only that month's rows count at all: Waiting / Approved / Rejected list and count that month's rows,
// and the second view lists EVERY row of the month whatever its status (labelled "This month" / "All in Sep",
// monthViewLabel in monthSwitch.ts). Without `scope` everything works as it did.

import {
  compareMonths,
  daysTouchMonth,
  isCurrentMonth,
  monthLabel,
  monthsOfDays,
  monthToShow,
  type CalMonth,
  type RowDays,
} from './monthSwitch.ts';

export type RequestView = 'waiting' | 'month' | 'approved' | 'rejected';
export type StatusGroup = 'waiting' | 'approved' | 'rejected' | 'other';

export const REQUEST_VIEWS: readonly RequestView[] = ['waiting', 'month', 'approved', 'rejected'];

/** Statuses that mean the request is still with an approver (every module's spelling). */
const WAITING = new Set(['pending', 'waiting', 'in_review', 'hod_approved', 'forwarded', 'submitted', 'requested', 'review']);
/** Statuses that mean yes. "out"/"returned"/"completed"/"closed"/"active" are an approved outpass / On-Duty going on. */
const APPROVED = new Set(['approved', 'hr_approved', 'out', 'returned', 'completed', 'closed', 'active', 'done', 'accepted']);
/** Statuses that mean no. */
const REJECTED = new Set(['rejected', 'declined', 'denied', 'cancelled', 'canceled', 'expired', 'withdrawn']);

export function statusGroup(status: string | null | undefined): StatusGroup {
  const s = String(status ?? '').trim().toLowerCase();
  if (WAITING.has(s)) return 'waiting';
  if (APPROVED.has(s)) return 'approved';
  if (REJECTED.has(s)) return 'rejected';
  return 'other';
}

/** The month a screen's switcher shows, and how to read the day(s) a row is for. */
export type MonthScope<T> = CalMonth & { daysOf: (row: T) => RowDays };

export type ViewOptions<T> = {
  statusOf: (row: T) => string | null | undefined;
  /**
   * dateOf: the day "This month" looks at (YYYY-MM-DD or an ISO date-time).
   * kind: 'taken' = approved rows only (leave / outpass / permission); 'submitted' = every row sent this month.
   * Not used (and may be left out) when `scope` is given.
   */
  month?: { dateOf: (row: T) => string | null | undefined; kind: 'taken' | 'submitted' };
  /** Today, for tests; defaults to the phone's date. */
  today?: Date;
  /** A screen's own exceptions (e.g. an outpass that is "out" counts as approved anyway). */
  groupOf?: (row: T) => StatusGroup | null | undefined;
  /** The month switcher's month: only rows of this month count, and "month" is every one of them. */
  scope?: MonthScope<T>;
};

/** "2026-10-07" or "2026-10-07T09:30:00+05:30" -> [2026, 10]; null when it is not a date. Never shifts by time zone. */
export function yearMonthOf(value: string | null | undefined): [number, number] | null {
  const m = /^(\d{4})-(\d{2})/.exec(String(value ?? ''));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function groupFor<T>(row: T, opts: ViewOptions<T>): StatusGroup {
  return opts.groupOf?.(row) ?? statusGroup(opts.statusOf(row));
}

function inThisMonth<T>(row: T, opts: ViewOptions<T>): boolean {
  if (!opts.month) return false;
  const ym = yearMonthOf(opts.month.dateOf(row));
  const today = opts.today ?? new Date();
  if (!ym || ym[0] !== today.getFullYear() || ym[1] !== today.getMonth() + 1) return false;
  return opts.month.kind === 'submitted' || groupFor(row, opts) === 'approved';
}

/** Whether a row belongs to the month a screen's switcher shows (its day, or any day of its range, is in it). */
export function inMonthScope<T>(row: T, scope: MonthScope<T>): boolean {
  return daysTouchMonth(scope.daysOf(row), scope);
}

/** The rows a screen works with: the switcher's month only when `scope` is given, else all of them. */
export function rowsInScope<T>(rows: readonly T[], opts: ViewOptions<T>): T[] {
  const scope = opts.scope;
  return scope ? rows.filter((r) => inMonthScope(r, scope)) : rows.slice();
}

/** The rows of one view, in the order they came. */
export function rowsForView<T>(rows: readonly T[], view: RequestView, opts: ViewOptions<T>): T[] {
  const pool = rowsInScope(rows, opts);
  if (view === 'month') return opts.scope ? pool : pool.filter((r) => inThisMonth(r, opts));
  return pool.filter((r) => groupFor(r, opts) === view);
}

/** How many rows each view holds, for the counts on the switcher. */
export function viewCounts<T>(rows: readonly T[], opts: ViewOptions<T>): Record<RequestView, number> {
  const counts: Record<RequestView, number> = { waiting: 0, month: 0, approved: 0, rejected: 0 };
  for (const r of rowsInScope(rows, opts)) {
    const g = groupFor(r, opts);
    if (g === 'waiting' || g === 'approved' || g === 'rejected') counts[g] += 1;
    if (opts.scope || inThisMonth(r, opts)) counts.month += 1;
  }
  return counts;
}

/**
 * The month a screen must show for `row` to be listed (a notification about it): the month on screen when the row
 * belongs to it, else the row's first month. Null when the row has no date (or the screen has no switcher).
 */
export function monthForRow<T>(row: T, opts: ViewOptions<T>): CalMonth | null {
  return opts.scope ? monthToShow(opts.scope.daysOf(row), opts.scope) : null;
}

/** The same options with the switcher moved to the row's own month (which views list it once that month is shown). */
export function scopeToRow<T>(row: T, opts: ViewOptions<T>): ViewOptions<T> {
  const month = monthForRow(row, opts);
  return month && opts.scope ? { ...opts, scope: { ...opts.scope, year: month.year, month: month.month } } : opts;
}

/**
 * Rows still waiting for approval that belong to OTHER months than the one on screen, and the latest month holding one
 * (so a screen can say "1 waiting in October 2026" instead of a pending request silently leaving the list when the
 * month turns). Count 0 / month null without `scope`.
 */
export function waitingInOtherMonths<T>(rows: readonly T[], opts: ViewOptions<T>): { count: number; month: CalMonth | null } {
  const scope = opts.scope;
  if (!scope) return { count: 0, month: null };
  let count = 0;
  let month: CalMonth | null = null;
  for (const r of rows) {
    if (groupFor(r, opts) !== 'waiting' || inMonthScope(r, scope)) continue;
    const span = monthsOfDays(scope.daysOf(r));
    if (!span) continue;
    count += 1;
    if (!month || compareMonths(span.last, month) > 0) month = span.last;
  }
  return { count, month };
}

/**
 * The empty state of a view on a month-scoped screen: "No leave requests in September 2026" when the month has none at
 * all, else what this view lacks ("Nothing waiting in September 2026").
 */
export function monthEmptyText(
  view: RequestView,
  noun: string,
  month: CalMonth,
  monthTotal: number,
  today: Date = new Date(),
): { title: string; subtitle: string } {
  const label = monthLabel(month);
  const current = isCurrentMonth(month, today);
  if (monthTotal === 0 || view === 'month') {
    return {
      title: `No ${noun} in ${label}`,
      subtitle: current ? 'When you have one this month, it shows here.' : 'Use the arrows above to look at another month.',
    };
  }
  switch (view) {
    case 'waiting':
      return { title: `Nothing waiting in ${label}`, subtitle: 'Nothing of this month is waiting for approval.' };
    case 'approved':
      return { title: `Nothing approved in ${label}`, subtitle: 'Approved ones of this month show here.' };
    default:
      return { title: `Nothing rejected in ${label}`, subtitle: 'Nothing of this month was turned down.' };
  }
}

/** The view a screen opens on: Waiting when something is waiting, else This month. */
export function defaultView(counts: Record<RequestView, number>): RequestView {
  return counts.waiting > 0 ? 'waiting' : 'month';
}
