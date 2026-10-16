// The employee's Department Head ("HOD Assignment" screen) as the screen uses it. Pure (no React Native), unit-tested in
// hodAssignment.test.ts.
//
// GET /employee/hod (backend/api/employee_compensation_views.py::employee_hod) answers for the signed-in employee, staff and
// production alike:
//   * assigned: the ONE head who decides this employee's requests (name, phone, photo, designation, department, branch,
//     email) and `approvals`, the kinds of request that head can give, each with a Can / Cannot mark and, when not, the reason;
//   * not assigned: `assigned: false` and a message asking the employee to contact HR;
//   * the employee IS a Department Head: `isSelf: true` and a message saying HR decides their own requests.
// Every field is optional on the phone: a missing or wrong-typed one reads as "not sent", and a reply that is not an object
// is null (the hook turns it into a Retry state).

import { readContact } from './compensation.ts';
import type { ContactBlock } from './supportContact.ts';

export interface HodApproval {
  /** leave, permission, casual_leave, missing_punch, on_duty, attendance_correction, resignation, outpass, holiday_work, or a
   *  kind added later. */
  key: string;
  label: string;
  canApprove: boolean;
  /** Why not ("Switched off by HR.", "HR decides this one.", ...), only when `canApprove` is false. */
  reason: string | null;
  /** "Employee" | "HR": who raises this kind of request. */
  requestedBy: string | null;
  /** "Employee → HOD or HR" */
  path: string | null;
}

export interface HodAssignment {
  assigned: boolean;
  /** The signed-in employee is a Department Head themselves. */
  isSelf: boolean;
  employeeId: number | null;
  employeeCode: string | null;
  name: string | null;
  phone: string | null;
  /** As the server sent it (usually a path such as "/media/boss.jpg"); see resolvePhotoUrl. */
  photoUrl: string | null;
  designation: string | null;
  department: string | null;
  branch: string | null;
  email: string | null;
  approvals: HodApproval[];
  hrContact: ContactBlock | null;
  contactNote: string;
  message: string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const orNull = (v: unknown): string | null => str(v) || null;

export const DEFAULT_CONTACT_NOTE = 'For any question about approvals, contact HR.';

function readApproval(raw: unknown): HodApproval | null {
  if (!isObject(raw)) return null;
  const key = str(raw.key);
  const label = str(raw.label);
  if (!key && !label) return null;
  const canApprove = raw.canApprove === true;
  return {
    key: key || label,
    label: label || key,
    canApprove,
    reason: canApprove ? null : orNull(raw.reason),
    requestedBy: orNull(raw.requestedBy),
    path: orNull(raw.path),
  };
}

/** The reply of GET /employee/hod, or null when it is not an object. */
export function normalizeHod(raw: unknown): HodAssignment | null {
  if (!isObject(raw)) return null;
  const id = typeof raw.employeeId === 'number' && Number.isFinite(raw.employeeId) ? raw.employeeId : null;
  const name = orNull(raw.name);
  // A head with no name cannot be shown as a person: treat the reply as "not assigned" rather than draw a blank card.
  const assigned = raw.assigned === true && name !== null;
  return {
    assigned,
    isSelf: raw.isSelf === true,
    employeeId: id,
    employeeCode: orNull(raw.employeeCode),
    name,
    phone: orNull(raw.phone),
    photoUrl: orNull(raw.photoUrl),
    designation: orNull(raw.designation),
    department: orNull(raw.department),
    branch: orNull(raw.branch),
    email: orNull(raw.email),
    approvals: assigned ? (Array.isArray(raw.approvals) ? raw.approvals : []).map(readApproval).filter((a): a is HodApproval => a !== null) : [],
    hrContact: readContact(raw.hrContact),
    contactNote: str(raw.contactNote) || DEFAULT_CONTACT_NOTE,
    message: orNull(raw.message),
  };
}

/** What to say instead of a card when there is no Department Head to show. */
export function unassignedMessage(h: Pick<HodAssignment, 'assigned' | 'isSelf' | 'message'>): string | null {
  if (h.assigned) return null;
  if (h.message) return h.message;
  return h.isSelf
    ? 'You are a Department Head yourself, so HR decides your own requests.'
    : 'You do not have a Department Head assigned yet. Please contact HR to have one assigned.';
}

/**
 * The photo as a URL the phone can load. The server stores whatever HR uploaded: usually a path on the API's own host
 * ("/media/boss.jpg"), sometimes a full URL or an inline image. A relative path is joined to the API's address (the
 * EXPO_PUBLIC_API_URL, minus its "/api" ending). Null when there is no photo, or when a relative path cannot be resolved
 * because the API address is unknown (the card then shows initials).
 */
export function resolvePhotoUrl(raw: string | null | undefined, apiUrl: string | null | undefined): string | null {
  const photo = (raw ?? '').trim();
  if (!photo) return null;
  if (/^(https?:|data:image\/|file:|content:)/i.test(photo)) return photo;
  const origin = (apiUrl ?? '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  if (!/^https?:\/\//i.test(origin)) return null;
  if (photo.startsWith('//')) return `${/^https:/i.test(origin) ? 'https:' : 'http:'}${photo}`;
  return `${origin}${photo.startsWith('/') ? '' : '/'}${photo}`;
}

/** What the dialer is given: the digits and a leading "+" only. '' when there is nothing dialable. */
export function phoneDial(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 3) return '';
  return `${raw.startsWith('+') ? '+' : ''}${digits}`;
}

export function telUrl(phone: string | null | undefined): string {
  const dial = phoneDial(phone);
  return dial ? `tel:${dial}` : '';
}

export function mailUrl(email: string | null | undefined): string {
  const e = (email ?? '').trim();
  return /^[^\s@]+@[^\s@]+$/.test(e) ? `mailto:${e}` : '';
}

/** "Can approve 6 of 9 kinds of request": the line above the list. */
export function approvalSummary(approvals: HodApproval[]): string {
  if (approvals.length === 0) return '';
  const can = approvals.filter((a) => a.canApprove).length;
  return `Can approve ${can} of ${approvals.length} kinds of request`;
}

/** The Can / Cannot mark's words (also what a screen reader says). */
export function approvalMark(a: Pick<HodApproval, 'canApprove'>): string {
  return a.canApprove ? 'Can approve' : 'Cannot approve';
}
