// Permission wording in ONE place (pure functions, no React).
//
// The backend rewrote Permissions to exactly three types, each a fixed 60
// minutes (Morning Late-In, Evening Early-Out, Middle One-Hour), and only the
// first N approved permissions of a calendar month are "Allowed" -the rest are
// "Overdue / Excess" (see backend/api/leave_views.py::_permission_json).
//
// This app is installed on phones long before the matching backend is
// deployed, so everything here works against BOTH:
//   * the new API sends typeKey / typeLabel / capStatus / statusLabel;
//   * the old API sends only `type` ("Late In" | "Early Out" | "Short Leave")
//     and a lowercase `status`, so labels are derived from those instead.
// The raw legacy `type` spelling is never shown to anyone.

export type PermissionTypeKey = 'morning_late_in' | 'evening_early_out' | 'middle_permission';
/** `approved` = approved, but the server did not say whether it is within the monthly limit. */
export type PermissionOutcomeKey = 'pending' | 'approved' | 'allowed' | 'not_allowed' | 'excess';

/** Every permission is a fixed hour now. */
export const PERMISSION_DURATION_MINUTES = 60;
export const PERMISSION_DURATION_LABEL = '1 hour (60 min)';

/** Backend default (PayrollSettings.permission_monthly_cap) when nothing else says otherwise. */
export const DEFAULT_PERMISSION_MONTHLY_LIMIT = 3;

export interface PermissionTypeOption {
  key: PermissionTypeKey;
  /** What goes in the POST body. Deliberately the LEGACY spelling: the old backend rejects
   *  anything else, and the new backend accepts both. */
  wire: 'Late In' | 'Early Out' | 'Short Leave';
  label: string;
  hint: string;
  /** Caption for the time picker: what the time on the request means for this type. */
  timeLabel: string;
  /** Sensible starting time for the picker (editable). */
  defaultTime: string;
  icon: string;
}

export const PERMISSION_TYPE_OPTIONS: PermissionTypeOption[] = [
  {
    key: 'morning_late_in', wire: 'Late In', label: 'Morning Late-In',
    hint: 'Arriving up to 1 hour after shift start',
    timeLabel: 'Arriving at', defaultTime: '09:30', icon: 'login',
  },
  {
    key: 'evening_early_out', wire: 'Early Out', label: 'Evening Early-Out',
    hint: 'Leaving up to 1 hour before shift end',
    timeLabel: 'Leaving at', defaultTime: '16:30', icon: 'logout',
  },
  {
    key: 'middle_permission', wire: 'Short Leave', label: 'Middle One-Hour Permission',
    hint: 'Stepping out for 1 hour during the shift',
    timeLabel: 'Stepping out at', defaultTime: '11:00', icon: 'timer-sand',
  },
];

const OPTION_BY_KEY: Record<PermissionTypeKey, PermissionTypeOption> = {
  morning_late_in: PERMISSION_TYPE_OPTIONS[0],
  evening_early_out: PERMISSION_TYPE_OPTIONS[1],
  middle_permission: PERMISSION_TYPE_OPTIONS[2],
};

// Keyed by the NORMALISED spelling (lowercase, every run of non-alphanumerics
// collapsed to one space) so "Late In", "late-in", "Morning Late-In" and
// "morning_late_in" all meet in the same place.
const TYPE_ALIASES: Record<string, PermissionTypeKey> = {
  'morning late in': 'morning_late_in',
  'late in': 'morning_late_in',
  'evening early out': 'evening_early_out',
  'early out': 'evening_early_out',
  'middle permission': 'middle_permission',
  'middle one hour permission': 'middle_permission',
  'middle one hour': 'middle_permission',
  'short leave': 'middle_permission',
};

function normalise(s: unknown): string {
  return typeof s === 'string' ? s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() : '';
}

interface PermissionTypeInput {
  type?: string | null;
  typeKey?: string | null;
  typeLabel?: string | null;
}

/** The canonical type of a permission item, from whichever spelling the server used. */
export function resolvePermissionTypeKey(p: PermissionTypeInput): PermissionTypeKey | null {
  for (const candidate of [p.typeKey, p.typeLabel, p.type]) {
    const hit = TYPE_ALIASES[normalise(candidate)];
    if (hit) return hit;
  }
  return null;
}

/** On-screen name of a permission's type. Never the raw legacy `type` string. */
export function permissionTypeLabel(p: PermissionTypeInput): string {
  const server = typeof p.typeLabel === 'string' ? p.typeLabel.trim() : '';
  if (server) return server;
  const key = resolvePermissionTypeKey(p);
  return key ? OPTION_BY_KEY[key].label : 'Permission';
}

export function permissionTypeIcon(key: PermissionTypeKey | null): string {
  return key ? OPTION_BY_KEY[key].icon : 'hand-wave-outline';
}

/** Badge variants (src/components/ui/Badge) the outcomes map onto. `onleave` is the neutral blue. */
export type PermissionBadgeVariant = 'pending' | 'approved' | 'rejected' | 'late' | 'onleave';

export interface PermissionOutcome {
  key: PermissionOutcomeKey;
  label: string;
  badge: PermissionBadgeVariant;
}

const OUTCOME_DEFAULTS: Record<PermissionOutcomeKey, { label: string; badge: PermissionBadgeVariant }> = {
  pending: { label: 'Pending', badge: 'pending' },
  approved: { label: 'Approved', badge: 'onleave' },
  allowed: { label: 'Allowed', badge: 'approved' },
  not_allowed: { label: 'Not Allowed', badge: 'rejected' },
  excess: { label: 'Overdue / Excess', badge: 'late' },
};

interface PermissionOutcomeInput {
  status?: string | null;
  capStatus?: string | null;
  statusLabel?: string | null;
}

/** True when the server said where a permission stands against the month's limit (new backend only). */
export function hasCapInfo(p: { capStatus?: string | null; statusLabel?: string | null }): boolean {
  return p.capStatus != null || (typeof p.statusLabel === 'string' && p.statusLabel.trim() !== '');
}

/**
 * Pending / Allowed / Not Allowed / Overdue-Excess for one permission.
 *
 * New backend: status + capStatus decide it, statusLabel is the wording.
 * Old backend (neither capStatus nor statusLabel): the server cannot say whether an approved
 * permission protects the day, so it is plain "Approved" (neutral blue) and a rejected one plain
 * "Rejected" -no "Allowed" / "Not Allowed" / "Excess" claims it cannot back.
 */
export function permissionOutcome(p: PermissionOutcomeInput): PermissionOutcome {
  const status = typeof p.status === 'string' ? p.status.toLowerCase() : '';
  const server = typeof p.statusLabel === 'string' ? p.statusLabel.trim() : '';
  const capKnown = hasCapInfo(p);

  let key: PermissionOutcomeKey;
  if (status === 'pending') key = 'pending';
  else if (status === 'rejected') key = 'not_allowed';
  else if (status === 'approved') key = p.capStatus === 'excess' ? 'excess' : capKnown ? 'allowed' : 'approved';
  else {
    // Status missing/unknown: fall back on the wording, else stay neutral.
    const said = normalise(server);
    if (said.includes('excess') || said.includes('overdue')) key = 'excess';
    else if (said.includes('not allowed')) key = 'not_allowed';
    else if (said.includes('allowed')) key = 'allowed';
    else key = 'pending';
  }

  const d = OUTCOME_DEFAULTS[key];
  const fallback = key === 'not_allowed' && !capKnown ? 'Rejected' : d.label;
  return { key, label: server || fallback, badge: d.badge };
}

/**
 * Whether the server speaks the monthly-limit rules (Allowed / Overdue-Excess, the free pool):
 * any of the policy, the summary's new cap/allowance, or a permission's capStatus/statusLabel.
 * An older backend sends none of them, and then the screens state the rules neutrally.
 */
export function capRulesKnown(input: {
  policy?: unknown;
  summary?: { permissionMonthlyCap?: number; freeAllowance?: number } | null;
  items?: { hasCapInfo: boolean }[];
}): boolean {
  return (
    input.policy != null
    || input.summary?.permissionMonthlyCap != null
    || input.summary?.freeAllowance != null
    || !!input.items?.some((i) => i.hasCapInfo)
  );
}

/** "1 hour (60 min)" for the standard length, "45 min" for an older request, null when unknown. */
export function formatPermissionDuration(minutes?: number | null): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes === PERMISSION_DURATION_MINUTES ? PERMISSION_DURATION_LABEL : `${minutes} min`;
}

/**
 * The month's permission limit. The shift-stats summary always carries it on the new backend;
 * the permission list only does once it has at least one row; the old backend's is 3.
 */
export function resolvePermissionLimit(statsCap?: number | null, listLimit?: number | null): number {
  if (typeof statsCap === 'number' && statsCap >= 0) return statsCap;
  if (typeof listLimit === 'number' && listLimit >= 0) return listLimit;
  return DEFAULT_PERMISSION_MONTHLY_LIMIT;
}

/** Message for a failed POST /permissions: the server's own text wins, 409 = duplicate for that day/type. */
export function permissionSubmitError(err: any): string {
  const data = err?.response?.data;
  const server = [data?.error, data?.message, data?.detail].find(
    (m) => typeof m === 'string' && m.trim() !== '',
  ) as string | undefined;
  if (server) return server;
  if (err?.response?.status === 409) {
    return 'A request of this type already exists for that day.';
  }
  return 'Failed to submit. Please try again.';
}
