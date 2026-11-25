// An employee whose HRMS account is inactive (owner 2026-11-25): they may sign in (or still be signed in), but the app
// covers every screen with "your account is inactive", counts 30 seconds down, then signs them out; HR's contact is shown
// so they can ask for the account to be made active again. Pure (no React Native), unit-tested in inactiveAccount.test.ts.
//
// Where the status comes from: `accountStatus` ("active" | "inactive") on GET /auth/me and on the sign-in replies
// (backend/api/employee_sessions.py account_status: anything other than Employee.status "active" is inactive). An older
// server sends neither: the app then never blocks (null = not known).
// The resignation flow is separate and keeps its own screen: a resignation approved makes the account inactive too, and
// ResignationGuard (app/_layout.tsx) signs the employee out to /resignation/deactivated - this gate stays out of its way.

export const INACTIVE_LOGOUT_SECONDS = 30;

export type AccountStatus = 'active' | 'inactive';

/** `accountStatus` of a GET /auth/me (or sign-in) reply; else the raw `employeeStatus`; null when neither is there. */
export function accountStatusOf(data: unknown): AccountStatus | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { accountStatus?: unknown; employeeStatus?: unknown };
  if (d.accountStatus === 'active' || d.accountStatus === 'inactive') return d.accountStatus;
  if (typeof d.employeeStatus === 'string') return d.employeeStatus.trim().toLowerCase() === 'active' ? 'active' : 'inactive';
  return null;
}

export interface GateInput {
  signedIn: boolean;
  /** The status the server gave in THIS run of the app (a copy kept from an earlier run never blocks on its own). */
  status: AccountStatus | null;
  fresh: boolean;
  /** GET /my/resignation has answered (or failed): until then a just-approved resignation could still be the reason. */
  resignationSettled: boolean;
  /** The employee's resignation was approved: the resignation flow signs them out to its own screen. */
  resignationApproved: boolean;
  /** The first segment of the current route ("(auth)", "(tabs)", "resignation", ...) and the second one. */
  route: readonly string[];
}

/** Whether the "account inactive" cover is shown now. */
export function shouldBlock(g: GateInput): boolean {
  if (!g.signedIn || g.status !== 'inactive' || !g.fresh) return false;
  if (!g.resignationSettled || g.resignationApproved) return false;
  const [first, second] = g.route;
  if (first === '(auth)') return false;
  if (first === 'resignation' && second === 'deactivated') return false;
  return true;
}

export interface Countdown {
  /** Whole seconds still to go (rounded up: 30 at the start, 1 in the last second, 0 when done). */
  secondsLeft: number;
  /** The share of the time still to go, 1 -> 0 (the ring). */
  remaining: number;
  done: boolean;
}

/** The countdown at `nowMs` towards `deadlineMs`. Worked out from the clock, so time spent in the background counts. */
export function countdownAt(deadlineMs: number, nowMs: number, totalSeconds = INACTIVE_LOGOUT_SECONDS): Countdown {
  const leftMs = Math.max(0, deadlineMs - nowMs);
  const totalMs = Math.max(1, totalSeconds * 1000);
  return {
    secondsLeft: Math.ceil(leftMs / 1000),
    remaining: Math.min(1, leftMs / totalMs),
    done: leftMs <= 0,
  };
}

/** The line under the ring. */
export function countdownSentence(secondsLeft: number): string {
  if (secondsLeft <= 0) return 'Signing you out now…';
  return `You will be signed out automatically in ${secondsLeft} ${secondsLeft === 1 ? 'second' : 'seconds'}.`;
}
