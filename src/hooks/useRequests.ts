import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  hasCapInfo,
  permissionOutcome,
  permissionTypeLabel,
  resolvePermissionTypeKey,
  type PermissionBadgeVariant,
  type PermissionOutcomeKey,
  type PermissionTypeKey,
} from '../lib/permissions';
import type { ApprovalProgress } from '../lib/approval';

export interface PermissionRequest {
  id: number;
  /** Legacy wire spelling ("Late In" | "Early Out" | "Short Leave"), or null when the request
   *  is untyped. Never render this: use `typeLabel`. */
  type: string | null;
  typeKey: PermissionTypeKey | null;
  /** "Morning Late-In" | "Evening Early-Out" | "Middle One-Hour Permission" (or "Permission"). */
  typeLabel: string;
  date: string;
  time: string;
  reason: string;
  /** Always 60 on the new backend; older requests may carry 30/45/90 (or null). */
  durationMinutes: number | null;
  status: 'Pending' | 'Approved' | 'Rejected';
  /** Pending / Allowed / Not Allowed / Overdue-Excess -derived from status + capStatus. On an
   *  older backend (no capStatus/statusLabel) an approved one is a plain, neutral "Approved". */
  outcome: PermissionOutcomeKey;
  outcomeLabel: string;
  outcomeBadge: PermissionBadgeVariant;
  /** The server sent capStatus/statusLabel, i.e. it speaks the monthly-limit rules. */
  hasCapInfo: boolean;
  appliedOn: string;
  /** Where the request stands in HR's approval pipeline. Absent on an older backend. */
  approval?: ApprovalProgress | null;
}

export interface PermissionsResult {
  items: PermissionRequest[];
  /** Requests this month that are still alive (pending + approved). */
  monthlyUsed: number;
  /** HR's monthly limit, as far as the list itself knows it: only present once the list has a
   *  row (the old backend: always 3). Undefined when unknown -resolve with resolvePermissionLimit. */
  monthlyLimit?: number;
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
  const outcome = permissionOutcome(raw);
  return {
    id: raw.id,
    type: raw.type ?? null,
    typeKey: resolvePermissionTypeKey(raw),
    typeLabel: permissionTypeLabel(raw),
    date: raw.date,
    time: raw.time ?? raw.permissionTime,
    reason: raw.reason,
    durationMinutes: typeof raw.durationMinutes === 'number' ? raw.durationMinutes : null,
    status: STATUS_MAP[String(raw.status).toLowerCase()] ?? raw.status,
    outcome: outcome.key,
    outcomeLabel: outcome.label,
    outcomeBadge: outcome.badge,
    hasCapInfo: hasCapInfo(raw),
    appliedOn: raw.appliedOn ?? raw.createdAt,
    approval: raw.approval ?? null,
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
      const limit = raw?.monthlyLimit ?? first.monthlyLimit;
      return {
        items,
        monthlyUsed: raw?.monthlyUsed ?? items.filter((r) => r.status !== 'Rejected').length,
        monthlyLimit: typeof limit === 'number' && limit >= 0 ? limit : undefined,
      };
    },
    enabled: !!employeeId,
  });
}

export function useSubmitPermission(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    // `type` is the LEGACY spelling ("Late In" | "Early Out" | "Short Leave") on purpose -the old
    // backend rejects anything else and the new one accepts both. No durationMinutes: every
    // permission is a fixed hour and the new backend ignores it.
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

// ── Missing Punch (staged approval: who decides, and in what order, is HR's pipeline - see `approval`) ──

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
  /** Where the request stands in HR's approval pipeline. Absent on an older backend, where `status` alone says
   *  which of the two fixed stages it is at. */
  approval?: ApprovalProgress | null;
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
