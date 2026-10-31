// The Compensation timeline (a whole year, grouped by month) in ONE place: pure functions, no React Native, unit-tested in
// compensationHistory.test.ts.
//
// The server (backend/api/mobile_pay_compensation.py, GET /my/compensation-history?year=YYYY) lists every compensation
// of the year: what the system detected, what HR gave (overtime relaxation / pay, Sunday and holiday work, credits on the
// balance, earlier alternative days, days taken from the balance) and what HR announced for everybody (late-in / early-out
// times, compensation days), plus the overtime pay each month's salary slip paid. This file reads that reply defensively
// and groups it for the phone; every figure is the server's.

import { formatLongDate, kindTone, minutesText, parseIsoDate, prettify, shiftsLabel, type KindTone } from './compensation.ts';
import { formatInr } from './salaryInsights.ts';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export type Source = 'hr' | 'automatic' | 'company';
export type SourceFilter = 'all' | Source;

export interface HistoryItem {
  key: string;
  kind: string;
  group: string;
  date: string | null;
  /** 'YYYY-MM' the item is filed under. */
  month: string | null;
  title: string;
  detail: string;
  status: string;
  statusLabel: string;
  shifts: number | null;
  minutes: number | null;
  minutesUsed: number | null;
  time: string | null;
  workDate: string | null;
  legacy: boolean;
  source: Source;
  sourceLabel: string;
  givenByHr: boolean;
}

export interface OtPayMonth {
  month: string;
  label: string;
  amount: number;
  shifts: number | null;
  slipId: number | null;
}

export interface CompensationHistory {
  isStaff: boolean;
  year: number;
  years: number[];
  balance: { shifts: number; creditedThisYear: number; takenThisYear: number; alternativeDaysAvailable: number } | null;
  totals: { items: number; givenByHr: number; company: number; automatic: number; shiftsGivenByHr: number; otPay: number } | null;
  otPayByMonth: OtPayMonth[];
  items: HistoryItem[];
  message: string | null;
}

const SOURCES: Source[] = ['hr', 'automatic', 'company'];
export const SOURCE_LABELS: Record<Source, string> = {
  hr: 'Given by HR',
  automatic: 'Automatic',
  company: 'Announced by HR for everyone',
};

const isoOrNull = (v: unknown) => (parseIsoDate(v) ? str(v).slice(0, 10) : null);

function readItem(raw: unknown, index: number): HistoryItem | null {
  if (!isObject(raw)) return null;
  const kind = str(raw.kind);
  const status = str(raw.status);
  const source = (SOURCES as string[]).includes(str(raw.source)) ? (str(raw.source) as Source) : 'hr';
  const date = isoOrNull(raw.date);
  return {
    key: str(raw.key) || `item-${index}`,
    kind,
    group: str(raw.group) || 'other',
    date,
    month: /^\d{4}-\d{2}$/.test(str(raw.month)) ? str(raw.month) : date ? date.slice(0, 7) : null,
    title: str(raw.title) || historyKindTone(kind).label,
    detail: str(raw.detail),
    status,
    statusLabel: str(raw.statusLabel) || prettify(status),
    shifts: num(raw.shifts),
    minutes: num(raw.minutes),
    minutesUsed: num(raw.minutesUsed),
    time: str(raw.time) || null,
    workDate: isoOrNull(raw.workDate),
    legacy: raw.legacy === true,
    source,
    sourceLabel: str(raw.sourceLabel) || SOURCE_LABELS[source],
    givenByHr: typeof raw.givenByHr === 'boolean' ? raw.givenByHr : source !== 'automatic',
  };
}

function readOtPay(raw: unknown): OtPayMonth | null {
  if (!isObject(raw)) return null;
  const month = str(raw.month);
  const amount = num(raw.amount);
  if (!/^\d{4}-\d{2}$/.test(month) || amount == null) return null;
  return { month, label: str(raw.label) || monthLabel(month), amount, shifts: num(raw.shifts), slipId: num(raw.slipId) };
}

/** The reply of GET /my/compensation-history, or null when it is not one. */
export function normalizeHistory(raw: unknown): CompensationHistory | null {
  if (!isObject(raw) || !Array.isArray(raw.items)) return null;
  const year = num(raw.year);
  if (year == null) return null;
  const years = (Array.isArray(raw.years) ? raw.years : []).map(num).filter((y): y is number => y != null);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => b - a);
  const b = isObject(raw.balance) ? raw.balance : null;
  const t = isObject(raw.totals) ? raw.totals : null;
  const seen = new Map<string, number>();
  const items: HistoryItem[] = [];
  raw.items.forEach((r, i) => {
    const item = readItem(r, i);
    if (!item) return;
    const n = seen.get(item.key) ?? 0;
    seen.set(item.key, n + 1);
    items.push(n === 0 ? item : { ...item, key: `${item.key}#${n}` });
  });
  return {
    isStaff: raw.isStaff !== false,
    year,
    years,
    balance: b
      ? {
          shifts: num(b.shifts) ?? 0,
          creditedThisYear: num(b.creditedThisYear) ?? 0,
          takenThisYear: num(b.takenThisYear) ?? 0,
          alternativeDaysAvailable: num(b.alternativeDaysAvailable) ?? 0,
        }
      : null,
    totals: t
      ? {
          items: num(t.items) ?? items.length,
          givenByHr: num(t.givenByHr) ?? 0,
          company: num(t.company) ?? 0,
          automatic: num(t.automatic) ?? 0,
          shiftsGivenByHr: num(t.shiftsGivenByHr) ?? 0,
          otPay: num(t.otPay) ?? 0,
        }
      : null,
    otPayByMonth: (Array.isArray(raw.otPayByMonth) ? raw.otPayByMonth : [])
      .map(readOtPay)
      .filter((r): r is OtPayMonth => r !== null),
    items,
    message: str(raw.message) || null,
  };
}

// ── looks ───────────────────────────────────────────────────────────────────

const TEAL: KindTone = { label: 'Compensation day', solid: '#0F766E', softLight: '#CCFBF1', softDark: '#14B8A638', inkLight: '#115E59', inkDark: '#5EEAD4', icon: 'calendar-heart' };
const INDIGO: KindTone = { label: 'Added to balance', solid: '#4338CA', softLight: '#E0E7FF', softDark: '#6366F138', inkLight: '#3730A3', inkDark: '#A5B4FC', icon: 'wallet-plus-outline' };
const STONE: KindTone = { label: 'Alternative day off', solid: '#57534E', softLight: '#E7E5E4', softDark: '#A8A29E33', inkLight: '#44403C', inkDark: '#D6D3D1', icon: 'calendar-refresh-outline' };

/** The colours / symbol of an item: the kinds the 90-day list knows look exactly as there; the three new kinds get their own. */
export function historyKindTone(kind: string): KindTone {
  switch (kind) {
    case 'compensation_day':
      return TEAL;
    case 'balance_credit':
      return INDIGO;
    case 'alternative_day':
      return STONE;
    default:
      return kindTone(kind);
  }
}

// ── grouping ────────────────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-03' -> 'March 2026' ('' for anything else). */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return '';
  const name = MONTHS[Number(m[2]) - 1];
  return name ? `${name} ${m[1]}` : '';
}

export function filterBySource(items: HistoryItem[], filter: SourceFilter): HistoryItem[] {
  return filter === 'all' ? items : items.filter((i) => i.source === filter);
}

export interface MonthGroup {
  month: string;
  label: string;
  items: HistoryItem[];
  /** The overtime pay that month's salary slip paid, when there was some. */
  otPay: OtPayMonth | null;
  /** Shifts in the month's items that HR gave (relaxation, pay, Sunday / holiday work approved). */
  hrShifts: number;
}

const COUNTED_HR_KINDS = new Set(['ot_shift_relaxation', 'ot_shift_pay']);

/** The items by month, newest month first, each newest first. A month with overtime pay but no item in the current
 *  filter is still listed when the filter shows HR's items (the pay is HR's). */
export function groupByMonth(items: HistoryItem[], otPay: OtPayMonth[], filter: SourceFilter = 'all'): MonthGroup[] {
  const shown = filterBySource(items, filter);
  const months = new Set<string>();
  for (const i of shown) if (i.month) months.add(i.month);
  if (filter === 'all' || filter === 'hr') for (const p of otPay) months.add(p.month);
  return [...months]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => {
      const list = shown
        .filter((i) => i.month === month)
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.key.localeCompare(a.key));
      const hrShifts = list
        .filter((i) => COUNTED_HR_KINDS.has(i.kind) || (i.kind === 'holiday_work' && i.status === 'approved'))
        .reduce((sum, i) => sum + (i.shifts ?? 0), 0);
      return {
        month,
        label: monthLabel(month),
        items: list,
        otPay: (filter === 'all' || filter === 'hr' ? otPay.find((p) => p.month === month) : undefined) ?? null,
        hrShifts: Math.round(hrShifts * 100) / 100,
      };
    });
}

export interface HistoryFact {
  icon: string;
  text: string;
}

/** The small facts under an item: shifts, minutes, the announced time, the day the work was done. */
export function historyFacts(item: HistoryItem): HistoryFact[] {
  const facts: HistoryFact[] = [];
  const shifts = shiftsLabel(item.shifts);
  if (shifts) facts.push({ icon: 'timer-sand', text: shifts });
  const minutes = minutesText(item.minutes);
  if (item.kind === 'ot_allowance') {
    if (minutes) facts.push({ icon: 'clock-plus-outline', text: `${minutes} allowance` });
    const used = minutesText(item.minutesUsed);
    if (used) facts.push({ icon: 'check-circle-outline', text: `Used ${used}` });
  } else if (minutes && item.kind.startsWith('ot_shift')) {
    facts.push({ icon: 'clock-outline', text: `${minutes} past shift end` });
  }
  if (item.time) facts.push({ icon: 'clock-outline', text: `At ${item.time}` });
  if (item.workDate && item.workDate !== item.date) {
    const worked = formatLongDate(item.workDate);
    if (worked) facts.push({ icon: 'briefcase-outline', text: `Worked ${worked}` });
  }
  return facts;
}

/** "Overtime pay in your March 2026 salary: ₹384.62 (0.50 shift)". */
export function otPayLine(p: OtPayMonth): string {
  const shifts = shiftsLabel(p.shifts);
  return `Overtime pay in your ${p.label} salary: ${formatInr(p.amount)}${shifts ? ` (${shifts})` : ''}`;
}

export const FILTERS: { key: SourceFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'hr', label: 'Given by HR' },
  { key: 'automatic', label: 'Automatic' },
  { key: 'company', label: 'For everyone' },
];
