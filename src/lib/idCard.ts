/**
 * Pure helpers for the Digital ID Card screen (tested with `npm test`).
 */

export interface StatusInfo {
  /**
   * 'active'  - HR's record says active.
   * 'working' - still employed but not plain active (on probation, on leave, serving notice).
   * 'ended'   - no longer employed or barred (inactive, resigned, terminated, suspended …):
   *             the card is stamped NOT ACTIVE.
   * 'other'   - some other word HR typed; shown as it is, no stamp.
   * 'unknown' - the server sent no status (older server): shown as before, no status chip.
   */
  kind: 'active' | 'working' | 'ended' | 'other' | 'unknown';
  /** False only for 'ended'. */
  isActive: boolean;
  /** HR's status in words, e.g. "Inactive", "On probation". '' when the server sent none. */
  label: string;
  unknown: boolean;
}

const WORKING = new Set(['probation', 'on probation', 'on leave', 'leave', 'notice', 'on notice', 'notice period']);
const ENDED = new Set([
  'inactive', 'resigned', 'terminated', 'suspended', 'relieved', 'absconded', 'left', 'exited',
  'deactivated', 'dismissed', 'retired', 'separated', 'blocked',
]);

/** Reads the employee status HR keeps (free text on the server, "active" by default). */
export function employeeStatusInfo(status: string | null | undefined): StatusInfo {
  const raw = (status ?? '').trim();
  if (!raw) return { kind: 'unknown', isActive: true, label: '', unknown: true };
  const words = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  const label = words === 'probation' ? 'On probation' : words.charAt(0).toUpperCase() + words.slice(1);
  if (words === 'active') return { kind: 'active', isActive: true, label: 'Active', unknown: false };
  if (WORKING.has(words)) return { kind: 'working', isActive: true, label, unknown: false };
  if (ENDED.has(words)) return { kind: 'ended', isActive: false, label, unknown: false };
  return { kind: 'other', isActive: true, label, unknown: false };
}

/**
 * Card width that follows the window (rotation, split screen, foldables), instead of being
 * fixed once when the app starts. Staff cards are portrait, production cards landscape.
 */
export function idCardWidth(windowWidth: number, isProduction: boolean): number {
  const w = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 360;
  return isProduction ? clamp(Math.round(w - 32), 260, 420) : clamp(Math.round(w - 72), 220, 320);
}

/** Height for a card of that width (the printed card proportions: 240 x 380). */
export function idCardHeight(width: number, isProduction: boolean): number {
  return Math.round(isProduction ? (width * 240) / 380 : (width * 380) / 240);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * The public web address the QR code points at. Builds use EXPO_PUBLIC_WEB_APP_URL (set in
 * eas.json); in development it falls back to the API address minus its port and "/api".
 */
export function verifyUrl(webAppUrl: string | null | undefined, apiUrl: string | null | undefined, code: string | null | undefined): string {
  const c = (code ?? '').trim();
  if (!c) return '';
  const origin = (webAppUrl && webAppUrl.trim()) || (apiUrl ?? '').trim().replace(/(:\d+)?\/api\/?$/, '');
  if (!origin) return '';
  return `${origin.replace(/\/+$/, '')}/verify/${encodeURIComponent(c)}`;
}

/** The text sent by "Share ID card". */
export function shareMessage(
  card: { name?: string | null; designation?: string | null; code?: string | null; company?: { name?: string | null } | null },
  qr: string,
  status: StatusInfo,
): string {
  const lines = [
    [card.name, card.designation].filter(Boolean).join(' · '),
    card.company?.name ? card.company.name : '',
    card.code ? `Employee Code: ${card.code}` : '',
    !status.unknown && !status.isActive ? `Status: ${status.label}` : '',
    qr ? `Verify: ${qr}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** Font size scaled with the card, so a wider card on a big phone is not full of tiny text. */
export function scaledSize(base: number, cardWidth: number, designWidth: number): number {
  const k = clamp(cardWidth / designWidth, 0.8, 1.35);
  return Math.round(base * k * 10) / 10;
}
