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
  /** What compensation shaped the day (see readCompensationMarker). All three are absent on an older backend. */
  compensationKind?: string | null;
  compensationMinutes?: number;
  compensationNote?: string | null;
}

/**
 * The compensation marker of one attendance day: which compensation the day used, in the server's own key
 * (`ot_allowance`, `window_late_in`, `window_early_out`, `birthday`, `relaxation`, or a kind added later), the allowance
 * minutes the arrival used, and the server's one-sentence explanation. Sent by every attendance endpoint
 * (backend/api/attendance_final.py::compensation_marker_json); a day with none, or an older backend, reads as
 * `{ kind: null, minutes: 0, note: null }`. Never throws: anything that is not the promised type counts as not sent.
 */
export interface CompensationMarker {
  kind: string | null;
  minutes: number;
  note: string | null;
}

export function readCompensationMarker(raw: any): CompensationMarker {
  const r = raw ?? {};
  const kind = typeof r.compensationKind === 'string' ? r.compensationKind.trim() : '';
  const note = typeof r.compensationNote === 'string' ? r.compensationNote.trim() : '';
  const minutes = Number(r.compensationMinutes);
  return {
    kind: kind || null,
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0,
    note: note || null,
  };
}

export function readDayFlags(raw: any): DayFlags {
  const r = raw ?? {};
  const reason = typeof r.lateReason === 'string' ? r.lateReason.trim() : '';
  const comp = readCompensationMarker(r);
  return {
    compensationKind: comp.kind,
    compensationMinutes: comp.minutes,
    compensationNote: comp.note,
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
