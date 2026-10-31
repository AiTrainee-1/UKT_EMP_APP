// The Approvals tab's categories, statuses, counts and "who decided" wording in ONE place (pure functions, no React
// Native, unit-tested in approvalsHistory.test.ts).
//
// The server side is backend/api/mobile_approvals_views.py:
//   GET /manager/requests/summary  -> { categories: [{ key, workflow, label, pending, approved, rejected }], total }
//   GET /manager/requests?category=&status=&search=&page=&page_size=
//                                  -> { category, status, counts, items, page, pageSize, total, hasMore }
// Every item is the same JSON /manager/pending-requests sends for its category, plus `historyStatus` and `outcome`.
// src/lib/api.ts camelizes response KEYS only, so the category keys (values) arrive in snake_case ("casual_leave").
//
// What the three statuses mean for a Department Head (decided on the server, worded here):
//   * Pending  - waiting for YOUR decision now (the same list as before, so it matches the tab badge).
//   * Approved - finally approved, or approved by the Department Head and now waiting for HR ("in_progress").
//   * Rejected - finally rejected, by whoever.

import { format } from 'date-fns';

import { formatWhen, type ApprovalRole, type WorkflowKey } from './approval.ts';
import { deciderText, type Decider } from './approvalsDecider.ts';
import type { ShownApprovalTabs } from './approvalBadge.ts';

export type ApprovalCategory =
  | 'leave'
  | 'permission'
  | 'casualLeave'
  | 'attendance'
  | 'missingPunch'
  | 'onDuty'
  | 'outpass'
  | 'holidayWork'
  | 'resignation';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = ['pending', 'approved', 'rejected'];

/** The order the category rail lists them in (the order the tab always had). */
export const CATEGORY_ORDER: readonly ApprovalCategory[] = [
  'leave',
  'permission',
  'casualLeave',
  'attendance',
  'missingPunch',
  'onDuty',
  'outpass',
  'holidayWork',
  'resignation',
];

/** The `category` value the server takes and sends back. */
export const CATEGORY_WIRE: Record<ApprovalCategory, string> = {
  leave: 'leave',
  permission: 'permission',
  casualLeave: 'casual_leave',
  attendance: 'attendance',
  missingPunch: 'missing_punch',
  onDuty: 'on_duty',
  outpass: 'outpass',
  holidayWork: 'holiday_work',
  resignation: 'resignation',
};

/** Which of HR's approval pipelines (GET /approval-summary, camelized) each category's requests follow. */
export const CATEGORY_WORKFLOW: Record<ApprovalCategory, WorkflowKey> = {
  leave: 'leave',
  permission: 'permission',
  casualLeave: 'casualLeave',
  attendance: 'attendanceCorrection',
  missingPunch: 'missingPunch',
  onDuty: 'onDuty',
  outpass: 'outpass',
  holidayWork: 'holidayWork',
  resignation: 'resignation',
};

/** What a category is called on screen ("Compensation" = holiday / Sunday work claims HR raised). */
export const CATEGORY_LABEL: Record<ApprovalCategory, string> = {
  leave: 'Leave',
  permission: 'Permission',
  casualLeave: 'Casual Leave',
  attendance: 'Attendance',
  missingPunch: 'Missing Punch',
  onDuty: 'On-Duty',
  outpass: 'Outpass',
  holidayWork: 'Compensation',
  resignation: 'Resignations',
};

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** A category key in any spelling the server or a link may use ("casual_leave", "casualLeave", "missing-punch"), or null. */
export function categoryFromWire(raw: unknown): ApprovalCategory | null {
  if (typeof raw !== 'string') return null;
  const flat = raw.trim().toLowerCase().replace(/[-_\s]/g, '');
  if (flat === 'attendancecorrection') return 'attendance';
  if (flat === 'compensation') return 'holidayWork';
  return CATEGORY_ORDER.find((c) => c.toLowerCase() === flat) ?? null;
}

export function statusFromParam(raw: unknown): ApprovalStatus | null {
  return typeof raw === 'string' && (APPROVAL_STATUSES as readonly string[]).includes(raw) ? (raw as ApprovalStatus) : null;
}

/** The categories this head sees, in rail order: Leave and Permission always, the rest behind their per-person switch
 *  (the same switches the server checks; see shownApprovalTabs in approvalBadge.ts). */
export function visibleCategories(shown: ShownApprovalTabs): ApprovalCategory[] {
  return CATEGORY_ORDER.filter((c) => c === 'leave' || c === 'permission' || shown[c]);
}

// ── counts ──────────────────────────────────────────────────────────────────

export interface StatusCounts {
  pending: number;
  approved: number;
  rejected: number;
}

export const ZERO_COUNTS: StatusCounts = { pending: 0, approved: 0, rejected: 0 };

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function normalizeCounts(raw: unknown): StatusCounts {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { pending: n(r.pending), approved: n(r.approved), rejected: n(r.rejected) };
}

export type CategoryCounts = Partial<Record<ApprovalCategory, StatusCounts>>;

/** GET /manager/requests/summary as the screen uses it, or null when the reply is not that shape (an older backend). */
export function normalizeCategoryCounts(raw: unknown): CategoryCounts | null {
  const list = raw && typeof raw === 'object' ? (raw as { categories?: unknown }).categories : null;
  if (!Array.isArray(list)) return null;
  const out: CategoryCounts = {};
  for (const entry of list) {
    const key = categoryFromWire((entry as { key?: unknown } | null)?.key);
    if (key) out[key] = normalizeCounts(entry);
  }
  return out;
}

/** Pending numbers from GET /manager/me, for an older backend without the summary (Approved / Rejected unknown = 0). */
export function countsFromProfile(m: Record<string, unknown> | null | undefined): CategoryCounts {
  const p = (key: string): StatusCounts => ({ ...ZERO_COUNTS, pending: n(m?.[key]) });
  return {
    leave: p('pendingLeavesCount'),
    permission: p('pendingPermissionsCount'),
    casualLeave: p('pendingCasualLeaveCount'),
    attendance: p('pendingAttendanceCount'),
    missingPunch: p('pendingMissingPunchCount'),
    onDuty: p('pendingOnDutyCount'),
    outpass: p('pendingOutpassCount'),
    holidayWork: p('pendingCompensationCount'),
    resignation: p('pendingResignationsCount'),
  };
}

/** Where each category sits in the older GET /manager/pending-requests reply (usePendingRequests' normalised shape). */
export const LEGACY_LIST_KEY: Record<ApprovalCategory, string> = {
  leave: 'leaveRequests',
  permission: 'permissionRequests',
  casualLeave: 'casualLeaves',
  attendance: 'attendanceRequests',
  missingPunch: 'missingPunchRequests',
  onDuty: 'onDutySessions',
  outpass: 'outpassRequests',
  holidayWork: 'holidayWorkClaims',
  resignation: 'resignations',
};

/** Pending numbers from the older pending lists (Approved / Rejected are not known there and stay out). */
export function legacyPendingCounts(lists: Record<string, unknown> | null | undefined): Partial<Record<ApprovalCategory, Partial<StatusCounts>>> {
  const out: Partial<Record<ApprovalCategory, Partial<StatusCounts>>> = {};
  for (const c of CATEGORY_ORDER) {
    const list = lists?.[LEGACY_LIST_KEY[c]];
    out[c] = { pending: Array.isArray(list) ? list.length : 0 };
  }
  return out;
}

// ── one page of a list ──────────────────────────────────────────────────────

export interface HistoryPage<T = any> {
  items: T[];
  page: number;
  total: number;
  hasMore: boolean;
  counts: StatusCounts;
}

export function normalizeHistoryPage<T = any>(raw: unknown, requestedPage = 1): HistoryPage<T> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const items = Array.isArray(r.items) ? (r.items as T[]) : [];
  return {
    items,
    page: typeof r.page === 'number' && r.page > 0 ? r.page : requestedPage,
    total: typeof r.total === 'number' && r.total >= 0 ? r.total : items.length,
    hasMore: r.hasMore === true,
    counts: normalizeCounts(r.counts),
  };
}

/** The page to fetch after this one, or undefined when the list is complete. */
export function nextPageParam(last: HistoryPage | undefined): number | undefined {
  return last && last.hasMore ? last.page + 1 : undefined;
}

/** A list item's permission rows come with `permissionTime`; the decision sheet reads `time` (as usePendingRequests
 *  normalises it). Other categories pass through untouched. */
export function normalizeItem<T extends Record<string, any>>(category: ApprovalCategory, item: T): T {
  if (category === 'permission' && item && item.time == null && item.permissionTime != null) {
    return { ...item, time: item.permissionTime };
  }
  return item;
}

// ── search (also used on the older backend's pending list, which the server cannot search) ─────────────────────

const empText = (item: any): string =>
  [item?.employeeName, item?.employeeCode, item?.employee?.name, item?.employee?.code, item?.employee?.employeeCode]
    .filter((v) => typeof v === 'string')
    .join(' ')
    .toLowerCase();

/** Every word of `query` appears in the employee's name or code. An empty query matches everything. */
export function matchesSearch(item: unknown, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = empText(item);
  return words.every((w) => hay.includes(w));
}

// ── who decided ─────────────────────────────────────────────────────────────

export interface ApprovalDecisionEntry {
  role: ApprovalRole | string | null;
  decision: 'approved' | 'rejected' | string | null;
  by?: string | null;
  at?: string | null;
  comment?: string | null;
}

export interface ApprovalOutcome {
  /** "pending" | "in_progress" (approved by a Department Head, waiting for HR) | "approved" | "rejected" */
  state: 'pending' | 'in_progress' | 'approved' | 'rejected' | null;
  yourDecision: 'approved' | 'rejected' | null;
  yourDecisionAt: string | null;
  yourComment: string | null;
  decidedByYou: boolean;
  decidedByRole: ApprovalRole | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisions: ApprovalDecisionEntry[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const role = (v: unknown): ApprovalRole | null => (v === 'hod' || v === 'hr' ? v : null);
const decision = (v: unknown): 'approved' | 'rejected' | null => (v === 'approved' || v === 'rejected' ? v : null);

/** The `outcome` block of a list item, or null when it is missing or not that shape. */
export function normalizeOutcome(raw: unknown): ApprovalOutcome | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const states = ['pending', 'in_progress', 'inProgress', 'approved', 'rejected'];
  const state = typeof r.state === 'string' && states.includes(r.state) ? r.state : null;
  return {
    state: state === 'inProgress' ? 'in_progress' : (state as ApprovalOutcome['state']),
    yourDecision: decision(r.yourDecision),
    yourDecisionAt: str(r.yourDecisionAt),
    yourComment: str(r.yourComment),
    decidedByYou: r.decidedByYou === true,
    decidedByRole: role(r.decidedByRole),
    decidedByName: str(r.decidedByName),
    decidedAt: str(r.decidedAt),
    decisions: Array.isArray(r.decisions)
      ? (r.decisions as any[]).filter((d) => d && typeof d === 'object').map((d) => ({
          role: d.role ?? null,
          decision: d.decision ?? null,
          by: str(d.by),
          at: str(d.at),
          comment: str(d.comment),
        }))
      : [],
  };
}

export type OutcomeTone = 'approved' | 'rejected' | 'waiting' | 'neutral';

export interface OutcomeLine {
  /** The prominent badge: "Approved by you · 31 Oct, 10:05 AM", "Rejected by HR (Meena) · ...",
   *  "Approved by Department Head (Kavya)". */
  text: string;
  /** What else the head should know: "You approved it first", "Waiting for HR's final decision". */
  note: string | null;
  tone: OutcomeTone;
  icon: string;
  decider: Decider;
}

/**
 * Who decided a request on the head's Approvals tab, as a badge plus a note. Null for a pending request (or no outcome).
 * `when` formats the decision time (tests pass a fixed one).
 */
export function outcomeLine(
  o: ApprovalOutcome | null | undefined,
  when: (iso: string) => string | null = formatWhen,
): OutcomeLine | null {
  if (!o || !o.state || o.state === 'pending') return null;
  if (o.state === 'in_progress') {
    const you = o.yourDecision === 'approved';
    const hodStep = [...o.decisions].reverse().find((d) => d.role === 'hod' && d.decision === 'approved');
    const decider: Decider = {
      decision: 'approved',
      role: 'hod',
      name: you ? null : (hodStep?.by ?? null),
      at: you ? o.yourDecisionAt : (hodStep?.at ?? null),
      you,
    };
    return { text: deciderText(decider, when), note: "Waiting for HR's final decision", tone: 'waiting', icon: 'progress-clock', decider };
  }
  const decider: Decider = {
    decision: o.state,
    role: o.decidedByRole,
    name: o.decidedByName,
    at: o.decidedAt,
    you: o.decidedByYou,
  };
  const note = o.yourDecision && !o.decidedByYou ? `You ${o.yourDecision} it first` : null;
  return {
    text: deciderText(decider, when),
    note,
    tone: o.state,
    icon: o.state === 'approved' ? 'check-decagram' : 'close-octagon',
    decider,
  };
}

// ── time ────────────────────────────────────────────────────────────────────

/** A calendar day "YYYY-MM-DD" as a local date (never shifted by the time zone), or null. Full ISO timestamps parse too. */
export function parseDay(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `value` formatted with a date-fns pattern, the raw text when it does not parse, or an em dash when missing. */
export function fmtDay(value: unknown, pattern = 'dd MMM yyyy'): string {
  const d = parseDay(value);
  if (d) return format(d, pattern);
  return typeof value === 'string' && value.trim() ? value : '—';
}

/** "Waiting 3 days" / "Waiting 5 hours" / "Waiting 20 min" / "Just now" since `createdAt`, or null without a time. */
export function waitingFor(createdAt: unknown, now: Date = new Date()): string | null {
  const d = parseDay(createdAt);
  if (!d) return null;
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `Waiting ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Waiting ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `Waiting ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** How urgent a wait looks: under a day "fresh", 1-2 days "aging", 3 days or more "old". */
export function waitTone(createdAt: unknown, now: Date = new Date()): 'fresh' | 'aging' | 'old' {
  const d = parseDay(createdAt);
  if (!d) return 'fresh';
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  return days >= 3 ? 'old' : days >= 1 ? 'aging' : 'fresh';
}

// ── empty states ────────────────────────────────────────────────────────────

export interface EmptyCopy {
  icon: string;
  title: string;
  subtitle: string;
}

/**
 * What an empty list says. `hodInPipeline` false = HR's pipeline for this kind has no Department Head step, so nothing
 * will ever wait for this head (the decided history can still hold requests HR decided).
 */
export function emptyCopy(
  category: ApprovalCategory,
  status: ApprovalStatus,
  opts: { search?: string; hodInPipeline?: boolean } = {},
): EmptyCopy {
  const what = CATEGORY_LABEL[category].toLowerCase().replace(/s$/, '');
  const q = opts.search?.trim();
  if (q) {
    return {
      icon: 'account-search-outline',
      title: 'No match',
      subtitle: `No ${STATUS_LABEL[status].toLowerCase()} ${what} requests for "${q}".`,
    };
  }
  if (status === 'pending') {
    return opts.hodInPipeline === false
      ? { icon: 'account-tie-outline', title: 'Nothing for you here', subtitle: 'These requests go to HR only, so none come to you.' }
      : { icon: 'check-circle-outline', title: 'All caught up!', subtitle: `No ${what} requests are waiting for you.` };
  }
  return status === 'approved'
    ? { icon: 'check-decagram-outline', title: 'No approved requests yet', subtitle: `Approved ${what} requests from your team will show here.` }
    : { icon: 'close-octagon-outline', title: 'No rejected requests', subtitle: `Rejected ${what} requests from your team will show here.` };
}
