import { useInfiniteQuery, useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { MissingPunchSlot } from './useRequests';
import type { ApprovalProgress } from '../lib/approval';
import {
  CATEGORY_WIRE,
  nextPageParam,
  normalizeCategoryCounts,
  normalizeHistoryPage,
  normalizeItem,
  type ApprovalCategory,
  type ApprovalStatus,
  type CategoryCounts,
  type HistoryPage,
} from '../lib/approvalsHistory';

// Every request the Department Head sees carries `approval` (absent on an older backend): where it is in HR's approval
// pipeline, who it waits for, and whether the Department Head may approve (canAct.hod) or reject (canReject.hod) it now.
// The pending lists already hold only what this Department Head can decide, so it is a check, not a filter.

export interface ManagerProfile {
  isManager: boolean;
  canSubmitLeave: boolean;
  canApproveLeaves?: boolean;
  canApprovePermissions?: boolean;
  canApproveResignations?: boolean;
  canApproveCasualLeave?: boolean;
  canApproveAttendance?: boolean;
  canApproveMissingPunch?: boolean;
  /** Holiday / Sunday work compensation claims (the HR User Management switch "Can approve compensation"). Absent on an
   *  older backend, which reads as "cannot": the tab stays hidden. */
  canApproveCompensation?: boolean;
  /** On-Duty requests (the HR User Management switch "Can approve On-Duty"). */
  canApproveOnDuty?: boolean;
  /** The server's own total, On-Duty included. The Approvals badge is approvalsBadgeCount() in src/lib/approvalBadge.ts:
   *  the same sum over the categories the tab shows (equal to this on a current backend). */
  pendingApprovalsCount: number;
  pendingLeavesCount?: number;
  pendingPermissionsCount?: number;
  pendingResignationsCount?: number;
  /** The wire key is `pendingCasualLeaveCount` (singular "Leave"). */
  pendingCasualLeaveCount?: number;
  pendingAttendanceCount?: number;
  pendingMissingPunchCount?: number;
  /** Gate outpass requests waiting for this head (inside `pendingApprovalsCount`). */
  pendingOutpassCount?: number;
  /** On-Duty requests waiting for this head (the Approvals tab's On-Duty category). */
  pendingOnDutyCount?: number;
  /** Claims waiting for this head: already inside `pendingApprovalsCount`. */
  pendingCompensationCount?: number;
}

export interface TeamOutpassRequest {
  id: number;
  employeeName?: string;
  employeeCode?: string;
  employee?: { id?: number; name?: string; code?: string; employeeCode?: string };
  destination: string;
  reason: string;
  status: string;
  createdAt?: string;
  approval?: ApprovalProgress | null;
}

export interface TeamLeaveRequest {
  id: number;
  // Flat fields (if backend serializes directly)
  employeeName?: string;
  employeeCode?: string;
  // Nested employee object (alternative serializer pattern)
  employee?: { id?: number; name?: string; code?: string; employeeCode?: string };
  leaveType?: string;
  leaveTypeName?: string;
  /** "Sick Leave" / "Emergency" / "Personal" / "Other Reasons" picked in the apps; blank on older requests. */
  reasonCategoryLabel?: string;
  startDate: string;
  endDate: string;
  totalDays?: number;
  days?: number;
  reason: string;
  status: string;
  appliedOn?: string;
  createdAt?: string;
  approval?: ApprovalProgress | null;
}

export interface TeamPermissionRequest {
  id: number;
  employeeName?: string;
  employeeCode?: string;
  employee?: { id?: number; name?: string; code?: string; employeeCode?: string };
  /** Legacy wire spelling ("Late In" | "Early Out" | "Short Leave"). Never render it: use
   *  permissionTypeLabel() from src/lib/permissions. */
  type?: string | null;
  permissionType?: string;
  // Additive fields of the rewritten backend (all absent on an older one): the type in the
  // policy's words, and how the request stands against the month's limit.
  typeKey?: string | null;
  typeLabel?: string | null;
  capStatus?: 'within_cap' | 'excess' | 'not_applicable' | null;
  statusLabel?: string | null;
  monthlyLimit?: number | null;
  date: string;
  time: string;
  reason: string;
  /** Always 60 on the new backend; older requests may carry 30/45/90 (or null). */
  durationMinutes?: number | null;
  status: string;
  appliedOn?: string;
  createdAt?: string;
  approval?: ApprovalProgress | null;
}

export interface TeamResignationRequest {
  id: number;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  reason: string;
  lastWorkingDate: string | null;
  surveyQ1Answer: string | null;
  surveyQ2Answer: string | null;
  surveyQ3Answer: string | null;
  status: 'pending' | 'dept_approved' | 'approved' | 'rejected';
  createdAt: string;
  approval?: ApprovalProgress | null;
}

export interface TeamCasualLeaveRequest {
  id: number;
  employeeName?: string;
  employeeCode?: string;
  employee?: { id?: number; name?: string; code?: string; employeeCode?: string };
  date: string;
  /** "full" | "first_half" | "second_half" (backend casual_leave_views.py); older servers send nothing = full. */
  portion?: string;
  portionLabel?: string;
  reason: string;
  status: string;
  createdAt?: string;
  approval?: ApprovalProgress | null;
}

export interface TeamAttendanceRequest {
  id: number;
  employeeName?: string;
  employeeCode?: string;
  employee?: { id?: number; name?: string; code?: string; employeeCode?: string };
  date: string;
  requestedStatus?: string;
  reason: string;
  status: string;
  createdAt?: string;
  approval?: ApprovalProgress | null;
}

export interface TeamMissingPunchRequest {
  id: number;
  employeeName?: string;
  employeeCode?: string;
  employee?: { id?: number; name?: string; code?: string; employeeCode?: string };
  date: string;
  punchTime: string;
  punchType: 'IN' | 'OUT';
  punchSlot?: MissingPunchSlot | null;
  reason: string;
  status: string;
  createdAt?: string;
  approval?: ApprovalProgress | null;
}

/**
 * A Holiday / Sunday work compensation claim HR raised for someone on this Department Head's team: the employee worked on a
 * Sunday or a company holiday, HR claims 0.25 / 0.5 / 0.75 / 1 shift for them, and the shifts go onto the employee's
 * compensation balance only once the head approves (backend/api/holiday_work_views.py::claim_json).
 */
export interface TeamHolidayWorkClaim {
  id: number;
  employeeName?: string;
  employeeCode?: string;
  employee?: { id?: number; name?: string; code?: string; employeeCode?: string };
  department?: string | null;
  /** The day the work was done (YYYY-MM-DD). */
  workDate: string;
  /** "sunday" | "holiday" */
  dayKind?: string | null;
  holidayName?: string | null;
  shifts: number;
  reason: string;
  status: string;
  /** Who in HR raised it. */
  requestedBy?: string | null;
  createdAt?: string;
  /** True once the approval added the shifts to the employee's balance (a reply to the head's own approval). */
  credited?: boolean;
  approval?: ApprovalProgress | null;
}

export interface PendingRequests {
  leaveRequests: TeamLeaveRequest[];
  permissionRequests: TeamPermissionRequest[];
  resignations: TeamResignationRequest[];
  casualLeaves: TeamCasualLeaveRequest[];
  attendanceRequests: TeamAttendanceRequest[];
  missingPunchRequests: TeamMissingPunchRequest[];
  outpassRequests: TeamOutpassRequest[];
  holidayWorkClaims: TeamHolidayWorkClaim[];
  /** On-Duty requests waiting for this head (each with `destination`, `createdAt`, `approval`, ...). */
  onDutySessions: Record<string, any>[];
}

/** What a signed-in employee who is not a Department Head reads as. */
const NOT_A_MANAGER: ManagerProfile = { isManager: false, canSubmitLeave: true, pendingApprovalsCount: 0 };

/**
 * GET /manager/me. A failed call is an ERROR, not "not a head": React Query then keeps the last good answer, so one
 * dropped 30 s poll (offline for a moment, a slow server) no longer hides the Approvals tab for a head and brings it back
 * on the next poll (the flicker the analysis found). Only a 404 - a server without the endpoint - means "not a head".
 * Before the first answer `data` is undefined, which every reader already treats as "not known yet / not a head".
 */
export function useManagerProfile(enabled = true) {
  return useQuery({
    queryKey: ['manager-profile'],
    queryFn: async (): Promise<ManagerProfile> => {
      try {
        const res = await api.get('/manager/me');
        return res.data ?? NOT_A_MANAGER;
      } catch (err: any) {
        if (err?.response?.status === 404) return NOT_A_MANAGER;
        throw err;
      }
    },
    enabled,
    staleTime: 1000 * 30,
    refetchInterval: 30000,
    retry: 2,
  });
}

// ── The Approvals tab's Pending / Approved / Rejected lists (backend/api/mobile_approvals_views.py) ─────────────────

/** Every query of the history lists and their counts starts with this key: a decision invalidates all of them. */
export const MANAGER_REQUESTS_KEY = ['manager-requests'] as const;

/** After a decision: the old pending list, the head's counts (tab badge) and every history list / count. */
export function invalidateApprovals(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
  queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
  queryClient.invalidateQueries({ queryKey: MANAGER_REQUESTS_KEY });
}

/**
 * Pending / Approved / Rejected numbers per category (GET /manager/requests/summary). `null` = the server has no
 * history endpoint yet (an older backend answers 404): the screen then falls back to the pending list alone.
 */
export function useApprovalCounts(enabled = true) {
  return useQuery({
    queryKey: [...MANAGER_REQUESTS_KEY, 'summary'],
    queryFn: async (): Promise<CategoryCounts | null> => {
      try {
        const res = await api.get('/manager/requests/summary');
        return normalizeCategoryCounts(res.data);
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    enabled,
    staleTime: 1000 * 15,
    refetchInterval: 30000,
  });
}

export const APPROVALS_PAGE_SIZE = 20;

/**
 * One category's list in one status, 20 at a time, optionally narrowed to an employee name / code
 * (GET /manager/requests). Items are the same shapes as usePendingRequests' lists, plus `historyStatus` and `outcome`.
 * While only the search text changes the previous rows stay on screen (no skeleton flash per keystroke); switching
 * category or status never shows another list's rows.
 */
export function useApprovalHistory(
  category: ApprovalCategory,
  status: ApprovalStatus,
  search: string,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: [...MANAGER_REQUESTS_KEY, 'list', category, status, search],
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<HistoryPage> => {
      const res = await api.get('/manager/requests', {
        params: {
          category: CATEGORY_WIRE[category],
          status,
          search: search || undefined,
          page: pageParam,
          page_size: APPROVALS_PAGE_SIZE,
        },
      });
      const page = normalizeHistoryPage(res.data, pageParam);
      return { ...page, items: page.items.map((item) => normalizeItem(category, item)) };
    },
    getNextPageParam: (last) => nextPageParam(last),
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey as readonly unknown[] | undefined;
      return key && key[2] === category && key[3] === status ? previous : undefined;
    },
    enabled,
    // The pending list is what the head has to act on: keep it as fresh as the badge. History changes rarely.
    refetchInterval: status === 'pending' ? 30000 : false,
  });
}

export function usePendingRequests(enabled = true) {
  return useQuery({
    queryKey: ['pending-requests'],
    queryFn: async (): Promise<PendingRequests> => {
      const res = await api.get('/manager/pending-requests');
      const raw = res.data;
      // Backend sends "permissionTime", never "time" — see
      // backend/api/leave_views.py::_permission_json. Normalized here so
      // the manager approval sheet (which reads item.time directly) isn't
      // silently blank the same way the employee-side list once was.
      const rawPermissions: any[] = raw.permissionRequests ?? raw.permissions ?? [];
      return {
        leaveRequests: raw.leaveRequests ?? [],
        permissionRequests: rawPermissions.map((p) => ({ ...p, time: p.time ?? p.permissionTime })),
        resignations: raw.resignations ?? [],
        casualLeaves: raw.casualLeaves ?? [],
        attendanceRequests: raw.attendanceRequests ?? [],
        missingPunchRequests: raw.missingPunchRequests ?? [],
        outpassRequests: raw.outpassRequests ?? [],
        // Additive: an older backend sends none.
        holidayWorkClaims: Array.isArray(raw.holidayWorkClaims) ? raw.holidayWorkClaims : [],
        onDutySessions: Array.isArray(raw.onDutySessions) ? raw.onDutySessions : [],
      };
    },
    enabled,
    refetchInterval: 30000,
  });
}

export function useApproveLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      comment,
    }: {
      id: number;
      status: 'approved' | 'rejected';
      comment?: string;
    }) => {
      const res = await api.patch(`/manager/leave-requests/${id}/status`, { status, comment });
      return res.data;
    },
    onSuccess: () => invalidateApprovals(queryClient),
  });
}

export function useApprovePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      comment,
    }: {
      id: number;
      status: 'approved' | 'rejected';
      comment?: string;
    }) => {
      const res = await api.patch(`/manager/permissions/${id}/status`, { status, comment });
      return res.data;
    },
    onSuccess: () => invalidateApprovals(queryClient),
  });
}

export function useResignationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      comment,
    }: {
      id: number;
      action: 'approve' | 'reject';
      comment?: string;
    }) => {
      const res = await api.patch(`/manager/resignations/${id}/action`, { action, comment });
      return res.data;
    },
    onSuccess: () => invalidateApprovals(queryClient),
  });
}

export function useApproveCasualLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, comment }: { id: number; status: 'approved' | 'rejected'; comment?: string }) => {
      const res = await api.patch(`/manager/casual-leaves/${id}/status`, { status, comment });
      return res.data;
    },
    onSuccess: () => invalidateApprovals(queryClient),
  });
}

export function useApproveAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, comment }: { id: number; status: 'approved' | 'rejected'; comment?: string }) => {
      const res = await api.patch(`/manager/attendance-requests/${id}/status`, { status, comment });
      return res.data;
    },
    onSuccess: () => invalidateApprovals(queryClient),
  });
}

export function useApproveOutpass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, comment }: { id: number; status: 'approved' | 'rejected'; comment?: string }) => {
      const res = await api.patch(`/manager/outpass-requests/${id}/status`, { status, comment });
      return res.data;
    },
    onSuccess: () => invalidateApprovals(queryClient),
  });
}

/**
 * PATCH /manager/holiday-work/{id}/status: the Department Head approves (the claimed shifts go onto the employee's
 * compensation balance, once) or rejects (final) a holiday / Sunday work claim, with an optional comment. Refusals come
 * back as plain sentences in `error` (the head's profile switch is off, the claim was already decided, it is not in their
 * team) and are shown as they are. After a refusal the manager profile is refetched: the switch that was just turned off
 * is what hides the tab.
 */
export function useApproveHolidayWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, comment }: { id: number; status: 'approved' | 'rejected'; comment?: string }) => {
      const res = await api.patch(`/manager/holiday-work/${id}/status`, { status, comment });
      return res.data as TeamHolidayWorkClaim;
    },
    onSuccess: () => invalidateApprovals(queryClient),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
      queryClient.invalidateQueries({ queryKey: MANAGER_REQUESTS_KEY });
    },
  });
}

export function useApproveMissingPunch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, comment }: { id: number; status: 'approved' | 'rejected'; comment?: string }) => {
      const res = await api.patch(`/manager/missing-punch-requests/${id}/status`, { status, comment });
      return res.data;
    },
    onSuccess: () => invalidateApprovals(queryClient),
  });
}

/**
 * PATCH /manager/on-duty-sessions/{id}/status {status, comment}: the Department Head's decision on an On-Duty request.
 * Under HR's pipeline an approval may be final (the session starts, every punch recorded under it becomes attendance and
 * a gate pass is issued) or pass it on to HR; a rejection is final and voids the punches. The reply is the session with
 * its `approval` block, so the toast can say which.
 */
export function useApproveOnDuty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, comment }: { id: number; status: 'approved' | 'rejected'; comment?: string }) => {
      const res = await api.patch(`/manager/on-duty-sessions/${id}/status`, { status, comment });
      return res.data;
    },
    onSuccess: () => invalidateApprovals(queryClient),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
    },
  });
}
