import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export type PermissionDurationMinutes = 30 | 45 | 60 | 90;

export interface PermissionRequest {
  id: number;
  type: 'Early Out' | 'Late In' | 'Short Leave';
  date: string;
  time: string;
  reason: string;
  durationMinutes?: PermissionDurationMinutes | null;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedOn: string;
}

export interface PermissionsResult {
  items: PermissionRequest[];
  monthlyUsed: number;
  monthlyLimit: number;
  // Daily/weekly caps on the backend's auto-detected Permission zone (see
  // PayrollSettings.max_permissions_per_day/_per_week) -not enforced on
  // this submission form itself, but shown alongside the monthly figure so
  // the employee understands the full picture. Read off any item since the
  // value is the same company-wide setting on every row; undefined when the
  // list is empty (falls back below).
  dailyLimit: number;
  weeklyLimit: number;
}

// Backend sends lowercase status ("pending"/"approved"/"rejected") and
// "permissionTime" (never "time") — see EmployeePermission.STATUS_CHOICES
// and _permission_json in backend/api/leave_views.py. Both were previously
// read directly as PermissionRequest without this mapping, which silently
// broke the Live/Confirmed tab split (status was never really "Pending",
// so the Live tab was always empty) and left every row's time blank.
const STATUS_MAP: Record<string, PermissionRequest['status']> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
};

function normalizePermission(raw: any): PermissionRequest {
  return {
    id: raw.id,
    type: raw.type,
    date: raw.date,
    time: raw.time ?? raw.permissionTime,
    reason: raw.reason,
    durationMinutes: raw.durationMinutes ?? null,
    status: STATUS_MAP[raw.status] ?? raw.status,
    appliedOn: raw.appliedOn ?? raw.createdAt,
  };
}

export function usePermissions(employeeId: number | null, month?: number, year?: number) {
  return useQuery({
    queryKey: ['permissions', employeeId, month, year],
    queryFn: async (): Promise<PermissionsResult> => {
      const res = await api.get('/permissions', { params: { employeeId, month, year } });
      const raw = res.data;
      const rawItems: any[] = Array.isArray(raw) ? raw : (raw?.items ?? raw?.results ?? []);
      const items = rawItems.map(normalizePermission);
      const first: any = rawItems[0] ?? {};
      return {
        items,
        monthlyUsed: raw?.monthlyUsed ?? items.filter((r) => r.status !== 'Rejected').length,
        monthlyLimit: raw?.monthlyLimit ?? (first.monthlyLimit ?? 3),
        dailyLimit: first.dailyLimit ?? 1,
        weeklyLimit: first.weeklyLimit ?? 2,
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
      durationMinutes?: PermissionDurationMinutes;
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

export function useMissingPunch(employeeId: number | null, month?: number, year?: number) {
  return useQuery({
    queryKey: ['missing-punch-requests', employeeId, month, year],
    queryFn: async (): Promise<MissingPunchItem[]> => {
      const res = await api.get('/missing-punch-requests', { params: { month, year } });
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
