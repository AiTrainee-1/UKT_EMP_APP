// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import { approvalsBadgeCount, shownApprovalTabs } from './approvalBadge.ts'

// GET /manager/me exactly as backend/api/manager_views.py::manager_me builds it, after the app's axios instance has
// camelized the keys (src/lib/api.ts). A head with every switch on.
const ME = {
  isManager: true,
  canSubmitLeave: true,
  canApprovePermissions: true,
  canApproveResignations: true,
  canApproveAttendance: true,
  canApproveCasualLeave: true,
  canApproveOnDuty: true,
  canApproveMissingPunch: true,
  canApproveCompensation: true,
  pendingApprovalsCount: 0,
  pendingLeavesCount: 0,
  pendingPermissionsCount: 0,
  pendingResignationsCount: 0,
  pendingAttendanceCount: 0,
  pendingCasualLeaveCount: 0,
  pendingOnDutyCount: 0,
  pendingMissingPunchCount: 0,
  pendingCompensationCount: 0,
}

test('the badge is the sum of every tab the screen shows, taken from /manager/me', () => {
  const me = {
    ...ME,
    pendingLeavesCount: 1,
    pendingPermissionsCount: 2,
    pendingResignationsCount: 3,
    pendingCasualLeaveCount: 4,
    pendingAttendanceCount: 5,
    pendingMissingPunchCount: 6,
    pendingCompensationCount: 7,
  }
  assert.equal(approvalsBadgeCount(me), 1 + 2 + 3 + 4 + 5 + 6 + 7)
})

test('one leave and three compensation claims read 4 (the old badge said 1)', () => {
  const me = { ...ME, pendingApprovalsCount: 4, pendingLeavesCount: 1, pendingCompensationCount: 3 }
  assert.equal(approvalsBadgeCount(me), 4)
})

test('casual leave is read from its wire name pendingCasualLeaveCount', () => {
  assert.equal(approvalsBadgeCount({ ...ME, pendingCasualLeaveCount: 2 }), 2)
  // The old misspelt name is not a key the server sends: it must not be what the badge reads.
  assert.equal(approvalsBadgeCount({ ...ME, pendingCasualLeavesCount: 9 } as never), 0)
})

test('On-Duty requests are not counted: the app has no On-Duty tab, so the badge could never be cleared', () => {
  // The server adds on-duty to pendingApprovalsCount (2 here), but this screen lists leave only.
  const me = { ...ME, pendingApprovalsCount: 3, pendingLeavesCount: 1, pendingOnDutyCount: 2 }
  assert.equal(approvalsBadgeCount(me), 1)
})

test('a tab whose switch is off adds nothing, even if a count came with it', () => {
  const counts = {
    pendingLeavesCount: 1,
    pendingPermissionsCount: 1,
    pendingResignationsCount: 10,
    pendingCasualLeaveCount: 10,
    pendingAttendanceCount: 10,
    pendingMissingPunchCount: 10,
    pendingCompensationCount: 10,
  }
  const allOff = {
    ...ME,
    ...counts,
    canApproveResignations: false,
    canApproveCasualLeave: false,
    canApproveAttendance: false,
    canApproveMissingPunch: false,
    canApproveCompensation: false,
  }
  assert.equal(approvalsBadgeCount(allOff), 2)
  // One at a time: each switch brings exactly its own tab back.
  assert.equal(approvalsBadgeCount({ ...allOff, canApproveCompensation: true }), 12)
  assert.equal(approvalsBadgeCount({ ...allOff, canApproveResignations: true }), 12)
  assert.equal(approvalsBadgeCount({ ...allOff, canApproveCasualLeave: true }), 12)
  assert.equal(approvalsBadgeCount({ ...allOff, canApproveAttendance: true }), 12)
  assert.equal(approvalsBadgeCount({ ...allOff, canApproveMissingPunch: true }), 12)
})

test('a switch the backend does not send reads as off, so its count is left out', () => {
  const { canApproveCompensation: _gone, ...older } = ME
  assert.equal(approvalsBadgeCount({ ...older, pendingLeavesCount: 1, pendingCompensationCount: 5 }), 1)
})

test('outpass is counted from pendingOutpassCount while the Outpass tab is shown', () => {
  const me = { ...ME, canApprovePermissions: true, pendingPermissionsCount: 1, pendingOutpassCount: 4 }
  assert.equal(approvalsBadgeCount(me), 5)
  assert.equal(approvalsBadgeCount({ ...me, canApprovePermissions: false }), 1)
})

test('a head whose only pending item is an outpass request still sees a badge', () => {
  assert.equal(approvalsBadgeCount({ ...ME, canApprovePermissions: true, pendingOutpassCount: 1 }), 1)
})

test('a backend that does not send pendingOutpassCount leaves outpass out of the badge', () => {
  assert.equal(approvalsBadgeCount({ ...ME, canApprovePermissions: true, pendingPermissionsCount: 1 }), 1)
})

test('nothing pending is 0, and so is no profile at all', () => {
  assert.equal(approvalsBadgeCount(ME), 0)
  assert.equal(approvalsBadgeCount(null), 0)
  assert.equal(approvalsBadgeCount(undefined), 0)
  assert.equal(approvalsBadgeCount({}), 0)
})

test('a backend that sends no per-kind count falls back to pendingApprovalsCount', () => {
  assert.equal(approvalsBadgeCount({ pendingApprovalsCount: 5 }), 5)
  assert.equal(approvalsBadgeCount({ pendingApprovalsCount: 0 }), 0)
})

test('a count that is not a sane number is 0, never NaN', () => {
  const me = { ...ME, pendingLeavesCount: Number.NaN, pendingPermissionsCount: -3, pendingCompensationCount: '4' as never }
  assert.equal(approvalsBadgeCount(me), 0)
  assert.equal(approvalsBadgeCount({ pendingApprovalsCount: Number.NaN }), 0)
})

test('shownApprovalTabs follows the per-person switches, outpass following Permissions', () => {
  assert.deepEqual(shownApprovalTabs(ME), {
    casualLeave: true,
    attendance: true,
    missingPunch: true,
    outpass: true,
    holidayWork: true,
    resignation: true,
  })
  assert.deepEqual(shownApprovalTabs({ canApprovePermissions: false, canApproveCompensation: true }), {
    casualLeave: false,
    attendance: false,
    missingPunch: false,
    outpass: false,
    holidayWork: true,
    resignation: false,
  })
  assert.deepEqual(shownApprovalTabs(undefined), {
    casualLeave: false,
    attendance: false,
    missingPunch: false,
    outpass: false,
    holidayWork: false,
    resignation: false,
  })
})
