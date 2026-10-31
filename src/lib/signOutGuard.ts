// No signing out during an active On-Duty day (owner 2026-10-31): signing out stops the route recording on the phone and
// HR would see a gap. Pure so the rule is tested (signOutGuard.test.ts); src/hooks/useSignOut.ts gathers the facts.
//
// The server decides whether an On-Duty track is running (GET /tracking/state `active`: from the moment the request is
// submitted until Done, the 4th punch, a rejection or the end of the day). When the server cannot be asked (offline), the
// phone's own recorder is the answer: if it is running, the day is still on.

export type SignOutFacts = {
  /** null = the server could not be asked (offline, error). */
  server: { supported: boolean; active: boolean } | null;
  /** null = unknown (browser, or the check failed). */
  collectorRunning: boolean | null;
};

export type SignOutDecision = { allowed: true } | { allowed: false; title: string; message: string };

export const BLOCKED_TITLE = "You can't sign out now";
export const BLOCKED_MESSAGE =
  'Your On-Duty is still running, and signing out would stop recording your route. ' +
  'You can sign out after it ends: when you mark it Done on the On-Duty page, after your 4th On-Duty punch, ' +
  'or automatically at the end of the day.';

export function decideSignOut(facts: SignOutFacts): SignOutDecision {
  const blocked: SignOutDecision = { allowed: false, title: BLOCKED_TITLE, message: BLOCKED_MESSAGE };
  if (facts.server && facts.server.supported) return facts.server.active ? blocked : { allowed: true };
  // Server unknown or without tracking: trust what the phone is doing.
  return facts.collectorRunning ? blocked : { allowed: true };
}
