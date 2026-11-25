// When a request on the Approvals tab is FOR, when it was SUBMITTED, and how far ahead (or late) it was applied
// (owner 2026-11-25): "Applied 3 days before", "Applied on the same day", "Applied 2 days after", so a Department Head can
// spot early, last-minute and delayed requests at a glance. Pure (no React Native), unit-tested in requestLeadTime.test.ts.
//
// Every category's row already carries what this needs (backend/api/mobile_approvals_views.py sends the same JSON as
// /manager/pending-requests): `createdAt` is the submission (ISO with its offset), and the day(s) it is for are
//   leave        startDate .. endDate          permission    date + time (permissionTime)
//   casualLeave  date                          attendance    date
//   missingPunch date + punchTime              onDuty        date (the On-Duty day; else started / created)
//   outpass      the day it was asked for (a gate pass is for going out now; `expectedReturnAt` = back by)
//   holidayWork  workDate (a use-balance claim: useDate, the day off)
//   resignation  lastWorkingDate
// Days are counted in factory time (IST, UTC+5:30, no daylight saving), as the server counts them.

import { clock12, itemDateLabel } from './approvalsItems.ts';
import { fmtDay, type ApprovalCategory } from './approvalsHistory.ts';

type Item = Record<string, any>;

/** The factory's offset from UTC (India Standard Time). */
export const FACTORY_UTC_OFFSET_MINUTES = 330;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PLAIN_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

interface FactoryParts {
  /** "YYYY-MM-DD" in factory time */
  day: string;
  /** "HH:MM" in factory time; null for a plain day */
  time: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A timestamp (ISO with its offset) or a plain "YYYY-MM-DD" as the factory's calendar day and clock, or null. */
export function factoryParts(value: unknown): FactoryParts | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (PLAIN_DAY.test(text)) return { day: text, time: null };
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return null;
  const f = new Date(ms + FACTORY_UTC_OFFSET_MINUTES * 60_000);
  return {
    day: `${f.getUTCFullYear()}-${pad(f.getUTCMonth() + 1)}-${pad(f.getUTCDate())}`,
    time: `${pad(f.getUTCHours())}:${pad(f.getUTCMinutes())}`,
  };
}

/** The factory calendar day ("YYYY-MM-DD") of a timestamp or plain day, or null. */
export function factoryDay(value: unknown): string | null {
  return factoryParts(value)?.day ?? null;
}

/** "05 Oct 2026" from "2026-10-05" (the Approvals tab's day format), or null. */
function dayText(day: string | null | undefined): string | null {
  const m = PLAIN_DAY.exec(String(day ?? ''));
  return m ? `${m[3]} ${MONTH_SHORT[Number(m[2]) - 1]} ${m[1]}` : null;
}

/** When it was submitted: "20 Nov 2026, 10:05 AM" in factory time ("20 Nov 2026" for a plain day), or null. */
export function submittedLabel(value: unknown): string | null {
  const p = factoryParts(value);
  if (!p) return null;
  const day = dayText(p.day);
  return p.time ? `${day}, ${clock12(p.time)}` : day;
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"): positive when `to` is later. */
export function daysBetween(from: string, to: string): number | null {
  const a = PLAIN_DAY.exec(from);
  const b = PLAIN_DAY.exec(to);
  if (!a || !b) return null;
  const ms = Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3]);
  return Math.round(ms / 86_400_000);
}

/** The first (or only) day a request is for, "YYYY-MM-DD", or null when the row does not say. */
export function requestedDay(category: ApprovalCategory, item: Item | null | undefined): string | null {
  if (!item) return null;
  const plain = (v: unknown) => (typeof v === 'string' && PLAIN_DAY.test(v.trim()) ? v.trim() : factoryDay(v));
  switch (category) {
    case 'leave':
      return plain(item.startDate);
    case 'permission':
    case 'casualLeave':
    case 'attendance':
    case 'missingPunch':
      return plain(item.date);
    case 'onDuty':
      return plain(item.date) ?? factoryDay(item.startedAt) ?? factoryDay(item.createdAt);
    case 'outpass':
      // a gate pass is for going out now: the day it was asked for
      return factoryDay(item.createdAt);
    case 'holidayWork':
      return plain(item.kind === 'use_balance' ? (item.useDate ?? item.workDate) : (item.workDate ?? item.date));
    case 'resignation':
      return plain(item.lastWorkingDate);
    default:
      return null;
  }
}

/** What a request is for, as a card / the sheet shows it: "06 Oct → 08 Oct 2026 · 3 day(s)", "10 Oct 2026 · 9:30 AM",
 *  "25 Nov 2026 · back by 5:30 PM", "30 Nov 2026" (a resignation's last working day). */
export function requestedLabel(category: ApprovalCategory, item: Item): string {
  switch (category) {
    case 'permission': {
      const time = item.time ?? item.permissionTime;
      return `${fmtDay(item.date)}${time ? ` · ${clock12(time)}` : ''}`;
    }
    case 'missingPunch':
      return `${fmtDay(item.date)}${item.punchTime ? ` · ${clock12(item.punchTime)}` : ''}`;
    case 'outpass': {
      const day = dayText(factoryDay(item.createdAt)) ?? '—';
      const back = factoryParts(item.expectedReturnAt);
      return back?.time ? `${day} · back by ${clock12(back.time)}` : day;
    }
    case 'resignation':
      return item.lastWorkingDate ? fmtDay(item.lastWorkingDate) : 'Not given';
    default:
      return itemDateLabel(category, item);
  }
}

export type LeadTone = 'early' | 'sameDay' | 'late';

export interface LeadTime {
  /** Days from the submission to the day it is for: positive = applied ahead, negative = applied afterwards. */
  days: number;
  tone: LeadTone;
  /** "Applied 3 days before" / "Applied on the same day" / "Applied 2 days after" */
  text: string;
  /** The short form for a chip: "3 days before" / "Same day" / "2 days after" */
  short: string;
}

const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** How far ahead of `requested` (a "YYYY-MM-DD") the request was submitted (`submittedAt`), or null when either is unknown. */
export function leadTime(requested: string | null | undefined, submittedAt: unknown): LeadTime | null {
  const submitted = factoryDay(submittedAt);
  if (!requested || !submitted) return null;
  const days = daysBetween(submitted, requested);
  if (days == null) return null;
  if (days === 0) return { days, tone: 'sameDay', text: 'Applied on the same day', short: 'Same day' };
  if (days > 0) return { days, tone: 'early', text: `Applied ${dayWord(days)} before`, short: `${dayWord(days)} before` };
  return { days, tone: 'late', text: `Applied ${dayWord(-days)} after`, short: `${dayWord(-days)} after` };
}

export interface RequestTiming {
  /** What it is for (requestedLabel). */
  requested: string;
  /** "20 Nov 2026, 10:05 AM", or null when the row has no submission time. */
  submitted: string | null;
  lead: LeadTime | null;
}

/** Everything a card and the decision sheet show about a request's timing. */
export function requestTiming(category: ApprovalCategory, item: Item): RequestTiming {
  const submittedAt = item?.createdAt ?? item?.appliedOn ?? null;
  return {
    requested: requestedLabel(category, item),
    submitted: submittedLabel(submittedAt),
    lead: leadTime(requestedDay(category, item), submittedAt),
  };
}
