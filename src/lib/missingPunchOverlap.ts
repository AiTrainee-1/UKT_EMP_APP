// A friendly reminder on the Report Missing Punch form when that day already has requests (owner, 2026-10-31: "No need
// to block duplicate requests. Instead, display a reminder if the employee has already submitted a request. However,
// employees should be allowed to submit requests for 2-3 different punches on the same day."). Never blocks sending.
// Pure, tested in missingPunchOverlap.test.ts.

import { waitingPhrase, type ApprovalProgress } from './approval.ts';
import { istDateOf, missingPunchGroup } from './myRequests.ts';

export type OverlapRow = {
  id: number;
  date: string;
  punchSlot?: string | null;
  punchType?: string | null;
  status: string;
  approval?: ApprovalProgress | null;
};

/** Short names, as the employee says them. */
export const SHORT_SLOT_LABEL: Record<string, string> = {
  morning_in: 'Morning in',
  lunch_out: 'Lunch out',
  lunch_in: 'Lunch back in',
  evening_out: 'Evening out',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function slotName(r: OverlapRow): string {
  if (r.punchSlot && SHORT_SLOT_LABEL[r.punchSlot]) return SHORT_SLOT_LABEL[r.punchSlot];
  return String(r.punchType ?? '').toUpperCase() === 'OUT' ? 'Check-out' : 'Check-in';
}

/** "30 Oct" from "2026-10-30". */
export function shortDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : date;
}

/** "approved" / "waiting for your Department Head" / "waiting for approval". */
export function stateWords(r: OverlapRow): string {
  if (missingPunchGroup(r.status) === 'approved') return 'approved';
  const who = waitingPhrase(r.approval);
  return who ? `waiting for ${who}` : 'waiting for approval';
}

/**
 * The live (not rejected) requests of `date` (India date), split into the ones for the same punch `slot` and the ones
 * for the day's other punches. Order is kept (the server sends newest first).
 */
export function punchOverlap<T extends OverlapRow>(rows: readonly T[], date: string, slot: string): { same: T[]; others: T[] } {
  const day = istDateOf(date);
  const live = rows.filter((r) => {
    const g = missingPunchGroup(r.status);
    return (g === 'waiting' || g === 'approved') && day != null && istDateOf(r.date) === day;
  });
  return {
    same: live.filter((r) => r.punchSlot === slot),
    others: live.filter((r) => r.punchSlot !== slot),
  };
}

/**
 * The two lines the form shows above the send button (either may be null):
 *   repeat: "You already sent a request for Lunch out on 30 Oct (waiting for your Department Head). Send another only if
 *            something changed."
 *   also:   "Also asked for this day: Morning in (approved), Evening out (waiting for HR)"
 */
export function overlapNotice(rows: readonly OverlapRow[], date: string, slot: string): { repeat: string | null; also: string | null } {
  const { same, others } = punchOverlap(rows, date, slot);
  let repeat: string | null = null;
  if (same.length) {
    const name = SHORT_SLOT_LABEL[slot] ?? 'this punch';
    const what = same.length === 1 ? 'a request' : `${same.length} requests`;
    // An approved one says the most; else the newest.
    const shown = same.find((r) => missingPunchGroup(r.status) === 'approved') ?? same[0];
    repeat = `You already sent ${what} for ${name} on ${shortDay(date)} (${stateWords(shown)}). Send another only if something changed.`;
  }
  // One mention per other punch (the newest request for it).
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const r of others) {
    const name = slotName(r);
    if (seen.has(name)) continue;
    seen.add(name);
    parts.push(`${name} (${stateWords(r)})`);
  }
  return { repeat, also: parts.length ? `Also asked for this day: ${parts.join(', ')}` : null };
}
