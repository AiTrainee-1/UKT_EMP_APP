// The few imperative entry points the rest of the app calls (kept apart from the hooks so non-React code, such as
// useGeoAttendance.ts and the sign-out in app/_layout.tsx, can use them without pulling in React Query).
import { Platform } from 'react-native';

import type { EnsureReason, EnsureResult } from './controller.ts';
import { getRuntime } from './runtime';

export const TRACKING_STATE_KEY = ['tracking-state'] as const;

/** The tracking runtime exists only on the phone: a browser has nothing to record. */
export const trackingAvailable = Platform.OS !== 'web';

/**
 * Asks the server whether a track is active and makes the collector match (start it, keep it, stop it). Safe to call at any
 * time and from anywhere: it never throws, runs one pass at a time, and answers what it decided (or why it could not start:
 * `decision.blockedBy` is 'consent' | 'permission' | 'foreground' | 'unsupported').
 */
export async function ensureTracking(reason: EnsureReason): Promise<EnsureResult | null> {
  if (!trackingAvailable) return null;
  try {
    return await getRuntime().controller.ensure(reason);
  } catch {
    return null;
  }
}

/** Right after an On-Duty request is submitted: the track already exists on the server, start recording now (before approval). */
export function startOnDutyTracking(): Promise<EnsureResult | null> {
  return ensureTracking('request_submitted');
}

/** Signing out: stop recording on this phone. The queue stays for the same employee's next sign-in. */
export async function stopTrackingForSignOut(): Promise<void> {
  if (!trackingAvailable) return;
  try {
    await getRuntime().controller.stopForSignOut();
  } catch {
    // nothing running / runtime not built yet
  }
}
