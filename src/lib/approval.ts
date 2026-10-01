// Approval pipelines in ONE place (pure functions, no React).
//
// HR configures, per kind of request, who approves and in what order (backend/api/approval_workflow.py; "Approval
// Workflow Control" in the HR portal): 1-2 steps, each held by the Department Head ("hod"), HR ("hr") or "HOD or HR"
// (whoever acts first), each mandatory or optional. A workflow can also be switched OFF, which refuses NEW requests.
// The server decides every real request; this file only READS what it sends and words it for the screens:
//   * `approval` on a request (ApprovalProgress): where THAT request is, who it waits for, who may act on it now.
//   * GET /approval-summary (ApprovalSummary): the pipeline per kind of request, for copy shown before a request exists.
// The legacy `status` strings (`pending_hod`, `pending_hr`, `dept_approved`, ...) no longer imply an order, so nothing
// here reads them. An older backend sends neither block, and then every helper answers "no information" (null, or the
// caller's fallback) and a screen behaves as it did before pipelines were configurable.

import { format } from 'date-fns';

export type ApprovalRole = 'hod' | 'hr';
export type ApprovalStepState = 'approved' | 'skipped' | 'pending' | 'waiting' | 'rejected';

export interface ApprovalStep {
  roles: ApprovalRole[];
  mandatory: boolean;
  /** "HOD" | "HR" | "HOD or HR" in the server's wording. The app words roles itself (ROLE_NAME), so nothing reads this. */
  label?: string;
}

export interface ApprovalProgressStep extends ApprovalStep {
  index: number;
  state: ApprovalStepState;
  by?: string | null;
  at?: string | null;
  comment?: string | null;
  decidedBy?: ApprovalRole;
}

/** The `approval` block every request of a staged kind carries. Absent/null on an older backend, and on an outpass
 *  that an On-Duty approval raised (it has no pipeline of its own). */
export interface ApprovalProgress {
  workflow: string;
  label: string;
  enabled: boolean;
  steps: ApprovalProgressStep[];
  /** Index of the step the request is at while it is pending, else null. */
  currentStep: number | null;
  waitingFor: ApprovalRole[];
  /** Could that role approve or reject right now under the pipeline. Says nothing about who the individual Department
   *  Head is or their per-person `canApprove*` switch. */
  canAct: Record<ApprovalRole, boolean>;
  /** Rejecting can be allowed out of turn (a resignation's HR may always reject), so it is told apart from approving. */
  canReject?: Record<ApprovalRole, boolean>;
}

export interface ApprovalSummaryItem {
  label: string;
  enabled: boolean;
  requestedBy: 'Employee' | 'HR';
  steps: ApprovalStep[];
  /** "Employee → HOD → HR" */
  path: string;
}

/** The server keys the summary by workflow key in snake_case (`casual_leave`), but src/lib/api.ts camelizes every
 *  response, so on the phone they are these. */
export type WorkflowKey =
  | 'leave'
  | 'permission'
  | 'casualLeave'
  | 'missingPunch'
  | 'onDuty'
  | 'onDutyPunch'
  | 'attendanceCorrection'
  | 'outpass'
  | 'request'
  | 'resignation'
  | 'advance';

export type ApprovalSummary = Partial<Record<WorkflowKey, ApprovalSummaryItem>>;

export const ROLE_NAME: Record<ApprovalRole, string> = { hod: 'Department Head', hr: 'HR' };
// How a sentence about the employee's own request names a role ("goes to your Department Head").
const ROLE_PHRASE: Record<ApprovalRole, string> = { hod: 'your Department Head', hr: 'HR' };

// "hod" sorts before "hr", so "Department Head or HR" reads the same whatever order the server listed the roles in.
function joinRoles(roles: ApprovalRole[] | undefined, names: Record<ApprovalRole, string>): string {
  return (roles ?? [])
    .filter((r) => r in names)
    .sort()
    .map((r) => names[r])
    .join(' or ');
}

// An `approval` that is not the shape the contract promises is treated as absent, never as a crash.
function usable(a: ApprovalProgress | null | undefined): a is ApprovalProgress {
  return !!a && Array.isArray(a.steps);
}

// Who a request waits for right now: nobody once it is decided, or when the server sent no `approval`.
function waitingRoles(a: ApprovalProgress | null | undefined): ApprovalRole[] {
  return usable(a) && a.currentStep != null && a.waitingFor?.length ? a.waitingFor : [];
}

/** "Department Head", "HR" or "Department Head or HR": who a pending request waits for now, or null. */
export function waitingTarget(a: ApprovalProgress | null | undefined): string | null {
  return joinRoles(waitingRoles(a), ROLE_NAME) || null;
}

/** "Waiting for HR" / "Waiting for Department Head" / "Waiting for Department Head or HR", or null. */
export function waitingText(a: ApprovalProgress | null | undefined): string | null {
  const target = waitingTarget(a);
  return target ? `Waiting for ${target}` : null;
}

/** "your Department Head or HR": the same, for a sentence about the employee's own request. */
export function waitingPhrase(a: ApprovalProgress | null | undefined): string | null {
  return joinRoles(waitingRoles(a), ROLE_PHRASE) || null;
}

/** Has any step already been approved (the request is part-way through its pipeline)? */
export function hasProgressed(a: ApprovalProgress | null | undefined): boolean {
  return usable(a) && a.steps.some((s) => s.state === 'approved');
}

/** Can the Department Head approve this request right now? The pipeline's answer when the server sent one, else
 *  `fallback` - the old rule, under which everything in a HOD's list is decidable because the server filtered it. */
export function hodCanAct(a: ApprovalProgress | null | undefined, fallback = true): boolean {
  return usable(a) && a.canAct ? !!a.canAct.hod : fallback;
}

/** The same for rejecting, which the pipeline can allow when approving is not (see ApprovalProgress.canReject). */
export function hodCanReject(a: ApprovalProgress | null | undefined, fallback = true): boolean {
  if (!usable(a)) return fallback;
  return a.canReject ? !!a.canReject.hod : hodCanAct(a, fallback);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const NEUTRAL_PIPELINE_SENTENCE = 'Your request will be reviewed.';

/** Who a new request goes to, as one sentence for a form or a banner: "Your request goes to your Department Head, then
 *  to HR." / "... to your Department Head or HR, whoever acts first." / "... to HR." `fallback` (neutral wording) when
 *  the summary has nothing for this workflow. */
export function pipelineSentence(
  item: ApprovalSummaryItem | null | undefined,
  fallback: string = NEUTRAL_PIPELINE_SENTENCE,
): string {
  const steps = (item?.steps ?? []).filter((s) => s?.roles?.length);
  if (!item || steps.length === 0) return fallback;
  const subject = item.requestedBy === 'HR' ? 'This request is raised by HR and goes' : 'Your request goes';
  let sentence = `${subject} ${steps.map((s) => `to ${joinRoles(s.roles, ROLE_PHRASE)}`).join(', then ')}`;
  if (steps.length === 1 && steps[0].roles.length > 1) sentence += ', whoever acts first';
  sentence += '.';
  // An optional first step can be passed over: the next role may decide it first.
  if (steps.length > 1 && steps[0].mandatory === false) {
    sentence +=
      ` ${capitalise(joinRoles(steps[1].roles, ROLE_PHRASE))} can decide it` +
      ` without waiting for ${joinRoles(steps[0].roles, ROLE_PHRASE)}.`;
  }
  return sentence;
}

/** Has HR switched this kind of request off? Only an explicit `false` counts: no summary means no information. */
export function workflowOff(item: ApprovalSummaryItem | null | undefined): boolean {
  return item?.enabled === false;
}

/** The short note that goes with a disabled create/submit control, or null while the workflow is on (or unknown). */
export function workflowOffNote(item: ApprovalSummaryItem | null | undefined): string | null {
  return item && item.enabled === false ? `${item.label || 'These'} requests are switched off by HR right now.` : null;
}

/** False when the workflow is known and none of its steps is the Department Head's: its requests never reach a HOD. */
export function hodTakesPart(item: ApprovalSummaryItem | null | undefined): boolean {
  if (!item || !item.steps?.length) return true;
  return item.steps.some((s) => s.roles?.includes('hod'));
}

// ── the step trail ──────────────────────────────────────────────────────────

const STATE_TEXT: Record<ApprovalStepState, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  skipped: 'Skipped',
  pending: 'Pending',
  waiting: 'Up next',
};

export interface TrailRow {
  key: string;
  /** "Department Head", "HR", "Department Head or HR" (+ " (optional)" for a step that can be passed over). */
  role: string;
  state: ApprovalStepState;
  /** "Approved by Anitha · 12 Mar, 4:30 PM", "Pending", "Skipped", "Up next", "Rejected by ...". */
  text: string;
  comment: string | null;
}

/** Is there anything worth drawing? A lone step that has not been decided says no more than the waiting chip does. */
export function trailWorthShowing(a: ApprovalProgress | null | undefined): a is ApprovalProgress {
  if (!usable(a) || a.steps.length === 0) return false;
  return a.steps.length > 1 || a.steps.some((s) => s.state !== 'pending' && s.state !== 'waiting');
}

/** "12 Mar, 4:30 PM", or null for a timestamp that does not parse. */
export function formatWhen(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, 'dd MMM, h:mm a');
}

/** One row per step. `when` turns the step's ISO timestamp into text (null = leave the time out). */
export function trailRows(
  a: ApprovalProgress | null | undefined,
  when: (iso: string) => string | null = formatWhen,
): TrailRow[] {
  if (!usable(a)) return [];
  return a.steps.map((s, i) => {
    const decided = s.state === 'approved' || s.state === 'rejected';
    const by = decided && s.by ? ` by ${s.by}` : '';
    // A shared "HOD or HR" step says which of the two actually decided it.
    const via = decided && s.roles?.length > 1 && s.decidedBy ? ` (${ROLE_NAME[s.decidedBy]})` : '';
    const at = decided && s.at ? when(s.at) : null;
    return {
      key: String(s.index ?? i),
      role: joinRoles(s.roles, ROLE_NAME) + (s.mandatory === false ? ' (optional)' : ''),
      state: s.state,
      text: `${STATE_TEXT[s.state] ?? ''}${by}${via}${at ? ` · ${at}` : ''}`.trim(),
      comment: decided && s.comment?.trim() ? s.comment.trim() : null,
    };
  });
}

// ── what happened to a decision ─────────────────────────────────────────────

/** The toast after a Department Head's decision, worded from the request the server sent back: "Approved. Now waiting
 *  for HR." while the pipeline goes on, "<noun> approved successfully." when that was the last step. Null for an
 *  approval when the reply carried no `approval` (an older backend): the caller keeps its own text. A rejection is
 *  worded the same either way. */
export function decisionMessage(
  decision: 'approved' | 'rejected',
  approval: ApprovalProgress | null | undefined,
  noun = 'Request',
): string | null {
  if (decision === 'rejected') return `${noun} rejected.`;
  if (!usable(approval)) return null;
  const target = waitingTarget(approval);
  return target ? `Approved. Now waiting for ${target}.` : `${noun} approved successfully.`;
}

/** The server's own text for a refused request or decision (`workflow_disabled`, `not_your_turn`,
 *  `role_not_in_pipeline`, ...) is written for the user: show it as it is. `fallback` only when the server sent none. */
export function approvalErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data;
  const text = [data?.error, data?.message, data?.detail].find((m) => typeof m === 'string' && m.trim() !== '');
  return (text as string | undefined) ?? fallback;
}

// ── GET /approval-summary ───────────────────────────────────────────────────

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function readSummaryItem(raw: any): ApprovalSummaryItem | null {
  if (!raw || typeof raw !== 'object' || typeof raw.enabled !== 'boolean' || !Array.isArray(raw.steps)) return null;
  const steps: ApprovalStep[] = [];
  for (const s of raw.steps) {
    const roles = (Array.isArray(s?.roles) ? s.roles : []).filter((r: unknown): r is ApprovalRole => r === 'hod' || r === 'hr');
    if (!roles.length) return null;
    steps.push({ roles, mandatory: s.mandatory !== false, label: typeof s.label === 'string' ? s.label : undefined });
  }
  if (!steps.length) return null;
  return {
    label: typeof raw.label === 'string' ? raw.label : '',
    enabled: raw.enabled,
    requestedBy: raw.requestedBy === 'HR' ? 'HR' : 'Employee',
    steps,
    path: typeof raw.path === 'string' ? raw.path : '',
  };
}

/** The reply of GET /approval-summary as the screens use it, or null when it is not what the contract promises (an
 *  older backend's 404 page, say) - so nothing malformed can reach a screen. Entries that do not parse are left out. */
export function normalizeApprovalSummary(raw: unknown): ApprovalSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, ApprovalSummaryItem> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const item = readSummaryItem(value);
    if (item) out[toCamel(key)] = item;
  }
  return Object.keys(out).length ? (out as ApprovalSummary) : null;
}
