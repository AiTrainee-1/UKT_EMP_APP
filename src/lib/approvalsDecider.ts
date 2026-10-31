// WHO approved or rejected a request, in one prominent line: "Approved by HR (Meena) · 31 Oct, 10:05 AM",
// "Rejected by Department Head (Kavya) · ...", "Approved by you · ..." (pure, unit-tested in approvalsDecider.test.ts).
//
// Owner (2026-10-31): requests should clearly display who approved them, so employees can identify and confirm who it
// was. Every decided card shows this line (src/components/approval/ApprovalTrail.tsx::DecisionBadge), read from the
// request's `approval` block (approval_workflow.progress on the server: each decided step carries by / at / decidedBy),
// or, for a request decided before that block existed, from the fields the request kept (approvedBy, reviewedBy ...).

import { formatWhen, ROLE_NAME, type ApprovalProgress, type ApprovalRole } from './approval.ts';

export interface Decider {
  decision: 'approved' | 'rejected';
  /** Department Head or HR; null when the request does not say. */
  role: ApprovalRole | null;
  name: string | null;
  /** ISO time of the decision, when known. */
  at: string | null;
  /** The person reading is the one who decided (the Department Head's own Approvals tab). */
  you?: boolean;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A role in any spelling the server has used ("hod", "dept_head", "hr", ...), or null ("system" and unknowns). */
export function roleOf(raw: unknown): ApprovalRole | null {
  const r = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (r === 'hr') return 'hr';
  if (r === 'hod' || r === 'dept_head' || r === 'department_head' || r === 'manager') return 'hod';
  return null;
}

/**
 * The final decision recorded in an `approval` block, or null while the request still waits (or the block is missing,
 * or it is an old request whose steps carry nothing). A rejection names the step that rejected; an approval the last
 * step that approved.
 */
export function deciderFromApproval(a: ApprovalProgress | null | undefined): Decider | null {
  if (!a || !Array.isArray(a.steps) || !a.steps.length) return null;
  if (a.currentStep != null || (Array.isArray(a.waitingFor) && a.waitingFor.length)) return null;
  const roleOfStep = (s: ApprovalProgress['steps'][number]): ApprovalRole | null =>
    s.decidedBy ?? (Array.isArray(s.roles) && s.roles.length === 1 ? s.roles[0] : null);
  const rejected = a.steps.find((s) => s.state === 'rejected');
  if (rejected) return { decision: 'rejected', role: roleOfStep(rejected), name: text(rejected.by), at: text(rejected.at) };
  // Not rejected, yet a step was never reached: an old rejected request whose stamps only recorded approvals. Saying
  // "Approved by ..." there would be wrong, so say nothing (the card's own status still shows).
  if (a.steps.some((s) => s.state === 'waiting' || s.state === 'pending')) return null;
  const approved = a.steps.filter((s) => s.state === 'approved');
  if (!approved.length) return null;
  // The step decided last; steps decided at the same time (or without times) fall back to pipeline order.
  const last = approved.reduce((best, s) => ((s.at ?? '') >= (best.at ?? '') ? s : best));
  return { decision: 'approved', role: roleOfStep(last), name: text(last.by), at: text(last.at) };
}

/** A decider from a request's own fields, for one decided before the `approval` block existed. Null when undecided or
 *  nobody is named. */
export function deciderFromFields(f: {
  status: unknown;
  name?: unknown;
  role?: unknown;
  at?: unknown;
}): Decider | null {
  const status = typeof f.status === 'string' ? f.status.toLowerCase() : '';
  const decision = status === 'rejected' ? 'rejected' : ['approved', 'closed', 'active', 'completed'].includes(status) ? 'approved' : null;
  if (!decision) return null;
  let name = text(f.name);
  let role = roleOf(f.role);
  // Some old rows kept the ROLE in the name field ("hr", "dept_head").
  if (name && roleOf(name) && !role) {
    role = roleOf(name);
    name = null;
  } else if (name && name.toLowerCase() === 'system') {
    name = null;
  }
  if (!name && !role) return null;
  return { decision, role, name, at: text(f.at) };
}

/** "Approved by HR (Meena) · 31 Oct, 10:05 AM". `when` formats the time (null leaves it out). */
export function deciderText(d: Decider, when: (iso: string) => string | null = formatWhen): string {
  const verb = d.decision === 'approved' ? 'Approved' : 'Rejected';
  const who = d.you
    ? 'you'
    : d.role && d.name
      ? `${ROLE_NAME[d.role]} (${d.name})`
      : d.role
        ? ROLE_NAME[d.role]
        : d.name;
  const at = d.at ? when(d.at) : null;
  return [who ? `${verb} by ${who}` : verb, at].filter(Boolean).join(' · ');
}

/**
 * Missing Punch / On-Duty requests decided before the `approval` block: they kept a Department Head stamp and an HR
 * stamp. The last one stamped made the final call (HR when both are there).
 */
export function deciderFromStamps(f: {
  status: unknown;
  hodBy?: unknown;
  hodAt?: unknown;
  hrBy?: unknown;
  hrAt?: unknown;
}): Decider | null {
  const hr = text(f.hrBy);
  return hr
    ? deciderFromFields({ status: f.status, name: hr, role: 'hr', at: f.hrAt })
    : deciderFromFields({ status: f.status, name: f.hodBy, role: text(f.hodBy) ? 'hod' : null, at: f.hodAt });
}

/** A salary advance / settlement: HR alone decides it. Who and when come from the record, else from its timeline. */
export function deciderForAdvance(a: {
  status: unknown;
  approvedBy?: unknown;
  approvedAt?: unknown;
  timeline?: { kind?: unknown; by?: unknown; at?: unknown }[] | null;
}): Decider | null {
  const status = typeof a.status === 'string' ? a.status.toLowerCase() : '';
  const kind = status === 'rejected' ? 'rejected' : 'approved';
  const event = (a.timeline ?? []).find((e) => e && e.kind === kind);
  const d = deciderFromFields({ status, name: text(a.approvedBy) ?? event?.by, role: 'hr', at: text(a.approvedAt) ?? event?.at });
  return d;
}
