// The month switcher every records screen shares (owner 2026-11-02: "the same monthly filter option" the Attendance tab
// has, on Geo Punch / On-Duty, Leave, Permission, Casual Leave, Missing Punch and Outpass & Tea Break).
//
// Pure (no React Native), unit-tested in monthSwitch.test.ts. The component is src/components/MonthSwitcher.tsx; the
// filtering of a screen's rows by the chosen month is requestViews.ts (`scope`).
//
// A month is { year, month 1-12 }. Every date is read from its text ("2026-09-30" or the date part of an ISO date-time),
// never through a Date object, so a record never moves to another month because of the phone's time zone.

export type CalMonth = { year: number; month: number };

/**
 * The day(s) a record is FOR: one day ("2026-09-30" or an ISO date-time) or a [first, last] range (a leave from
 * 30 Sep to 2 Oct). Null / undefined when the record has no date.
 */
export type RowDays = string | null | undefined | readonly [string | null | undefined, string | null | undefined];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The month `today` is in (the phone's calendar). */
export function currentMonth(today: Date = new Date()): CalMonth {
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

/** { 2026, 9 } -> "2026-09" (the server's `month=` param). */
export function monthKey(m: CalMonth): string {
  return `${m.year}-${String(m.month).padStart(2, '0')}`;
}

/** "2026-09" -> { 2026, 9 }; null for anything else. */
export function parseMonthKey(value: unknown): CalMonth | null {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})$/.exec(value.trim()) : null;
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

/** The month of "2026-09-30" / "2026-09-30T23:30:00+05:30" read from the text; null when it is not a date. */
export function monthOf(value: string | null | undefined): CalMonth | null {
  const m = /^(\d{4})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

/** Negative when `a` is before `b`, 0 when the same month, positive when after. */
export function compareMonths(a: CalMonth, b: CalMonth): number {
  return a.year !== b.year ? a.year - b.year : a.month - b.month;
}

export function sameMonth(a: CalMonth | null | undefined, b: CalMonth | null | undefined): boolean {
  return !!a && !!b && a.year === b.year && a.month === b.month;
}

/** The month `delta` months after `m` (negative = before); wraps the year. */
export function shiftMonth(m: CalMonth, delta: number): CalMonth {
  const index = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** The later of two months. */
export function laterMonth(a: CalMonth, b: CalMonth): CalMonth {
  return compareMonths(a, b) >= 0 ? a : b;
}

/** "September 2026". */
export function monthLabel(m: CalMonth): string {
  return `${MONTH_NAMES[m.month - 1] ?? ''} ${m.year}`;
}

export function isCurrentMonth(m: CalMonth, today: Date = new Date()): boolean {
  return sameMonth(m, currentMonth(today));
}

/** The ‹ arrow works unless `min` is given and `m` is already at (or before) it. */
export function canGoBack(m: CalMonth, min?: CalMonth | null): boolean {
  return !min || compareMonths(m, min) > 0;
}

/** The › arrow works while `m` is before `max` (the current month unless a screen says otherwise). */
export function canGoForward(m: CalMonth, max: CalMonth): boolean {
  return compareMonths(m, max) < 0;
}

/** `m` held inside [min, max] (either end optional). */
export function clampMonth(m: CalMonth, min?: CalMonth | null, max?: CalMonth | null): CalMonth {
  if (max && compareMonths(m, max) > 0) return max;
  if (min && compareMonths(m, min) < 0) return min;
  return m;
}

/** What the second view card says for the month on screen: "This month", or "All in Sep" for any other month. */
export function monthViewLabel(m: CalMonth, today: Date = new Date()): string {
  return isCurrentMonth(m, today) ? 'This month' : `All in ${MONTH_SHORT_NAMES[m.month - 1] ?? ''}`;
}

/** The first and last day of a month as "YYYY-MM-DD". */
export function monthBounds(m: CalMonth): { first: string; last: string } {
  const prefix = monthKey(m);
  const lastDay = new Date(m.year, m.month, 0).getDate();
  return { first: `${prefix}-01`, last: `${prefix}-${String(lastDay).padStart(2, '0')}` };
}

/** The first and last day of a record as "YYYY-MM-DD" (a range written backwards is read as its first day only). */
function dayRange(days: RowDays): [string, string] | null {
  const read = (v: string | null | undefined) => {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? ''));
    return m ? m[1] : null;
  };
  if (typeof days === 'string' || days == null) {
    const d = read(days as string | null | undefined);
    return d ? [d, d] : null;
  }
  const first = read(days[0]);
  const last = read(days[1]);
  if (!first) return last ? [last, last] : null;
  return [first, last && last >= first ? last : first];
}

/** Whether a record's day(s) fall in month `m`: one day in it, or a range that overlaps it. */
export function daysTouchMonth(days: RowDays, m: CalMonth): boolean {
  const range = dayRange(days);
  if (!range) return false;
  const { first, last } = monthBounds(m);
  return range[0] <= last && range[1] >= first;
}

/** The first and last month a record touches. */
export function monthsOfDays(days: RowDays): { first: CalMonth; last: CalMonth } | null {
  const range = dayRange(days);
  if (!range) return null;
  return { first: monthOf(range[0]) as CalMonth, last: monthOf(range[1]) as CalMonth };
}

/**
 * The month to open so a record is on screen (a notification about it): the month already on screen when the record
 * touches it (never switch needlessly), else the record's first month. Null when the record has no date.
 */
export function monthToShow(days: RowDays, selected: CalMonth): CalMonth | null {
  if (daysTouchMonth(days, selected)) return { year: selected.year, month: selected.month };
  return monthsOfDays(days)?.first ?? null;
}

/** The last month any of `rows` touches (null when none has a date). */
export function latestMonthOf<T>(rows: readonly T[], daysOf: (row: T) => RowDays): CalMonth | null {
  let latest: CalMonth | null = null;
  for (const row of rows) {
    const last = monthsOfDays(daysOf(row))?.last;
    if (last && (!latest || compareMonths(last, latest) > 0)) latest = last;
  }
  return latest;
}
