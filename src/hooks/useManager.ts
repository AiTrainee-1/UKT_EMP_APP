import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { MissingPunchSlot } from './useRequests';
import type { ApprovalProgress } from '../lib/approval';

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
  pendingApprovalsCount: number;
  pendingLeavesCount?: number;
  pendingPermissionsCount?: number;
  pendingResignationsCount?: number;
  pendingCasualLeavesCount?: number;
  pendingAttendanceCount?: number;
  pendingMissingPunchCount?: number;
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

export interface PendingRequests {
  leaveRequests: TeamLeaveRequest[];
  permissionRequests: TeamPermissionRequest[];
  resignations: TeamResignationRequest[];
  casualLeaves: TeamCasualLeaveRequest[];
  attendanceRequests: TeamAttendanceRequest[];
  missingPunchRequests: TeamMissingPunchRequest[];
  outpassRequests: TeamOutpassRequest[];
}

export function useManagerProfile(enabled = true) {
  return useQuery({
    queryKey: ['manager-profile'],
    queryFn: async (): Promise<ManagerProfile> => {
      try {
        const res = await api.get('/manager/me');
        return res.data;
      } catch {
        return { isManager: false, canSubmitLeave: true, pendingApprovalsCount: 0 };
      }
    },
    enabled,
    staleTime: 1000 * 30,
    refetchInterval: 30000,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
    },
  });
}

export function useApproveCasualLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, comment }: { id: number; status: 'approved' | 'rejected'; comment?: string }) => {
      const res = await api.patch(`/manager/casual-leaves/${id}/status`, { status, comment });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
    },
  });
}

export function useApproveAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, comment }: { id: number; status: 'approved' | 'rejected'; comment?: string }) => {
      const res = await api.patch(`/manager/attendance-requests/${id}/status`, { status, comment });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
    },
  });
}

export function useApproveOutpass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, comment }: { id: number; status: 'approved' | 'rejected'; comment?: string }) => {
      const res = await api.patch(`/manager/outpass-requests/${id}/status`, { status, comment });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
    },
  });
}
