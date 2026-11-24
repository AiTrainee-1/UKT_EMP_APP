// The attendance day sheet (owner 2026-11-24): every punch of the day with its source, the shift the day earned, and the
// date a request form opens with when the employee goes there from the sheet. Pure; tested in dayPunches.test.ts.
import { getRequestWindow } from './requestWindow.ts';

export type PunchKind = 'biometric' | 'geo' | 'on_duty' | 'ot' | 'missing_punch' | 'hr' | 'auto';

/** One punch as GET /attendance/employee/{id} sends it in `allPunches` (backend attendance_views.all_punches_of). */
export interface DayPunchWire {
  date?: string;
  time: string;
  type: 'IN' | 'OUT' | 'OT' | string;
  source?: string | null;
  sourceLabel?: string | null;
  kind?: string | null;
  counted?: boolean;
  /** An On-Duty / OT punch's own state: pending | approved | rejected. */
  verification?: string | null;
  note?: string | null;
  nextDay?: boolean;
}

export interface DayPunchView {
  key: string;
  time: string;
  /** "In" / "Out" / "OT". */
  direction: string;
  kind: PunchKind;
  /** "Biometric", "Geo Punch", "On-Duty", "OT Punch 1", "Missing Punch", "HR entry" ... */
  source: string;
  icon: string;
  /** Under the source: "Waiting for HR", "Rejected", "Not counted · double tap", "Next day" ... */
  detail: string | null;
  /** Counted in the day's attendance (an OT punch, a waiting / rejected On-Duty punch and a double tap are not). */
  counted: boolean;
}

export const KIND_LABEL: Record<PunchKind, string> = {
  biometric: 'Biometric',
  geo: 'Geo Punch',
  on_duty: 'On-Duty',
  ot: 'OT Punch',
  missing_punch: 'Missing Punch',
  hr: 'HR entry',
  auto: 'Auto',
};

export const KIND_ICON: Record<PunchKind, string> = {
  biometric: 'fingerprint',
  geo: 'map-marker-radius-outline',
  on_duty: 'briefcase-outline',
  ot: 'clock-plus-outline',
  missing_punch: 'file-document-edit-outline',
  hr: 'account-tie-outline',
  auto: 'robot-outline',
};

/** The kind from the server, or worked out from the source on an older server. */
export function kindOf(p: Pick<DayPunchWire, 'kind' | 'source'>): PunchKind {
  const k = String(p.kind ?? '');
  if (k in KIND_LABEL) return k as PunchKind;
  const s = String(p.source ?? '');
  if (s === 'on_duty_ot') return 'ot';
  if (s.startsWith('on_duty')) return 'on_duty';
  if (s.startsWith('geo')) return 'geo';
  if (s.startsWith('missing_punch')) return 'missing_punch';
  if (s === 'manual' || s.startsWith('hr') || s === 'punch_view') return 'hr';
  if (s.startsWith('auto')) return 'auto';
  return 'biometric';
}

/** "13:05" / "13:05:09" -> "1:05 PM". */
export function time12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? '').trim());
  if (!m) return String(hhmm ?? '');
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * The punches to show, oldest first: the server's full list (`allPunches`), or - from an older server - the plain
 * attendance punches (`punches`) it always sent.
 */
export function dayPunchViews(all: readonly DayPunchWire[] | null | undefined, fallback?: readonly DayPunchWire[] | null): DayPunchView[] {
  const list = all && all.length ? all : fallback ?? [];
  return list.map((p, i) => {
    const kind = kindOf(p);
    const counted = p.counted !== false;
    const details: string[] = [];
    if (kind === 'ot') details.push(p.verification === 'approved' ? 'Overtime · approved' : 'Overtime · waiting for approval');
    else if (p.verification === 'pending') details.push('Waiting for HR');
    else if (p.verification === 'rejected') details.push('Rejected by HR');
    else if (p.note === 'double_tap') details.push('Not counted · double tap');
    else if (p.note === 'previous_shift') details.push("Previous night's shift");
    if (p.nextDay) details.push('Next day');
    const label = kind === 'ot' ? p.sourceLabel || KIND_LABEL.ot : KIND_LABEL[kind];
    return {
      key: `${p.date ?? ''}-${p.time}-${i}`,
      time: time12(p.time),
      direction: p.type === 'OT' || kind === 'ot' ? 'OT' : p.type === 'OUT' ? 'Out' : 'In',
      kind,
      source: label,
      icon: KIND_ICON[kind],
      detail: details.length ? details.join(' · ') : null,
      counted,
    };
  });
}

/** "1.00 shift", "0.50 shift", "1.50 shifts", or null when the server sent none. */
export function earnedShiftText(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n.toFixed(2)} ${n > 1 ? 'shifts' : 'shift'}`;
}

/** What the earned shift means, in a few words. */
export function earnedShiftHint(value: number | string | null | undefined): string | null {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return null;
  if (n >= 1) return 'Full day';
  if (n >= 0.75) return 'Three-quarter day';
  if (n >= 0.5) return 'Half day';
  if (n > 0) return 'Part of a day';
  return 'No shift earned';
}

/**
 * The date a request form opens with when the employee came from the attendance day sheet (`?date=YYYY-MM-DD`): that
 * day, when the forms can still take it (the request window: this month, last month on the 1st-5th, not in the future);
 * otherwise null and the form keeps its own default.
 */
export function prefillDate(param: unknown, now: Date, { allowFuture = false }: { allowFuture?: boolean } = {}): string | null {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const w = getRequestWindow(now);
  if (value < w.min || value > w.max) return null;
  if (!allowFuture && value > w.today) return null;
  return value;
}
