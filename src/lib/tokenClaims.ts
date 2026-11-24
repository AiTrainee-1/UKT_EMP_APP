// When to renew the employee's sign-in (pure; tested in tokenClaims.test.ts). See tokenRefresh.ts.

/** Renew when less than this is left (the server gives 180 days): about every 10 days of use. */
export const RENEW_WHEN_LEFT_MS = 170 * 24 * 3600 * 1000;

export interface TokenClaims {
  exp?: number;
  kind?: string;
  role?: string;
  employeeId?: number;
  name?: string;
}

function base64UrlDecode(part: string): string {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = typeof atob === 'function' ? atob(padded) : '';
  // UTF-8 safe (a name with non-ASCII letters)
  try {
    return decodeURIComponent(Array.from(binary, (ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  } catch {
    return binary;
  }
}

/** The claims of a JWT (not verified: only the server can do that), or null when it is not one. */
export function readClaims(token: string | null | undefined): TokenClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(base64UrlDecode(parts[1]));
    return claims && typeof claims === 'object' ? (claims as TokenClaims) : null;
  } catch {
    return null;
  }
}

/** Whether an employee token should be renewed now. */
export function renewalDue(token: string | null | undefined, now = Date.now()): boolean {
  const claims = readClaims(token);
  if (!claims || claims.role !== 'employee') return false;
  if (claims.kind !== 'employee_session') return true; // the old 7-day kind: upgrade it
  if (typeof claims.exp !== 'number') return true;
  return claims.exp * 1000 - now < RENEW_WHEN_LEFT_MS;
}
