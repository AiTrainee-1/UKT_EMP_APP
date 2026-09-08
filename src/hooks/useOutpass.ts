import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

// See backend/api/outpass_request_views.py::_outpass_request_json. Approving
// (from either HOD or HR) sets approvedAt/expiresAt -expiresAt is always
// exactly approvedAt + 60 minutes, computed server-side.
export interface OutpassRequestItem {
  id: number;
  employeeId: number;
  destination: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  source: 'manual' | 'on_duty';
  approverRole?: 'hr' | 'dept_head' | 'system' | null;
  approvedBy?: string | null;
  reviewComment?: string | null;
  approvedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  // Gate Scanner fields -see backend/api/gate_scanner_views.py. qrToken is
  // only present while the pass is actually presentable at a gate (approved,
  // unexpired, not yet exited) -this is what OutpassFlipCard renders as a QR.
  qrToken?: string | null;
  exitGateName?: string | null;
  exitedAt?: string | null;
  scanStatus?: 'not_applicable' | 'pending_exit' | 'exited' | 'expired_unscanned';
}

// GET/POST both self-scope to the logged-in employee token server-side —
// no employeeId needed in the request itself, only in the query key so a
// different employee logging in on the same device gets a fresh cache entry.
export function useOutpassRequests(employeeId: number | null) {
  return useQuery({
    queryKey: ['outpass-requests', employeeId],
    queryFn: async (): Promise<OutpassRequestItem[]> => {
      const res = await api.get('/outpass-requests');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!employeeId,
    refetchInterval: 30000,
  });
}

export function useSubmitOutpassRequest(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { destination: string; reason: string }) => {
      const res = await api.post('/outpass-requests', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outpass-requests', employeeId] });
    },
  });
}
