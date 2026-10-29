// The "On-Duty Journey" list as the employee reads it (pure, no React): the status chip, the live status line, today /
// yesterday / date grouping, and the numbers on a card. The words and colours match the detail screen (activity.ts).
import { endReasonLabel, formatAgo, formatClock, formatDistance, formatDuration } from './format.ts';
import { parseTime } from './geo.ts';
import type { Tone } from './activity.ts';
import type { JourneyListItem } from './journeyModel.ts';

export interface StatusChip {
  label: string;
  tone: Tone;
}

/** "In progress" / "Completed" / "Ended by day-end" / "Rejected" / "Closed by HR". */
export function journeyChip(j: Pick<JourneyListItem, 'status' | 'endReason' | 'approvalStatus'>): StatusChip {
  if (j.status === 'active') return { label: 'In progress', tone: 'blue' };
  if (j.endReason === 'rejected' || j.approvalStatus === 'rejected') return { label: 'Rejected', tone: 'red' };
  if (j.endReason === 'auto_day_end') return { label: 'Ended by day-end', tone: 'amber' };
  if (j.endReason === 'admin') return { label: 'Closed by HR', tone: 'grey' };
  return { label: 'Completed', tone: 'green' };
}

/** The line under a finished journey's chip ("All 4 punches were recorded"); empty when the reason says nothing more. */
export function endNote(j: Pick<JourneyListItem, 'status' | 'endReason'>): string {
  return j.status === 'ended' ? endReasonLabel(j.endReason) : '';
}

export interface LiveStatus {
  label: string;
  /** One sentence the employee can act on, or ''. */
  hint: string;
  tone: Tone;
}

/** What a journey in progress is doing right now, from the server's `state`. */
export function liveStatus(state: string | null | undefined): LiveStatus {
  switch (state) {
    case 'moving':
      return { label: 'Moving', hint: '', tone: 'green' };
    case 'stationary':
      return { label: 'Still', hint: 'You are staying in one place (a break is being recorded).', tone: 'amber' };
    case 'offline':
      return { label: 'Offline', hint: 'No location has reached the office for a while. It uploads when your phone has internet.', tone: 'grey' };
    case 'location_off':
      return { label: 'Location off', hint: "Turn on Location in your phone's quick settings. Nothing is recorded while it is off.", tone: 'red' };
    case 'waiting_first_fix':
      return { label: 'Starting', hint: 'Waiting for the first location.', tone: 'blue' };
    default:
      return { label: 'Recording', hint: '', tone: 'blue' };
  }
}

/** Seconds a journey has been running: the clock for one in progress, the recorded total for a finished one. */
export function runningS(j: Pick<JourneyListItem, 'status' | 'startedAt' | 'durationS'>, now: number = Date.now()): number {
  if (j.status !== 'active') return j.durationS;
  const a = parseTime(j.startedAt);
  return a == null ? j.durationS : Math.max(0, Math.round((now - a) / 1000));
}

/** "09:04 AM - 11:26 AM", or "09:04 AM - now" while it runs. */
export function timeRange(j: Pick<JourneyListItem, 'status' | 'startedAt' | 'endedAt'>): string {
  const from = formatClock(j.startedAt);
  const to = j.status === 'active' ? 'now' : formatClock(j.endedAt);
  return [from, to].filter(Boolean).join(' - ');
}

/** "Last position 2 min ago" / "Waiting for the first location". */
export function lastUpdateText(j: Pick<JourneyListItem, 'lastPointAt'>, now: number = Date.now()): string {
  const at = parseTime(j.lastPointAt);
  return at ? `Last position ${formatAgo(at, now)}` : 'Waiting for the first location';
}

/** "4/4 punches" (the slots filled, of the day's four); empty when the server does not say. */
export function punchText(j: Pick<JourneyListItem, 'punchCount'>): string {
  return j.punchCount == null ? '' : `${Math.min(4, j.punchCount)}/4`;
}

/** "3 breaks · 1 h 05 min", "1 break · 12 min" or "No breaks". */
export function breaksText(j: Pick<JourneyListItem, 'stopCount' | 'stopS'>): string {
  if (j.stopCount <= 0) return 'No breaks';
  return `${j.stopCount} ${j.stopCount === 1 ? 'break' : 'breaks'} · ${formatDuration(j.stopS)}`;
}

/** The breaks metric of a card as a value and a caption: "5 breaks" / "1 h 05 min in total", or "None" / "No breaks". */
export function breakParts(j: Pick<JourneyListItem, 'stopCount' | 'stopS'>): { value: string; label: string } {
  if (j.stopCount <= 0) return { value: 'None', label: 'No breaks' };
  return { value: `${j.stopCount} ${j.stopCount === 1 ? 'break' : 'breaks'}`, label: `${formatDuration(j.stopS)} in total` };
}

export const distanceText =(j: Pick<JourneyListItem, 'distanceM'>): string => formatDistance(j.distanceM);

// ------------------------------------------------------------------------------------------------ grouping by day

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The phone's calendar day of an instant: "2026-10-28". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "Today" / "Yesterday" / "Mon, 27 Oct" (with the year when it is not this year's). */
export function dayLabel(ms: number, now: number = Date.now()): string {
  const key = dayKey(ms);
  if (key === dayKey(now)) return 'Today';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y.getTime())) return 'Yesterday';
  const d = new Date(ms);
  const base = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** The date tile on a card: "28" / "Oct" / "Wed" (the phone's calendar). */
export function dayParts(ms: number): { day: string; month: string; weekday: string } {
  const d = new Date(ms);
  return { day: String(d.getDate()), month: MONTHS[d.getMonth()], weekday: WEEKDAYS[d.getDay()] };
}

export interface DayGroup {
  key: string;
  label: string;
  items: JourneyListItem[];
}

/** The journeys that are still running (the highlighted card) and the rest, grouped by the day they started, newest first. */
export function splitJourneys(list: JourneyListItem[], now: number = Date.now()): { current: JourneyListItem[]; days: DayGroup[] } {
  const startOf = (j: JourneyListItem) => parseTime(j.startedAt) ?? 0;
  const sorted = [...list].sort((a, b) => startOf(b) - startOf(a) || b.id - a.id);
  const current = sorted.filter((j) => j.status === 'active');
  const days: DayGroup[] = [];
  for (const j of sorted) {
    if (j.status === 'active') continue;
    const at = startOf(j);
    const key = at ? dayKey(at) : 'unknown';
    let group = days[days.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: at ? dayLabel(at, now) : 'Earlier', items: [] };
      days.push(group);
    }
    group.items.push(j);
  }
  return { current, days };
}
