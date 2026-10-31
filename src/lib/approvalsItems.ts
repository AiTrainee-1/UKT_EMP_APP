// How one request on the Approvals tab is worded: who, what, when (pure functions, unit-tested in approvalsItems.test.ts).
// Moved out of app/(tabs)/approvals.tsx when the tab was split into src/components/approvals/*; the wording is unchanged
// ("Leave · Sick Leave", "Casual Leave · Half day (...)", "Mark as Present", "Morning Check-In" ...), only the date
// parsing is now time-zone safe (parseDay instead of new Date("YYYY-MM-DD")).

import { claimDateLabel, claimTypeLabel, type ClaimLike } from './compensation.ts';
import { permissionOutcome, permissionTypeLabel, type PermissionBadgeVariant } from './permissions.ts';
import { fmtDay, type ApprovalCategory, type ApprovalStatus } from './approvalsHistory.ts';

/** The same words src/hooks/useRequests.ts::PUNCH_SLOT_LABEL uses (kept here so this file stays free of React Native). */
const PUNCH_SLOT_LABEL: Record<string, string> = {
  morning_in: 'Morning Check-In',
  lunch_out: 'Lunch Check-Out',
  lunch_in: 'Lunch Check-In',
  evening_out: 'Evening Check-Out',
};

type Item = Record<string, any>;

export function empName(item: Item | null | undefined): string {
  return item?.employeeName || item?.employee?.name || '—';
}

export function empCode(item: Item | null | undefined): string {
  return item?.employeeCode || item?.employee?.code || item?.employee?.employeeCode || '—';
}

export function empInitial(item: Item | null | undefined): string {
  const name = empName(item);
  return name !== '—' && name[0] ? name[0].toUpperCase() : '?';
}

/** "Sewing" (the department) where the row carries one. */
export function empDepartment(item: Item | null | undefined): string | null {
  const d = item?.departmentName ?? item?.department ?? item?.employee?.department;
  return typeof d === 'string' && d.trim() ? d : null;
}

export function totalDays(item: Item): string | null {
  const d = item.totalDays ?? item.days;
  return d ? `${d} day(s)` : null;
}

export function appliedOn(item: Item): string {
  return fmtDay(item.appliedOn || item.createdAt);
}

/** What the request is: the chip on a card and the "Type" row of the sheet. */
export function itemTypeLabel(category: ApprovalCategory, item: Item): string {
  switch (category) {
    case 'leave': {
      const reasonCategory = item.reasonCategoryLabel;
      return reasonCategory ? `Leave · ${reasonCategory}` : item.leaveType || item.leaveTypeName || '—';
    }
    case 'permission':
      // Morning Late-In / Evening Early-Out / Middle One-Hour Permission. The raw `type` is the legacy wire spelling.
      return permissionTypeLabel({ type: item.type ?? item.permissionType, typeKey: item.typeKey, typeLabel: item.typeLabel });
    case 'casualLeave':
      return item.portion && item.portion !== 'full' && item.portionLabel ? `Casual Leave · ${item.portionLabel}` : 'Casual Leave';
    case 'attendance':
      return item.requestedStatus ? `Mark as ${item.requestedStatus}` : 'Attendance Override';
    case 'missingPunch':
      return item.punchSlot && PUNCH_SLOT_LABEL[item.punchSlot]
        ? PUNCH_SLOT_LABEL[item.punchSlot]
        : item.punchType === 'IN'
          ? 'Check-In'
          : 'Check-Out';
    case 'outpass':
      return item.destination || 'Outpass';
    case 'onDuty':
      return item.destination ? `On-Duty · ${item.destination}` : 'On-Duty';
    case 'holidayWork':
      return claimTypeLabel(item as ClaimLike);
    case 'resignation':
      return 'Resignation';
    default:
      return '—';
  }
}

/** When it is for: "06 Oct → 08 Oct 2026 · 3 day(s)", "10 Oct 2026 · 09:30", ... */
export function itemDateLabel(category: ApprovalCategory, item: Item): string {
  switch (category) {
    case 'leave': {
      const days = totalDays(item);
      const range =
        item.startDate && item.endDate && item.startDate !== item.endDate
          ? `${fmtDay(item.startDate, 'dd MMM')} → ${fmtDay(item.endDate)}`
          : fmtDay(item.startDate);
      return range + (days ? ` · ${days}` : '');
    }
    case 'permission': {
      const time = item.time ?? item.permissionTime;
      return `${fmtDay(item.date)}${time ? ` · ${time}` : ''}`;
    }
    case 'missingPunch':
      return `${fmtDay(item.date)}${item.punchTime ? ` · ${item.punchTime}` : ''}`;
    case 'casualLeave':
    case 'attendance':
      return fmtDay(item.date);
    case 'outpass':
      return appliedOn(item);
    case 'onDuty': {
      const n = onDutyPunches(item).length;
      return `${fmtDay(item.date ?? item.createdAt)}${n ? ` · ${n} ${n === 1 ? 'punch' : 'punches'}` : ' · No punches yet'}`;
    }
    case 'holidayWork':
      return claimDateLabel(item as ClaimLike);
    case 'resignation':
      return `Submitted ${fmtDay(item.createdAt)}${item.lastWorkingDate ? ` · Last day ${fmtDay(item.lastWorkingDate)}` : ''}`;
    default:
      return '—';
  }
}

/** The badge on a card. A permission shows its own outcome (Pending / Allowed / Excess ...); everything else the list's
 *  status. */
export function itemBadge(
  category: ApprovalCategory,
  status: ApprovalStatus,
  item: Item,
): { label: string; variant: PermissionBadgeVariant } {
  // Approved by a Department Head, final word still with HR.
  if (item?.outcome?.state === 'in_progress') return { label: 'With HR', variant: 'onleave' };
  if (category === 'permission') {
    const o = permissionOutcome(item as any);
    return { label: o.label, variant: o.badge };
  }
  if (status === 'approved') return { label: 'Approved', variant: 'approved' };
  if (status === 'rejected') return { label: 'Rejected', variant: 'rejected' };
  return { label: 'Pending', variant: 'pending' };
}

// ── On-Duty ─────────────────────────────────────────────────────────────────

export interface OnDutyPunchRow {
  id: number;
  punchDate?: string | null;
  /** "HH:MM" */
  punchTime?: string | null;
  punchType?: string | null;
  punchNumber?: number | null;
  status?: string | null;
  hasPhoto?: boolean;
  hasPhoto2?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  isMocked?: boolean;
}

/** The punches recorded under an On-Duty request (GET /manager/requests sends them; the old pending list does not). */
export function onDutyPunches(item: Item | null | undefined): OnDutyPunchRow[] {
  const raw = item?.punches;
  return Array.isArray(raw) ? raw.filter((p) => p && typeof p === 'object' && typeof p.id === 'number') : [];
}

/** "9:05 AM" from "09:05" (or the text as it came). */
export function clock12(hhmm: unknown): string {
  const m = typeof hhmm === 'string' ? /^(\d{1,2}):(\d{2})/.exec(hhmm) : null;
  if (!m) return typeof hhmm === 'string' && hhmm ? hhmm : '—';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "In 9:05 AM · Out 1:00 PM" for a card. */
export function onDutyPunchLine(item: Item | null | undefined): string | null {
  const punches = onDutyPunches(item);
  if (!punches.length) return null;
  return punches.map((p) => `${p.punchType === 'OUT' ? 'Out' : 'In'} ${clock12(p.punchTime)}`).join(' · ');
}
