// What the Salary pages show about money, in ONE place (pure functions, no React Native, unit-tested in
// salaryInsights.test.ts).
//
// The server is the authority on every figure (backend/api/mobile_pay.py): it reads what payroll STORED on each salary
// slip (allocated monthly salary, earned gross, late / permission deductions, PF, ESI, TDS, advance recovery, net pay) and
// never recomputes a payroll. This file only reads that reply defensively and words it for the phone:
//   * a missing or wrong-typed field reads as "not sent" (null), never throws;
//   * a figure the server sends as null (production pay has no allocated salary, an older slip has no late split) stays
//     null, and the screen prints the server's reason instead of a number;
//   * a malformed reply as a whole is null, which the hook turns into an error state with a Retry button.

// ── small readers ───────────────────────────────────────────────────────────

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
const num0 = (v: unknown): number => num(v) ?? 0;

// ── money ───────────────────────────────────────────────────────────────────

/** Indian digit grouping of a whole number: 123456 -> "1,23,456". */
function groupIndian(whole: number): string {
  const digits = String(Math.trunc(Math.abs(whole)));
  if (digits.length <= 3) return digits;
  const tail = digits.slice(-3);
  let head = digits.slice(0, -3);
  const groups: string[] = [];
  while (head.length > 2) {
    groups.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) groups.unshift(head);
  return `${groups.join(',')},${tail}`;
}

/**
 * Rupees the Indian way: "₹1,23,456", "₹1,23,456.50" (paise only when there are some), "-₹500". Written by hand rather
 * than with toLocaleString('en-IN'), which some Android JavaScript engines print with Western grouping.
 */
export function formatInr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const paiseTotal = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const sign = value < 0 && paiseTotal !== 0 ? '-' : '';
  return `${sign}₹${groupIndian(whole)}${paise ? `.${String(paise).padStart(2, '0')}` : ''}`;
}

/** "₹1.2L", "₹45.3K", "₹900": a short figure for chart axes and small chips. */
export function formatInrShort(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const a = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (a >= 100000) return `${sign}₹${(a / 100000).toFixed(a >= 1000000 ? 0 : 1).replace(/\.0$/, '')}L`;
  if (a >= 1000) return `${sign}₹${(a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return `${sign}₹${Math.round(a)}`;
}

/** 21.25 -> "21.25", 24 -> "24", 0.5 -> "0.5". */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(Math.round(value * 100) / 100);
}

// ── the reply of GET /my/salary-insights and /my/salary-slips/<id>/breakdown ──

export type StepOp = 'start' | 'minus' | 'plus' | 'subtotal' | 'total';

export interface SalaryStep {
  key: string;
  label: string;
  /** null = payroll does not store this figure for this slip (the note says why). */
  amount: number | null;
  op: StepOp;
  note: string;
}

export interface PeriodInfo {
  label: string;
  shortLabel: string;
  start: string | null;
  end: string | null;
  cycle: string | null;
  cycleLabel: string | null;
}

export interface PayrollAfterSlip {
  status: string;
  statusLabel: string;
  bonus: number;
  deductionChange: number;
  net: number;
  matchesSlip: boolean;
  /** HR added a bonus or changed the deductions after the slip (what the phone shows as "Changed by HR"). */
  hrChanged: boolean;
}

export interface SalaryCounts {
  workingDays: number | null;
  paidDays: number | null;
  presentDays: number | null;
  absentDays: number | null;
  paidLeaveDays: number | null;
  unpaidLeaveDays: number | null;
  halfDays: number | null;
  lateMarks: number | null;
  lateInDays: number | null;
  earlyOutDays: number | null;
  freeLateMarks: number | null;
  billableLateMarks: number | null;
  permissionsApproved: number | null;
  permissionsFree: number | null;
  permissionsCharged: number | null;
  dailyRate: number | null;
  totalDays: number | null;
  daysWorked: number | null;
  totalShifts: number | null;
  ratePerShift: number | null;
}

export interface SalaryPeriod {
  slipId: number;
  slipNumber: string;
  /** staff | production | legacy */
  kind: string;
  month: number;
  year: number;
  period: PeriodInfo;
  hasDetails: boolean;
  allocated: number | null;
  earnedGross: number;
  absentLoss: number | null;
  lateDeduction: number | null;
  permissionDeduction: number | null;
  attendanceLoss: number | null;
  otPay: number;
  pf: number;
  esi: number;
  tds: number;
  tdsPercent: number | null;
  statutory: number;
  advance: number;
  otherDeductions: number;
  totalDeductions: number;
  netPayable: number;
  counts: SalaryCounts;
  /** Why a figure is null: keys allocated | absentLoss | late | permission. */
  notes: Record<string, string>;
  steps: SalaryStep[];
  reconciles: boolean;
  payroll: PayrollAfterSlip | null;
}

export interface YearSummary {
  periods: number;
  allocated: number | null;
  allocatedPeriods: number;
  earnedGross: number;
  absentLoss: number | null;
  lateDeduction: number | null;
  permissionDeduction: number | null;
  attendanceLoss: number | null;
  otPay: number;
  statutory: number;
  advance: number;
  totalDeductions: number;
  netPayable: number;
}

export interface SalaryInsights {
  employmentType: string;
  year: number;
  years: number[];
  periods: SalaryPeriod[];
  summary: YearSummary;
  notes: string[];
}

const STEP_OPS: StepOp[] = ['start', 'minus', 'plus', 'subtotal', 'total'];

function readStep(raw: unknown): SalaryStep | null {
  if (!isObject(raw)) return null;
  const op = str(raw.op) as StepOp;
  if (!STEP_OPS.includes(op)) return null;
  return { key: str(raw.key), label: str(raw.label), amount: num(raw.amount), op, note: str(raw.note) };
}

const COUNT_KEYS: (keyof SalaryCounts)[] = [
  'workingDays', 'paidDays', 'presentDays', 'absentDays', 'paidLeaveDays', 'unpaidLeaveDays', 'halfDays', 'lateMarks',
  'lateInDays', 'earlyOutDays', 'freeLateMarks', 'billableLateMarks', 'permissionsApproved', 'permissionsFree',
  'permissionsCharged', 'dailyRate', 'totalDays', 'daysWorked', 'totalShifts', 'ratePerShift',
];

function readCounts(raw: unknown): SalaryCounts {
  const src = isObject(raw) ? raw : {};
  const out = {} as SalaryCounts;
  for (const k of COUNT_KEYS) out[k] = num(src[k]);
  return out;
}

function readPayroll(raw: unknown): PayrollAfterSlip | null {
  if (!isObject(raw)) return null;
  return {
    status: str(raw.status),
    statusLabel: str(raw.statusLabel),
    bonus: num0(raw.bonus),
    deductionChange: num0(raw.deductionChange),
    net: num0(raw.net),
    matchesSlip: raw.matchesSlip !== false,
    hrChanged: typeof raw.hrChanged === 'boolean' ? raw.hrChanged : num0(raw.bonus) !== 0 || num0(raw.deductionChange) !== 0,
  };
}

export function normalizePeriod(raw: unknown): SalaryPeriod | null {
  if (!isObject(raw)) return null;
  const slipId = num(raw.slipId);
  if (slipId == null) return null;
  const p = isObject(raw.period) ? raw.period : {};
  const notes: Record<string, string> = {};
  if (isObject(raw.notes)) {
    for (const [k, v] of Object.entries(raw.notes)) if (str(v)) notes[k] = str(v);
  }
  return {
    slipId,
    slipNumber: str(raw.slipNumber),
    kind: str(raw.kind) || 'staff',
    month: num0(raw.month),
    year: num0(raw.year),
    period: {
      label: str(p.label),
      shortLabel: str(p.shortLabel) || str(p.label),
      start: str(p.start) || null,
      end: str(p.end) || null,
      cycle: str(p.cycle) || null,
      cycleLabel: str(p.cycleLabel) || null,
    },
    hasDetails: raw.hasDetails === true,
    allocated: num(raw.allocated),
    earnedGross: num0(raw.earnedGross),
    absentLoss: num(raw.absentLoss),
    lateDeduction: num(raw.lateDeduction),
    permissionDeduction: num(raw.permissionDeduction),
    attendanceLoss: num(raw.attendanceLoss),
    otPay: num0(raw.otPay),
    pf: num0(raw.pf),
    esi: num0(raw.esi),
    tds: num0(raw.tds),
    tdsPercent: num(raw.tdsPercent),
    statutory: num0(raw.statutory),
    advance: num0(raw.advance),
    otherDeductions: num0(raw.otherDeductions),
    totalDeductions: num0(raw.totalDeductions),
    netPayable: num0(raw.netPayable),
    counts: readCounts(raw.counts),
    notes,
    steps: (Array.isArray(raw.steps) ? raw.steps : []).map(readStep).filter((s): s is SalaryStep => s !== null),
    reconciles: raw.reconciles !== false,
    payroll: readPayroll(raw.payroll),
  };
}

function readSummary(raw: unknown): YearSummary {
  const s = isObject(raw) ? raw : {};
  return {
    periods: num0(s.periods),
    allocated: num(s.allocated),
    allocatedPeriods: num0(s.allocatedPeriods),
    earnedGross: num0(s.earnedGross),
    absentLoss: num(s.absentLoss),
    lateDeduction: num(s.lateDeduction),
    permissionDeduction: num(s.permissionDeduction),
    attendanceLoss: num(s.attendanceLoss),
    otPay: num0(s.otPay),
    statutory: num0(s.statutory),
    advance: num0(s.advance),
    totalDeductions: num0(s.totalDeductions),
    netPayable: num0(s.netPayable),
  };
}

/** The reply of GET /my/salary-insights, or null when it is not one (an older backend's 404 page, a proxy's page). */
export function normalizeInsights(raw: unknown): SalaryInsights | null {
  if (!isObject(raw) || !Array.isArray(raw.periods)) return null;
  const year = num(raw.year);
  if (year == null) return null;
  const years = (Array.isArray(raw.years) ? raw.years : []).map(num).filter((y): y is number => y != null);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => b - a);
  return {
    employmentType: str(raw.employmentType) || 'staff',
    year,
    years,
    periods: raw.periods.map(normalizePeriod).filter((p): p is SalaryPeriod => p !== null),
    summary: readSummary(raw.summary),
    notes: (Array.isArray(raw.notes) ? raw.notes : []).map(str).filter((n) => n !== ''),
  };
}

// ── wording ─────────────────────────────────────────────────────────────────

/** "October 2026" / "2 Feb - 8 Feb 2026 · Weekly". */
export function periodTitle(p: Pick<SalaryPeriod, 'period'>): string {
  const label = p.period.label || 'Pay period';
  return p.period.cycleLabel ? `${label} · ${p.period.cycleLabel}` : label;
}

/** The plain-English "what did I lose" line of one period. */
export function lossSentence(p: SalaryPeriod): string {
  const title = p.period.label || 'this period';
  if (p.allocated == null) {
    const parts: string[] = [];
    if (p.lateDeduction) parts.push(`${formatInr(p.lateDeduction)} late deduction`);
    const head = p.notes.allocated || 'There is no fixed salary to compare with for this pay.';
    return parts.length ? `${head} Attendance cost you ${parts.join(' and ')} in ${title}.` : head;
  }
  const loss = p.attendanceLoss ?? 0;
  if (loss <= 0) return `You lost nothing to attendance in ${title}.`;
  const parts: string[] = [];
  if (p.absentLoss) {
    const working = p.counts.workingDays;
    const paid = p.counts.paidDays;
    const days = working != null && paid != null ? Math.round((working - paid) * 100) / 100 : null;
    parts.push(
      days != null && days > 0
        ? `${formatInr(p.absentLoss)} for ${formatCount(days)} ${days === 1 ? 'day' : 'days'} not paid`
        : `${formatInr(p.absentLoss)} for days not paid`,
    );
  }
  if (p.lateDeduction) parts.push(`${formatInr(p.lateDeduction)} late deduction`);
  if (p.permissionDeduction) parts.push(`${formatInr(p.permissionDeduction)} permission deduction`);
  return `You lost ${formatInr(loss)} in ${title}: ${parts.join(', ')}.`;
}

// ── the comparison chart ────────────────────────────────────────────────────

export interface ComparisonBar {
  slipId: number;
  label: string;
  allocated: number | null;
  earned: number;
  net: number;
  lost: number | null;
  /** 0..1 against the biggest figure in the chart. */
  allocatedRatio: number;
  earnedRatio: number;
  netRatio: number;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * One bar per pay period: allocated (the full track), earned for attendance (the fill) and payable (the marker), all on
 * one scale so periods compare at a glance. A production period has no allocated salary: its track is the earned pay.
 */
export function comparisonBars(periods: SalaryPeriod[]): ComparisonBar[] {
  const scale = Math.max(1, ...periods.map((p) => Math.max(p.allocated ?? 0, p.earnedGross + p.otPay, p.netPayable)));
  return periods.map((p) => {
    const earned = p.earnedGross;
    const track = p.allocated ?? earned + p.otPay;
    return {
      slipId: p.slipId,
      label: p.period.shortLabel || p.period.label,
      allocated: p.allocated,
      earned,
      net: p.netPayable,
      lost: p.attendanceLoss,
      allocatedRatio: clamp01(track / scale),
      earnedRatio: clamp01(earned / scale),
      netRatio: clamp01(p.netPayable / scale),
    };
  });
}

/** The newest period of the list (the server sends oldest first), or null. */
export function latestPeriod(periods: SalaryPeriod[]): SalaryPeriod | null {
  return periods.length ? periods[periods.length - 1] : null;
}

// ── the waterfall ───────────────────────────────────────────────────────────

export interface WaterfallRow extends SalaryStep {
  /** "₹24,000", "- ₹2,750", "+ ₹500", "= ₹21,250", or "Not recorded" for a null figure. */
  amountText: string;
  /** The bar of this row, as fractions 0..1 of the biggest running total: [from, to]. */
  from: number;
  to: number;
  tone: 'base' | 'loss' | 'gain' | 'result';
}

/** The slip's steps with the running total drawn as a waterfall (a minus step is the piece cut off the bar above). */
export function waterfallRows(steps: SalaryStep[]): WaterfallRow[] {
  let running = 0;
  let peak = 0;
  const raw = steps.map((s) => {
    const amount = s.amount ?? 0;
    let from = running;
    let to = running;
    if (s.op === 'start') {
      from = 0;
      to = amount;
      running = amount;
    } else if (s.op === 'minus') {
      to = running - amount;
      running = to;
    } else if (s.op === 'plus') {
      to = running + amount;
      running = to;
    } else {
      from = 0;
      to = amount;
      running = amount;
    }
    peak = Math.max(peak, from, to);
    return { s, from, to };
  });
  const scale = peak > 0 ? peak : 1;
  return raw.map(({ s, from, to }) => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    let amountText: string;
    if (s.amount == null) amountText = 'Not recorded';
    else if (s.op === 'minus') amountText = s.amount ? `- ${formatInr(s.amount)}` : formatInr(0);
    else if (s.op === 'plus') amountText = `+ ${formatInr(s.amount)}`;
    else if (s.op === 'subtotal' || s.op === 'total') amountText = `= ${formatInr(s.amount)}`;
    else amountText = formatInr(s.amount);
    const tone: WaterfallRow['tone'] =
      s.op === 'minus' ? 'loss' : s.op === 'plus' ? 'gain' : s.op === 'start' ? 'base' : 'result';
    return { ...s, amountText, from: clamp01(lo / scale), to: clamp01(hi / scale), tone };
  });
}

// ── the slip list ───────────────────────────────────────────────────────────

/** The part of a slip (GET /my/salary-slips) the list reads. */
export interface SlipLike {
  id: number;
  month: number;
  year: number;
  weekNumber?: number | null;
  payCycle?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const CYCLE_LABELS: Record<string, string> = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly' };

function ymd(iso: string | null | undefined): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** "October 2026", "2 Feb - 8 Feb 2026" (a production period), "Week 2 of October 2026" (an old weekly slip). */
export function slipPeriodLabel(s: SlipLike): string {
  const a = ymd(s.periodStart);
  const b = ymd(s.periodEnd);
  if (a && b) {
    const left = `${a[2]} ${MON[a[1] - 1]}${a[0] !== b[0] ? ` ${a[0]}` : ''}`;
    return `${left} - ${b[2]} ${MON[b[1] - 1]} ${b[0]}`;
  }
  const month = MONTHS[s.month - 1] ?? String(s.month);
  return s.weekNumber ? `Week ${s.weekNumber} of ${month} ${s.year}` : `${month} ${s.year}`;
}

/** "Weekly pay", "Bi-weekly pay", "Monthly pay" for a production slip; null for a staff slip. */
export function slipCycleLabel(s: SlipLike): string | null {
  const c = (s.payCycle ?? '').toLowerCase();
  return CYCLE_LABELS[c] ? `${CYCLE_LABELS[c]} pay` : null;
}

/** Newest first: by the period's start for production slips, else by year, month and week. */
export function sortSlipsNewestFirst<T extends SlipLike>(slips: T[]): T[] {
  const key = (s: SlipLike) => {
    const start = ymd(s.periodStart);
    const day = start ? start[2] : 0;
    return s.year * 1_000_000 + s.month * 10_000 + day * 100 + (s.weekNumber ?? 0);
  };
  return [...slips].sort((a, b) => key(b) - key(a) || b.id - a.id);
}

/** A file name for the slip's PDF that never collides between two slips of the same month (weekly production pay). */
export function slipPdfFileName(s: SlipLike & { slipNumber?: string | null }): string {
  const base = (s.slipNumber || `${s.year}-${s.month}-${s.id}`).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `salary-slip-${base || s.id}.pdf`;
}
