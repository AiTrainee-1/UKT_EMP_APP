// "HR edited this day" on the attendance calendar (owner 2026-11-02), in ONE place: pure, no React Native, unit-tested in
// hrEdit.test.ts.
//
// Owner's words:
//   (1) "Whenever HR edits an attendance record, display a '!' icon on that date; clicking it shows a tooltip explaining
//       what was edited and which approval stage the edit is in."
//   (2) "Display HR-edited attendance records in a different colour so it is easy to identify which records were modified
//       by HR."
//
// The server sends `hrEdit` on every day of GET /attendance/employee/<id> (backend/api/hr_edit_marks.py): null, or the
// LATEST HR edit of the day, whatever its stage. The rules this file turns into looks and words:
//   * the "!" badge is shown for ANY edit (waiting for the Department Head, waiting for HR, applied, rejected);
//   * the "Edited by HR" colour only once the edit is APPLIED (both approvals done, the day really changed);
//   * an older server sends no `hrEdit` at all: every day reads as "not edited", nothing changes.
//
// The colours are EXACTLY the Employee Web App's (parity, lead 2026-11-02): an indigo tint + indigo outline + the "!" badge
// (applied: indigo; waiting: amber; rejected: rose). No status tint is indigo (they are green / red / orange / blue / violet
// / cyan / slate / pink). The Early-Out RING is a close indigo (#4F46E5), so an HR cell is told apart by what an Early-Out
// day never has: the indigo FILL and the "!" (an Early-Out day keeps its own fill, green for a Present day, and no badge).
// Early-Out itself is unchanged. On an HR-edited day the Late-In / Early-Out ring would fight the outline, so those two
// become corner dots instead (amber / indigo, white-edged, as everywhere else).

import { isWorkedKey, marksOf, visualKeyOf, type DayLike, type Detect } from './attendanceVisual.ts';

export type HrEditStatus = 'waiting_hod' | 'waiting_hr' | 'applied' | 'rejected';

export type HrEditOption =
  | 'worked'
  | 'compensation'
  | 'not_worked'
  | 'permission'
  | 'late'
  | 'casual_leave'
  | 'on_duty';

export interface HrEditSide {
  label: string;
  shifts: number | null;
}

export interface HrEdit {
  requestId: number;
  /** A status added after this app was built reads as 'unknown': the "!" still shows, with neutral words. */
  status: HrEditStatus | 'unknown';
  /** The server's sentence: "Waiting for HR (Department Head Suresh Raj approved on 02 Nov 2026)". */
  stageLabel: string;
  from: HrEditSide;
  to: HrEditSide;
  option: string;
  type: string;
  /** "Mark as Late", "Permission · Morning Late-In", "Casual Leave · First half", "On-Duty", "Present"... */
  typeLabel: string;
  reason: string | null;
  comment: string | null;
  raisedBy: string | null;
  raisedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

// ── reading the server's block ──────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const STATUSES: readonly HrEditStatus[] = ['waiting_hod', 'waiting_hr', 'applied', 'rejected'];

function readSide(raw: unknown): HrEditSide {
  const r = isObject(raw) ? raw : {};
  return { label: text(r.label) ?? 'Not recorded', shifts: num(r.shifts) };
}

/**
 * The `hrEdit` block of one attendance day, or null (not sent, null, or not an object). Never throws: a field of the wrong
 * type reads as not sent, an unknown status as 'unknown'.
 */
export function readHrEdit(raw: unknown): HrEdit | null {
  if (!isObject(raw)) return null;
  const status = text(raw.status)?.toLowerCase() ?? '';
  const typeLabel = text(raw.typeLabel) ?? text(isObject(raw.to) ? raw.to.label : null) ?? 'Attendance changed';
  return {
    requestId: num(raw.requestId) ?? 0,
    status: (STATUSES as readonly string[]).includes(status) ? (status as HrEditStatus) : 'unknown',
    stageLabel: text(raw.stageLabel) ?? '',
    from: readSide(raw.from),
    to: readSide(raw.to),
    option: text(raw.option) ?? '',
    type: text(raw.type) ?? '',
    typeLabel,
    reason: text(raw.reason),
    comment: text(raw.comment),
    raisedBy: text(raw.raisedBy),
    raisedAt: text(raw.raisedAt),
    decidedBy: text(raw.decidedBy),
    decidedAt: text(raw.decidedAt),
  };
}

// ── the colour ──────────────────────────────────────────────────────────────

export interface HrEditTone {
  label: string;
  /** The outline and the "!" badge. */
  solidLight: string;
  solidDark: string;
  /** The cell's tint. */
  fillLight: string;
  fillDark: string;
  /** Icon / number colour on the tint. */
  inkLight: string;
  inkDark: string;
}

export const HR_EDIT_TONE: HrEditTone = {
  label: 'Edited by HR',
  solidLight: '#6366F1',
  solidDark: '#818CF8',
  fillLight: '#E0E7FF',
  fillDark: '#6366F138',
  inkLight: '#3730A3',
  inkDark: '#C7D2FE',
};

/** The "!" of each stage (the web app's): applied indigo, waiting amber, rejected rose. */
export const HR_BADGE = {
  applied: { light: { bg: '#4F46E5', fg: '#FFFFFF' }, dark: { bg: '#818CF8', fg: '#1E1B4B' } },
  waiting: { light: { bg: '#F59E0B', fg: '#451A03' }, dark: { bg: '#FBBF24', fg: '#451A03' } },
  rejected: { light: { bg: '#E11D48', fg: '#FFFFFF' }, dark: { bg: '#FB7185', fg: '#4C0519' } },
} as const;

/** The outline width of an HR-edited cell: the same as the Late-In / Early-Out ring, so nothing shifts. */
export const HR_EDIT_OUTLINE = 2.5;

/** The day takes the "Edited by HR" colour: only once the edit is applied (a waiting or rejected one only gets the "!"). */
export function isHrColoured(edit: HrEdit | null | undefined): boolean {
  return edit?.status === 'applied';
}

export function hrTone(isDark: boolean): { solid: string; fill: string; ink: string } {
  return isDark
    ? { solid: HR_EDIT_TONE.solidDark, fill: HR_EDIT_TONE.fillDark, ink: HR_EDIT_TONE.inkDark }
    : { solid: HR_EDIT_TONE.solidLight, fill: HR_EDIT_TONE.fillLight, ink: HR_EDIT_TONE.inkLight };
}

// ── the "!" badge ───────────────────────────────────────────────────────────

export type HrBadgeVariant = 'applied' | 'waiting' | 'rejected';

/** Which "!" a day carries, or null (no HR edit). Every edit gets one, whatever its stage. */
export function hrBadgeOf(edit: HrEdit | null | undefined): HrBadgeVariant | null {
  if (!edit) return null;
  if (edit.status === 'applied') return 'applied';
  if (edit.status === 'rejected') return 'rejected';
  return 'waiting'; // waiting_hod, waiting_hr, and a status this app does not know
}

/** The badge's colours (HR_BADGE), with a thin edge in the card colour so the "!" stands off any cell fill. */
export function hrBadgeColors(variant: HrBadgeVariant, isDark: boolean): { bg: string; fg: string; border: string } {
  const c = isDark ? HR_BADGE[variant].dark : HR_BADGE[variant].light;
  return { bg: c.bg, fg: c.fg, border: isDark ? '#0F172A' : '#FFFFFF' };
}

// ── the cell's marks on an HR-coloured day ──────────────────────────────────

export interface CellMarks {
  /** Ring colour (Late-In / Early-Out) on an ordinary day; null on an HR-coloured day (the outline is its own). */
  ring: string | null;
  /** The cell carries the HR outline (an applied HR edit). */
  hrOutline: boolean;
  /** Amber corner dot: an Excess permission, or (on an HR-coloured day) a Late-In. */
  amberDot: boolean;
  /** Indigo corner dot: an Early-Out the ring does not already say. */
  earlyDot: boolean;
}

/**
 * The border and dots of a day. An ordinary day keeps exactly attendanceVisual.marksOf (ring + dots). An HR-coloured day has
 * the HR outline instead of the ring, and its Late-In / Early-Out show as the corner dots.
 */
export function cellMarksOf(day: DayLike & { hrEdit?: HrEdit | null }, detect: Detect): CellMarks {
  const m = marksOf(day, detect);
  if (!isHrColoured(day.hrEdit)) {
    return { ring: m.ring, hrOutline: false, amberDot: m.excessDot, earlyDot: m.earlyDot };
  }
  // Only a day worked (even in part) can be late / early-out, exactly as marksOf decides it.
  const worked = isWorkedKey(visualKeyOf(day.status));
  const late = worked && detect.lateIn && !!day.isLate;
  const early = worked && detect.earlyOut && !!day.isEarlyOut;
  const excess = worked && !!(day.morningPermissionExcess || day.eveningPermissionExcess);
  return { ring: null, hrOutline: true, amberDot: late || excess, earlyDot: early };
}

// ── words ───────────────────────────────────────────────────────────────────

const STAGE_TITLE: Record<HrEdit['status'], string> = {
  waiting_hod: 'Waiting for Department Head',
  waiting_hr: 'Waiting for HR',
  applied: 'Applied',
  rejected: 'Rejected',
  unknown: 'In approval',
};

/** The short stage for the pill: "Waiting for Department Head", "Waiting for HR", "Applied", "Rejected". */
export function hrStageTitle(edit: HrEdit): string {
  return STAGE_TITLE[edit.status];
}

/** The pill's tone (the same as the day's "!"): waiting = amber, applied = the HR indigo, rejected = rose. */
export function hrStageTone(edit: HrEdit): 'waiting' | 'applied' | 'rejected' {
  return edit.status === 'applied' ? 'applied' : edit.status === 'rejected' ? 'rejected' : 'waiting';
}

/** "1.00 shift", "0.50 shift", "1.50 shifts" (two decimals, as the HRMS writes shifts everywhere). */
function shiftWords(n: number): string {
  const t = n.toFixed(2);
  return `${t} ${Number(t) > 1 ? 'shifts' : 'shift'}`;
}

/** "Present (1.00 shift)", or just "Present" when the server sent no shifts. */
export function hrSideText(side: HrEditSide): string {
  return side.shifts == null ? side.label : `${side.label} (${shiftWords(side.shifts)})`;
}

/** "Absent (0.00 shift) → Present (1.00 shift)". */
export function hrChangeText(edit: HrEdit): string {
  return `${hrSideText(edit.from)} → ${hrSideText(edit.to)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An ISO moment in the phone's time: "02 Nov 2026, 10:05 AM"; null when it does not parse. */
export function hrWhenText(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "Meena · 02 Nov 2026, 10:05 AM" / "Meena" / "02 Nov 2026, 10:05 AM" / null. */
function whoWhen(who: string | null, iso: string | null): string | null {
  const when = hrWhenText(iso);
  if (who && when) return `${who} · ${when}`;
  return who ?? when;
}

export interface HrEditRow {
  key: 'change' | 'reason' | 'raised' | 'stage' | 'decided' | 'comment';
  label: string;
  value: string;
}

/**
 * The details under the day sheet's "Edited by HR" row, in reading order: what changed (from → to with shifts), HR's
 * reason, who raised it and when, the approval stage in the server's words, who decided and when, the comment. Rows with
 * nothing to say are left out; a comment the stage sentence already quotes is not repeated.
 */
export function hrEditRows(edit: HrEdit): HrEditRow[] {
  const rows: HrEditRow[] = [{ key: 'change', label: 'Changed', value: hrChangeText(edit) }];
  if (edit.reason) rows.push({ key: 'reason', label: 'Reason', value: edit.reason });
  const raised = whoWhen(edit.raisedBy, edit.raisedAt);
  if (raised) rows.push({ key: 'raised', label: 'Raised by', value: raised });
  rows.push({ key: 'stage', label: 'Approval stage', value: edit.stageLabel || hrStageTitle(edit) });
  const decided = edit.status === 'applied' || edit.status === 'rejected' ? whoWhen(edit.decidedBy, edit.decidedAt) : null;
  if (decided) rows.push({ key: 'decided', label: edit.status === 'rejected' ? 'Rejected by' : 'Approved by', value: decided });
  if (edit.comment && !(edit.stageLabel || '').includes(edit.comment)) {
    rows.push({ key: 'comment', label: 'Comment', value: edit.comment });
  }
  return rows;
}

/** The title of the day sheet's section (the web popover's): "Edited by HR" / "HR edit waiting for approval" / "HR edit
 *  rejected". */
export function hrEditTitle(edit: HrEdit): string {
  if (edit.status === 'applied') return 'Edited by HR';
  if (edit.status === 'rejected') return 'HR edit rejected';
  return 'HR edit waiting for approval';
}

/** What the stage means for the employee's attendance, one sentence under the details. */
export function hrEditNote(edit: HrEdit): string {
  if (edit.status === 'applied') return 'HR changed your attendance for this day. The day is counted as changed.';
  if (edit.status === 'rejected') return 'This change was rejected, so your attendance for this day stays as it was.';
  return 'Not applied yet: your attendance for this day changes only when the approval is complete.';
}

/** One line under the sheet's row title while it is folded: "Mark as Late · Waiting for HR". */
export function hrEditSummary(edit: HrEdit): string {
  return `${edit.typeLabel} · ${hrStageTitle(edit)}`;
}

/** What a screen reader says for the day's HR edit: "HR edit waiting for approval: Mark as Late. Waiting for HR." */
export function hrEditA11y(edit: HrEdit): string {
  return `${hrEditTitle(edit)}: ${edit.typeLabel}. ${hrStageTitle(edit)}.`;
}

/** The days of a month that carry an HR edit, as {date: edit} (records first, then days the calendar draws empty). */
export function hrEditsByDate(
  records: readonly { date: string; hrEdit?: HrEdit | null }[],
  extra?: Readonly<Record<string, HrEdit>> | null,
): Record<string, HrEdit> {
  const out: Record<string, HrEdit> = { ...(extra ?? {}) };
  for (const r of records) if (r.hrEdit) out[r.date] = r.hrEdit;
  return out;
}

export type HrEditCounts = { total: number; applied: number; waiting: number; rejected: number };

/** How many days of the month HR edited, by stage (for the line under the calendar). */
export function hrEditCounts(edits: Readonly<Record<string, HrEdit>>): HrEditCounts {
  const all = Object.values(edits);
  return {
    total: all.length,
    applied: all.filter((e) => hrBadgeOf(e) === 'applied').length,
    waiting: all.filter((e) => hrBadgeOf(e) === 'waiting').length,
    rejected: all.filter((e) => hrBadgeOf(e) === 'rejected').length,
  };
}

/** The line under the calendar (the web app's): "HR changed 3 days this month: 1 applied, 1 waiting for approval, 1
 *  rejected." A stage with none is left out; null when HR changed nothing. */
export function hrMonthLine(c: HrEditCounts): string | null {
  if (c.total <= 0) return null;
  const parts = [
    c.applied ? `${c.applied} applied` : null,
    c.waiting ? `${c.waiting} waiting for approval` : null,
    c.rejected ? `${c.rejected} rejected` : null,
  ].filter(Boolean);
  return `HR changed ${c.total} ${c.total === 1 ? 'day' : 'days'} this month: ${parts.join(', ')}.`;
}
