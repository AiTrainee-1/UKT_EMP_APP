import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface LeaveBalance {
  leaveType: string;
  total: number;
  used: number;
  remaining: number;
}

export interface LeaveRequest {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;       // legacy field
  totalDays?: number; // backend now returns this (Mon–Sat count, no Sundays)
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedOn: string;
  isHalfDay?: boolean;
  halfDaySlot?: 'morning' | 'afternoon' | null;
}

export interface LeaveType {
  id: number;
  name: string;
}

export function useLeaveBalances(employeeId: number | null) {
  return useQuery({
    queryKey: ['leave-balances', employeeId],
    queryFn: async () => {
      const res = await api.get('/leave-balances', { params: { employeeId } });
      return res.data as LeaveBalance[];
    },
    enabled: !!employeeId,
  });
}

export function useLeaveRequests(employeeId: number | null) {
  return useQuery({
    queryKey: ['leave-requests', employeeId],
    queryFn: async () => {
      const res = await api.get('/leave-requests', { params: { employeeId } });
      return res.data as LeaveRequest[];
    },
    enabled: !!employeeId,
  });
}

const FALLBACK_LEAVE_TYPES: LeaveType[] = [
  { id: 1, name: 'Annual Leave' },
  { id: 2, name: 'Sick Leave' },
  { id: 3, name: 'Casual Leave' },
  { id: 4, name: 'Emergency Leave' },
  { id: 5, name: 'Maternity Leave' },
  { id: 6, name: 'Paternity Leave' },
];

export function useLeaveTypes() {
  return useQuery({
    queryKey: ['leave-types'],
    queryFn: async () => {
      const res = await api.get('/leave-types');
      const data = res.data;
      if (Array.isArray(data) && data.length > 0) {
        return data.map((t: any) => ({ ...t, id: Number(t.id) })) as LeaveType[];
      }
      // Backend has no leave types configured — use defaults
      return FALLBACK_LEAVE_TYPES;
    },
  });
}

export function useApplyLeave(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      leaveTypeId?: number;
      startDate: string;
      endDate: string;
      reason: string;
      isHalfDay?: boolean;
      halfDaySlot?: 'morning' | 'afternoon';
    }) => {
      const res = await api.post('/leave-requests', { employeeId, ...data });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances', employeeId] });
    },
  });
}
