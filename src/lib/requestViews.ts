// The four views every request screen offers (owner brief 2026-10-31): Waiting, This month, Approved, Rejected.
//
// Pure so every screen sorts its requests the same way and the rules are tested once (requestViews.test.ts). A screen
// passes how to read the status and the date of one of its rows; "This month" means what the owner asked for on that
// screen: leave/outpass/permission TAKEN this month (approved, by the day it is for), missing punch/on-duty SUBMITTED
// this month (any status, by the day it was sent) - the caller picks with `month`.

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

export type ViewOptions<T> = {
  statusOf: (row: T) => string | null | undefined;
  /**
   * dateOf: the day "This month" looks at (YYYY-MM-DD or an ISO date-time).
   * kind: 'taken' = approved rows only (leave / outpass / permission); 'submitted' = every row sent this month.
   */
  month: { dateOf: (row: T) => string | null | undefined; kind: 'taken' | 'submitted' };
  /** Today, for tests; defaults to the phone's date. */
  today?: Date;
  /** A screen's own exceptions (e.g. an outpass that is "out" counts as approved anyway). */
  groupOf?: (row: T) => StatusGroup | null | undefined;
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
  const ym = yearMonthOf(opts.month.dateOf(row));
  const today = opts.today ?? new Date();
  if (!ym || ym[0] !== today.getFullYear() || ym[1] !== today.getMonth() + 1) return false;
  return opts.month.kind === 'submitted' || groupFor(row, opts) === 'approved';
}

/** The rows of one view, in the order they came. */
export function rowsForView<T>(rows: readonly T[], view: RequestView, opts: ViewOptions<T>): T[] {
  if (view === 'month') return rows.filter((r) => inThisMonth(r, opts));
  return rows.filter((r) => groupFor(r, opts) === view);
}

/** How many rows each view holds, for the counts on the switcher. */
export function viewCounts<T>(rows: readonly T[], opts: ViewOptions<T>): Record<RequestView, number> {
  const counts: Record<RequestView, number> = { waiting: 0, month: 0, approved: 0, rejected: 0 };
  for (const r of rows) {
    const g = groupFor(r, opts);
    if (g === 'waiting' || g === 'approved' || g === 'rejected') counts[g] += 1;
    if (inThisMonth(r, opts)) counts.month += 1;
  }
  return counts;
}

/** The view a screen opens on: Waiting when something is waiting, else This month. */
export function defaultView(counts: Record<RequestView, number>): RequestView {
  return counts.waiting > 0 ? 'waiting' : 'month';
}
