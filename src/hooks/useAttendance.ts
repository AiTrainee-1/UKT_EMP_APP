import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { readDayFlags } from '../lib/attendanceFlags';

export interface AttendancePunch {
  time: string;
  type: 'IN' | 'OUT';
  source: string;
  sourceLabel: string;
}

export interface AttendanceRecord {
  date: string;
  /** One word per day for the calendar cell. When several things hold, the one that costs the
   *  employee most wins (Half Day > Late-In > Early-Out > Permission); the rest stay readable
   *  through the flags below. */
  status: 'Present' | 'Absent' | 'Late-In' | 'Early-Out' | 'On Leave' | 'Casual Leave' | 'Holiday' | 'Weekend' | 'Half Day' | 'Permission';
  /** "Holiday" for a declared holiday, "Weekend" for a Sunday off (staff): the calendar colours them apart. */
  dayKind?: 'holiday' | 'weekly_off' | null;
  /** The declared holiday's name and type (national / regional / company), when `dayKind` is "holiday". */
  holidayName?: string;
  holidayType?: string;
  /** An approved Casual Leave day (the server stores it as a Present day, so only this flag tells it apart). */
  isCasualLeave?: boolean;
  /** Morning Late-In: first punch after the (permission-adjusted) shift start + grace. */
  isLate?: boolean;
  /** Evening Early-Out: last punch before the (permission-adjusted) shift end - grace. Only
   *  ever set while the company has that check switched on. */
  isEarlyOut?: boolean;
  isHalfShift?: boolean;
  /** An Allowed permission moved that edge of the day (Morning Late-In: shift start 1h later,
   *  Evening Early-Out: shift end 1h earlier). Falls back on the old permissionMorning /
   *  permissionDeparture keys. */
  morningPermissionApplied?: boolean;
  eveningPermissionApplied?: boolean;
  /** Approved, but beyond the month's limit: it did NOT protect the day and counts as one
   *  occurrence toward late deductions. */
  morningPermissionExcess?: boolean;
  eveningPermissionExcess?: boolean;
  /** A Middle One-Hour permission was approved for the day (never moves anything). */
  middlePermissionToday?: boolean;
  /** Why the day was flagged, in the server's words -only when the endpoint sends it. */
  lateReason?: string;
  /** Something protective covered the day: an applied permission, or strict mode's
   *  auto-detected lunch-return zone. */
  isPermission?: boolean;
  permissionAfternoon?: boolean;
  permissionWithRequest?: boolean;
  /** HR announced this day as a Compensation Day (festival/special day) —
   *  Late/Permission penalties are exempted, but Full/Half Day is still
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
// mobile app can never disagree with HRMS on Present / Half Day / Late-In.
// Status values (lowercase from Django): "present", "half_shift", "absent", "on_leave", "holiday", "future"
// `isLate` / `isEarlyOut` are separate flags — a day can be both "half_shift" AND late at
// once (HRMS shows these as independent checkmarks); since this mobile
// calendar shows one status per day, "half_shift" wins (it's the more
// specific outcome) and a late arrival / early leave on an otherwise-Present
// day is shown as "Late-In" / "Early-Out" — the flags themselves are still
// exposed on the record for callers that want to show every fact (chips in
// the calendar's day detail).
// Summary is nested under `summary` key: { present, halfShift, absent, late, onLeave }
const STATUS_MAP: Record<string, AttendanceRecord['status']> = {
  present: 'Present',
  half_shift: 'Half Day',
  absent: 'Absent',
  on_leave: 'On Leave',
  holiday: 'Holiday',
  weekend: 'Holiday',
  future: 'Present', // filtered out below, placeholder
};

/** 'YYYY-MM-DD' is a Sunday (calendar date, no time zone involved). */
function isSundayIso(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay() === 0;
}

function transformAttendance(raw: any): AttendanceSummary {
  const records: AttendanceRecord[] = (raw.records ?? [])
    // Future days are empty cells, except a holiday / Sunday off / approved Casual Leave: those show ahead of time.
    .filter((r: any) => r.status !== 'future' || !!r.dayKind || !!r.isCasualLeave)
    .map((r: any) => {
      let status = STATUS_MAP[r.status] ?? (r.present ? 'Present' : 'Absent');
      const dayKind: AttendanceRecord['dayKind'] = r.dayKind === 'holiday' || r.dayKind === 'weekly_off' ? r.dayKind : null;
      if (r.status === 'future') status = dayKind ? 'Holiday' : 'Casual Leave'; // all that gets this far (see the filter)
      // A day off the server marked as a Sunday is "Weekend" (its own colour); an older server sends no dayKind, so a
      // Sunday with no holiday name is read as the weekly off.
      if (status === 'Holiday' && (dayKind === 'weekly_off' || (!dayKind && isSundayIso(r.date)))) status = 'Weekend';
      // New keys with the old ones as fallback: an older backend only sends
      // permissionMorning / permissionDeparture (the new ones mirror them).
      const f = readDayFlags(r);
      const isPermission = f.morningPermissionApplied || f.eveningPermissionApplied || f.permissionAfternoon;
      const permissionWithRequest = !!(
        (r.morningPermissionApplied ?? r.permissionMorningWithRequest)
        || (r.eveningPermissionApplied ?? r.permissionDepartureWithRequest)
        || r.permissionAfternoonWithRequest
      );
      // A late / early day outranks "Permission": it is an occurrence in the monthly late pool
      // even when a permission moved the boundary (the employee was late for the moved one).
      if (status === 'Present' && r.isCasualLeave) status = 'Casual Leave';
      else if (status === 'Present') {
        if (f.isLate) status = 'Late-In';
        else if (f.isEarlyOut) status = 'Early-Out';
        else if (isPermission) status = 'Permission';
      }
      return {
        date: r.date,
        status,
        dayKind,
        holidayName: typeof r.holidayName === 'string' && r.holidayName ? r.holidayName : undefined,
        holidayType: typeof r.holidayType === 'string' && r.holidayType ? r.holidayType : undefined,
        isCasualLeave: !!r.isCasualLeave,
        isLate: f.isLate,
        isEarlyOut: f.isEarlyOut,
        isHalfShift: f.isHalfShift,
        morningPermissionApplied: f.morningPermissionApplied,
        eveningPermissionApplied: f.eveningPermissionApplied,
        morningPermissionExcess: f.morningPermissionExcess,
        eveningPermissionExcess: f.eveningPermissionExcess,
        middlePermissionToday: f.middlePermissionToday,
        lateReason: f.lateReason,
        isPermission,
        permissionAfternoon: f.permissionAfternoon,
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
      ?? records.filter((r) => r.status !== 'Holiday' && r.status !== 'Weekend').length,
    present: s.present ?? raw.totalPresent ?? raw.present ?? 0,
    absent: s.absent ?? raw.totalAbsent ?? raw.absent ?? 0,
    late: s.late ?? raw.totalLate ?? raw.late ?? 0,
    onLeave: s.onLeave ?? s.on_leave ?? raw.totalOnLeave ?? raw.onLeave ?? 0,
    halfShift: s.halfShift ?? s.half_shift ?? raw.totalHalfShift
      ?? records.filter((r) => r.status === 'Half Day').length,
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
