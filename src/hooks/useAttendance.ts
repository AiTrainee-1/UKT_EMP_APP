import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface AttendanceRecord {
  date: string;
  status: 'Present' | 'Absent' | 'Late' | 'On Leave' | 'Holiday' | 'Weekend';
  firstIn?: string;
  lastOut?: string;
  punchCount?: number;
  source?: string;
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  records: AttendanceRecord[];
}

// Backend now returns all days of the month with an explicit `status` string.
// Status values (lowercase from Django): "present", "absent", "on_leave", "holiday", "future"
// Summary is nested under `summary` key: { present, absent, late, onLeave }
const STATUS_MAP: Record<string, AttendanceRecord['status']> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  on_leave: 'On Leave',
  holiday: 'Holiday',
  weekend: 'Holiday',
  future: 'Present', // filtered out below, placeholder
};

function transformAttendance(raw: any): AttendanceSummary {
  const records: AttendanceRecord[] = (raw.records ?? [])
    .filter((r: any) => r.status !== 'future') // exclude future days — shown as empty cells
    .map((r: any) => ({
      date: r.date,
      status: STATUS_MAP[r.status] ?? (r.present ? 'Present' : 'Absent'),
      firstIn: r.firstPunch ?? r.firstIn ?? undefined,
      lastOut: r.lastPunch ?? r.lastOut ?? undefined,
      punchCount: r.totalPunches ?? r.punchCount ?? undefined,
      source: r.source ?? undefined,
    }));

  // Support both new format (summary object) and old format (top-level totals)
  const s = raw.summary ?? {};
  return {
    present: s.present ?? raw.totalPresent ?? raw.present ?? 0,
    absent: s.absent ?? raw.totalAbsent ?? raw.absent ?? 0,
    late: s.late ?? raw.totalLate ?? raw.late ?? 0,
    onLeave: s.onLeave ?? s.on_leave ?? raw.totalOnLeave ?? raw.onLeave ?? 0,
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
