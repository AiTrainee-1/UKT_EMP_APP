import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface ManagerProfile {
  isManager: boolean;
  canSubmitLeave: boolean;
  pendingApprovalsCount: number;
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

export interface PendingRequests {
  leaveRequests: TeamLeaveRequest[];
  permissionRequests: TeamPermissionRequest[];
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
      console.log('[pending-requests] raw:', JSON.stringify(res.data));
      return res.data;
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
