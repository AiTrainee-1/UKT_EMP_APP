// The Missing Punch time picker's rules (owner, 2026-10-31: "The time selection in the existing missing-punch form is
// difficult to use. Redesign it to make selecting the required time much easier."). Pure, tested in
// punchTimePicker.test.ts. A time is minutes after midnight (0..1439) everywhere here; the form sends "HH:mm".
//
// The picker offers, in order of effort:
//   1. one-tap chips for the employee's own shift times (shift start, lunch out, lunch in, shift end) and "Now" today;
//      picking a slot jumps straight to its usual time;
//   2. a big hour grid (1-12), a minute grid (00, 05 ... 55) and AM / PM;
//   3. -5 / -1 / +1 / +5 minute nudges for the exact minute.
// It never offers a time that has not happened yet today (a punch cannot be missed in the future).

export type PunchSlot = 'morning_in' | 'lunch_out' | 'lunch_in' | 'evening_out';
export type Meridiem = 'AM' | 'PM';

export const DAY_MINUTES = 24 * 60;
/** Lunch when the shift does not say: out at 1:00 PM, back 45 minutes later (the old form's fallbacks). */
export const DEFAULT_LUNCH_OUT = 13 * 60;
export const DEFAULT_LUNCH_MINUTES = 45;
const DEFAULT_START = 9 * 60;
const DEFAULT_END = 18 * 60;

/** "09:00", "9:00:00", "09:00 AM", "1:45 pm" -> minutes after midnight; null when it is not a time. */
export function parseClock(value: string | null | undefined): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?\s*$/.exec(String(value ?? ''));
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  const ap = m[3]?.toUpperCase();
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'AM') h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + min;
}

/** Minutes -> "HH:mm" (what the server takes). */
export function toHHmm(minutes: number): string {
  const v = clampMinutes(minutes);
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** Minutes -> "9:05 AM". */
export function to12hLabel(minutes: number): string {
  const { hour12, minute, meridiem } = to12h(minutes);
  return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

export function to12h(minutes: number): { hour12: number; minute: number; meridiem: Meridiem } {
  const v = clampMinutes(minutes);
  const h = Math.floor(v / 60);
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: v % 60, meridiem: h < 12 ? 'AM' : 'PM' };
}

export function from12h(hour12: number, minute: number, meridiem: Meridiem): number {
  const h = (hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
  return clampMinutes(h * 60 + minute);
}

/** Keeps a time inside the day (00:00 - 23:59): a nudge never wraps round to the day before or after. */
export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(DAY_MINUTES - 1, Math.max(0, Math.round(minutes)));
}

export function nudge(minutes: number, delta: number): number {
  return clampMinutes(minutes + delta);
}

/** The shift as far as the picker needs it (src/hooks/useShift.ts ShiftInfo). Any part may be missing. */
export type ShiftTimes = {
  startTime?: string | null;
  endTime?: string | null;
  firstHalfEnd?: string | null;
  lunchDurationMinutes?: number | null;
} | null | undefined;

export type SlotTarget = { minutes: number; fromShift: boolean };

/** The usual time of each of the day's four punches, from the shift when it says, else the company's usual times. */
export function slotTargets(shift: ShiftTimes): Record<PunchSlot, SlotTarget> {
  const start = parseClock(shift?.startTime);
  const end = parseClock(shift?.endTime);
  const lunchOut = parseClock(shift?.firstHalfEnd);
  const lunchLen = typeof shift?.lunchDurationMinutes === 'number' && shift.lunchDurationMinutes > 0
    ? shift.lunchDurationMinutes
    : null;
  const out = lunchOut ?? DEFAULT_LUNCH_OUT;
  return {
    morning_in: { minutes: start ?? DEFAULT_START, fromShift: start != null },
    lunch_out: { minutes: out, fromShift: lunchOut != null },
    lunch_in: { minutes: clampMinutes(out + (lunchLen ?? DEFAULT_LUNCH_MINUTES)), fromShift: lunchOut != null && lunchLen != null },
    evening_out: { minutes: end ?? DEFAULT_END, fromShift: end != null },
  };
}

export const SLOT_ORDER: readonly PunchSlot[] = ['morning_in', 'lunch_out', 'lunch_in', 'evening_out'];

const CHIP_LABEL: Record<PunchSlot, string> = {
  morning_in: 'Shift start',
  lunch_out: 'Lunch out',
  lunch_in: 'Lunch back',
  evening_out: 'Shift end',
};

export type TimeChip = {
  key: PunchSlot | 'now';
  label: string;
  minutes: number;
  /** The chip of the punch being reported. */
  suggested: boolean;
  /** A time later than now, today: shown but cannot be picked. */
  disabled: boolean;
};

/**
 * The one-tap chips: the four shift times (the chosen slot's first and marked "suggested"), then "Now" when the day is
 * today. `nowMinutes` is the time now when the chosen date is today, else null.
 */
export function buildTimeChips(shift: ShiftTimes, slot: PunchSlot, nowMinutes: number | null): TimeChip[] {
  const targets = slotTargets(shift);
  const ordered = [slot, ...SLOT_ORDER.filter((s) => s !== slot)];
  const chips: TimeChip[] = ordered.map((s) => ({
    key: s,
    label: CHIP_LABEL[s],
    minutes: targets[s].minutes,
    suggested: s === slot,
    disabled: nowMinutes != null && targets[s].minutes > nowMinutes,
  }));
  if (nowMinutes != null) chips.push({ key: 'now', label: 'Now', minutes: clampMinutes(nowMinutes), suggested: false, disabled: false });
  return chips;
}

/** Where the picker starts for a slot: its usual time, pulled back to now when that has not come yet today. */
export function startTimeFor(shift: ShiftTimes, slot: PunchSlot, nowMinutes: number | null): number {
  const t = slotTargets(shift)[slot].minutes;
  return nowMinutes != null && t > nowMinutes ? clampMinutes(nowMinutes) : t;
}

/** The hour grid: 1..12 (with AM/PM beside it); disabled = every minute of that hour is still to come today. */
export function hourCells(meridiem: Meridiem, nowMinutes: number | null): { hour12: number; disabled: boolean }[] {
  const order = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  return order.map((hour12) => ({
    hour12,
    disabled: nowMinutes != null && from12h(hour12, 0, meridiem) > nowMinutes,
  }));
}

/** The minute grid: 00, 05 ... 55; disabled = later than now on today's chosen hour. */
export function minuteCells(hour12: number, meridiem: Meridiem, nowMinutes: number | null): { minute: number; disabled: boolean }[] {
  return Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => ({
    minute,
    disabled: nowMinutes != null && from12h(hour12, minute, meridiem) > nowMinutes,
  }));
}

/** The minutes now on the phone when `date` (YYYY-MM-DD) is today on the phone, else null (no limit that day). */
export function nowMinutesIfToday(date: string, now: Date): number | null {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return date === today ? now.getHours() * 60 + now.getMinutes() : null;
}

/** Why a time cannot be sent (blocks submit), or null. */
export function timeProblem(minutes: number | null, nowMinutes: number | null): string | null {
  if (minutes == null) return 'Pick the time of the punch you missed.';
  if (nowMinutes != null && minutes > nowMinutes) {
    return `That time has not come yet today. Pick ${to12hLabel(nowMinutes)} or earlier.`;
  }
  return null;
}

/** A gentle "check this" when the time is far (3 h or more) from the slot's usual time; never blocks. */
export function slotTimeHint(slot: PunchSlot, minutes: number, shift: ShiftTimes): string | null {
  const target = slotTargets(shift)[slot];
  if (Math.abs(minutes - target.minutes) < 180) return null;
  const what = CHIP_LABEL[slot].toLowerCase();
  return `This is far from your usual ${what} (${to12hLabel(target.minutes)}). Please check the time and the punch you picked.`;
}

/**
 * The window the little day bar shows: from an hour before the earliest to an hour after the latest of the shift
 * times, the punches already recorded that day and the picked time, on whole hours.
 */
export function dayBarRange(points: readonly number[]): { start: number; end: number } {
  const valid = points.filter((p) => Number.isFinite(p));
  if (!valid.length) return { start: 8 * 60, end: 19 * 60 };
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  const start = Math.max(0, Math.floor((lo - 60) / 60) * 60);
  const end = Math.min(DAY_MINUTES, Math.ceil((hi + 60) / 60) * 60);
  return { start, end: end > start ? end : start + 60 };
}

/** 0..1 position of a time on the day bar. */
export function barPosition(minutes: number, range: { start: number; end: number }): number {
  return Math.min(1, Math.max(0, (minutes - range.start) / (range.end - range.start)));
}
