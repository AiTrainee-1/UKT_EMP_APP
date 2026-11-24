import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { sendOrQueue } from '../offline/submit';
import type { ApprovalProgress } from '../lib/approval';

// See backend/api/outpass_request_views.py::_outpass_request_json. The final
// approval sets approvedAt/expiresAt -expiresAt is always exactly
// approvedAt + 60 minutes, computed server-side.
export type OutpassPassType = 'official' | 'personal' | 'early_dismissal';

export const OUTPASS_PASS_TYPE_LABEL: Record<OutpassPassType, string> = {
  official: 'Official / Mill Duty',
  personal: 'Personal Emergency',
  early_dismissal: 'Early Shift Dismissal',
};

export interface OutpassRequestItem {
  id: number;
  employeeId: number;
  destination: string;
  reason: string;
  passType?: OutpassPassType | null;
  expectedReturnAt?: string | null;
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
  // Return/re-entry leg -returnQrToken is only present once the employee has
  // tapped "Generate Return QR" (see useGenerateReturnOutpassQr below) AND
  // it hasn't expired/been superseded yet -mirrors qrToken's own rule.
  entryGateName?: string | null;
  enteredAt?: string | null;
  returnQrToken?: string | null;
  returnQrExpiresAt?: string | null;
  canGenerateReturnQr?: boolean;
  scanStatus?:
    | 'not_applicable' | 'pending_exit' | 'exited' | 'expired_unscanned'
    | 'pending_return' | 'return_expired' | 'completed';
  // Who a pending request waits for and how far it has got in HR's approval
  // pipeline. Null for a pass an On-Duty approval raised (no pipeline of its
  // own), absent on an older backend.
  approval?: ApprovalProgress | null;
  /** Since 2026-11-24: when the exit QR becomes valid (an On-Duty pass: the moment the On-Duty was submitted). */
  validFrom?: string | null;
  /** The On-Duty request this pass belongs to, and that request's own state (its pass is raised at submission). */
  onDutySessionId?: number | null;
  onDutyStatus?: string | null;
  /** The employee block (HR lists and the On-Duty status carry it; the employee's own list does not). */
  employee?: {
    id: number;
    employeeCode?: string | null;
    name?: string | null;
    department?: string | null;
    designation?: string | null;
    photoUrl?: string | null;
  } | null;
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
    mutationFn: async (data: {
      destination: string;
      reason: string;
      passType?: OutpassPassType;
      expectedReturnAt?: string;
    }) => {
      return sendOrQueue<any>({
        kind: 'outpass.submit',
        label: `Gate outpass · ${data.destination}`,
        url: '/outpass-requests',
        body: data,
        invalidate: [['outpass-requests', employeeId], ['my-pending-requests']],
        meta: { destination: data.destination, reason: data.reason, passType: data.passType ?? null },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outpass-requests', employeeId] });
    },
  });
}

// The "Generate Return QR" button on an already-exited Outpass card -see
// backend/api/outpass_request_views.py::generate_return_qr. Self-scoped
// server-side, so no employeeId needed in the body, only in the cache key.
export function useGenerateReturnOutpassQr(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: number): Promise<OutpassRequestItem> => {
      const res = await api.post(`/outpass-requests/${requestId}/generate-return-qr`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outpass-requests', employeeId] });
      // an On-Duty's pass is also shown on the On-Duty page
      queryClient.invalidateQueries({ queryKey: ['on-duty-session-status'] });
    },
  });
}
