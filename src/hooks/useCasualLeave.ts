import { useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { ApprovalProgress } from '../lib/approval';
import {
  asPortion,
  asStatus,
  readBalance,
  readHistory,
  readMonthsUsage,
  readRule,
  type CLBalance,
  type CLHistory,
  type CLLeft,
  type CLMonthUsage,
  type CLPart,
  type CLPortion,
  type CLRule,
  type CLSource,
  type ShiftHalves,
} from '../lib/casualLeave';

export interface CasualLeaveRequest {
  id: number;
  date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  /** Where the request stands in HR's approval pipeline. Absent on an older backend. */
  approval?: ApprovalProgress | null;
  /** Full day or one half of the shift (2026-10-31). "full" on an older backend. */
  portion: CLPortion;
  /** Who decided it, with their note (absent while it waits). */
  reviewedBy?: string | null;
  reviewComment?: string | null;
  reviewedAt?: string | null;
  /** "hr_edit" when an HR attendance edit gave it (2026-11-02); "employee" otherwise and on an older backend. */
  source: CLSource;
  /** The HR attendance edit that gave it, when it did. */
  hrEditRequestId?: number | null;
}

/** One month the employee may still apply casual leave for (the previous month only while the grace days are open, then
 *  the current month). */
export interface CLEligibilityMonth {
  /** 'yyyy-MM' */
  month: string;
  /** 'September 2026' */
  label: string;
  eligible: boolean;
  reason: string | null;
  /** What is left of the month's Casual Leave. An older server does not send it: then read from `eligible`. */
  left: CLLeft;
  /** The month's pending / approved requests (empty on an older server). */
  usedParts: CLPart[];
  /** Which half of which date is already asked for. */
  usedHalves: { date: string; portion: CLPortion }[];
  /** Added 2026-11-02 (yearly balance); absent on an older server = the one-a-month rule. */
  rule?: CLRule;
  /** The yearly days still free for the month's year (null under the old rule). */
  remaining?: number | null;
  /** Dates already taken as a full day. */
  usedFullDates?: string[];
}

export interface CLEligibility {
  eligible: boolean;
  reason?: string;
  year?: number;
  yearlyEntitlement?: number;
  usedThisYear?: number;
  remainingThisYear?: number;
  /** Days waiting for a decision this year (newer server only). */
  waitingThisYear?: number;
  /** Per-month eligibility. Absent on an older server: then only `eligible` is known. */
  months?: CLEligibilityMonth[];
  /** The employee's shift split into the two halves, for "what does First half mean" (null without a shift). */
  shift?: ShiftHalves | null;
  /** 'yyyy-MM' of this device's clock when the answer was fetched: the month the answer is about. */
  fetchedMonth?: string;
  /** The yearly balance (2026-11-02): 12 - approved - waiting days. Absent on an older server (then the one-a-month words). */
  balance?: CLBalance | null;
  /** The rule today's requests follow. */
  rule?: CLRule;
  /** The year month by month, every part (HR proposals that still wait included). */
  monthsUsage?: CLMonthUsage[];
}

/** 'yyyy-MM' of a date, in the device's time (the same clock the request window uses). */
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function readParts(raw: unknown): CLPart[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p.date === 'string')
    .map((p) => ({ id: typeof p.id === 'number' ? p.id : undefined, date: p.date, portion: asPortion(p.portion), status: asStatus(p.status) }));
}

/** `months` from the server, or undefined when it is not sent (an older server) or not a list. */
function readMonths(raw: unknown): CLEligibilityMonth[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((m) => m && typeof m.month === 'string')
    .map((m) => {
      const eligible = !!m.eligible;
      const left: CLLeft = m.left === 'full' || m.left === 'one_half' || m.left === 'nothing' ? m.left : eligible ? 'full' : 'nothing';
      return {
        month: m.month as string,
        label: typeof m.label === 'string' && m.label ? m.label : (m.month as string),
        eligible,
        reason: typeof m.reason === 'string' && m.reason ? m.reason : null,
        left,
        usedParts: readParts(m.usedParts),
        usedHalves: readParts(m.usedHalves).map(({ date, portion }) => ({ date, portion })),
        rule: readRule(m.rule),
        remaining: typeof m.remaining === 'number' && Number.isFinite(m.remaining) ? m.remaining : null,
        usedFullDates: Array.isArray(m.usedFullDates) ? m.usedFullDates.filter((d: unknown) => typeof d === 'string') : [],
      };
    });
}

function readShift(raw: any): ShiftHalves | null {
  if (!raw || typeof raw.start !== 'string' || typeof raw.end !== 'string') return null;
  return {
    name: typeof raw.name === 'string' ? raw.name : null,
    start: raw.start,
    end: raw.end,
    firstHalfEnd: typeof raw.firstHalfEnd === 'string' ? raw.firstHalfEnd : raw.start,
    secondHalfStart: typeof raw.secondHalfStart === 'string' ? raw.secondHalfStart : raw.end,
  };
}

function normalizeStatus(raw: string): CasualLeaveRequest['status'] {
  const s = asStatus(raw);
  return s === 'approved' ? 'Approved' : s === 'rejected' ? 'Rejected' : 'Pending';
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
        approval: r.approval ?? null,
        portion: asPortion(r.portion),
        reviewedBy: r.reviewedBy ?? null,
        reviewComment: r.reviewComment ?? null,
        reviewedAt: r.reviewedAt ?? null,
        source: r.source === 'hr_edit' ? 'hr_edit' : 'employee',
        hrEditRequestId: typeof r.hrEditRequestId === 'number' ? r.hrEditRequestId : null,
      }));
    },
    enabled: !!employeeId,
  });
}

// GET /casual-leaves/my-eligibility — self-scoped for the logged-in employee
// (casual-leaves/eligibility is a separate, HR-only bulk board endpoint that
// 403s on an employee token; this one exists specifically for self-service).
//
// The answer is about a month (used this month, which months are still open), but the tabs stay mounted for days and the
// app has no focus / online manager for React Native, so a cached answer would otherwise outlive its month. So it is asked
// again every time the screen using it gains focus, and whenever the device's month is not the month it was fetched in.
// Call this from a screen (it uses the navigation focus).
export function useCLEligibility(employeeId: number | null) {
  const query = useQuery({
    queryKey: ['casual-leave-eligibility', employeeId],
    queryFn: async (): Promise<CLEligibility> => {
      const res = await api.get('/casual-leaves/my-eligibility');
      return {
        eligible: !!res.data?.eligible,
        reason: res.data?.reason,
        year: res.data?.year,
        yearlyEntitlement: res.data?.yearlyEntitlement,
        usedThisYear: res.data?.usedThisYear,
        remainingThisYear: res.data?.remainingThisYear,
        waitingThisYear: typeof res.data?.waitingThisYear === 'number' ? res.data.waitingThisYear : undefined,
        months: readMonths(res.data?.months),
        shift: readShift(res.data?.shift),
        fetchedMonth: monthKey(new Date()),
        balance: readBalance(res.data?.balance),
        rule: readRule(res.data?.rule),
        monthsUsage: readMonthsUsage(res.data?.monthsUsage),
      };
    },
    enabled: !!employeeId,
  });
  const { refetch } = query;

  // cancelRefetch: false joins a request that is already running (the first load, another screen) instead of restarting it.
  useFocusEffect(
    useCallback(() => {
      if (employeeId) void refetch({ cancelRefetch: false });
    }, [employeeId, refetch]),
  );

  const nowMonth = monthKey(new Date());
  const dataMonth = query.data?.fetchedMonth;
  useEffect(() => {
    if (employeeId && dataMonth && dataMonth !== nowMonth) void refetch({ cancelRefetch: false });
  }, [employeeId, dataMonth, nowMonth, refetch]);

  return query;
}

/**
 * GET /casual-leaves/history?year= (2026-11-02): the year's balance as a running story ("12 → 11 on 05 Nov: Casual Leave
 * approved ..."). `null` when the server does not have it (an older one answers 404): the screen then shows nothing.
 */
export function useCLHistory(employeeId: number | null, year: number) {
  return useQuery({
    queryKey: ['casual-leave-history', employeeId, year],
    queryFn: async (): Promise<CLHistory | null> => {
      try {
        const res = await api.get('/casual-leaves/history', { params: { year } });
        return readHistory(res.data);
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: !!employeeId,
  });
}

export function useApplyCasualLeave(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    // `portion` is left out for a full day, so an older server (which knows no portion) sees exactly what it always did.
    mutationFn: async (data: { date: string; reason: string; portion?: CLPortion }) => {
      const { portion, ...rest } = data;
      const body = portion && portion !== 'full' ? { employeeId, ...rest, portion } : { employeeId, ...rest };
      const res = await api.post('/casual-leaves', body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casual-leaves', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['casual-leave-eligibility', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['casual-leave-history', employeeId] });
    },
  });
}
