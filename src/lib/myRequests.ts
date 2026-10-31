// How the four "my requests" screens (Missing Punch, Outpass, Permission, On-Duty) sort their rows into the shared views
// Waiting / This month / Approved / Rejected (src/lib/requestViews.ts). Pure, so the mapping of every module's real
// statuses is pinned in myRequests.test.ts.
//
// Owner's words (2026-10-31):
//   Missing Punch: waiting, SUBMITTED during the current month, approved, rejected.
//   Outpass:       waiting, outpasses TAKEN during the current month, approved, rejected.
//   Permission:    waiting, permissions TAKEN during the current month, approved, rejected.
//   On-Duty:       waiting, On-Duty requests SUBMITTED during the current month, approved, rejected.

import { yearMonthOf, type StatusGroup, type ViewOptions } from './requestViews.ts';

const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * The India calendar day of a value: "2026-10-07" stays as it is; an ISO date-time with an offset or "Z" (the server
 * sends created/approved times in UTC) becomes the date it was in India. Null when it is not a date.
 */
export function istDateOf(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return null;
  // A date-time without an offset is already a wall-clock time: read its date part as it is.
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return s.slice(0, 10);
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// ── Missing Punch ────────────────────────────────────────────────────────────────────────────────────────────────────

export type MissingPunchLike = { status: string; date: string; createdAt?: string | null };

/** pending_hod / pending_hr: still with an approver (the generic table does not know these two spellings). */
export function missingPunchGroup(status: string | null | undefined): StatusGroup {
  const s = String(status ?? '').toLowerCase();
  if (s === 'pending_hod' || s === 'pending_hr' || s === 'pending') return 'waiting';
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  return 'other';
}

/** "Sent this month" = every request sent this month (India date of createdAt; the punch's own date when absent). */
export function missingPunchViewOptions<T extends MissingPunchLike>(today?: Date): ViewOptions<T> {
  return {
    statusOf: (r) => r.status,
    groupOf: (r) => missingPunchGroup(r.status),
    month: { dateOf: (r) => istDateOf(r.createdAt) ?? r.date, kind: 'submitted' },
    today,
  };
}

// ── Outpass ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type OutpassLike = {
  status: string;
  createdAt: string;
  approvedAt?: string | null;
  exitedAt?: string | null;
};

/** Outpass requests are pending / approved / rejected; going out and coming back happens on an approved pass. */
export function outpassGroup(status: string | null | undefined): StatusGroup {
  const s = String(status ?? '').toLowerCase();
  if (s === 'pending') return 'waiting';
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  return 'other';
}

/** The day a pass was taken: the day the employee went out, else the day it was approved, else the day it was asked. */
export function outpassDay(r: OutpassLike): string | null {
  return istDateOf(r.exitedAt) ?? istDateOf(r.approvedAt) ?? istDateOf(r.createdAt);
}

/** "Taken this month" = approved passes whose day (outpassDay) is in this month. */
export function outpassViewOptions<T extends OutpassLike>(today?: Date): ViewOptions<T> {
  return {
    statusOf: (r) => r.status,
    groupOf: (r) => outpassGroup(r.status),
    month: { dateOf: outpassDay, kind: 'taken' },
    today,
  };
}

// ── Permission ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type PermissionLike = { status: string; date: string };

/** "Pending" / "Approved" / "Rejected" (the hook capitalises them). An Overdue / Excess permission is still approved. */
export function permissionGroup(status: string | null | undefined): StatusGroup {
  const s = String(status ?? '').toLowerCase();
  if (s === 'pending') return 'waiting';
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  return 'other';
}

/** "Taken this month" = approved permissions for a day in this month. */
export function permissionViewOptions<T extends PermissionLike>(today?: Date): ViewOptions<T> {
  return {
    statusOf: (r) => r.status,
    groupOf: (r) => permissionGroup(r.status),
    month: { dateOf: (r) => r.date, kind: 'taken' },
    today,
  };
}

/** This month's permissions that still count against the monthly limit (pending + approved), by the day they are for. */
export function permissionsUsedThisMonth<T extends PermissionLike>(rows: readonly T[], today: Date = new Date()): number {
  return rows.filter((r) => {
    const ym = yearMonthOf(r.date);
    return !!ym && ym[0] === today.getFullYear() && ym[1] === today.getMonth() + 1 && permissionGroup(r.status) !== 'rejected';
  }).length;
}

// ── On-Duty ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type OnDutyLike = { status: string; approvalStatus?: string | null; date?: string | null; createdAt?: string | null };

/**
 * Sorted by the TRUE approval state (`approvalStatus`), never by `status`: the server shows the employee a request that
 * is still with an approver as "active" (they work under it straight away) or "completed" once the day ended.
 *   pending_hod / pending_hr -> waiting; active / completed -> approved; rejected -> rejected.
 */
export function onDutyGroup(row: OnDutyLike): StatusGroup {
  const s = String(row.approvalStatus ?? row.status ?? '').toLowerCase();
  if (s === 'pending_hod' || s === 'pending_hr') return 'waiting';
  if (s === 'active' || s === 'completed') return 'approved';
  if (s === 'rejected') return 'rejected';
  return 'other';
}

/**
 * The badge and the one-line state of an On-Duty request in View Records, in plain English:
 *   waiting  -> "Waiting" + "Day in progress" / "Day ended"
 *   approved -> "Approved" + "Day in progress" / "Day completed"
 *   rejected -> "Rejected" + "Punches under it do not count"
 */
export function onDutyRowLabel(row: OnDutyLike & { completionReason?: string | null }): {
  label: string;
  variant: 'pending' | 'approved' | 'rejected';
  detail: string;
} {
  const group = onDutyGroup(row);
  const shown = String(row.status ?? '').toLowerCase();
  const ended = shown === 'completed' || String(row.approvalStatus ?? '').toLowerCase() === 'completed';
  const how =
    row.completionReason === 'auto_4th_punch' ? ' (all 4 punches)'
    : row.completionReason === 'auto_day_end' ? ' (closed at day end)'
    : row.completionReason === 'manual' ? ' (marked done)'
    : '';
  if (group === 'waiting') return { label: 'Waiting', variant: 'pending', detail: ended ? 'Day ended, waiting for approval' : 'Day in progress, waiting for approval' };
  if (group === 'approved') return { label: 'Approved', variant: 'approved', detail: ended ? `Day completed${how}` : 'Day in progress' };
  if (group === 'rejected') return { label: 'Rejected', variant: 'rejected', detail: 'Punches recorded under it do not count' };
  return { label: row.status, variant: 'pending', detail: '' };
}

/** "Sent this month" = every On-Duty request sent this month (India date). */
export function onDutyViewOptions<T extends OnDutyLike>(today?: Date): ViewOptions<T> {
  return {
    statusOf: (r) => r.approvalStatus ?? r.status,
    groupOf: onDutyGroup,
    month: { dateOf: (r) => r.date ?? istDateOf(r.createdAt), kind: 'submitted' },
    today,
  };
}

// ── Month headings for long lists ────────────────────────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type MonthSection<T> = { key: string; title: string; rows: T[] };

/** Rows split under month headings ("October 2026"), keeping their order; rows without a date go under "Earlier". */
export function monthSections<T>(rows: readonly T[], dateOf: (row: T) => string | null | undefined): MonthSection<T>[] {
  const out: MonthSection<T>[] = [];
  const byKey = new Map<string, MonthSection<T>>();
  for (const row of rows) {
    const ym = yearMonthOf(dateOf(row));
    const key = ym ? `${ym[0]}-${String(ym[1]).padStart(2, '0')}` : 'none';
    let section = byKey.get(key);
    if (!section) {
      section = { key, title: ym ? `${MONTHS[ym[1] - 1]} ${ym[0]}` : 'Earlier', rows: [] };
      byKey.set(key, section);
      out.push(section);
    }
    section.rows.push(row);
  }
  return out;
}

/** Plain-English empty-state wording per view, so an empty view never reads like a failed load. */
export function emptyViewText(
  view: 'waiting' | 'month' | 'approved' | 'rejected',
  noun: string,
  monthPhrase: string,
): { title: string; subtitle: string } {
  switch (view) {
    case 'waiting':
      return { title: `No ${noun} waiting`, subtitle: `Nothing is waiting for approval right now.` };
    case 'month':
      return { title: `No ${noun} ${monthPhrase}`, subtitle: `When you have one this month, it shows here.` };
    case 'approved':
      return { title: `No approved ${noun} yet`, subtitle: `Approved ones will show here.` };
    default:
      return { title: `No rejected ${noun}`, subtitle: `Good news: nothing has been turned down.` };
  }
}
