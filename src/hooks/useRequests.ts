import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface PermissionRequest {
  id: number;
  type: 'Early Out' | 'Late In' | 'Short Leave';
  date: string;
  time: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedOn: string;
}

export interface PermissionsResult {
  items: PermissionRequest[];
  monthlyUsed: number;
  monthlyLimit: number;
}

export function usePermissions(employeeId: number | null, month?: number, year?: number) {
  return useQuery({
    queryKey: ['permissions', employeeId, month, year],
    queryFn: async (): Promise<PermissionsResult> => {
      const res = await api.get('/permissions', { params: { employeeId, month, year } });
      const raw = res.data;
      const items: PermissionRequest[] = Array.isArray(raw) ? raw : (raw?.items ?? raw?.results ?? []);
      return {
        items,
        monthlyUsed: raw?.monthlyUsed ?? items.filter((r) => r.status !== 'Rejected').length,
        monthlyLimit: raw?.monthlyLimit ?? 3,
      };
    },
    enabled: !!employeeId,
  });
}

export function useSubmitPermission(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      type: string;
      date: string;
      time: string;
      reason: string;
    }) => {
      const { time, ...rest } = data;
      const res = await api.post('/permissions', { employeeId, ...rest, permissionTime: time });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', employeeId] });
    },
  });
}

// ── Missing Punch (two-stage: Department Head, then HR) ─────────────────────

// Which of the day's (up to) 4 punches this request represents — purely
// descriptive, lets the employee say exactly which punch they missed instead
// of a generic Check-In/Check-Out. Not the source of truth for real P1-P4
// identity (the engine derives that from punch TIME, never stored) — this
// only maps onto punchType (morning_in/lunch_in -> IN, lunch_out/evening_out
// -> OUT), which is what actually gets written to attendance on approval.
export type MissingPunchSlot = 'morning_in' | 'lunch_out' | 'lunch_in' | 'evening_out';

export const PUNCH_SLOT_LABEL: Record<MissingPunchSlot, string> = {
  morning_in: 'Morning Check-In',
  lunch_out: 'Lunch Check-Out',
  lunch_in: 'Lunch Check-In',
  evening_out: 'Evening Check-Out',
};

export interface MissingPunchItem {
  id: number;
  date: string;
  punchTime: string;
  punchType: 'IN' | 'OUT';
  punchSlot: MissingPunchSlot | null;
  reason: string;
  status: 'pending_hod' | 'pending_hr' | 'approved' | 'rejected';
  hodReviewedBy: string | null;
  hodReviewComment: string | null;
  hrReviewedBy: string | null;
  hrReviewComment: string | null;
  createdAt: string | null;
}

export function useMissingPunch(employeeId: number | null) {
  return useQuery({
    queryKey: ['missing-punch-requests', employeeId],
    queryFn: async (): Promise<MissingPunchItem[]> => {
      const res = await api.get('/missing-punch-requests');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!employeeId,
  });
}

export function useSubmitMissingPunch(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { date: string; punchTime: string; punchSlot: MissingPunchSlot; reason: string }) => {
      const res = await api.post('/missing-punch-requests', { employeeId, ...data });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missing-punch-requests', employeeId] });
    },
  });
}
