import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface ShiftInfo {
  id: number;
  shiftName: string;
  shiftType: 'staff' | 'production';
  startTime: string;
  endTime: string;
  gracePeriod: number;
  firstHalfEnd: string | null;
  lunchDurationMinutes: number | null;
  saturdayOff: boolean;
  isCustomTime: boolean;
}

// `/shift-assignments` returns assignment *history* (an array), each entry
// pairing an employee with a ShiftTemplate plus optional per-employee
// overrides (customStartTime/customEndTime/saturdayOff). Pick the most
// recent still-active assignment and merge template + overrides.
function pickCurrentAssignment(list: any[]): any | null {
  if (!list.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const active = list.filter((a) => !a.effectiveTo || a.effectiveTo >= today);
  const pool = active.length ? active : list;
  return [...pool].sort((a, b) => {
    const cmp = String(b.effectiveFrom ?? '').localeCompare(String(a.effectiveFrom ?? ''));
    return cmp !== 0 ? cmp : (b.id ?? 0) - (a.id ?? 0);
  })[0];
}

function normalizeShift(raw: any): ShiftInfo | null {
  const assignment = Array.isArray(raw) ? pickCurrentAssignment(raw) : raw;
  if (!assignment) return null;

  const template = assignment.shift ?? assignment.shiftTemplate ?? assignment;
  const customStart = assignment.customStartTime;
  const customEnd = assignment.customEndTime;

  return {
    id: assignment.id ?? template.id,
    shiftName: template.name ?? template.shiftName ?? 'General Shift',
    shiftType: (template.shiftType ?? 'staff') as 'staff' | 'production',
    startTime: customStart ?? template.startTime ?? '—',
    endTime: customEnd ?? template.endTime ?? '—',
    gracePeriod: template.gracePeriodMinutes ?? template.gracePeriod ?? 0,
    firstHalfEnd: template.firstHalfEnd ?? null,
    lunchDurationMinutes: template.lunchDurationMinutes ?? null,
    saturdayOff: assignment.saturdayOff ?? template.saturdayOff ?? false,
    isCustomTime: !!(customStart || customEnd),
  };
}

export function useShift(employeeId: number | null) {
  return useQuery({
    queryKey: ['shift', employeeId],
    queryFn: async (): Promise<ShiftInfo | null> => {
      const res = await api.get('/shift-assignments', { params: { employeeId } });
      return normalizeShift(res.data);
    },
    enabled: !!employeeId,
  });
}
