/**
 * Keeping the employee signed in until they sign out (owner 2026-11-24). The server issues a sign-in that lasts 180 days
 * (backend/api/employee_sessions.py) and renews it on POST /auth/refresh; this file renews it whenever the app is online
 * and the token is getting old, so an employee who opens the app now and then is never asked to sign in again.
 *
 * A token from before sessions existed (7 days, no `kind`) is renewed at once: the server turns it into a session.
 * An older server without /auth/refresh answers 404: nothing changes and it is not asked again until the next start.
 * A 401 means the session was ended (signed out on the server, HR): the API client signs out, as for any request.
 */
import { getToken, setToken } from './auth';
import { renewalDue } from './tokenClaims';

export { renewalDue } from './tokenClaims';


let unsupported = false;
let inFlight: Promise<void> | null = null;

/** Renews the stored sign-in when it is due. Never throws; does nothing offline or on an older server. */
export function refreshTokenIfDue(): Promise<void> {
  if (unsupported) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const token = await getToken();
      if (!renewalDue(token)) return;
      // Required here, not imported: api.ts imports this module's neighbour auth.ts, and the API client must exist first.
      const api = (require('./api') as typeof import('./api')).default;
      const res = await api.post('/auth/refresh', {}, { timeout: 10_000 });
      const fresh = res.data?.token;
      // Store it only if nobody signed out / in meanwhile.
      if (typeof fresh === 'string' && fresh && (await getToken()) === token) await setToken(fresh);
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 405) unsupported = true;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Ends this sign-in on the server too (best effort, before the token is forgotten on the phone). */
export async function revokeSessionOnServer(token: string | null): Promise<void> {
  if (!token) return;
  try {
    const api = (require('./api') as typeof import('./api')).default;
    // isPublic: send exactly this token, and a 401 (already ended) must not start a second sign-out
    await api.post('/auth/logout', {}, { isPublic: true, timeout: 4000, headers: { Authorization: `Bearer ${token}` } });
  } catch {
    /* offline or already ended: the phone forgets it anyway */
  }
}
