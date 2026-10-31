import type { ApprovalProgress } from '../../lib/approval';
import type { ApprovalCategory, ApprovalStatus } from '../../lib/approvalsHistory';

/**
 * One request on the Approvals tab: whatever GET /manager/requests (or, on an older backend, /manager/pending-requests)
 * sent for its category - TeamLeaveRequest, TeamPermissionRequest, ... in src/hooks/useManager.ts - plus the history
 * keys. Read through the helpers in src/lib/approvalsItems.ts, which cope with every category's shape.
 */
export type ApprovalItem = Record<string, any> & {
  id: number;
  approval?: ApprovalProgress | null;
  /** The `outcome` block (see normalizeOutcome in src/lib/approvalsHistory.ts). Absent on the old pending list. */
  outcome?: unknown;
  historyStatus?: ApprovalStatus | null;
};

/** The request whose sheet is open, and the list it was opened from. */
export interface SelectedApproval {
  category: ApprovalCategory;
  status: ApprovalStatus;
  item: ApprovalItem;
}
