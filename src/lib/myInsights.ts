// Home "My Insights" (owner 2026-11-25). Pure (no React Native), unit-tested in myInsights.test.ts.
//
// The server only COUNTS (GET /my/analytics?months=6, backend api/mobile_analytics.py: the stored day records, approved
// requests, On-Duty sessions and salary slips, month by month). This file reads that reply defensively, adds the months
// up, works out the attendance health score (0-100 with a plain-words grade) and words the short sentences Home shows:
//   * a missing or wrong-typed figure reads as 0 (a count) or null (an average / a pay figure), never throws;
//   * a malformed reply as a whole is null, which the hook turns into an error state with a Retry button.

import { HIDDEN_AMOUNT } from './homeAttention.ts';
import { formatInr, formatInrShort } from './salaryInsights.ts';

// ── small readers ───────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const num0 = (v: unknown): number => Math.max(0, numOrNull(v) ?? 0);
const obj = (v: unknown): Record<string, unknown> => (isObject(v) ? v : {});

// ── the reply ───────────────────────────────────────────────────────────────

export interface InsightsDays {
  /** Days with a stored verdict (today only once punched). */
  recorded: number;
  /** recorded - holidays (a staff Sunday is a holiday). */
  working: number;
  present: number;
  half: number;
  absent: number;
  /** Leave days (a half-day leave = 0.5). */
  leave: number;
  holidays: number;
}

export interface InsightsPunctuality {
  /** Present / half days with a first punch. */
  arrivals: number;
  onTime: number;
  late: number;
  /** "09:04": the average first punch (null when none could be averaged). */
  avgArrival: string | null;
  /** Average minutes after the shift start (negative = early), null without a shift. */
  avgArrivalDelta: number | null;
}

export interface InsightsSalary {
  earned: number;
  /** Lost to attendance (days not paid + late + permission). null = the slip does not record it. */
  lost: number | null;
  net: number;
  /** The fixed monthly salary (staff); null for production pay. */
  allocated: number | null;
  otPay: number;
  slips: number;
}

export interface InsightsMonth {
  key: string;
  year: number;
  month: number;
  label: string;
  shortLabel: string;
  current: boolean;
  days: InsightsDays;
  punctuality: InsightsPunctuality;
  earlyOut: { days: number; minutes: number };
  overtimeMinutes: number;
  onDutyDays: number;
  permissions: number;
  casualLeave: number;
  salary: InsightsSalary | null;
}

export interface InsightsShift {
  name: string;
  start: string | null;
  end: string | null;
  graceMinutes: number | null;
}

export interface MyInsights {
  employmentType: string;
  today: string;
  months: number;
  shift: InsightsShift | null;
  /** Oldest first; the last one is the current month. */
  periods: InsightsMonth[];
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function normalizeMonth(raw: Record<string, unknown>): InsightsMonth | null {
  const year = numOrNull(raw.year);
  const month = numOrNull(raw.month);
  if (year == null || month == null || month < 1 || month > 12) return null;
  const d = obj(raw.days);
  const p = obj(raw.punctuality);
  const e = obj(raw.earlyOut);
  const s = isObject(raw.salary) ? raw.salary : null;
  const recorded = num0(d.recorded);
  const holidays = num0(d.holidays);
  const shortLabel = str(raw.shortLabel) || MONTH_ABBR[month - 1];
  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
    label: str(raw.label) || `${shortLabel} ${year}`,
    shortLabel,
    current: raw.current === true,
    days: {
      recorded,
      working: d.working == null ? Math.max(0, recorded - holidays) : num0(d.working),
      present: num0(d.present),
      half: num0(d.half),
      absent: num0(d.absent),
      leave: num0(d.leave),
      holidays,
    },
    punctuality: {
      arrivals: num0(p.arrivals),
      onTime: num0(p.onTime),
      late: num0(p.late),
      avgArrival: /^\d{2}:\d{2}$/.test(str(p.avgArrival)) ? str(p.avgArrival) : null,
      avgArrivalDelta: numOrNull(p.avgArrivalDelta),
    },
    earlyOut: { days: num0(e.days), minutes: num0(e.minutes) },
    overtimeMinutes: num0(raw.overtimeMinutes),
    onDutyDays: num0(raw.onDutyDays),
    permissions: num0(raw.permissions),
    casualLeave: num0(raw.casualLeave),
    salary: s
      ? {
          earned: num0(s.earned),
          lost: numOrNull(s.lost),
          net: numOrNull(s.net) ?? 0,
          allocated: numOrNull(s.allocated),
          otPay: num0(s.otPay),
          slips: num0(s.slips),
        }
      : null,
  };
}

/** The reply of GET /my/analytics, or null when it is not one (the hook shows an error with Retry). */
export function normalizeMyInsights(raw: unknown): MyInsights | null {
  if (!isObject(raw) || !Array.isArray(raw.periods)) return null;
  const periods = raw.periods
    .filter(isObject)
    .map(normalizeMonth)
    .filter((m): m is InsightsMonth => m !== null)
    .sort((a, b) => a.year - b.year || a.month - b.month);
  // Exactly one current month: the newest, when the server did not say.
  if (periods.length && !periods.some((m) => m.current)) periods[periods.length - 1].current = true;
  const sh = isObject(raw.shift) ? raw.shift : null;
  return {
    employmentType: str(raw.employmentType) || 'staff',
    today: str(raw.today),
    months: numOrNull(raw.months) ?? periods.length,
    shift: sh
      ? {
          name: str(sh.name) || 'Shift',
          start: str(sh.start) || null,
          end: str(sh.end) || null,
          graceMinutes: numOrNull(sh.graceMinutes),
        }
      : null,
    periods,
  };
}

// ── per month ───────────────────────────────────────────────────────────────

/** Present days + half of the half days. */
export function attendedDays(days: InsightsDays): number {
  return days.present + days.half / 2;
}

/** Attended out of working days, 0-100 (one decimal), or null when there were no working days. */
export function attendancePct(days: InsightsDays): number | null {
  if (days.working <= 0) return null;
  return Math.round(Math.min(1, attendedDays(days) / days.working) * 1000) / 10;
}

/** On-time arrivals out of all arrivals, 0-100 (one decimal), or null when there were none. */
export function onTimePct(p: InsightsPunctuality): number | null {
  if (p.arrivals <= 0) return null;
  return Math.round(Math.min(1, p.onTime / p.arrivals) * 1000) / 10;
}

export function currentMonth(data: MyInsights | null | undefined): InsightsMonth | null {
  if (!data?.periods.length) return null;
  return data.periods.find((m) => m.current) ?? data.periods[data.periods.length - 1];
}

/** The months a view covers: just the current one, or the whole window. */
export type InsightsScope = 'month' | 'window';
export function periodsFor(data: MyInsights | null | undefined, scope: InsightsScope): InsightsMonth[] {
  if (!data) return [];
  if (scope === 'window') return data.periods;
  const cur = currentMonth(data);
  return cur ? [cur] : [];
}

// ── totals ──────────────────────────────────────────────────────────────────

export interface InsightsTotals {
  months: number;
  working: number;
  attended: number;
  present: number;
  half: number;
  absent: number;
  leave: number;
  holidays: number;
  arrivals: number;
  onTime: number;
  late: number;
  /** Average minutes after the shift start over the months, weighted by each month's arrivals (null without any). */
  avgArrivalDelta: number | null;
  earlyOutDays: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  onDutyDays: number;
  permissions: number;
  casualLeave: number;
  /** Pay over the months that have a slip. */
  salaryMonths: number;
  earned: number;
  lost: number;
}

export function totalsOf(periods: readonly InsightsMonth[]): InsightsTotals {
  const t: InsightsTotals = {
    months: periods.length,
    working: 0, attended: 0, present: 0, half: 0, absent: 0, leave: 0, holidays: 0,
    arrivals: 0, onTime: 0, late: 0, avgArrivalDelta: null,
    earlyOutDays: 0, earlyOutMinutes: 0, overtimeMinutes: 0, onDutyDays: 0, permissions: 0, casualLeave: 0,
    salaryMonths: 0, earned: 0, lost: 0,
  };
  let deltaSum = 0;
  let deltaWeight = 0;
  for (const m of periods) {
    t.working += m.days.working;
    t.attended += attendedDays(m.days);
    t.present += m.days.present;
    t.half += m.days.half;
    t.absent += m.days.absent;
    t.leave += m.days.leave;
    t.holidays += m.days.holidays;
    t.arrivals += m.punctuality.arrivals;
    t.onTime += m.punctuality.onTime;
    t.late += m.punctuality.late;
    if (m.punctuality.avgArrivalDelta != null) {
      const w = Math.max(1, m.punctuality.arrivals);
      deltaSum += m.punctuality.avgArrivalDelta * w;
      deltaWeight += w;
    }
    t.earlyOutDays += m.earlyOut.days;
    t.earlyOutMinutes += m.earlyOut.minutes;
    t.overtimeMinutes += m.overtimeMinutes;
    t.onDutyDays += m.onDutyDays;
    t.permissions += m.permissions;
    t.casualLeave += m.casualLeave;
    if (m.salary) {
      t.salaryMonths += 1;
      t.earned += m.salary.earned;
      t.lost += m.salary.lost ?? 0;
    }
  }
  if (deltaWeight > 0) t.avgArrivalDelta = Math.round((deltaSum / deltaWeight) * 10) / 10;
  return t;
}

// ── the health score ────────────────────────────────────────────────────────

/** How much each part counts. Showing up matters most; approved leave never counts against anyone. */
export const SCORE_WEIGHTS = { attendance: 60, punctuality: 25, fullDays: 15 } as const;

export interface ScoreParts {
  /** Days attended out of the days due (working days - approved leave), 0-100. */
  attendance: number | null;
  /** Arrivals on time, 0-100. */
  punctuality: number | null;
  /** Arrival days with no early out, 0-100. */
  fullDays: number | null;
}

export type ScoreTone = 'great' | 'good' | 'fair' | 'low' | 'none';

export interface HealthScore {
  /** 0-100, or null while there is nothing to score. */
  score: number | null;
  grade: string;
  tone: ScoreTone;
  /** One plain sentence: what is going well or what holds the score back. */
  summary: string;
  parts: ScoreParts;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const pct1 = (v: number) => Math.round(clamp01(v) * 1000) / 10;

export function scoreParts(t: InsightsTotals): ScoreParts {
  const due = t.working - t.leave;
  return {
    attendance: due > 0 ? pct1(t.attended / due) : null,
    punctuality: t.arrivals > 0 ? pct1(t.onTime / t.arrivals) : null,
    fullDays: t.arrivals > 0 ? pct1(1 - Math.min(t.earlyOutDays, t.arrivals) / t.arrivals) : null,
  };
}

export function gradeFor(score: number | null): { grade: string; tone: ScoreTone } {
  if (score == null) return { grade: 'No data yet', tone: 'none' };
  if (score >= 90) return { grade: 'Excellent', tone: 'great' };
  if (score >= 75) return { grade: 'Good', tone: 'good' };
  if (score >= 60) return { grade: 'Fair', tone: 'fair' };
  return { grade: 'Needs attention', tone: 'low' };
}

const WEAK_PART_TEXT: Record<keyof ScoreParts, string> = {
  attendance: 'Missed days are pulling your score down.',
  punctuality: 'Late arrivals are pulling your score down.',
  fullDays: 'Leaving early is pulling your score down.',
};

export function healthScore(periods: readonly InsightsMonth[]): HealthScore {
  const parts = scoreParts(totalsOf(periods));
  if (parts.attendance == null) {
    return {
      score: null,
      grade: 'No data yet',
      tone: 'none',
      summary: 'Your score appears once you have working days in this period.',
      parts,
    };
  }
  let sum = 0;
  let weight = 0;
  (Object.keys(SCORE_WEIGHTS) as (keyof ScoreParts)[]).forEach((k) => {
    const v = parts[k];
    if (v == null) return;
    sum += SCORE_WEIGHTS[k] * v;
    weight += SCORE_WEIGHTS[k];
  });
  const score = Math.round(sum / weight);
  const { grade, tone } = gradeFor(score);
  let summary: string;
  if (tone === 'great') {
    summary = 'Excellent attendance and timekeeping. Keep it up!';
  } else {
    // The weakest part (first one on a tie, in weight order) is what to work on.
    let weakest: keyof ScoreParts = 'attendance';
    (Object.keys(SCORE_WEIGHTS) as (keyof ScoreParts)[]).forEach((k) => {
      const v = parts[k];
      const w = parts[weakest];
      if (v != null && (w == null || v < w)) weakest = k;
    });
    summary = (tone === 'good' ? 'Good going. ' : '') + WEAK_PART_TEXT[weakest];
  }
  return { score, grade, tone, summary, parts };
}

// ── wording ─────────────────────────────────────────────────────────────────

/** 2 -> "2", 1.5 -> "1.5", 1.25 -> "1.3". */
export function countText(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 10) / 10);
}

/** "1 day", "2 days", "1.5 days". */
export function daysText(n: number): string {
  return `${countText(n)} ${n === 1 ? 'day' : 'days'}`;
}

/** 92.4 -> "92%", null -> "—". */
export function pctText(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '—' : `${Math.round(v)}%`;
}

/** 45 -> "45 min", 90 -> "1.5 h", 750 -> "12.5 h", 0 -> "0 h". */
export function durationText(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 h';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${countText(minutes / 60)} h`;
}

/** -6 -> "6 min early", 4.4 -> "4 min late", 0.3 -> "right on time". */
export function arrivalText(delta: number | null | undefined): string {
  if (delta == null || !Number.isFinite(delta)) return '—';
  const m = Math.round(Math.abs(delta));
  if (m < 1) return 'right on time';
  return `${m} min ${delta < 0 ? 'early' : 'late'}`;
}

export type InsightTone = 'good' | 'warn' | 'bad' | 'info';

export interface InsightLine {
  key: string;
  /** A MaterialCommunityIcons name. */
  icon: string;
  tone: InsightTone;
  text: string;
}

/** The month before the current one that has working days (what "last month" compares with). */
function previousMonth(data: MyInsights): InsightsMonth | null {
  const idx = data.periods.findIndex((m) => m.current);
  for (let i = (idx < 0 ? data.periods.length - 1 : idx) - 1; i >= 0; i--) {
    if (data.periods[i].days.working > 0) return data.periods[i];
  }
  return null;
}

/**
 * The short sentences under the score, most useful first: "On time 18 of 21 days this month", attendance against last
 * month, the average arrival, early outs, overtime, On-Duty days and the latest pay lost to attendance (masked while the
 * salary eye on Home is closed).
 */
export function insightLines(data: MyInsights | null | undefined, hidden: boolean): InsightLine[] {
  if (!data) return [];
  const out: InsightLine[] = [];
  const cur = currentMonth(data);
  const span = `the last ${data.periods.length} months`;
  if (cur) {
    const p = cur.punctuality;
    if (p.arrivals > 0) {
      const ratio = p.onTime / p.arrivals;
      out.push({
        key: 'onTime',
        icon: 'clock-check-outline',
        tone: ratio >= 1 ? 'good' : ratio >= 0.8 ? 'info' : 'warn',
        text: `On time ${countText(p.onTime)} of ${daysText(p.arrivals)} this month`,
      });
    }
    const now = attendancePct(cur.days);
    const prev = previousMonth(data);
    const before = prev ? attendancePct(prev.days) : null;
    if (now != null && before != null && prev) {
      const diff = Math.round(now) - Math.round(before);
      out.push({
        key: 'trend',
        icon: diff > 0 ? 'trending-up' : diff < 0 ? 'trending-down' : 'trending-neutral',
        tone: diff >= 0 ? 'good' : 'warn',
        text:
          diff === 0
            ? `Attendance steady at ${pctText(now)} this month`
            : `Attendance ${pctText(now)} this month, ${diff > 0 ? 'up' : 'down'} from ${pctText(before)} in ${prev.shortLabel}`,
      });
    } else if (now != null) {
      out.push({ key: 'trend', icon: 'calendar-check-outline', tone: 'info', text: `Attendance ${pctText(now)} this month so far` });
    }
    if (p.avgArrivalDelta != null) {
      const late = p.avgArrivalDelta >= 1;
      out.push({
        key: 'arrival',
        icon: late ? 'run-fast' : 'weather-sunset-up',
        tone: late ? 'warn' : 'good',
        text: `You arrive ${arrivalText(p.avgArrivalDelta)} on average${p.avgArrival ? ` (${p.avgArrival})` : ''}`,
      });
    }
    if (p.arrivals > 0) {
      out.push(
        cur.earlyOut.days === 0
          ? { key: 'earlyOut', icon: 'check-circle-outline', tone: 'good', text: 'No early outs this month' }
          : {
              key: 'earlyOut',
              icon: 'exit-run',
              tone: 'warn',
              text: `Left early on ${daysText(cur.earlyOut.days)} this month${cur.earlyOut.minutes > 0 ? ` (${durationText(cur.earlyOut.minutes)})` : ''}`,
            },
      );
    }
  }
  const t = totalsOf(data.periods);
  if (t.overtimeMinutes > 0) {
    out.push({ key: 'ot', icon: 'timer-plus-outline', tone: 'info', text: `${durationText(t.overtimeMinutes)} overtime in ${span}` });
  }
  if (t.onDutyDays > 0) {
    out.push({ key: 'onDuty', icon: 'briefcase-outline', tone: 'info', text: `${daysText(t.onDutyDays)} On-Duty in ${span}` });
  }
  const lastPaid = [...data.periods].reverse().find((m) => m.salary && m.salary.lost != null);
  if (lastPaid?.salary && lastPaid.salary.lost != null) {
    const lost = lastPaid.salary.lost;
    out.push(
      lost > 0
        ? {
            key: 'pay',
            icon: 'cash-minus',
            tone: 'bad',
            text: `${hidden ? HIDDEN_AMOUNT : formatInr(lost)} lost to attendance in ${lastPaid.shortLabel}`,
          }
        : { key: 'pay', icon: 'cash-check', tone: 'good', text: `Nothing lost to attendance in ${lastPaid.shortLabel}` },
    );
  }
  return out;
}

// ── chart data ──────────────────────────────────────────────────────────────

export interface TrendBar {
  key: string;
  label: string;
  /** Attendance % (null = no working days that month). */
  attendance: number | null;
  /** On-time % (null = no arrivals). */
  onTime: number | null;
  current: boolean;
}

export function trendBars(data: MyInsights | null | undefined): TrendBar[] {
  return (data?.periods ?? []).map((m) => ({
    key: m.key,
    label: m.shortLabel,
    attendance: attendancePct(m.days),
    onTime: onTimePct(m.punctuality),
    current: m.current,
  }));
}

export interface PayBar {
  key: string;
  label: string;
  hasSlip: boolean;
  earned: number;
  lost: number;
  /** Bar heights as a share of the tallest month (earned + lost), 0-1. */
  earnedRatio: number;
  lostRatio: number;
  earnedText: string;
  lostText: string;
}

export interface PayChart {
  bars: PayBar[];
  /** Any month has a slip. */
  any: boolean;
  totalEarnedText: string;
  totalLostText: string;
  /** e.g. "92% of your pay kept" over the months with a fixed salary; null when none has one. */
  keptPct: number | null;
}

/** Earned vs lost to attendance per month. `hidden`: every amount is masked (the bars still show the proportions). */
export function payChart(data: MyInsights | null | undefined, hidden: boolean): PayChart {
  const periods = data?.periods ?? [];
  const max = Math.max(0, ...periods.map((m) => (m.salary ? m.salary.earned + Math.max(0, m.salary.lost ?? 0) : 0)));
  const short = (v: number) => (hidden ? '•••' : formatInrShort(v));
  const bars = periods.map((m) => {
    const earned = m.salary?.earned ?? 0;
    const lost = Math.max(0, m.salary?.lost ?? 0);
    return {
      key: m.key,
      label: m.shortLabel,
      hasSlip: !!m.salary,
      earned,
      lost,
      earnedRatio: max > 0 ? earned / max : 0,
      lostRatio: max > 0 ? lost / max : 0,
      earnedText: m.salary ? short(earned) : '',
      lostText: m.salary && lost > 0 ? short(lost) : '',
    };
  });
  const t = totalsOf(periods);
  const withAllocated = periods.filter((m) => m.salary && m.salary.allocated != null && m.salary.allocated > 0);
  const allocated = withAllocated.reduce((s, m) => s + (m.salary?.allocated ?? 0), 0);
  const earnedThere = withAllocated.reduce((s, m) => s + (m.salary?.earned ?? 0), 0);
  return {
    bars,
    any: bars.some((b) => b.hasSlip),
    totalEarnedText: hidden ? HIDDEN_AMOUNT : formatInr(t.earned),
    totalLostText: hidden ? HIDDEN_AMOUNT : formatInr(t.lost),
    keptPct: allocated > 0 ? Math.round(clamp01(earnedThere / allocated) * 100) : null,
  };
}

/** Nothing worth a chart yet: no working day and no slip in the whole window. */
export function insightsEmpty(data: MyInsights | null | undefined): boolean {
  if (!data) return true;
  return !data.periods.some((m) => m.days.working > 0 || m.salary || m.onDutyDays > 0);
}
