// Which tabs the Approvals screen lists for a Department Head, and the number on the Approvals tab icon, in ONE place
// (pure functions, no React Native, unit-tested in approvalBadge.test.ts).
//
// The badge must be exactly what the screen can clear: the sum of the pending counts of the tabs the head actually sees
// there, every count read from GET /manager/me (backend/api/manager_views.py::manager_me). It is NOT
// `pendingApprovalsCount`: the server adds On-Duty requests to that total, and this app has no On-Duty tab, so the badge
// would show a number the head can never clear. A kind this app has no tab for is never counted.
//
// Outpass: the Outpass tab is counted from `pendingOutpassCount` (an additive key the server sends since the outpass
// total became part of pendingApprovalsCount); an older backend that does not send it leaves outpass out of the badge.

/** The part of the /manager/me reply the tab list and the badge read (a structural subset of ManagerProfile). */
export interface ManagerTabInfo {
  canApprovePermissions?: boolean;
  canApproveResignations?: boolean;
  canApproveCasualLeave?: boolean;
  canApproveAttendance?: boolean;
  canApproveMissingPunch?: boolean;
  canApproveCompensation?: boolean;
  pendingApprovalsCount?: number;
  pendingLeavesCount?: number;
  pendingPermissionsCount?: number;
  pendingResignationsCount?: number;
  pendingCasualLeaveCount?: number;
  pendingAttendanceCount?: number;
  pendingMissingPunchCount?: number;
  pendingCompensationCount?: number;
  pendingOutpassCount?: number;
}

/** The tabs that depend on a per-person switch (Leave and Permission are always listed for a head). A switch an older
 *  backend does not send reads as "off", and the tab stays hidden. */
export interface ShownApprovalTabs {
  casualLeave: boolean;
  attendance: boolean;
  missingPunch: boolean;
  /** Outpass reuses the Permissions switch (manager_update_outpass_status shares can_approve_permissions). */
  outpass: boolean;
  /** Holiday / Sunday work compensation claims. */
  holidayWork: boolean;
  resignation: boolean;
}

export function shownApprovalTabs(manager: ManagerTabInfo | null | undefined): ShownApprovalTabs {
  const m = manager ?? {};
  return {
    casualLeave: m.canApproveCasualLeave === true,
    attendance: m.canApproveAttendance === true,
    missingPunch: m.canApproveMissingPunch === true,
    outpass: m.canApprovePermissions === true,
    holidayWork: m.canApproveCompensation === true,
    resignation: m.canApproveResignations === true,
  };
}

/** A count from the reply: a finite number of at least 0, else 0 (never NaN on a badge). */
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** The per-kind keys that exist on a backend that counts per kind. */
const PER_KIND_KEYS = [
  'pendingLeavesCount',
  'pendingPermissionsCount',
  'pendingResignationsCount',
  'pendingCasualLeaveCount',
  'pendingAttendanceCount',
  'pendingMissingPunchCount',
  'pendingCompensationCount',
  'pendingOutpassCount',
] as const;

/**
 * The number on the Approvals tab: the pending counts of the tabs the screen shows, summed.
 *
 * A tab the head does not see (its switch is off) adds nothing even when a count came with it. A backend that sends no
 * per-kind count at all (the oldest one) only has `pendingApprovalsCount`, which then stands in for the sum.
 */
export function approvalsBadgeCount(manager: ManagerTabInfo | null | undefined): number {
  if (!manager) return 0;
  if (!PER_KIND_KEYS.some((k) => typeof manager[k] === 'number')) return count(manager.pendingApprovalsCount);
  const shown = shownApprovalTabs(manager);
  return (
    count(manager.pendingLeavesCount) +
    count(manager.pendingPermissionsCount) +
    (shown.casualLeave ? count(manager.pendingCasualLeaveCount) : 0) +
    (shown.attendance ? count(manager.pendingAttendanceCount) : 0) +
    (shown.missingPunch ? count(manager.pendingMissingPunchCount) : 0) +
    (shown.holidayWork ? count(manager.pendingCompensationCount) : 0) +
    (shown.outpass ? count(manager.pendingOutpassCount) : 0) +
    (shown.resignation ? count(manager.pendingResignationsCount) : 0)
  );
}
