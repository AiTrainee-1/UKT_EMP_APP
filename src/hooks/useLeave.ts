import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { ApprovalProgress } from '../lib/approval';

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
  /** Where the request stands in HR's approval pipeline. Absent on an older backend (`...raw` below carries it). */
  approval?: ApprovalProgress | null;
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

// Backend sends lowercase status ("pending"/"approved"/"rejected") -see
// LeaveRequest.status in backend/api/models.py and leave_request_json in
// backend/api/serializers.py. Reading it directly as this hook's own
// capitalized LeaveRequest['status'] union silently broke the Live/
// Confirmed tab split and the Approved/Rejected/Taken summary counts on
// app/(tabs)/leave.tsx (status was never really "Pending", so nothing ever
// matched) -mirrors the identical fix already applied to PermissionRequest
// in useRequests.ts's STATUS_MAP/normalizePermission.
const STATUS_MAP: Record<string, LeaveRequest['status']> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
};

function normalizeLeaveRequest(raw: any): LeaveRequest {
  return {
    ...raw,
    status: STATUS_MAP[raw.status] ?? raw.status,
    // Backend's leave_request_json returns "type", never "leaveType" -read
    // directly as LeaveRequest before this mapping existed, request.leaveType
    // was always undefined, leaving the type label blank on every leave card
    // and the type filter chips empty (see LeaveCard.tsx / app/(tabs)/leave.tsx).
    leaveType: raw.leaveType ?? raw.type,
  };
}

export function useLeaveRequests(employeeId: number | null) {
  return useQuery({
    queryKey: ['leave-requests', employeeId],
    queryFn: async () => {
      const res = await api.get('/leave-requests', { params: { employeeId } });
      const items: any[] = Array.isArray(res.data) ? res.data : [];
      return items.map(normalizeLeaveRequest);
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
