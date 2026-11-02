// Home's "Right now / Today's punches" panel (src/components/home/TodayPanel.tsx). Pure (no React Native), unit-tested in
// homePunches.test.ts.
//
// Today's punches as a story, labelled by WHAT each punch is ("Arrived", "Stepped out", "Came back", "Left for the day"),
// never by its position (the old 4-slot tracker filled "In / Lunch Out / Lunch In / Evening Out" by array index, so a
// day with two punches showed its second one as "Lunch Out"). A port of the Employee Web App's lib/home-punches.ts (same
// labels, same rules), plus what the phone needs on top of it:
//   - night shifts that cross midnight: punch times run on an axis past 24:00 (a 06:02 closing punch of a 22:00 night
//     sits at 30:02), so the day bar, the "time inside" and "Left for the day" all work across midnight;
//   - the shift day a night worker is still in (at 02:00 their punches belong to yesterday's record);
//   - a day off (leave, Casual Leave, holiday, weekly off), before the shift starts, and no punch at all after it.

export interface PunchLike {
  time: string;
  type: 'IN' | 'OUT' | string;
  source?: string;
  sourceLabel?: string;
  /** The server marks a night's closing punch made on the next calendar date (a production worker's 05:30). */
  nextDay?: boolean;
}

export type PunchKind = 'arrived' | 'stepped_out' | 'came_back' | 'left' | 'out' | 'in_again';

export interface PunchStep {
  key: string;
  kind: PunchKind;
  /** "Arrived", "Stepped out", ... */
  label: string;
  /** "9:05 AM" (or the server's text when it is not a clock time). */
  time: string;
  /** Minutes on the shift day's axis (since its midnight; past 1440 after midnight); null when not a clock time. */
  minutes: number | null;
  /** Where it came from: "Biometric", "Geo Punch", ... ('' when unknown). */
  source: string;
  isIn: boolean;
  /** Made after midnight, on the calendar day after the shift day. */
  nextDay: boolean;
}

export const DAY_MIN = 24 * 60;

/** Minutes since midnight of "HH:MM" or "HH:MM:SS" (24 h); null for anything else ("—", ""). */
export function minutesOf(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** "09:05" / "09:05:31" -> "9:05 AM"; anything else is returned as it came. */
export function to12h(value: string | null | undefined): string {
  const total = minutesOf(value);
  if (total == null) return String(value ?? '').trim();
  return clock12(total);
}

/** Minutes (any axis) -> "9:05 AM". */
export function clock12(minutes: number): string {
  const t = ((Math.round(minutes) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h = Math.floor(t / 60);
  const m = t % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** The shift on the shift day's axis: a night shift ends past 1440. null without both times. */
export interface ShiftWindow {
  start: number;
  end: number;
  overnight: boolean;
}

export function shiftWindow(start: string | null | undefined, end: string | null | undefined): ShiftWindow | null {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s == null || e == null) return null;
  const overnight = e <= s;
  return { start: s, end: overnight ? e + DAY_MIN : e, overnight };
}

/** "Shift A" for "A", "General Shift" as it is. */
export function shiftTitle(name: string | null | undefined): string {
  const n = String(name ?? '').trim();
  if (!n) return 'Your shift';
  return /shift/i.test(n) ? n : `Shift ${n}`;
}

/** Within this many minutes of the shift's end, a final OUT reads as "Left for the day". */
export const LEAVING_WINDOW_MIN = 60;

export const PUNCH_LABEL: Record<PunchKind, string> = {
  arrived: 'Arrived',
  stepped_out: 'Stepped out',
  came_back: 'Came back',
  left: 'Left for the day',
  out: 'Punched out',
  in_again: 'Punched in again',
};

/**
 * Labels the day's punches (oldest first, as the server sends them).
 *   first IN                      -> Arrived
 *   IN right after an OUT         -> Came back
 *   IN right after an IN          -> Punched in again
 *   OUT followed by more punches  -> Stepped out
 *   last OUT near / after shift end (or the day is over) -> Left for the day
 *   last OUT earlier in the day   -> Punched out (it could be lunch or an early exit; we do not guess)
 * Times past midnight (marked nextDay, or earlier than the punch before them) move onto the next day of the axis, so a
 * night shift's 06:02 closing punch is "near the end" of a 22:00-06:00 shift and a 23:00 break is not.
 */
export function punchStory(
  punches: readonly PunchLike[] | null | undefined,
  opts: { shiftStart?: string | null; shiftEnd?: string | null; dayIsOver?: boolean } = {},
): PunchStep[] {
  const list = punches ?? [];
  const win = shiftWindow(opts.shiftStart ?? null, opts.shiftEnd ?? null);
  const end = win ? win.end : minutesOf(opts.shiftEnd ?? null);

  // Axis minutes: monotonic through the day, a day added at each midnight crossed.
  let offset = 0;
  let prev = -1;
  const axis = list.map((p) => {
    const clock = minutesOf(p.time);
    if (clock == null) return null;
    if (p.nextDay && offset < DAY_MIN) offset = DAY_MIN;
    let at = clock + offset;
    if (at < prev) {
      offset += DAY_MIN;
      at = clock + offset;
    }
    prev = at;
    return at;
  });

  return list.map((p, i) => {
    const isIn = String(p.type).toUpperCase() === 'IN';
    const prevPunch = list[i - 1];
    const isLast = i === list.length - 1;
    const at = axis[i];
    let kind: PunchKind;
    if (isIn) {
      if (!prevPunch) kind = 'arrived';
      else kind = String(prevPunch.type).toUpperCase() === 'OUT' ? 'came_back' : 'in_again';
    } else if (!isLast) {
      kind = 'stepped_out';
    } else {
      const nearEnd = end != null && at != null && at >= end - LEAVING_WINDOW_MIN;
      kind = opts.dayIsOver || nearEnd ? 'left' : 'out';
    }
    return {
      key: `${i}-${p.time}-${p.type}`,
      kind,
      label: PUNCH_LABEL[kind],
      time: to12h(p.time),
      minutes: at,
      source: (p.sourceLabel || p.source || '').trim(),
      isIn,
      nextDay: at != null && at >= DAY_MIN,
    };
  });
}

/**
 * Where a 0..1 point of the shift is "now" ("HH:MM" start/end, minutes since midnight now). null without a shift.
 * A night shift (22:00-06:00) is half done at 02:00 and not started at 21:00 (tonight's night is next; the web's copy of
 * this function read 21:00 as "the next evening" and said the shift was over).
 */
export function shiftProgress(start: string | null | undefined, end: string | null | undefined, nowMinutes: number): number | null {
  const win = shiftWindow(start, end);
  if (!win) return null;
  let now = nowMinutes;
  // After midnight and before the night's end: still on the night that began yesterday evening.
  if (win.overnight && now < win.end - DAY_MIN) now += DAY_MIN;
  return shiftProgressAt(win, now);
}

/** The same on the shown day's axis (`axisNow`): for yesterday's night shift shown after midnight, 07:00 is "over". */
export function shiftProgressAt(win: ShiftWindow, nowAxis: number): number {
  return Math.max(0, Math.min(1, (nowAxis - win.start) / (win.end - win.start)));
}

/** "1 h 5 min", "25 min", "3 h". */
export function spanText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** Under the shift's progress bar: "Starts in 25 min", "40% of the shift done", "Shift time is over" (+ " · 11 min grace"). */
export function shiftStatusText(
  progress: number,
  opts: { start?: string | null; nowMinutes: number; graceMinutes?: number | null },
): string {
  let text: string;
  if (progress <= 0) {
    const s = minutesOf(opts.start ?? null);
    const until = s == null ? null : (((s - opts.nowMinutes) % DAY_MIN) + DAY_MIN) % DAY_MIN;
    text = until != null && until > 0 ? `Starts in ${spanText(until)}` : 'Shift not started yet';
  } else if (progress >= 1) {
    text = 'Shift time is over';
  } else {
    text = `${Math.round(progress * 100)}% of the shift done`;
  }
  const grace = opts.graceMinutes ?? 0;
  return grace > 0 ? `${text} · ${grace} min grace` : text;
}

// ── the day itself ─────────────────────────────────────────────────────────

/** The part of an attendance day record the panel reads (the mobile app's mapped record and the raw server record both fit). */
export interface DayRecordLike {
  date: string;
  status?: string | null;
  dayKind?: string | null;
  holidayName?: string | null;
  isCasualLeave?: boolean | null;
  punches?: readonly PunchLike[] | null;
}

export type DayOffKind = 'leave' | 'casual_leave' | 'holiday' | 'weekly_off';

export interface DayOff {
  kind: DayOffKind;
  /** For the presence line: "On leave today", "Holiday today (Diwali)". */
  title: string;
  /** For the small chip: "On leave", "Diwali". */
  short: string;
}

/** A day nobody expects a punch on: approved leave, Casual Leave, a declared holiday, the weekly off. null on a work day. */
export function dayOffOf(record: DayRecordLike | null | undefined): DayOff | null {
  if (!record) return null;
  // "On Leave" (mapped) and "on_leave" (raw) both become on_leave.
  const s = String(record.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (record.isCasualLeave || s === 'casual_leave') return { kind: 'casual_leave', title: 'On Casual Leave today', short: 'Casual Leave' };
  if (s === 'on_leave') return { kind: 'leave', title: 'On leave today', short: 'On leave' };
  if (record.dayKind === 'weekly_off' || s === 'weekend') return { kind: 'weekly_off', title: 'Weekly off today', short: 'Weekly off' };
  if (record.dayKind === 'holiday' || s === 'holiday') {
    const name = String(record.holidayName ?? '').trim();
    return { kind: 'holiday', title: name ? `Holiday today (${name})` : 'Holiday today', short: name || 'Holiday' };
  }
  return null;
}

/** How long after a night shift's end its punches still stand for "today" on Home. */
export const NIGHT_CARRY_MIN = 180;

/**
 * Which day's record holds the punches Home should show. Normally today's; but a night worker at 02:00 (or until three
 * hours after their night ends) is still in the shift that began yesterday, whose punches the server lists on yesterday's
 * record. Only when today's record has no punch yet and yesterday's has some.
 */
export function pickShiftDay<R extends DayRecordLike>(
  records: readonly R[] | null | undefined,
  opts: { today: string; yesterday: string; shiftStart?: string | null; shiftEnd?: string | null; nowMinutes: number },
): { record: R | null; carried: boolean } {
  const list = records ?? [];
  const today = list.find((r) => r.date === opts.today) ?? null;
  const win = shiftWindow(opts.shiftStart ?? null, opts.shiftEnd ?? null);
  if (win?.overnight && !today?.punches?.length && opts.nowMinutes < win.end - DAY_MIN + NIGHT_CARRY_MIN) {
    const yesterday = list.find((r) => r.date === opts.yesterday) ?? null;
    if (yesterday?.punches?.length) return { record: yesterday, carried: true };
  }
  return { record: today, carried: false };
}

/** "Now" on the shown day's axis: past 1440 when the shown day is yesterday's night shift. */
export function axisNow(nowMinutes: number, carried: boolean): number {
  return carried ? nowMinutes + DAY_MIN : nowMinutes;
}

/**
 * One line under the clock: "In since 9:05 AM", "Back in since 1:40 PM", "Punched out at 1:02 PM", "Left at 6:01 PM";
 * with no punch: the day off ("On leave today"), "No punch yet today", or, once the shift is over, "No punch recorded
 * today".
 */
export function presenceLine(
  steps: readonly PunchStep[],
  ctx: { dayOff?: DayOff | null; shiftStart?: string | null; shiftEnd?: string | null; nowMinutes?: number } = {},
): string {
  if (!steps.length) {
    if (ctx.dayOff) return ctx.dayOff.title;
    if (ctx.nowMinutes != null) {
      const p = shiftProgress(ctx.shiftStart, ctx.shiftEnd, ctx.nowMinutes);
      if (p != null && p >= 1) return 'No punch recorded today';
    }
    return 'No punch yet today';
  }
  const last = steps[steps.length - 1];
  if (last.isIn) {
    const firstIn = steps.find((s) => s.kind === 'arrived') ?? last;
    return last.kind === 'came_back' ? `Back in since ${last.time}` : `In since ${firstIn.time}`;
  }
  if (last.kind === 'left') return `Left at ${last.time}`;
  return `Punched out at ${last.time}`;
}

// ── the day bar ────────────────────────────────────────────────────────────

export interface DayBarModel {
  /** The axis shown, in minutes (whole hours). */
  lo: number;
  hi: number;
  span: number;
  /** The shift window, when there is a shift. */
  shift: { from: number; to: number } | null;
  /** Time inside: each IN to the OUT after it (or to now, for the last punch). */
  inside: { from: number; to: number }[];
  /** One dot per punch with a clock time. */
  dots: { key: string; at: number; isIn: boolean }[];
  /** The "now" marker, when now is on the axis. */
  now: number | null;
  ticks: number[];
}

/** The day as a bar: the axis fits the punches, now and the shift (rounded out to whole hours, 30 min of air each side). */
export function dayBarModel(
  steps: readonly PunchStep[],
  opts: { shiftStart?: string | null; shiftEnd?: string | null; nowAxis: number },
): DayBarModel {
  const win = shiftWindow(opts.shiftStart ?? null, opts.shiftEnd ?? null);
  const times = steps.map((s) => s.minutes).filter((t): t is number => t != null);
  const candidates = [...times, opts.nowAxis, ...(win ? [win.start, win.end] : [])];
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const cap = max > DAY_MIN ? 2 * DAY_MIN : DAY_MIN;
  const lo = Math.max(0, Math.floor((min - 30) / 60) * 60);
  const hi = Math.min(cap, Math.ceil((max + 30) / 60) * 60);
  const span = Math.max(60, hi - lo);

  const inside: { from: number; to: number }[] = [];
  steps.forEach((s, i) => {
    if (!s.isIn || s.minutes == null) return;
    const next = steps[i + 1];
    if (next?.isIn) return;
    const to = next ? next.minutes : opts.nowAxis;
    if (to != null && to > s.minutes) inside.push({ from: s.minutes, to });
  });

  const step = span > 10 * 60 ? 180 : span > 5 * 60 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= lo + span; t += step) ticks.push(t);

  return {
    lo,
    hi: lo + span,
    span,
    shift: win ? { from: win.start, to: win.end } : null,
    inside,
    dots: steps.filter((s) => s.minutes != null).map((s) => ({ key: s.key, at: s.minutes as number, isIn: s.isIn })),
    now: opts.nowAxis >= lo && opts.nowAxis <= lo + span ? opts.nowAxis : null,
    ticks,
  };
}

/** 0..1 along the bar for a minute on its axis (clamped to the bar). */
export function barFraction(model: Pick<DayBarModel, 'lo' | 'span'>, minute: number): number {
  return Math.max(0, Math.min(1, (minute - model.lo) / model.span));
}

/** "9 AM", "12 PM" (the axis wraps at midnight). */
export function hourLabel(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── the list ───────────────────────────────────────────────────────────────

/** Punch rows shown before "Show N earlier": the latest ones, still oldest first. */
export const PUNCH_ROWS_COLLAPSED = 4;

/** The rows to list: all of them, or (collapsed, more than `max`) the latest `max`, with how many earlier ones are hidden. */
export function visiblePunches(steps: readonly PunchStep[], expanded: boolean, max = PUNCH_ROWS_COLLAPSED): { shown: PunchStep[]; hiddenCount: number } {
  if (expanded || steps.length <= max) return { shown: [...steps], hiddenCount: 0 };
  return { shown: steps.slice(steps.length - max), hiddenCount: steps.length - max };
}

/** "Biometric · next day" under a punch row ('' when there is nothing to say). */
export function punchMeta(step: PunchStep): string {
  return [step.source, step.nextDay ? 'next day' : ''].filter(Boolean).join(' · ');
}

/** A punch in words for a screen reader: "Arrived at 9:02 AM, from Biometric". */
export function punchA11y(step: PunchStep): string {
  return `${step.label} at ${step.time}${step.nextDay ? ' the next day' : ''}${step.source ? `, from ${step.source}` : ''}`;
}

/** The whole day in words: "3 punches today: Arrived at 9:02 AM, from Biometric. Stepped out at ...". */
export function punchesA11y(steps: readonly PunchStep[]): string {
  if (!steps.length) return 'No punches today';
  const head = `${steps.length} punch${steps.length === 1 ? '' : 'es'} today`;
  return `${head}: ${steps.map(punchA11y).join('. ')}.`;
}

// ── keeping the list fresh ────────────────────────────────────────────────

/** Today's punch count from GET /attendance/geo-punch/status (polled every 30 s by the slide-to-punch bar). */
export interface GeoCount {
  date: string;
  count: number;
}

/**
 * True when the geo status shows a NEW punch for today (same date, more punches than the last time it was seen): Home then
 * re-reads the month's attendance once, so a biometric punch appears without pulling to refresh. Never on the first
 * reading and never because the two lists differ (a production night's closing punch is listed on the day the night
 * began, so they can differ for good; only growth triggers a re-read).
 */
export function geoPunchesGrew(prev: GeoCount | null | undefined, next: GeoCount | null | undefined, today: string): boolean {
  if (!prev || !next) return false;
  return next.date === today && prev.date === next.date && next.count > prev.count;
}
