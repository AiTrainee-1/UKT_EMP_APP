import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface ManagerProfile {
  isManager: boolean;
  canSubmitLeave: boolean;
  canApproveLeaves?: boolean;
  canApprovePermissions?: boolean;
  canApproveResignations?: boolean;
  canApproveCasualLeave?: boolean;
  canApproveAttendance?: boolean;
  canApproveShifts?: boolean;
  pendingApprovalsCount: number;
  pendingLeavesCount?: number;
  pendingPermissionsCount?: number;
  pendingResignationsCount?: number;
  pendingCasualLeavesCount?: number;
  pendingAttendanceCount?: number;
  pendingShiftsCount?: number;
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
}

export interface TeamPermissionRequest {
  id: number;
  employeeName?: string;
  employeeCode?: string;
  employee?: { id?: number; name?: string; code?: string; employeeCode?: string };
  type?: string;
  permissionType?: string;
  date: string;
  time: string;
  reason: string;
  status: string;
  appliedOn?: string;
  createdAt?: string;
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
}

export interface TeamShiftApproval {
  id: number;
  employeeName?: string;
  employeeCode?: string;
  employee?: { id?: number; name?: string; code?: string; employeeCode?: string };
  shiftName?: string;
  effectiveFrom?: string;
  approvalStatus: string;
  approvalComment?: string | null;
  createdAt?: string;
}

export interface PendingRequests {
  leaveRequests: TeamLeaveRequest[];
  permissionRequests: TeamPermissionRequest[];
  resignations: TeamResignationRequest[];
  casualLeaves: TeamCasualLeaveRequest[];
  attendanceRequests: TeamAttendanceRequest[];
  shiftApprovals: TeamShiftApproval[];
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
      return {
        leaveRequests: raw.leaveRequests ?? [],
        permissionRequests: raw.permissionRequests ?? raw.permissions ?? [],
        resignations: raw.resignations ?? [],
        casualLeaves: raw.casualLeaves ?? [],
        attendanceRequests: raw.attendanceRequests ?? [],
        shiftApprovals: raw.shiftApprovals ?? [],
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

export function useApproveShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, comment }: { id: number; action: 'approve' | 'reject'; comment?: string }) => {
      const res = await api.patch(`/shift-assignments/${id}/approve`, { action, comment });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-requests'] });
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] });
    },
  });
}
