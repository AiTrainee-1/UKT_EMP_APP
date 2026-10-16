// How an attendance day LOOKS: which colour each kind of day gets, which days carry a border mark, and the counts the
// month chart draws. Pure (no React Native), so the calendar, its legend and the chart can never disagree, and it is
// unit-tested (attendanceVisual.test.ts). The day's one-word status comes from useAttendance.ts; this file only decides
// colours and groupings from it.
//
// Rules the owner asked for:
//   * every kind of day has its own fill: Present, Absent, Half Day, Permission, On Leave, Casual Leave, Sunday, and a
//     declared Holiday (Sunday and Holiday are different colours);
//   * Late-In and Early-Out do NOT get a fill of their own: the day keeps the colour of what it was (a late Present
//     day is still green) and a RING around the cell marks it.

export type DayVisualKey =
  | 'present'
  | 'absent'
  | 'halfDay'
  | 'permission'
  | 'onLeave'
  | 'casualLeave'
  | 'sunday'
  | 'holiday';

export interface DayTone {
  /** The label shown in the legend, the day sheet and the chart. */
  label: string;
  /** Strong colour: chart segments, legend dot, the border of a day sheet badge. */
  solid: string;
  /** Soft cell background. */
  fillLight: string;
  fillDark: string;
  /** Icon / number colour on that background. */
  inkLight: string;
  inkDark: string;
  /** MaterialCommunityIcons name. */
  icon: string;
}

// Eight hues that stay apart at a glance: green, red, orange, blue, violet, teal, slate, pink.
export const DAY_TONES: Record<DayVisualKey, DayTone> = {
  present: { label: 'Present', solid: '#16A34A', fillLight: '#DCFCE7', fillDark: '#16A34A38', inkLight: '#15803D', inkDark: '#86EFAC', icon: 'check' },
  absent: { label: 'Absent', solid: '#DC2626', fillLight: '#FEE2E2', fillDark: '#DC262638', inkLight: '#B91C1C', inkDark: '#FCA5A5', icon: 'close' },
  halfDay: { label: 'Half Day', solid: '#EA580C', fillLight: '#FFEDD5', fillDark: '#EA580C38', inkLight: '#C2410C', inkDark: '#FDBA74', icon: 'circle-half-full' },
  permission: { label: 'Permission', solid: '#2563EB', fillLight: '#DBEAFE', fillDark: '#2563EB38', inkLight: '#1D4ED8', inkDark: '#93C5FD', icon: 'hand-back-right-outline' },
  onLeave: { label: 'On Leave', solid: '#7C3AED', fillLight: '#EDE9FE', fillDark: '#7C3AED38', inkLight: '#6D28D9', inkDark: '#C4B5FD', icon: 'umbrella' },
  casualLeave: { label: 'Casual Leave', solid: '#0891B2', fillLight: '#CFFAFE', fillDark: '#0891B238', inkLight: '#0E7490', inkDark: '#67E8F9', icon: 'beach' },
  sunday: { label: 'Sunday', solid: '#94A3B8', fillLight: '#E2E8F0', fillDark: '#94A3B833', inkLight: '#475569', inkDark: '#CBD5E1', icon: 'calendar-weekend-outline' },
  holiday: { label: 'Holiday', solid: '#DB2777', fillLight: '#FCE7F3', fillDark: '#DB277738', inkLight: '#BE185D', inkDark: '#F9A8D4', icon: 'party-popper' },
};

/** The border marks: not a fill, a ring (Late-In) / a second ring colour (Early-Out). */
export const RING = { late: '#D97706', earlyOut: '#4F46E5' } as const;

/** Order of the legend and of the chart's segments. */
export const OUTCOME_ORDER: DayVisualKey[] = ['present', 'halfDay', 'permission', 'casualLeave', 'onLeave', 'absent'];
export const OFF_DAY_ORDER: DayVisualKey[] = ['sunday', 'holiday'];

// ── Compensation days ───────────────────────────────────────────────────────
//
// The server marks a day that used a compensation (`compensationKind` on every attendance day, see
// backend/api/attendance_final.py::compensation_marker_json). Five kinds exist; an older backend sends none, and a newer
// one may send a kind this app has never heard of (that one is NOT drawn differently: the day keeps its status colour and
// the day sheet shows the server's own words).
//
// A compensation day is drawn SOLID (strong colour, white symbol), where every ordinary status is a soft pastel tint with a
// coloured symbol: the two families cannot be mistaken for each other whatever the hue, and each kind still has a hue and a
// symbol of its own. Late-In / Early-Out rings go on top of it as on any worked day.
//
// The hues are the gaps the status palette leaves (lime, sky, fuchsia, emerald, rose); the rings are amber and indigo, so
// none of the five is either of those.

export type CompensationKey = 'ot_allowance' | 'window_late_in' | 'window_early_out' | 'relaxation' | 'birthday';

export interface CompensationTone {
  /** Short name: legend, day sheet, month chips. */
  label: string;
  /** Strong colour: the calendar cell. White symbol and number on it. */
  solid: string;
  /** Soft tint + ink for chips on a card (light and dark ground). */
  softLight: string;
  softDark: string;
  inkLight: string;
  inkDark: string;
  /** MaterialCommunityIcons name: the symbol. Different for every kind. */
  icon: string;
}

export const COMPENSATION_TONES: Record<CompensationKey, CompensationTone> = {
  ot_allowance: { label: 'Late-in allowance', solid: '#4D7C0F', softLight: '#ECFCCB', softDark: '#65A30D38', inkLight: '#3F6212', inkDark: '#BEF264', icon: 'clock-plus-outline' },
  window_late_in: { label: 'Company late-in time', solid: '#0369A1', softLight: '#E0F2FE', softDark: '#0284C738', inkLight: '#075985', inkDark: '#7DD3FC', icon: 'clock-start' },
  window_early_out: { label: 'Company early-out time', solid: '#A21CAF', softLight: '#FAE8FF', softDark: '#C026D338', inkLight: '#86198F', inkDark: '#F0ABFC', icon: 'clock-end' },
  relaxation: { label: 'Compensation day', solid: '#047857', softLight: '#D1FAE5', softDark: '#05966938', inkLight: '#065F46', inkDark: '#6EE7B7', icon: 'sofa-outline' },
  birthday: { label: 'Birthday leave', solid: '#E11D48', softLight: '#FFE4E6', softDark: '#E11D4838', inkLight: '#BE123C', inkDark: '#FDA4AF', icon: 'cake-variant-outline' },
};

/** Order of the legend and of the month chips. */
export const COMPENSATION_ORDER: CompensationKey[] = ['ot_allowance', 'window_late_in', 'window_early_out', 'relaxation', 'birthday'];

/** What the legend says each one means (the calendar cell shows only the symbol). */
export const COMPENSATION_LEGEND: Record<CompensationKey, string> = {
  ot_allowance: 'Late-in allowance used',
  window_late_in: 'Company late-in time',
  window_early_out: 'Company early-out time',
  relaxation: 'Compensation day (relaxation)',
  birthday: 'Birthday leave (paid)',
};

/** The key of a kind this app knows, or null (no marker, an unknown kind, anything that is not a string). */
export function compensationKeyOf(kind: unknown): CompensationKey | null {
  if (typeof kind !== 'string') return null;
  const k = kind.trim().toLowerCase();
  return (COMPENSATION_ORDER as string[]).includes(k) ? (k as CompensationKey) : null;
}

/** Does the day carry any compensation marker at all (a kind this app does not know included)? */
export function hasCompensationMarker(kind: unknown): boolean {
  return typeof kind === 'string' && kind.trim() !== '';
}

/** "Birthday leave", "Late-in allowance"... and a plain "Compensation" for a kind added after this app was built. */
export function compensationLabelOf(kind: unknown): string | null {
  const key = compensationKeyOf(kind);
  if (key) return COMPENSATION_TONES[key].label;
  return hasCompensationMarker(kind) ? 'Compensation' : null;
}

/**
 * Days whose attendance is made up by the compensation itself rather than by punches: a birthday is paid whatever the
 * punches say, and a relaxation day is topped up with no punches at all. Neither is "a half day with a missing punch" or
 * "an absence to apply leave for", so the day sheet offers no such remedy for them.
 */
export function isCompensatedWholeDay(kind: unknown): boolean {
  const key = compensationKeyOf(kind);
  return key === 'relaxation' || key === 'birthday';
}

/** The part of an attendance record the visuals read (a structural subset of AttendanceRecord). */
export interface DayLike {
  date: string;
  status: string;
  isLate?: boolean;
  isEarlyOut?: boolean;
  morningPermissionExcess?: boolean;
  eveningPermissionExcess?: boolean;
  /** Optional: absent on an older backend. */
  compensationKind?: string | null;
}

export interface Detect {
  lateIn: boolean;
  earlyOut: boolean;
}

/** Which colour a day takes. Late-In / Early-Out days are the colour of an ordinary Present day. */
export function visualKeyOf(status: string): DayVisualKey {
  switch (status) {
    case 'Absent':
      return 'absent';
    case 'Half Day':
      return 'halfDay';
    case 'Permission':
      return 'permission';
    case 'On Leave':
      return 'onLeave';
    case 'Casual Leave':
      return 'casualLeave';
    case 'Weekend':
      return 'sunday';
    case 'Holiday':
      return 'holiday';
    default:
      return 'present'; // Present, Late-In, Early-Out
  }
}

/** A day worked (even in part): the only kind that can carry a Late-In / Early-Out ring. */
export function isWorkedKey(key: DayVisualKey): boolean {
  return key === 'present' || key === 'halfDay' || key === 'permission';
}

export interface DayMarks {
  /** Ring colour, or null. Late-In wins when a day is both late and early-out (the early-out then shows as a dot). */
  ring: string | null;
  /** A second mark when the day is both: a small dot in the early-out colour. */
  earlyDot: boolean;
  /** An Excess permission on the day (counts toward late deductions) that no ring already says. */
  excessDot: boolean;
}

export function marksOf(day: DayLike, detect: Detect): DayMarks {
  const key = visualKeyOf(day.status);
  if (!isWorkedKey(key)) return { ring: null, earlyDot: false, excessDot: false };
  const late = detect.lateIn && !!day.isLate;
  const early = detect.earlyOut && !!day.isEarlyOut;
  const excess = !!(day.morningPermissionExcess || day.eveningPermissionExcess);
  return {
    ring: late ? RING.late : early ? RING.earlyOut : null,
    earlyDot: late && early,
    excessDot: excess && !late,
  };
}

export type Counts = Record<DayVisualKey, number> & { late: number; earlyOut: number };

export function emptyCounts(): Counts {
  return {
    present: 0, absent: 0, halfDay: 0, permission: 0, onLeave: 0, casualLeave: 0, sunday: 0, holiday: 0,
    late: 0, earlyOut: 0,
  };
}

/** Tally of days. `today` (ISO) limits the attendance outcomes to days that have happened; Sundays and holidays
 *  count for the whole month so an upcoming holiday is visible. */
export function tally(days: DayLike[], detect: Detect, today?: string): Counts {
  const c = emptyCounts();
  for (const d of days) {
    const key = visualKeyOf(d.status);
    if (today && d.date > today && key !== 'sunday' && key !== 'holiday') continue;
    c[key] += 1;
    if (isWorkedKey(key)) {
      if (detect.lateIn && d.isLate) c.late += 1;
      if (detect.earlyOut && d.isEarlyOut) c.earlyOut += 1;
    }
  }
  return c;
}

export type CompensationCounts = Record<CompensationKey, number>;

/** How many days of each KNOWN compensation kind. `today` (ISO) leaves out days that have not happened (the server only
 *  marks a day once it has been judged, so this is a guard, not a rule). A kind this app does not know is not counted. */
export function tallyCompensation(days: DayLike[], today?: string): CompensationCounts {
  const c: CompensationCounts = { ot_allowance: 0, window_late_in: 0, window_early_out: 0, relaxation: 0, birthday: 0 };
  for (const d of days) {
    if (today && d.date > today) continue;
    const key = compensationKeyOf(d.compensationKind);
    if (key) c[key] += 1;
  }
  return c;
}

/** Days that were attended in full or part, as the share of days the employee was expected (everything but Sundays,
 *  holidays and approved leave). Half Day counts as half. Null when there is nothing to measure yet. */
export function attendanceRate(c: Counts): number | null {
  const expected = c.present + c.halfDay + c.permission + c.casualLeave + c.absent;
  if (expected === 0) return null;
  const attended = c.present + c.permission + c.casualLeave + c.halfDay * 0.5;
  return Math.round((attended / expected) * 100);
}

export interface WeekGroup {
  /** 1-based, calendar rows (Sunday first, like the calendar). */
  index: number;
  from: string;
  to: string;
  counts: Counts;
  /** Days of the outcomes (not Sundays / holidays) in the week. */
  total: number;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** The month's days split into the calendar's rows (Sunday to Saturday). */
export function weeksOf(days: DayLike[], month: number, year: number, detect: Detect, today?: string): WeekGroup[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const last = new Date(year, month, 0).getDate();
  const weeks: WeekGroup[] = [];
  let cur: DayLike[] = [];
  let from = 1;
  const flush = (to: number) => {
    if (!cur.length && from > to) return;
    const counts = tally(cur, detect, today);
    const total = OUTCOME_ORDER.reduce((n, k) => n + counts[k], 0);
    weeks.push({ index: weeks.length + 1, from: iso(year, month, from), to: iso(year, month, to), counts, total });
    cur = [];
  };
  for (let day = 1; day <= last; day++) {
    const rec = byDate.get(iso(year, month, day));
    if (rec) cur.push(rec);
    const weekday = new Date(year, month - 1, day).getDay(); // 0 = Sunday
    if (weekday === 6 || day === last) {
      flush(day);
      from = day + 1;
    }
  }
  return weeks;
}
