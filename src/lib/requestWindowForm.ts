// Glue between the shared request-date rule (requestWindow.ts, the same rule as the backend and the web apps) and this app's
// date-picker forms (Leave, Casual Leave, Permission, Missing Punch). Pure: `now` is passed in and must be read when the form
// is rendered / submitted, never once at module load. The server stays the authority; this only guides the employee.
//
// The import carries its `.ts` extension so Node's test runner can load this file as well (tsconfig: allowImportingTsExtensions;
// Metro resolves the exact file name first).
import { checkRequestDate, checkRequestRange, getRequestWindow, isIsoDate, windowHint } from './requestWindow.ts'
import type { RequestWindow } from './requestWindow.ts'

/** Local midnight of a YYYY-MM-DD string (what the date picker's min / max want). */
export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export type RequestPickerLimits = {
  window: RequestWindow
  /** First day the picker allows (local midnight). */
  minDate: Date
  /** Last day the picker allows (local midnight): the last day of the month, or today for `noFuture`. */
  maxDate: Date
  /** windowHint(), or missingPunchHint() for `noFuture`: the short line to show under the picker. */
  hint: string
  /** Today, held inside [min .. max]: the date a form starts with whenever it opens. */
  defaultDate: string
}

/** The hint under the Missing Punch date: the window, but ending today (a punch cannot be missed tomorrow). */
export function missingPunchHint(w: RequestWindow): string {
  // windowHint() is "<first day> to <last day>" while last month is open: keep the first day, the end is today.
  return w.graceOpen ? `${windowHint(w).split(' to ')[0]} to today` : `Any day in ${w.currentMonth}, up to today`
}

/** What a date picker needs for a request form at `now`. `noFuture`: Missing Punch (window start .. today). */
export function requestPickerLimits(now: Date, opts: { noFuture?: boolean } = {}): RequestPickerLimits {
  const w = getRequestWindow(now)
  const last = opts.noFuture ? w.today : w.max
  const defaultDate = w.today < w.min ? w.min : w.today > last ? last : w.today
  return {
    window: w,
    minDate: isoToLocalDate(w.min),
    maxDate: isoToLocalDate(last),
    hint: opts.noFuture ? missingPunchHint(w) : windowHint(w),
    defaultDate,
  }
}

/** The month (1-12) and year of a YYYY-MM-DD string, else those of `fallback` (a form whose date is empty or not a real day). */
export function monthOfDate(date: string | null | undefined, fallback: Date): { month: number; year: number } {
  if (isIsoDate(date)) return { month: Number(date.slice(5, 7)), year: Number(date.slice(0, 4)) }
  return { month: fallback.getMonth() + 1, year: fallback.getFullYear() }
}

export type RangeFieldErrors = { start: string | null; end: string | null }

/**
 * Where to show the message of a refused leave range. checkRequestRange() is the verdict; checkRequestDate() tells which end
 * is outside the window (both can be). When both ends are fine, only "end before start" is left and it belongs under End Date.
 */
export function rangeFieldErrors(start: string, end: string, now: Date): RangeFieldErrors {
  const rangeMessage = checkRequestRange(start, end, now)
  if (!rangeMessage) return { start: null, end: null }
  const startMessage = checkRequestDate(start, now)
  const endMessage = checkRequestDate(end, now)
  if (startMessage || endMessage) return { start: startMessage, end: endMessage }
  return { start: null, end: rangeMessage }
}

/** One row of GET /casual-leaves/my-eligibility `months`. */
export type MonthEligibility = { month: string; label: string; eligible: boolean; reason: string | null }

/**
 * Can casual leave be applied for at all? With the per-month list (present and not empty): when at least one month is
 * eligible. Without it (an older server): the old single yes / no, which is "yes" while it is unknown.
 */
export function casualLeaveAvailable(eligible: boolean | undefined, months: readonly MonthEligibility[] | undefined): boolean {
  return months && months.length > 0 ? months.some((m) => m.eligible) : eligible !== false
}

/** Why casual leave is closed for every month: the latest month's reason (the current month), else `fallback`. */
export function casualLeaveClosedReason(months: readonly MonthEligibility[] | undefined, fallback: string): string {
  const latest = months && months.length > 0 ? months[months.length - 1] : undefined
  return latest?.reason || fallback
}

/** The reason to show when the month of the picked date is listed and not eligible, else null (also while `months` is unknown). */
export function casualLeaveMonthBlock(date: string, months: readonly MonthEligibility[] | undefined): string | null {
  const row = months?.find((m) => m.month === date.slice(0, 7))
  if (!row || row.eligible) return null
  return row.reason || `Casual leave is not available for ${row.label}.`
}

/**
 * The date the Casual Leave sheet opens on: today, unless the month of today is listed and not eligible while an earlier month
 * of the window is still open (the grace days, the 1st and 2nd). Then the latest day of that month that is not after today
 * (its last day), so the sheet does not open on a red "not eligible" message for a month the employee did not pick.
 */
export function casualLeaveDefaultDate(now: Date, months: readonly MonthEligibility[] | undefined): string {
  const w = getRequestWindow(now)
  if (!months || casualLeaveMonthBlock(w.today, months) === null) return w.today
  for (const row of [...months].sort((a, b) => b.month.localeCompare(a.month))) {
    if (!row.eligible || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month)) continue
    const lastDay = new Date(Number(row.month.slice(0, 4)), Number(row.month.slice(5, 7)), 0).getDate()
    const end = `${row.month}-${String(lastDay).padStart(2, '0')}`
    const day = end < w.today ? end : w.today
    // Clamped into the window: a listed month the window no longer reaches is skipped.
    if (day.startsWith(row.month) && day >= w.min && day <= w.max) return day
  }
  return w.today
}
