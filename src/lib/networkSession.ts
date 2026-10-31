/**
 * When a stored sign-in is kept and when it is thrown away. Pure (no React Native, no axios), so the rule is tested in
 * src/lib/networkSession.test.ts and reads the same everywhere it is used (start-up, coming back online).
 *
 * THE RULE: only the server can end a session. A sign-in is cleared only when the server itself answered GET /auth/me
 * and said the token is no good:
 *   - 401 (backend/api/auth.py: no token, "Invalid or expired token", "Session revoked"), or
 *   - 403 with the server's own `{ "error": ... }` body ("This token cannot be used here": a token that is not an
 *     employee / HR sign-in at all, e.g. a tea-break QR pass).
 * Everything else - no internet, a timeout, a DNS failure, a 5xx / 502 / 503 / 504, a captive-portal page, a cancelled
 * request, an answer that does not look like ours - says nothing about the token: the employee stays signed in with the
 * details stored on the phone and the server is asked again later.
 */

export type SessionCheck =
  /** The server answered and accepted the token. */
  | 'valid'
  /** The server answered and refused the token: sign out. */
  | 'invalid'
  /** No usable answer (offline, timeout, server down, odd reply): keep the stored sign-in. */
  | 'unverified';

export interface SessionUser {
  employeeId: number;
  name: string;
  role: string;
}

/** The role a sign-in restored from the phone is given until the server confirms it (only employees use this app). */
export const DEFAULT_ROLE = 'employee';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A successful (2xx) GET /auth/me body. A page that is not ours (a Wi-Fi sign-in page answering 200) is not proof. */
export function classifySessionResponse(data: unknown): SessionCheck {
  return isPlainObject(data) && typeof data.role === 'string' && data.role !== '' ? 'valid' : 'unverified';
}

interface ErrorLike {
  code?: string;
  response?: { status?: number; data?: unknown };
}

/** A failed GET /auth/me (whatever axios rejected with). */
export function classifySessionError(err: unknown): SessionCheck {
  if (typeof err !== 'object' || err === null) return 'unverified';
  const e = err as ErrorLike;
  if (e.code === 'ERR_CANCELED') return 'unverified';
  const status = e.response?.status;
  if (status === 401) return 'invalid';
  if (status === 403) {
    // Only the server's own refusal (`{ error: "..." }`), never a proxy's or a Wi-Fi portal's 403 page.
    const data = e.response?.data;
    return isPlainObject(data) && typeof data.error === 'string' ? 'invalid' : 'unverified';
  }
  return 'unverified';
}

/** The signed-in user from what the phone stored at sign-in, or null when there is not enough to go on. */
export function storedSessionUser(employeeId: number | null | undefined, name: string | null | undefined, role?: string | null): SessionUser | null {
  if (typeof employeeId !== 'number' || !Number.isFinite(employeeId) || employeeId <= 0) return null;
  return { employeeId, name: name ?? '', role: role || DEFAULT_ROLE };
}

/**
 * The user once the server has accepted the token: the stored id and name, with the server's role. When the phone lost
 * the stored id (it should not), the server's `employeeId` / `name` fill in.
 */
export function verifiedSessionUser(stored: SessionUser | null, data: unknown): SessionUser | null {
  const body = isPlainObject(data) ? data : {};
  const role = typeof body.role === 'string' && body.role ? body.role : stored?.role || DEFAULT_ROLE;
  if (stored) return { ...stored, role };
  const id = typeof body.employeeId === 'number' ? body.employeeId : Number(body.employeeId);
  const fromServer = storedSessionUser(Number.isFinite(id) ? id : null, typeof body.name === 'string' ? body.name : '', role);
  return fromServer;
}

export type StartupPlan =
  /** No token on the phone: the Login screen. */
  | 'login'
  /** Offline with a stored sign-in: open Home at once with the stored user; verify once the internet is back. */
  | 'open-stored'
  /** Online: ask the server, but open with the stored user if it has not answered within the start-up budget. */
  | 'verify'
  /** A token but no stored employee to open with, and no internet to ask: Login, keeping the token. */
  | 'login-keep-token';

export interface StartupFacts {
  hasToken: boolean;
  /** An employee id (and name) is stored next to the token. */
  hasStoredUser: boolean;
  /** What the phone says about the internet: null = not known yet (counts as online). */
  online: boolean | null;
}

export function startupPlan({ hasToken, hasStoredUser, online }: StartupFacts): StartupPlan {
  if (!hasToken) return 'login';
  if (online === false) return hasStoredUser ? 'open-stored' : 'login-keep-token';
  return 'verify';
}

export type SessionAction =
  /** Sign out (clear the token) - the server refused it. */
  | { kind: 'sign-out' }
  /** Signed in as this user. */
  | { kind: 'signed-in'; user: SessionUser }
  /** No user to open with, but the token is kept (it may still be good). */
  | { kind: 'login-keep-token' };

/** What to do with the answer (or the lack of one) from GET /auth/me. */
export function sessionAction(check: SessionCheck, stored: SessionUser | null, data?: unknown): SessionAction {
  if (check === 'invalid') return { kind: 'sign-out' };
  if (check === 'valid') {
    const user = verifiedSessionUser(stored, data);
    return user ? { kind: 'signed-in', user } : { kind: 'login-keep-token' };
  }
  return stored ? { kind: 'signed-in', user: stored } : { kind: 'login-keep-token' };
}
