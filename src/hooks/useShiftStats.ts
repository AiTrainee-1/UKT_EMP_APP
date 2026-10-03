import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { readDayFlags, type DayFlags } from '../lib/attendanceFlags';

export interface DailyShiftLog extends DayFlags {
  date: string;
  firstPunch?: string | null;
  lastPunch?: string | null;
  status: string;
  /** "holiday" (declared) | "weekly_off" (a Sunday off) | null. Sent for future days too; absent on an older backend. */
  dayKind?: 'holiday' | 'weekly_off' | null;
  holidayName?: string | null;
  holidayType?: string | null;
  /** An approved Casual Leave day (stored as a Present day, so only this tells it apart). */
  isCasualLeave?: boolean;
}

export interface ShiftStatsSummary {
  shiftDeductions: number;
  salaryDeductionAmount: number;
  billableLateCount: number;
  /** How much of the free allowance is used (late-ins + early-outs + excess permissions, capped at it). */
  permissionsUsed: number;
  permissionOverageCount: number;
  totalEffectiveShifts?: number;
  halfShiftDays?: number;
  absentDays?: number;
  // Additive fields of the rewritten backend: all undefined on an older one, so every reader
  // needs a fallback (see latePoolView).
  lateInCount?: number;
  earlyOutCount?: number;
  excessPermissionCount?: number;
  freeAllowance?: number;
  permissionMonthlyCap?: number;
}

/**
 * The company-wide rules the days were judged by (top-level `policy` of the rewritten backend;
 * absent on an older one, so EVERY field is optional and every reader needs a fallback).
 */
export interface ShiftPolicy {
  morningLateInEnabled?: boolean;
  eveningEarlyOutEnabled?: boolean;
  /** "HH:MM" -the OLD fixed cut-off for the Morning Half (an older backend still decides by it). */
  halfDayFirstHalfEnd?: string;
  /** The arrival timeline of the current backend, measured from each shift's own start + grace: Late up to
   *  lateWindowMinutes, an approved Late-In permission excuses a further permissionWindowMinutes, then arrivalExtraMinutes
   *  more still count as the Morning Half (the day earning 1 - arrivalQuarterDeduction shift); later is the second half. */
  lateWindowMinutes?: number;
  permissionWindowMinutes?: number;
  arrivalExtraMinutes?: number;
  arrivalQuarterDeduction?: number;
  /** "HH:MM" -a punch at/after this is the Evening Half. */
  halfDaySecondHalfStart?: string;
  permissionMonthlyCap?: number;
  freeAllowance?: number;
  permissionDurationMinutes?: number;
}

export interface ShiftStats {
  totalLateCount: number;
  halfShiftDays: number;
  totalEffectiveShifts: number;
  absentDays: number;
  employmentType?: string;
  policy?: ShiftPolicy;
  summary: ShiftStatsSummary;
  dailyLogs: DailyShiftLog[];
}

/** Free lates a month on the old backend, and the fallback whenever the API doesn't say. */
export const DEFAULT_FREE_ALLOWANCE = 3;

export interface LatePoolView {
  freeAllowance: number;
  /** Late-ins + early-outs + excess permissions share one monthly pool; the first
   *  `freeAllowance` are free, the rest are billed. */
  freeUsed: number;
  billable: number;
  excess: number;
  shiftDeductions: number;
  salaryDeductionAmount: number;
  /** True only when the API sent a trustworthy split (lateIn/earlyOut/excess): never on an older
   *  backend, and never for production staff (see latePoolView). */
  hasBreakdown: boolean;
  lateIn: number;
  earlyOut: number;
  /** Production staff: own late policy, flat free allowance, no split. */
  isProduction: boolean;
}

/**
 * The deduction preview with every new field defaulted, so screens never hardcode "3". The
 * company policy, when present, wins over the summary's copy of the same number.
 *
 * Production staff are the exception: they have their own late policy (the backend still prices
 * them against a flat 3) and its production branch sends lateIn = earlyOut = 0, which would read
 * as "no late-ins" beside a monthly late count. So production never gets a split, and its free
 * allowance is the flat default, not the staff policy value. Mirrors the web app's
 * resolveDeductionPool (`staffPool`).
 */
export function latePoolView(
  stats: Pick<ShiftStats, 'summary' | 'policy' | 'employmentType'>,
): LatePoolView {
  const s = stats.summary;
  const staffPool = stats.employmentType !== 'production';
  return {
    freeAllowance: staffPool
      ? (stats.policy?.freeAllowance ?? s.freeAllowance ?? DEFAULT_FREE_ALLOWANCE)
      : DEFAULT_FREE_ALLOWANCE,
    freeUsed: s.permissionsUsed,
    billable: s.billableLateCount,
    excess: s.excessPermissionCount ?? s.permissionOverageCount,
    shiftDeductions: s.shiftDeductions,
    salaryDeductionAmount: s.salaryDeductionAmount,
    hasBreakdown:
      staffPool && s.lateInCount != null && s.earlyOutCount != null && s.excessPermissionCount != null,
    lateIn: s.lateInCount ?? 0,
    earlyOut: s.earlyOutCount ?? 0,
    isProduction: !staffPool,
  };
}

// undefined (not 0) when the API didn't send the field, so "absent" stays distinguishable.
function optionalNumber(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function optionalTime(v: unknown): string | undefined {
  return typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v) ? v.slice(0, 5) : undefined;
}

function parsePolicy(raw: any): ShiftPolicy | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    morningLateInEnabled: typeof raw.morningLateInEnabled === 'boolean' ? raw.morningLateInEnabled : undefined,
    eveningEarlyOutEnabled: typeof raw.eveningEarlyOutEnabled === 'boolean' ? raw.eveningEarlyOutEnabled : undefined,
    halfDayFirstHalfEnd: optionalTime(raw.halfDayFirstHalfEnd),
    halfDaySecondHalfStart: optionalTime(raw.halfDaySecondHalfStart),
    lateWindowMinutes: optionalNumber(raw.lateWindowMinutes),
    permissionWindowMinutes: optionalNumber(raw.permissionWindowMinutes),
    arrivalExtraMinutes: optionalNumber(raw.arrivalExtraMinutes),
    arrivalQuarterDeduction: optionalNumber(raw.arrivalQuarterDeduction),
    permissionMonthlyCap: optionalNumber(raw.permissionMonthlyCap),
    freeAllowance: optionalNumber(raw.freeAllowance),
    permissionDurationMinutes: optionalNumber(raw.permissionDurationMinutes),
  };
}

/** Which Late Detection checks the company has switched on. */
export interface DetectionFlags {
  lateIn: boolean;
  earlyOut: boolean;
}

/**
 * Morning Late-In / Evening Early-Out on or off. Unknown (no policy, i.e. an older backend or
 * stats not loaded yet) counts as ON, matching how the app behaved before the policy existed.
 * The two switches are staff-only settings, so production staff always see both.
 */
export function detectionFlags(stats?: Pick<ShiftStats, 'policy' | 'employmentType'> | null): DetectionFlags {
  const p = stats?.employmentType === 'production' ? undefined : stats?.policy;
  return {
    lateIn: p?.morningLateInEnabled !== false,
    earlyOut: p?.eveningEarlyOutEnabled !== false,
  };
}

/**
 * "Late-Ins, Early-Outs and Excess permissions" -only naming the checks that are on. Production
 * staff have their own pool (late days + approved permissions, no early-outs).
 */
export function latePoolNames(flags: DetectionFlags, isProduction = false): string {
  if (isProduction) return 'Late-Ins and approved permissions';
  const names = [flags.lateIn && 'Late-Ins', flags.earlyOut && 'Early-Outs', 'Excess permissions']
    .filter(Boolean) as string[];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
}

/** HR's monthly permission limit: the company policy first, the summary's copy second. */
export function permissionLimitFromStats(stats?: ShiftStats | null): number | undefined {
  return stats?.policy?.permissionMonthlyCap ?? stats?.summary.permissionMonthlyCap;
}

const shiftsText = (n: number) => String(Number(n.toFixed(2)));

/** The two half-day windows in words, or null when the backend didn't say (then show nothing, not a guess). The current
 *  backend measures the morning half from each shift's own start and grace; an older one has only a fixed cut-off time. */
export function halfDayRule(policy?: ShiftPolicy): { morning: string; evening: string } | null {
  if (!policy?.halfDaySecondHalfStart) return null;
  const { lateWindowMinutes: late, permissionWindowMinutes: perm, arrivalExtraMinutes: extra, arrivalQuarterDeduction: q } = policy;
  let morning: string | null = null;
  if (late !== undefined && perm !== undefined && extra !== undefined && q !== undefined) {
    const notes = [`Late up to ${late} min`];
    if (perm > 0) notes.push(`excused up to ${late + perm} min with an approved Late-In permission`);
    if (q > 0) notes.push(`after that the day counts ${shiftsText(1 - q)} shift`);
    morning = `Any punch up to ${late + perm + extra} min after your grace time ends (${notes.join('; ')})`;
  } else if (policy.halfDayFirstHalfEnd) {
    morning = `Any punch before ${policy.halfDayFirstHalfEnd}`;
  }
  if (!morning) return null;
  return { morning, evening: `Any punch from ${policy.halfDaySecondHalfStart}` };
}

/** GET /attendance/employee-shift-stats — self-scoped for employee tokens. */
export function useShiftStats(month: number, year: number, options?: { staleTime?: number; enabled?: boolean }) {
  return useQuery({
    queryKey: ['employee-shift-stats', month, year],
    staleTime: options?.staleTime,
    enabled: options?.enabled ?? true,
    queryFn: async (): Promise<ShiftStats | null> => {
      try {
        const res = await api.get('/attendance/employee-shift-stats', { params: { month, year } });
        const d = res.data ?? {};
        // shiftDeductions / salaryDeductionAmount / totalEffectiveShifts come
        // back as strings (Decimal fields serialized with str() on the
        // backend) — Number() them so the `number` types here are actually
        // true at runtime, not just at compile time.
        return {
          totalLateCount: d.totalLateCount ?? 0,
          halfShiftDays: d.halfShiftDays ?? d.summary?.halfShiftDays ?? 0,
          totalEffectiveShifts: Number(d.totalEffectiveShifts ?? d.summary?.totalEffectiveShifts ?? 0),
          absentDays: d.absentDays ?? d.summary?.absentDays ?? 0,
          employmentType: typeof d.employmentType === 'string' ? d.employmentType : undefined,
          policy: parsePolicy(d.policy),
          summary: {
            shiftDeductions: Number(d.summary?.shiftDeductions ?? 0),
            salaryDeductionAmount: Number(d.summary?.salaryDeductionAmount ?? 0),
            billableLateCount: d.summary?.billableLateCount ?? 0,
            permissionsUsed: d.summary?.permissionsUsed ?? 0,
            permissionOverageCount: d.summary?.permissionOverageCount ?? 0,
            totalEffectiveShifts: d.summary?.totalEffectiveShifts != null ? Number(d.summary.totalEffectiveShifts) : undefined,
            halfShiftDays: d.summary?.halfShiftDays,
            absentDays: d.summary?.absentDays,
            lateInCount: optionalNumber(d.summary?.lateInCount),
            earlyOutCount: optionalNumber(d.summary?.earlyOutCount),
            excessPermissionCount: optionalNumber(d.summary?.excessPermissionCount),
            freeAllowance: optionalNumber(d.summary?.freeAllowance),
            permissionMonthlyCap: optionalNumber(d.summary?.permissionMonthlyCap),
          },
          dailyLogs: (Array.isArray(d.dailyLogs) ? d.dailyLogs : []).map((log: any): DailyShiftLog => ({
            ...log,
            ...readDayFlags(log),
          })),
        };
      } catch {
        return null;
      }
    },
  });
}

/**
 * Late-In / Early-Out on-or-off for screens that don't otherwise load shift stats (the calendar,
 * its legend). The policy is company-wide, so the CURRENT month's stats will do -it is the query
 * My Shift and Permissions already share, and a switch flipped by HR is not urgent, so a few
 * minutes' staleness is fine and this is normally a cache hit, not another heavy request.
 */
export function useLatePolicy(): DetectionFlags {
  const now = new Date();
  const { data } = useShiftStats(now.getMonth() + 1, now.getFullYear(), { staleTime: 5 * 60 * 1000 });
  return detectionFlags(data);
}
