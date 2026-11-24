// The employee's own compensation claims, in ONE place (pure functions, no React Native, unit-tested in
// compensationClaims.test.ts).
//
// Since 2026-11-19 an employee claims compensation themselves (and HR can still claim for them); every claim goes to the
// employee's Department Head. The server (backend/api/employee_compensation_views.py + compensation_claims.py):
//   GET    /employee/compensation                 items carry `claimable`, `claimKind`, `claim`, `suggestedShifts`;
//                                                 top level `canClaim`, `claimWindowDays`, `useBalance`
//   POST   /employee/compensation/claims          {kind, date, overtimeRecordId?, shifts?, reason} -> 201 the claim
//   POST   /employee/compensation/use             {date, shifts, reason} -> 201 the claim (kind use_balance)
//   GET    /employee/compensation/claims          the employee's own claims, newest first
//   DELETE /employee/compensation/claims/<id>     withdraw one that still waits
// Refusals come back as `{error, code}` with a plain sentence, shown as it is.
//
// NOTE the app's axios client turns every request body key into snake_case (src/lib/caseKeys.ts), so `overtimeRecordId`
// goes over the wire as `overtime_record_id`.
//
// An OLDER server has none of this: `canClaim` is null and nothing here is used (compensation.ts keeps the read-only
// screen).

import {
  CLAIM_KIND_LABEL,
  CLAIM_STATUS_LABEL,
  claimKindFrom,
  formatLongDate,
  minutesText,
  parseIsoDate,
  prettify,
  readClaimOvertime,
  readRaisedByRole,
  shiftsLabel,
  type ClaimFields,
  type ClaimKind,
  type ClaimOvertime,
  type CompensationItem,
  type UseBalanceInfo,
} from './compensation.ts';
import { checkRequestDate } from './requestWindow.ts';

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
const isoOrNull = (v: unknown): string | null => (parseIsoDate(v) ? str(v).slice(0, 10) : null);

// ── shifts in quarters ──────────────────────────────────────────────────────

/** The amounts a claim or a use-balance request can be: quarters of a shift, at most one shift a day. */
export const QUARTERS: readonly number[] = [0.25, 0.5, 0.75, 1];

const EPS = 1e-9;

/** `n` rounded DOWN to a quarter (0.6 -> 0.5), never below 0. */
export function floorToQuarter(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n * 4 + EPS) / 4;
}

/** 0.25, 0.50, 0.75 or 1.00 (a float from JSON such as 0.5000001 counts). */
export function isQuarterShift(n: unknown): n is number {
  return typeof n === 'number' && QUARTERS.some((q) => Math.abs(q - n) < 1e-6);
}

export interface ShiftChoice {
  value: number;
  /** "0.25", "0.50", "0.75", "1.00" */
  label: string;
  enabled: boolean;
}

/** The four quarters, those above `max` disabled (`max` null: all enabled). */
export function shiftChoices(max: number | null): ShiftChoice[] {
  return QUARTERS.map((value) => ({
    value,
    label: value.toFixed(2),
    enabled: max == null || value <= max + EPS,
  }));
}

/** The largest enabled choice, or null when none is. */
export function largestChoice(choices: readonly ShiftChoice[]): number | null {
  const on = choices.filter((c) => c.enabled);
  return on.length ? on[on.length - 1].value : null;
}

// ── claiming an item ────────────────────────────────────────────────────────

/** The part of an item (90-day list or year history) a claim reads. */
export type ClaimSource = Pick<CompensationItem, 'key' | 'kind' | 'date' | 'workDate' | 'shifts' | 'minutes' | 'title'> &
  ClaimFields;

/** The claim kinds an employee claims from an item (use_balance is its own form). */
export const ITEM_CLAIM_KINDS: readonly ClaimKind[] = ['holiday_work', 'ot_allowance', 'ot_shift', 'birthday'];

/** Where an item stands as a claim: claimable now, claimed and waiting, approved, not approved; null for none of these. */
export type ItemClaimState = 'claimable' | 'pending' | 'approved' | 'rejected';

export function itemClaimState(item: Pick<ClaimFields, 'claimable' | 'claim'>): ItemClaimState | null {
  const s = item.claim?.status ?? '';
  if (s === 'pending' || s === 'claim_pending') return 'pending';
  if (s === 'approved' || s === 'claim_approved') return 'approved';
  // a claim that was not approved can be claimed again while the server still says so
  if (item.claimable) return 'claimable';
  if (s === 'rejected' || s === 'claim_rejected') return 'rejected';
  return null;
}

/** Whether the Claim button shows on an item: the server lets this employee claim (`canClaim`), says this item is
 *  claimable, names a kind this app can claim, and no claim of it waits or was approved. */
export function canClaimItem(canClaim: boolean | null | undefined, item: ClaimSource): boolean {
  if (canClaim !== true || !item.claimable || !item.claimKind) return false;
  if (!ITEM_CLAIM_KINDS.includes(item.claimKind)) return false;
  if (item.claimKind === 'ot_allowance' || item.claimKind === 'ot_shift') {
    if (item.overtimeRecordId == null) return false;
  }
  return itemClaimState(item) === 'claimable' && !!claimDate(item);
}

/** The items to list under "Can be claimed": claimable now, newest first. */
export function claimableItems<T extends ClaimSource>(canClaim: boolean | null | undefined, items: readonly T[]): T[] {
  return items
    .filter((i) => canClaimItem(canClaim, i))
    .sort((a, b) => (claimDate(b) ?? '').localeCompare(claimDate(a) ?? '') || b.key.localeCompare(a.key));
}

/** The date a claim of this item is for: the day worked (Sunday / holiday), else the item's date (OT day, birthday). */
export function claimDate(item: Pick<ClaimSource, 'claimKind' | 'date' | 'workDate'>): string | null {
  if (item.claimKind === 'holiday_work') return item.workDate ?? item.date;
  return item.date ?? item.workDate;
}

export interface ClaimDraft {
  kind: ClaimKind;
  /** YYYY-MM-DD */
  date: string;
  overtimeRecordId: number | null;
  /** The quarters the employee picks from; null when the claim has no amount to pick (OT allowance, birthday). */
  shiftOptions: ShiftChoice[] | null;
  /** The amount the picker starts on. */
  defaultShifts: number | null;
  /** The amount a claim without a picker credits (birthday: 1.00 shift); null for none (OT allowance). */
  fixedShifts: number | null;
  minutes: number | null;
  /** The sheet's title ("Claim OT credit"). */
  title: string;
  /** What is claimed, in one sentence. */
  summary: string;
  /** What happens after the Department Head's decision. */
  note: string;
}

const TITLE: Record<ClaimKind, string> = {
  holiday_work: 'Claim Sunday / holiday work',
  ot_allowance: 'Claim OT allowance',
  ot_shift: 'Claim OT credit',
  birthday: 'Claim birthday credit',
  use_balance: 'Use my balance',
};

/** What the claim sheet shows and sends for an item, or null when the item cannot be claimed as it is. */
export function claimDraftFor(item: ClaimSource): ClaimDraft | null {
  const kind = item.claimKind;
  const date = claimDate(item);
  if (!kind || !ITEM_CLAIM_KINDS.includes(kind) || !date) return null;
  const day = formatLongDate(date) || date;
  const minutes = item.claim?.minutes ?? item.minutes;
  const base = { kind, date, overtimeRecordId: item.overtimeRecordId, minutes, title: TITLE[kind] };
  switch (kind) {
    case 'holiday_work': {
      // any quarter; the picker starts on what the server suggests (else a full shift)
      const start = floorToQuarter(Math.min(1, item.suggestedShifts ?? 1)) || 1;
      return {
        ...base,
        shiftOptions: shiftChoices(null),
        defaultShifts: start,
        fixedShifts: null,
        summary: `You worked on ${day}.`,
        note: 'Your Department Head approves it, then the shifts are added to your compensation balance to take as time off later.',
      };
    }
    case 'ot_shift': {
      if (item.overtimeRecordId == null) return null;
      // never above what the OT earns by the quarters rule
      const suggested = item.suggestedShifts ?? item.shifts;
      const max = suggested != null ? floorToQuarter(Math.min(1, suggested)) : null;
      if (max != null && max < 0.25) return null;
      const options = shiftChoices(max);
      const past = minutesText(minutes);
      return {
        ...base,
        shiftOptions: options,
        defaultShifts: largestChoice(options),
        fixedShifts: null,
        summary: `Extra hours on ${day}${past ? `: ${past} past your shift end` : ''}.`,
        note:
          (max != null ? `You can claim up to ${shiftsLabel(max)} for it. ` : '') +
          'Once your Department Head approves it, the shifts are added to your compensation balance.',
      };
    }
    case 'ot_allowance': {
      if (item.overtimeRecordId == null) return null;
      const amount = minutesText(minutes);
      return {
        ...base,
        shiftOptions: null,
        defaultShifts: null,
        fixedShifts: null,
        summary: `You worked late on ${day}${amount ? `: a ${amount} late-in allowance` : ''}.`,
        note:
          `Once your Department Head approves it, you may arrive up to ${amount ?? 'the allowance'} later on your next working ` +
          `day after ${day} without being marked late.`,
      };
    }
    case 'birthday': {
      const credit = item.suggestedShifts ?? item.shifts ?? 1;
      return {
        ...base,
        shiftOptions: null,
        defaultShifts: null,
        fixedShifts: credit,
        summary: `You worked on your birthday, ${day}.`,
        note: `Once your Department Head approves it, ${shiftsLabel(credit)} is added to your compensation balance, to take as a day off later.`,
      };
    }
    default:
      return null;
  }
}

/** The fewest characters a reason may have (the same rule as the other request forms). */
export const REASON_MIN = 5;
export const REASON_MAX = 300;
export const REASON_SHORT_MESSAGE = `Please give a reason (at least ${REASON_MIN} letters).`;

export interface ClaimBody {
  kind: ClaimKind;
  date: string;
  overtimeRecordId?: number;
  shifts?: number;
  reason: string;
}

export type BuildResult<B> =
  | { ok: true; body: B }
  | { ok: false; field: 'shifts' | 'reason' | 'date'; error: string };

function checkReason(reason: string): string | null {
  const r = reason.trim();
  if (r.length < REASON_MIN) return REASON_SHORT_MESSAGE;
  if (r.length > REASON_MAX) return `Please keep the reason under ${REASON_MAX} letters.`;
  return null;
}

/** The body of POST /employee/compensation/claims for a draft, or why it cannot be sent yet. */
export function buildClaimBody(draft: ClaimDraft, shifts: number | null, reason: string): BuildResult<ClaimBody> {
  const body: ClaimBody = { kind: draft.kind, date: draft.date, reason: reason.trim() };
  if (draft.overtimeRecordId != null) body.overtimeRecordId = draft.overtimeRecordId;
  if (draft.shiftOptions) {
    const choice = draft.shiftOptions.find((c) => shifts != null && Math.abs(c.value - shifts) < 1e-6);
    if (!choice) return { ok: false, field: 'shifts', error: 'Choose how much to claim.' };
    if (!choice.enabled) {
      const max = largestChoice(draft.shiftOptions);
      return { ok: false, field: 'shifts', error: max != null ? `You can claim up to ${shiftsLabel(max)}.` : 'Choose how much to claim.' };
    }
    body.shifts = choice.value;
  }
  const why = checkReason(reason);
  if (why) return { ok: false, field: 'reason', error: why };
  return { ok: true, body };
}

// ── using the balance ───────────────────────────────────────────────────────

/** What a new use-balance request may take: the server's available (balance - waiting requests), else the balance. */
export function availableToUse(info: UseBalanceInfo | null | undefined, balance: number): number {
  const v = info ? info.availableShifts : balance;
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}

/** The quarters a use-balance request can be: up to what is available, at most 1.00 shift a day. */
export function useBalanceChoices(available: number): ShiftChoice[] {
  return shiftChoices(floorToQuarter(Math.min(1, available)));
}

/** Whether "Use my balance" can be opened, and if not, why (the server's message, else this app's). */
export function useBalanceState(
  canClaim: boolean | null | undefined,
  info: UseBalanceInfo | null | undefined,
  balance: number,
): { shown: boolean; enabled: boolean; why: string | null } {
  if (canClaim !== true || !info) return { shown: false, enabled: false, why: null };
  const available = availableToUse(info, balance);
  if (!info.allowed) return { shown: true, enabled: false, why: info.message ?? 'You cannot use your balance right now.' };
  if (available < 0.25) {
    return {
      shown: true,
      enabled: false,
      why:
        info.pendingShifts > 0
          ? 'Everything in your balance is already asked for in requests that wait for your Department Head.'
          : 'Your balance is empty: there is nothing to use yet.',
    };
  }
  return { shown: true, enabled: true, why: null };
}

/** "Balance 1.50 shifts · waiting 0.50 shift · available 1.00 shift" */
export function useBalanceLine(info: UseBalanceInfo | null | undefined, balance: number): string {
  const total = info ? info.balanceShifts : balance;
  const parts = [`Balance ${shiftsLabel(total)}`];
  if (info && info.pendingShifts > 0) parts.push(`waiting ${shiftsLabel(info.pendingShifts)}`);
  parts.push(`available ${shiftsLabel(availableToUse(info, balance))}`);
  return parts.join(' · ');
}

export interface UseBody {
  date: string;
  shifts: number;
  reason: string;
}

/** The body of POST /employee/compensation/use, or why it cannot be sent yet. The date must be in the request window
 *  (current month; last month too on the 1st-5th: requestWindow.ts, the server's rule) and the shifts within what is
 *  available. The server checks the rest (a working day, not already a full day). */
export function buildUseBody(
  date: string,
  shifts: number | null,
  reason: string,
  available: number,
  now: Date,
): BuildResult<UseBody> {
  const dateMessage = checkRequestDate(date, now);
  if (dateMessage) return { ok: false, field: 'date', error: dateMessage };
  if (shifts == null || !isQuarterShift(shifts)) return { ok: false, field: 'shifts', error: 'Choose how much of your balance to use.' };
  if (shifts > available + EPS) {
    return { ok: false, field: 'shifts', error: `You have ${shiftsLabel(available)} available to use.` };
  }
  const why = checkReason(reason);
  if (why) return { ok: false, field: 'reason', error: why };
  return { ok: true, body: { date, shifts, reason: reason.trim() } };
}

// ── "My claims" ─────────────────────────────────────────────────────────────

export interface MyClaim {
  id: number;
  /** The kind, or null for a kind added later (then `kindLabel` is the server's). */
  kind: ClaimKind | null;
  kindLabel: string;
  /** pending | approved | rejected | withdrawn, or a status added later. */
  status: string;
  statusLabel: string;
  /** The claim's date: the day worked, the OT day, the birthday, or the day off of a use-balance request. */
  date: string | null;
  /** Use balance: the day off. */
  useDate: string | null;
  shifts: number | null;
  minutes: number | null;
  reason: string;
  raisedByRole: 'employee' | 'hr' | null;
  requestedBy: string | null;
  createdAt: string | null;
  reviewedBy: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  overtime: ClaimOvertime | null;
  dayKind: string | null;
  holidayName: string | null;
  /** The employee may withdraw it (it waits, and they raised it, unless the server says otherwise). */
  canWithdraw: boolean;
}

function readMyClaim(raw: unknown): MyClaim | null {
  if (!isObject(raw)) return null;
  const id = num(raw.id);
  if (id == null || !Number.isInteger(id) || id <= 0) return null;
  const rawKind = str(raw.kind);
  // an older shape (no kind) is a Sunday / holiday work claim
  const kind = rawKind ? claimKindFrom(rawKind) : 'holiday_work';
  const status = str(raw.status);
  const raisedByRole = readRaisedByRole(raw.raisedByRole);
  const useDate = isoOrNull(raw.useDate);
  const date = (kind === 'use_balance' ? useDate : null) ?? isoOrNull(raw.date) ?? isoOrNull(raw.workDate) ?? useDate;
  const pending = status === 'pending';
  return {
    id,
    kind,
    kindLabel: (kind ? CLAIM_KIND_LABEL[kind] : '') || str(raw.kindLabel) || prettify(rawKind) || 'Compensation',
    status,
    statusLabel: str(raw.statusLabel) || CLAIM_STATUS_LABEL[status] || prettify(status),
    date,
    useDate,
    shifts: num(raw.shifts),
    minutes: num(raw.minutes),
    reason: str(raw.reason),
    raisedByRole,
    requestedBy: str(raw.requestedBy) || null,
    createdAt: str(raw.createdAt) || null,
    reviewedBy: str(raw.reviewedBy) || null,
    reviewComment: str(raw.reviewComment) || null,
    reviewedAt: str(raw.reviewedAt) || null,
    overtime: readClaimOvertime(raw.overtime),
    dayKind: str(raw.dayKind) || null,
    holidayName: str(raw.holidayName) || null,
    canWithdraw: typeof raw.canWithdraw === 'boolean' ? raw.canWithdraw && pending : pending && raisedByRole !== 'hr',
  };
}

/**
 * The reply of GET /employee/compensation/claims: a list, or an object holding it (`items`, `claims` or `results`).
 * Null when it is neither (the hook turns that into an error). Rows that do not parse are left out; newest first.
 */
export function normalizeMyClaims(raw: unknown): MyClaim[] | null {
  const list = Array.isArray(raw)
    ? raw
    : isObject(raw)
      ? [raw.items, raw.claims, raw.results].find((v) => Array.isArray(v))
      : undefined;
  if (!Array.isArray(list)) return null;
  const seen = new Set<number>();
  const out: MyClaim[] = [];
  for (const r of list) {
    const c = readMyClaim(r);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out.sort(
    (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id,
  );
}

export type ClaimFilter = 'all' | 'pending' | 'approved' | 'rejected';

export const CLAIM_FILTERS: { key: ClaimFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Not approved' },
];

/** Which filter a claim's status belongs to ('all' only: withdrawn and statuses added later). */
export function claimFilterOf(status: string): ClaimFilter {
  if (status === 'pending') return 'pending';
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'all';
}

export function filterClaims(claims: readonly MyClaim[], filter: ClaimFilter): MyClaim[] {
  return filter === 'all' ? [...claims] : claims.filter((c) => claimFilterOf(c.status) === filter);
}

export function claimCounts(claims: readonly MyClaim[]): Record<ClaimFilter, number> {
  const out: Record<ClaimFilter, number> = { all: claims.length, pending: 0, approved: 0, rejected: 0 };
  for (const c of claims) {
    const f = claimFilterOf(c.status);
    if (f !== 'all') out[f] += 1;
  }
  return out;
}

/** The claim's title: "OT credit: 0.50 shift", "OT allowance: 30 min", "Sunday work: 1.00 shift", "Use balance: 0.50 shift". */
export function myClaimTitle(c: MyClaim): string {
  let name = c.kindLabel;
  if (c.kind === 'holiday_work') name = c.dayKind === 'sunday' ? 'Sunday work' : c.dayKind === 'holiday' ? 'Holiday work' : name;
  const amount = c.kind === 'ot_allowance' ? minutesText(c.minutes) : shiftsLabel(c.shifts);
  return amount ? `${name}: ${amount}` : name;
}

export interface ClaimFact {
  icon: string;
  text: string;
}

/** The small facts under a claim: its day, who raised it, the overtime it is about, the decision's comment. */
export function myClaimFacts(c: MyClaim): ClaimFact[] {
  const facts: ClaimFact[] = [];
  const day = formatLongDate(c.date);
  if (day) {
    const what =
      c.kind === 'use_balance' ? 'Day off' : c.kind === 'birthday' ? 'Birthday' : c.kind === 'holiday_work' ? 'Worked' : 'OT on';
    facts.push({ icon: c.kind === 'use_balance' ? 'calendar-arrow-left' : 'calendar-month-outline', text: `${what} ${day}` });
  }
  if (c.holidayName) facts.push({ icon: 'party-popper', text: c.holidayName });
  const extra = minutesText(c.overtime?.extraMinutes);
  if (extra) facts.push({ icon: 'clock-outline', text: `${extra} past shift end` });
  if (c.raisedByRole) {
    facts.push(
      c.raisedByRole === 'employee'
        ? { icon: 'account-outline', text: 'Raised by you' }
        : { icon: 'account-tie-outline', text: c.requestedBy ? `Raised by HR (${c.requestedBy})` : 'Raised by HR' },
    );
  }
  return facts;
}

/** The line about the decision: "Not approved by Kavya: not on the roster.", "Approved by Kavya."; null while it waits. */
export function myClaimDecisionLine(c: MyClaim): string | null {
  if (c.status !== 'approved' && c.status !== 'rejected') return null;
  const verb = c.status === 'approved' ? 'Approved' : 'Not approved';
  const by = c.reviewedBy ? ` by ${c.reviewedBy}` : '';
  return c.reviewComment ? `${verb}${by}: ${c.reviewComment}` : `${verb}${by}.`;
}

// ── notifications ───────────────────────────────────────────────────────────

/**
 * A "compensation" notification opens the Compensation screen on its claim (`?focus=<claim id>`). The claim is a row
 * "hw-<id>" of the list, or the `claim` of the item it was made for (an OT day, a birthday), or a row of My claims. Each
 * claim id is given to ONE row, so only one card pulses: the "hw-<id>" row first, else the first item whose claim it is.
 * Returns the id each item key carries for the highlight (absent: none).
 */
export function claimFocusIds(items: readonly { key: string; claim?: { id: number | null } | null }[]): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<number>();
  for (const it of items) {
    const m = /^hw-(\d+)$/.exec(it.key);
    if (m) {
      const id = Number(m[1]);
      if (!taken.has(id)) {
        taken.add(id);
        out.set(it.key, id);
      }
    }
  }
  for (const it of items) {
    const id = it.claim?.id;
    if (id != null && !taken.has(id) && !out.has(it.key)) {
      taken.add(id);
      out.set(it.key, id);
    }
  }
  return out;
}

// ── errors ──────────────────────────────────────────────────────────────────

export const NO_CONNECTION_MESSAGE = 'Could not reach the server. Check your connection and try again.';

/** The server's plain sentence for a refused claim / request (`error`, `message` or `detail`), else `fallback`; a request
 *  that never got an answer says so. */
export function claimErrorMessage(err: unknown, fallback: string): string {
  const e = err as
    | { response?: { data?: unknown; status?: number }; request?: unknown; isAxiosError?: boolean; code?: string }
    | null
    | undefined;
  const data = e?.response?.data;
  if (isObject(data)) {
    const text = [data.error, data.message, data.detail].find((m) => typeof m === 'string' && m.trim() !== '');
    if (typeof text === 'string') return text.trim();
  }
  if (typeof data === 'string' && data.trim() && !/^\s*</.test(data) && data.length < 300) return data.trim();
  // asked, but no answer came back (offline, timed out): not a refusal
  if (e && typeof e === 'object' && !e.response && (e.isAxiosError === true || e.request != null || !!e.code)) {
    return NO_CONNECTION_MESSAGE;
  }
  return fallback;
}
