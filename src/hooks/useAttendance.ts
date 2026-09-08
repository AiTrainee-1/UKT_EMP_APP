import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface AttendancePunch {
  time: string;
  type: 'IN' | 'OUT';
  source: string;
  sourceLabel: string;
}

export interface AttendanceRecord {
  date: string;
  status: 'Present' | 'Absent' | 'Late' | 'On Leave' | 'Holiday' | 'Weekend' | 'Half Shift' | 'Permission';
  isLate?: boolean;
  isHalfShift?: boolean;
  /** Auto-detected Permission zone (morning/afternoon/departure) — set purely
   *  from punch timing by the backend, independent of a submitted request.
   *  See `permissionWithRequest` for whether one also covers it. */
  isPermission?: boolean;
  permissionWithRequest?: boolean;
  /** HR announced this day as a Compensation Day (festival/special day) —
   *  Late/Permission penalties are exempted, but Full/Half Shift is still
   *  judged from real punches, never auto-granted. */
  isCompensationDay?: boolean;
  firstIn?: string;
  lastOut?: string;
  punchCount?: number;
  source?: string;
  punches?: AttendancePunch[];
}

export interface AttendanceSummary {
  /** Elapsed days this month excluding holidays — the denominator the
   *  other five figures are read against. */
  workingDays: number;
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  halfShift: number;
  records: AttendanceRecord[];
}

// Backend returns the canonical per-day verdict from the same engine payroll
// and the HR portal's Attendance Search use (compute_day_record), so this
// mobile app can never disagree with HRMS on Present / Half Shift / Late.
// Status values (lowercase from Django): "present", "half_shift", "absent", "on_leave", "holiday", "future"
// `isLate` is a separate flag — a day can be both "half_shift" AND late at
// once (HRMS shows these as two independent checkmarks); since this mobile
// calendar shows one status per day, "half_shift" wins (it's the more
// specific outcome) and a late arrival on an otherwise-Present day is shown
// as "Late" — `isLate` itself is still exposed on the record for callers
// that want to show both facts (e.g. a small late-arrival indicator).
// Summary is nested under `summary` key: { present, halfShift, absent, late, onLeave }
const STATUS_MAP: Record<string, AttendanceRecord['status']> = {
  present: 'Present',
  half_shift: 'Half Shift',
  absent: 'Absent',
  on_leave: 'On Leave',
  holiday: 'Holiday',
  weekend: 'Holiday',
  future: 'Present', // filtered out below, placeholder
};

function transformAttendance(raw: any): AttendanceSummary {
  const records: AttendanceRecord[] = (raw.records ?? [])
    .filter((r: any) => r.status !== 'future') // exclude future days — shown as empty cells
    .map((r: any) => {
      let status = STATUS_MAP[r.status] ?? (r.present ? 'Present' : 'Absent');
      const isPermission = !!(r.permissionMorning || r.permissionAfternoon || r.permissionDeparture);
      const permissionWithRequest = !!(r.permissionMorningWithRequest || r.permissionAfternoonWithRequest || r.permissionDepartureWithRequest);
      if (status === 'Present' && isPermission) status = 'Permission';
      else if (status === 'Present' && r.isLate) status = 'Late';
      return {
        date: r.date,
        status,
        isLate: !!r.isLate,
        isHalfShift: !!r.isHalfShift,
        isPermission,
        permissionWithRequest,
        isCompensationDay: !!r.isCompensationDay,
        firstIn: r.firstPunch ?? r.firstIn ?? undefined,
        lastOut: r.lastPunch ?? r.lastOut ?? undefined,
        punchCount: r.totalPunches ?? r.punchCount ?? undefined,
        source: r.source ?? undefined,
        punches: r.punches ?? undefined,
      };
    });

  // Support both new format (summary object) and old format (top-level totals)
  const s = raw.summary ?? {};
  return {
    // Falls back to counting non-holiday records so an older backend that
    // doesn't send workingDays yet still shows a sensible number.
    workingDays: s.workingDays ?? s.working_days
      ?? records.filter((r) => r.status !== 'Holiday').length,
    present: s.present ?? raw.totalPresent ?? raw.present ?? 0,
    absent: s.absent ?? raw.totalAbsent ?? raw.absent ?? 0,
    late: s.late ?? raw.totalLate ?? raw.late ?? 0,
    onLeave: s.onLeave ?? s.on_leave ?? raw.totalOnLeave ?? raw.onLeave ?? 0,
    halfShift: s.halfShift ?? s.half_shift ?? raw.totalHalfShift
      ?? records.filter((r) => r.status === 'Half Shift').length,
    records,
  };
}

export function useAttendance(employeeId: number | null, month: number, year: number) {
  return useQuery({
    queryKey: ['attendance', employeeId, month, year],
    queryFn: async () => {
      const res = await api.get(`/attendance/employee/${employeeId}`, {
        params: { month, year },
      });
      return transformAttendance(res.data);
    },
    enabled: !!employeeId,
  });
}
