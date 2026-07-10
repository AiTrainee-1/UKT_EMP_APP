import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface CasualLeaveRequest {
  id: number;
  date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
}

export interface CLEligibility {
  eligible: boolean;
  reason?: string;
}

function normalizeStatus(raw: string): CasualLeaveRequest['status'] {
  const s = (raw || '').toLowerCase();
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  return 'Pending';
}

export function useCasualLeaves(employeeId: number | null, params?: { status?: string; month?: number; year?: number }) {
  return useQuery({
    queryKey: ['casual-leaves', employeeId, params],
    queryFn: async (): Promise<CasualLeaveRequest[]> => {
      const res = await api.get('/casual-leaves', { params: { employeeId, ...params } });
      const raw = Array.isArray(res.data) ? res.data : (res.data?.items ?? res.data?.results ?? []);
      return raw.map((r: any) => ({
        id: r.id,
        date: r.date,
        reason: r.reason ?? '',
        status: normalizeStatus(r.status),
        createdAt: r.createdAt ?? r.date,
      }));
    },
    enabled: !!employeeId,
  });
}

export function useCLEligibility(employeeId: number | null) {
  return useQuery({
    queryKey: ['casual-leave-eligibility', employeeId],
    queryFn: async (): Promise<CLEligibility> => {
      const res = await api.get('/casual-leaves/eligibility', { params: { employeeId } });
      return {
        eligible: !!res.data?.eligible,
        reason: res.data?.reason,
      };
    },
    enabled: !!employeeId,
  });
}

export function useApplyCasualLeave(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { date: string; reason: string }) => {
      const res = await api.post('/casual-leaves', { employeeId, ...data });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casual-leaves', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['casual-leave-eligibility', employeeId] });
    },
  });
}
