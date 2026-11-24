// The rule for every Reject in the HRMS (owner, 2026-11-21): approving never needs a remark, rejecting always needs the
// reason. The server applies the same rule (backend/api/approval_workflow.py REJECT_REMARK_MIN, reply
// 400 {"error": "...", "code": "remark_required"}), so an older app that skips this check is refused with the same words.
// Used by the Department Head's Approvals tab (src/components/approvals/*); unit-tested in rejectRemark.test.ts.

export const REJECT_REMARK_MIN = 3;
/** What the server keeps of a decision remark (longer text is cut there too). */
export const REJECT_REMARK_MAX = 1000;
/** The server's error code for a rejection sent without a reason. */
export const REJECT_REMARK_CODE = 'remark_required';
export const REJECT_REMARK_MESSAGE = `Write the reason for rejecting (at least ${REJECT_REMARK_MIN} characters).`;

/** The reason as the employee will read it: spaces collapsed, trimmed, at most REJECT_REMARK_MAX characters. */
export function cleanRejectRemark(text: string | null | undefined): string {
  return (typeof text === 'string' ? text : '').replace(/\s+/g, ' ').trim().slice(0, REJECT_REMARK_MAX);
}

/** Why this reason cannot be sent yet (REJECT_REMARK_MESSAGE), or null when it is fine. */
export function rejectRemarkProblem(text: string | null | undefined): string | null {
  return cleanRejectRemark(text).length < REJECT_REMARK_MIN ? REJECT_REMARK_MESSAGE : null;
}

/** True when the server refused a rejection because its reason was missing (an axios error carrying the shared code). */
export function isRemarkRequiredError(err: unknown): boolean {
  const data = (err as { response?: { data?: { code?: unknown } } } | null | undefined)?.response?.data;
  return !!data && typeof data === 'object' && data.code === REJECT_REMARK_CODE;
}

/**
 * The `comment` a decision sends (the body keeps its shape: `{status, comment}` / `{action, comment}`). A rejection sends
 * the cleaned reason; an approval sends what was typed, or nothing when the box is blank (a comment stays optional there).
 */
export function decisionComment(decision: 'approved' | 'rejected', text: string | null | undefined): string | undefined {
  if (decision === 'rejected') return cleanRejectRemark(text) || undefined;
  return typeof text === 'string' && text.trim() ? text : undefined;
}
