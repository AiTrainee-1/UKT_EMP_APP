import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

// See backend/api/tea_break_views.py. A permanent, no-approval, per-employee
// QR -unlike Outpass's per-request approval flow, this just identifies WHO
// is scanning; the server toggles OUT/IN by itself based on whether an open
// break already exists. Scanned at the same gate logins Outpass already
// uses, so there's no separate device/login concept for this on the app side.

export interface TeaBreakLogItem {
  id: number;
  outGateName: string | null;
  outAt: string;
  inGateName: string | null;
  inAt: string | null;
  takenMinutes: number;
  remark: 'overtime' | 'on_time' | 'in_progress' | 'not_returned';
}

export interface TeaBreakStatus {
  onBreak: boolean;
  outAt: string | null;
  allowedMinutes: number;
  recent: TeaBreakLogItem[];
}

// The QR token itself barely changes (it's a long-lived, employee-identifying
// JWT, not single-use) -fetched once per screen visit rather than polled.
export function useTeaBreakQrToken(employeeId: number | null) {
  return useQuery({
    queryKey: ['tea-break-qr-token', employeeId],
    queryFn: async (): Promise<string> => {
      const res = await api.get('/tea-break/qr-token');
      return res.data.qrToken as string;
    },
    enabled: !!employeeId,
    staleTime: Infinity,
  });
}

// Polled while the screen is open so a gate scan (out or back in) shows up
// here without the employee needing to pull-to-refresh.
export function useTeaBreakStatus(employeeId: number | null) {
  return useQuery({
    queryKey: ['tea-break-status', employeeId],
    queryFn: async (): Promise<TeaBreakStatus> => {
      const res = await api.get('/tea-break/my-status');
      return res.data as TeaBreakStatus;
    },
    enabled: !!employeeId,
    refetchInterval: 15000,
  });
}
