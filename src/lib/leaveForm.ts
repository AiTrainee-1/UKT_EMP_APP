// The Leave page's own rules (owner 2026-10-31): Casual Leave left the leave form; the employee now says WHY with one of
// four reason categories. The category is descriptive only (backend LeaveRequest.reason_category): it changes neither the
// leave type nor any balance. Pure, tested in leaveForm.test.ts.

export type ReasonCategory = 'sick' | 'emergency' | 'personal' | 'other';

export const REASON_CATEGORIES: readonly { key: ReasonCategory; label: string; icon: string; hint: string }[] = [
  { key: 'sick', label: 'Sick Leave', icon: 'medical-bag', hint: 'You are unwell or seeing a doctor' },
  { key: 'emergency', label: 'Emergency', icon: 'alert-circle-outline', hint: 'Something urgent came up' },
  { key: 'personal', label: 'Personal', icon: 'account-heart-outline', hint: 'Family or personal work' },
  { key: 'other', label: 'Other Reasons', icon: 'dots-horizontal-circle-outline', hint: 'Anything else' },
];

const LABEL: Record<string, string> = Object.fromEntries(REASON_CATEGORIES.map((c) => [c.key, c.label]));

export function isReasonCategory(value: unknown): value is ReasonCategory {
  return typeof value === 'string' && value in LABEL;
}

export function reasonCategoryLabel(value: string | null | undefined): string | null {
  return value && LABEL[value] ? LABEL[value] : null;
}

export function reasonCategoryIcon(value: string | null | undefined): string {
  return REASON_CATEGORIES.find((c) => c.key === value)?.icon ?? 'umbrella-outline';
}

/** The leave type the app sends with every request: a plain "Leave", never a Casual Leave type (Casual Leave is its own
 *  request now) and never an id the app made up. */
export const PLAIN_LEAVE_TYPE = 'Leave';

/** A leave card's title: the reason category when the request has one; older requests keep their type, except the old
 *  server default "casual", which was never Casual Leave and would be mistaken for it. */
export function leaveTitle(r: { reasonCategory?: string | null; leaveType?: string | null; isHalfDay?: boolean }): string {
  const category = reasonCategoryLabel(r.reasonCategory);
  if (category) return r.isHalfDay ? `${category} · Half day` : category;
  if (r.isHalfDay) return 'Half-Day Leave';
  const type = String(r.leaveType ?? '').trim();
  if (!type || type.toLowerCase() === 'casual') return 'Leave';
  return type;
}

/** The day "Taken this month" looks at for a leave from `start` to `end`: a day of the range inside today's month when
 *  there is one (a leave from 30 Sep to 2 Oct is taken in October too), else the start. */
export function leaveDayForMonth(start: string, end: string | null | undefined, today: Date): string {
  const first = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const last = `${first.slice(0, 8)}${String(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  const stop = end && end >= start ? end : start;
  if (stop < first || start > last) return start;
  return start >= first ? start : first;
}
