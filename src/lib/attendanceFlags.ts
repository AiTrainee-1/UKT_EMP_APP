// The Late Detection / Permission flags of one attendance day, read the same
// way for every endpoint that carries them (GET /attendance/employee/:id
// `records[]` and GET /attendance/employee-shift-stats `dailyLogs[]`).
//
// Two generations of keys are sent on purpose (see
// backend/api/attendance_final.py::permission_flags_json):
//   * current: morningPermissionApplied / eveningPermissionApplied (an Allowed
//     permission moved that edge today), morningPermissionExcess /
//     eveningPermissionExcess (approved but beyond the monthly limit, so it
//     did NOT protect the day), middlePermissionToday, isEarlyOut;
//   * old, and what an older backend still sends: permissionMorning /
//     permissionDeparture, which the new ones mirror.
// Every new key is optional, so each read falls back to the old one -an app
// installed before the backend update keeps working, and vice versa.

export interface DayFlags {
  isLate: boolean;
  isEarlyOut: boolean;
  isHalfShift: boolean;
  morningPermissionApplied: boolean;
  eveningPermissionApplied: boolean;
  morningPermissionExcess: boolean;
  eveningPermissionExcess: boolean;
  middlePermissionToday: boolean;
  /** Strict mode's auto-detected lunch-return permission zone (untouched by the rewrite). */
  permissionAfternoon: boolean;
  /** Why the day was flagged, in the server's words. Only some endpoints send it. */
  lateReason?: string;
}

export function readDayFlags(raw: any): DayFlags {
  const r = raw ?? {};
  const reason = typeof r.lateReason === 'string' ? r.lateReason.trim() : '';
  return {
    isLate: !!r.isLate,
    isEarlyOut: !!(r.isEarlyOut ?? r.earlyLeave),
    isHalfShift: !!r.isHalfShift,
    morningPermissionApplied: !!(r.morningPermissionApplied ?? r.permissionMorning),
    eveningPermissionApplied: !!(r.eveningPermissionApplied ?? r.permissionDeparture),
    morningPermissionExcess: !!r.morningPermissionExcess,
    eveningPermissionExcess: !!r.eveningPermissionExcess,
    middlePermissionToday: !!r.middlePermissionToday,
    permissionAfternoon: !!r.permissionAfternoon,
    lateReason: reason || undefined,
  };
}
