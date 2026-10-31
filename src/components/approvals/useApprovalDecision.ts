import {
  useApproveAttendance,
  useApproveCasualLeave,
  useApproveHolidayWork,
  useApproveLeave,
  useApproveMissingPunch,
  useApproveOnDuty,
  useApproveOutpass,
  useApprovePermission,
  useResignationAction,
} from '../../hooks/useManager';
import { approvalErrorMessage, decisionMessage } from '../../lib/approval';
import { claimCreditedMessage } from '../../lib/compensation';
import type { SelectedApproval } from './types';

export type DecisionResult =
  | { ok: true; message: string; tone: 'success' | 'error' }
  // `refused`: the server said no (not this head's turn any more, HR changed the pipeline, already decided ...), so what
  // is on screen is out of date: refresh and close the sheet. Otherwise (no answer, 5xx) the sheet stays for another try.
  | { ok: false; message: string; refused: boolean };

/**
 * Approve / reject one request through the existing PATCH endpoints (unchanged), with the toast wording the tab always
 * used: the pipeline's own answer ("Approved. Now waiting for HR."), a compensation claim's "... added to X's balance",
 * and the old two-stage wording on an older backend that sends no `approval`.
 */
export function useApprovalDecision() {
  const approveLeave = useApproveLeave();
  const approvePermission = useApprovePermission();
  const resignationAction = useResignationAction();
  const approveCasualLeave = useApproveCasualLeave();
  const approveAttendance = useApproveAttendance();
  const approveMissingPunch = useApproveMissingPunch();
  const approveOutpass = useApproveOutpass();
  const approveHolidayWork = useApproveHolidayWork();
  const approveOnDuty = useApproveOnDuty();

  const busy =
    approveLeave.isPending ||
    approvePermission.isPending ||
    resignationAction.isPending ||
    approveCasualLeave.isPending ||
    approveAttendance.isPending ||
    approveMissingPunch.isPending ||
    approveOutpass.isPending ||
    approveHolidayWork.isPending ||
    approveOnDuty.isPending;

  const decide = async (
    selected: SelectedApproval,
    status: 'approved' | 'rejected',
    rawComment: string,
  ): Promise<DecisionResult> => {
    const { category, item } = selected;
    const comment = rawComment.trim() ? rawComment : undefined;
    try {
      if (category === 'resignation') {
        const result = await resignationAction.mutateAsync({
          id: item.id,
          action: status === 'approved' ? 'approve' : 'reject',
          comment,
        });
        return status === 'approved'
          ? {
              ok: true,
              message: decisionMessage('approved', result?.approval, 'Resignation') ?? 'Resignation forwarded to HR.',
              tone: 'success',
            }
          : { ok: true, message: 'Resignation rejected.', tone: 'error' };
      }
      const args = { id: item.id, status, comment };
      const mutation = {
        leave: approveLeave,
        permission: approvePermission,
        casualLeave: approveCasualLeave,
        attendance: approveAttendance,
        missingPunch: approveMissingPunch,
        outpass: approveOutpass,
        holidayWork: approveHolidayWork,
        onDuty: approveOnDuty,
      }[category];
      const result: any = await mutation.mutateAsync(args);
      if (status === 'rejected') return { ok: true, message: 'Request rejected.', tone: 'error' };
      // A compensation claim is decided by the head alone: its approval is final, and says what it added to whom.
      const message =
        category === 'holidayWork' && result?.credited
          ? claimCreditedMessage({ ...(item as any), ...result })
          : // Worded from the request the server sent back. Without its `approval` (an older backend, whose pipeline is
            // fixed) it is the old two-stage wording.
            (decisionMessage('approved', result?.approval) ??
            (category === 'missingPunch' ? 'Forwarded to HR for final approval.' : 'Request approved successfully.'));
      return { ok: true, message, tone: 'success' };
    } catch (err: any) {
      return {
        ok: false,
        message: approvalErrorMessage(err, 'Action failed. Please try again.'),
        refused: [400, 403, 404, 409].includes(err?.response?.status),
      };
    }
  };

  return { decide, busy };
}
