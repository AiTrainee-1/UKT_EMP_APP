import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface DailyShiftLog {
  date: string;
  firstPunch?: string | null;
  lastPunch?: string | null;
  status: string;
  isLate?: boolean;
}

export interface ShiftStatsSummary {
  shiftDeductions: number;
  salaryDeductionAmount: number;
  billableLateCount: number;
  permissionsUsed: number;
  permissionOverageCount: number;
  totalEffectiveShifts?: number;
  halfShiftDays?: number;
  absentDays?: number;
}

export interface ShiftStats {
  totalLateCount: number;
  halfShiftDays: number;
  totalEffectiveShifts: number;
  absentDays: number;
  summary: ShiftStatsSummary;
  dailyLogs: DailyShiftLog[];
}

/** GET /attendance/employee-shift-stats — self-scoped for employee tokens. */
export function useShiftStats(month: number, year: number) {
  return useQuery({
    queryKey: ['employee-shift-stats', month, year],
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
          summary: {
            shiftDeductions: Number(d.summary?.shiftDeductions ?? 0),
            salaryDeductionAmount: Number(d.summary?.salaryDeductionAmount ?? 0),
            billableLateCount: d.summary?.billableLateCount ?? 0,
            permissionsUsed: d.summary?.permissionsUsed ?? 0,
            permissionOverageCount: d.summary?.permissionOverageCount ?? 0,
            totalEffectiveShifts: d.summary?.totalEffectiveShifts != null ? Number(d.summary.totalEffectiveShifts) : undefined,
            halfShiftDays: d.summary?.halfShiftDays,
            absentDays: d.summary?.absentDays,
          },
          dailyLogs: d.dailyLogs ?? [],
        };
      } catch {
        return null;
      }
    },
  });
}
