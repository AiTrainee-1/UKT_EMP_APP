// HOD Assignment -> "My Requests": the signed-in employee's own requests that are still waiting for an answer, and the
// "Remind approver" button. Pure (no React Native), unit-tested in pendingReminders.test.ts.
//
// GET  /my/pending-requests                          (backend/api/mobile_reminder_views.py::my_pending_requests)
// POST /my/pending-requests/<module>/<id>/remind     (::remind_approver) - once per request every 24 hours
//
// Who a reminder goes to is decided by the server (the approval pipeline): the Department Head on their phone, or HR in the
// HR portal. Every field is optional on the phone: a missing or wrong-typed one reads as "not sent", and a reply that is
// not an object with a list is null (the hook turns it into a Retry state).

export type StepState = 'approved' | 'rejected' | 'skipped' | 'pending' | 'waiting';

export interface PendingStep {
  /** "Department Head", "HR" or "Department Head or HR". */
  label: string;
  state: StepState;
  by: string | null;
  at: string | null;
}

export interface TrailEntry {
  roleLabel: string;
  decision: string;
  by: string | null;
  at: string | null;
  comment: string | null;
}

export interface PendingApprover {
  role: 'hod' | 'hr';
  /** The head's name, or "HR". */
  name: string;
  label: string;
}

/** What an attendance change HR proposed would do to the day (only on `attendance_correction` rows). */
export interface AttendanceChange {
  date: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  fromShifts: string | null;
  toShifts: string | null;
  firstPunch: string | null;
  lastPunch: string | null;
  marks: string[];
  /** The server's sentence: "2026-10-08: Absent (0.00 shift) → Present (1.00 shift), 09:00 to 18:00, marked Late". */
  text: string;
}

export interface Detail {
  label: string;
  value: string;
}

/** Who raised a request: the employee, or HR for them (an attendance change HR proposed). */
export interface RaisedBy {
  raisedBy: 'employee' | 'hr';
  /** "Raised by HR" / "Raised by you" */
  raisedByLabel: string;
  /** The HR user who proposed it ("Meena"), or null. */
  raisedByName: string | null;
}

export interface PendingRequest extends RaisedBy {
  key: string;
  /** leave, permission, casual_leave, missing_punch, on_duty, outpass, attendance_correction, resignation, advance, request */
  module: string;
  moduleLabel: string;
  id: number;
  title: string;
  summary: string;
  reason: string | null;
  submittedAt: string | null;
  /** "Waiting for your Department Head (Ravi Shankar)" / "Waiting for HR" */
  stage: string;
  approver: PendingApprover;
  steps: PendingStep[];
  trail: TrailEntry[];
  workflowEnabled: boolean;
  reminderCount: number;
  lastRemindedAt: string | null;
  canRemind: boolean;
  nextReminderAt: string | null;
  /** Seconds until a reminder is allowed again, as the server counted them when it answered (0 = now). */
  remindInSeconds: number;
  details: Detail[];
  change: AttendanceChange | null;
}

/** An attendance change HR proposed for the employee that was decided in the last `recentDays` days. */
export interface RecentHrEdit extends RaisedBy {
  key: string;
  id: number;
  title: string;
  summary: string;
  reason: string | null;
  status: 'approved' | 'rejected';
  statusLabel: string;
  decidedAt: string | null;
  decidedBy: string | null;
  /** "hod" | "hr" | null */
  decidedByRole: string | null;
  comment: string | null;
  change: AttendanceChange | null;
}

export interface PendingRequests {
  items: PendingRequest[];
  count: number;
  cooldownHours: number;
  recentHrEdits: RecentHrEdit[];
  recentDays: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const orNull = (v: unknown): string | null => str(v) || null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const STATES: readonly StepState[] = ['approved', 'rejected', 'skipped', 'pending', 'waiting'];

function readStep(raw: unknown): PendingStep | null {
  if (!isObject(raw)) return null;
  const label = str(raw.label);
  if (!label) return null;
  const state = STATES.includes(raw.state as StepState) ? (raw.state as StepState) : 'waiting';
  return { label, state, by: orNull(raw.by), at: orNull(raw.at) };
}

function readTrail(raw: unknown): TrailEntry | null {
  if (!isObject(raw)) return null;
  const decision = str(raw.decision);
  if (!decision) return null;
  return {
    roleLabel: str(raw.roleLabel) || 'Approver',
    decision,
    by: orNull(raw.by),
    at: orNull(raw.at),
    comment: orNull(raw.comment),
  };
}

function readDetail(raw: unknown): Detail | null {
  if (!isObject(raw)) return null;
  const label = str(raw.label);
  const value = typeof raw.value === 'number' ? String(raw.value) : str(raw.value);
  return label && value ? { label, value } : null;
}

const readDetails = (raw: unknown): Detail[] =>
  (Array.isArray(raw) ? raw : []).map(readDetail).filter((d): d is Detail => d !== null);

/** The change block, or null when it is missing or says nothing. */
export function readChange(raw: unknown): AttendanceChange | null {
  if (!isObject(raw)) return null;
  const change: AttendanceChange = {
    date: orNull(raw.date),
    fromLabel: orNull(raw.fromLabel),
    toLabel: orNull(raw.toLabel),
    fromShifts: orNull(raw.fromShifts),
    toShifts: orNull(raw.toShifts),
    firstPunch: orNull(raw.firstPunch),
    lastPunch: orNull(raw.lastPunch),
    marks: (Array.isArray(raw.marks) ? raw.marks : []).map(str).filter(Boolean),
    text: str(raw.text),
  };
  if (!change.text) change.text = changeText(change);
  return change.text ? change : null;
}

/** The sentence for a change, built from its parts (for a reply without `text`): "2026-10-08: Absent → Present". */
export function changeText(c: Omit<AttendanceChange, 'text'>): string {
  if (!c.fromLabel && !c.toLabel) return '';
  const side = (label: string | null, shifts: string | null) => `${label ?? 'Not recorded'}${shifts ? ` (${shifts})` : ''}`;
  let text = `${c.date ? `${c.date}: ` : ''}${side(c.fromLabel, c.fromShifts)} → ${side(c.toLabel, c.toShifts)}`;
  if (c.firstPunch || c.lastPunch) text += `, ${c.firstPunch ?? '-'} to ${c.lastPunch ?? '-'}`;
  if (c.marks.length) text += `, marked ${c.marks.join(' and ')}`;
  return text;
}

function readRaisedBy(raw: Record<string, unknown>): RaisedBy {
  const hr = raw.raisedBy === 'hr';
  return {
    raisedBy: hr ? 'hr' : 'employee',
    raisedByLabel: str(raw.raisedByLabel) || (hr ? 'Raised by HR' : 'Raised by you'),
    raisedByName: hr ? orNull(raw.raisedByName) : null,
  };
}

/** One row of the list, or null when it has no id or kind. */
export function readPendingRequest(raw: unknown): PendingRequest | null {
  if (!isObject(raw)) return null;
  const id = num(raw.id);
  const module = str(raw.module);
  if (id === null || !module) return null;
  const approver = isObject(raw.approver) ? raw.approver : {};
  const role = approver.role === 'hod' ? 'hod' : 'hr';
  const wait = Math.max(0, Math.round(num(raw.remindInSeconds) ?? 0));
  // An explicit "no" from the server wins; without one, the wait decides.
  const canRemind = (raw.canRemind === undefined || raw.canRemind === true) && wait === 0;
  return {
    key: str(raw.key) || `${module}-${id}`,
    module,
    moduleLabel: str(raw.moduleLabel) || module,
    id,
    title: str(raw.title) || str(raw.moduleLabel) || 'Request',
    summary: str(raw.summary),
    reason: orNull(raw.reason),
    submittedAt: orNull(raw.submittedAt),
    stage: str(raw.stage) || 'Waiting for an answer',
    approver: {
      role,
      name: str(approver.name) || (role === 'hod' ? 'your Department Head' : 'HR'),
      label: str(approver.label) || (role === 'hod' ? 'Department Head' : 'HR'),
    },
    steps: (Array.isArray(raw.steps) ? raw.steps : []).map(readStep).filter((s): s is PendingStep => s !== null),
    trail: (Array.isArray(raw.trail) ? raw.trail : []).map(readTrail).filter((t): t is TrailEntry => t !== null),
    workflowEnabled: raw.workflowEnabled !== false,
    reminderCount: Math.max(0, num(raw.reminderCount) ?? 0),
    lastRemindedAt: orNull(raw.lastRemindedAt),
    canRemind,
    nextReminderAt: orNull(raw.nextReminderAt),
    remindInSeconds: canRemind ? 0 : wait,
    details: readDetails(raw.details),
    change: readChange(raw.change),
    ...readRaisedBy(raw),
  };
}

/** One recently decided HR attendance change, or null when it has no id or no decision. */
export function readRecentHrEdit(raw: unknown): RecentHrEdit | null {
  if (!isObject(raw)) return null;
  const id = num(raw.id);
  if (id === null || (raw.status !== 'approved' && raw.status !== 'rejected')) return null;
  const status = raw.status;
  return {
    key: str(raw.key) || `attendance_correction-${id}`,
    id,
    title: str(raw.title) || 'Attendance correction',
    summary: str(raw.summary),
    reason: orNull(raw.reason),
    status,
    statusLabel: str(raw.statusLabel) || (status === 'approved' ? 'Approved' : 'Rejected'),
    decidedAt: orNull(raw.decidedAt),
    decidedBy: orNull(raw.decidedBy),
    decidedByRole: orNull(raw.decidedByRole),
    comment: orNull(raw.comment),
    change: readChange(raw.change),
    ...readRaisedBy({ raisedBy: 'hr', ...raw }),
  };
}

/** "Approved by Meena (HR) on 31 Oct, 10:05" / "Rejected by your Department Head". */
export function decisionLine(e: Pick<RecentHrEdit, 'statusLabel' | 'decidedBy' | 'decidedByRole' | 'decidedAt'>): string {
  const role = e.decidedByRole === 'hod' ? 'Department Head' : e.decidedByRole === 'hr' ? 'HR' : '';
  const who = e.decidedBy ? ` by ${e.decidedBy}${role ? ` (${role})` : ''}` : role ? ` by ${role === 'HR' ? 'HR' : `your ${role}`}` : '';
  const when = shortDateTime(e.decidedAt);
  return `${e.statusLabel}${who}${when ? ` on ${when}` : ''}`;
}

/** The reply of GET /my/pending-requests, or null when it is not an object with a list. */
export function normalizePendingRequests(raw: unknown): PendingRequests | null {
  if (!isObject(raw) || !Array.isArray(raw.items)) return null;
  const items = raw.items.map(readPendingRequest).filter((i): i is PendingRequest => i !== null);
  const recentHrEdits = (Array.isArray(raw.recentHrEdits) ? raw.recentHrEdits : [])
    .map(readRecentHrEdit)
    .filter((e): e is RecentHrEdit => e !== null);
  return {
    items,
    count: items.length,
    cooldownHours: num(raw.cooldownHours) ?? 24,
    recentHrEdits,
    recentDays: num(raw.recentDays) ?? 30,
  };
}

/**
 * Seconds still to wait before this request can be reminded again, `nowMs` being the phone's clock and `fetchedAtMs` when
 * the list arrived. Counted from the server's own figure, so a phone whose clock is wrong still shows the right wait.
 * A request the server refused without a wait (e.g. an older reply) stays 0 here; the button then follows `canRemind`.
 */
export function secondsUntilRemind(
  item: Pick<PendingRequest, 'canRemind' | 'remindInSeconds'>,
  fetchedAtMs: number,
  nowMs: number,
): number {
  if (item.canRemind) return 0;
  const elapsed = Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000));
  return Math.max(0, item.remindInSeconds - elapsed);
}

/** "5 h 12 m", "12 m", "under a minute". Rounded UP to the minute, so it never promises a time that is too early. */
export function durationText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) return '';
  if (s < 60) return 'under a minute';
  const minutes = Math.ceil(s / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} m` : `${m} m`;
}

/** "You can remind again in 5 h 12 m" (or '' when the button is free). */
export function cooldownText(seconds: number): string {
  const d = durationText(seconds);
  return d ? `You can remind again in ${d}` : '';
}

/** The button's words. */
export function remindLabel(item: Pick<PendingRequest, 'approver'>): string {
  return item.approver.role === 'hod' ? 'Remind Department Head' : 'Remind HR';
}

const ICONS: Record<string, string> = {
  leave: 'calendar-remove-outline',
  permission: 'clock-time-four-outline',
  casual_leave: 'beach',
  missing_punch: 'fingerprint',
  on_duty: 'map-marker-path',
  outpass: 'exit-run',
  resignation: 'account-arrow-right-outline',
  advance: 'cash-fast',
  request: 'message-text-outline',
  attendance_correction: 'calendar-edit',
};

/** A MaterialCommunityIcons name for the kind of request. */
export function moduleIcon(module: string): string {
  return ICONS[module] ?? 'file-document-outline';
}

export type StepperState = StepState | 'submitted';

/** The stepper: who raised it first ("You", or "HR" for a change HR proposed), then the pipeline's steps; `current` marks
 *  the step the request is at now. */
export function stepperSteps(
  item: Pick<PendingRequest, 'steps'> & { raisedBy?: RaisedBy['raisedBy'] },
): { label: string; state: StepperState; current: boolean }[] {
  const steps: PendingStep[] = item.steps.length ? item.steps : [{ label: 'Approver', state: 'pending', by: null, at: null }];
  return [
    { label: item.raisedBy === 'hr' ? 'HR (raised it)' : 'You', state: 'submitted', current: false },
    ...steps.map((s) => ({ label: s.label, state: s.state, current: s.state === 'pending' })),
  ];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "31 Oct, 10:05" in the phone's own time. '' for a missing or bad date. */
export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

/** "Waiting 3 days" / "Waiting 5 h" / "Sent just now", counted from when it was submitted. */
export function waitingSince(submittedAt: string | null | undefined, nowMs: number): string {
  if (!submittedAt) return '';
  const t = new Date(submittedAt).getTime();
  if (Number.isNaN(t)) return '';
  const minutes = Math.max(0, Math.floor((nowMs - t) / 60000));
  if (minutes < 60) return minutes < 2 ? 'Sent just now' : `Waiting ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Waiting ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Waiting ${days} day${days === 1 ? '' : 's'}`;
}

/** The server's message for a failed reminder (a 429 says when it opens again), or a plain fallback. */
export function remindErrorText(err: unknown): string {
  const response = isObject(err) && isObject(err.response) ? err.response : null;
  const data = response && isObject(response.data) ? response.data : null;
  const text = data ? str(data.error) || str(data.message) || str(data.detail) : '';
  if (text) return text;
  if (response) return 'The reminder could not be sent. Please try again.';
  return 'No connection. Check your internet and try again.';
}

/** The answer of a successful reminder: the server's sentence (who was reminded) and the request as it is now. */
export function readRemindResult(raw: unknown): { message: string; item: PendingRequest | null } {
  if (!isObject(raw)) return { message: 'Reminder sent.', item: null };
  return { message: str(raw.message) || 'Reminder sent.', item: readPendingRequest(raw.item) };
}

/** The number on the "My Requests" tab: '' for none, '99+' past 99. */
export function countBadge(count: number | null | undefined): string {
  const n = Math.max(0, Math.floor(count ?? 0));
  if (n === 0) return '';
  return n > 99 ? '99+' : String(n);
}
