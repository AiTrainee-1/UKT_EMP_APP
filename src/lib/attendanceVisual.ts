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

/** The part of an attendance record the visuals read (a structural subset of AttendanceRecord). */
export interface DayLike {
  date: string;
  status: string;
  isLate?: boolean;
  isEarlyOut?: boolean;
  morningPermissionExcess?: boolean;
  eveningPermissionExcess?: boolean;
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
