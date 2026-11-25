import { useCallback } from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';

import { useAuth } from './useAuth';
import { fetchTrackingState } from '../tracking/api';
import { trackingAvailable } from '../tracking/actions';
import { LOCATION_TASK_NAME } from '../tracking/constants';
import { decideSignOut, signOutConfirmMessage, type SignOutFacts } from '../lib/signOutGuard';
import { createOverlayStore } from '../lib/overlayStore';
import { playSignOut } from '../lib/authTransition';
import { getOfflineStatus } from '../offline/engine';

const SERVER_CHECK_MS = 5000;

async function gatherFacts(): Promise<SignOutFacts> {
  let server: SignOutFacts['server'] = null;
  try {
    const state = await Promise.race([
      fetchTrackingState(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), SERVER_CHECK_MS)),
    ]);
    server = { supported: state.supported, active: state.active };
  } catch {
    server = null;
  }
  let collectorRunning: boolean | null = null;
  if (trackingAvailable) {
    collectorRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => null);
  }
  return { server, collectorRunning };
}

/** What the logout popup (src/components/auth/SignOutDialog.tsx) shows. */
export type SignOutDialogState =
  /** Asking whether an On-Duty day is running (up to a few seconds): Logout waits. */
  | { kind: 'checking' }
  /** "Are you sure?", or the offline-queue warning (`waiting` > 0). */
  | { kind: 'confirm'; message: string; waiting: number }
  /** Refused: an On-Duty day is running. */
  | { kind: 'blocked'; title: string; message: string };

export type SignOutChoice = 'logout' | 'open-on-duty' | 'cancel';

/** The logout popup: one at a time, drawn by SignOutDialog at the app root. */
export const signOutDialog = createOverlayStore<SignOutDialogState, SignOutChoice>('cancel');

/**
 * The "Logout" every screen offers: refused with an explanation while an On-Duty day is running (src/lib/signOutGuard.ts),
 * otherwise the usual "Are you sure?" and sign-out. Only the person's own sign-out goes through here; the server ending
 * the session (401) or a deactivated account still signs out at once (app/_layout.tsx).
 *
 * Owner 2026-11-25: a styled popup instead of the system alert (it opens at once and says it is checking), and a
 * confirmed logout plays the "Please stay in the app" farewell (src/lib/authTransition.ts) while the usual sign-out runs
 * behind it. Same API as before: callers get a function.
 */
export function useConfirmSignOut(): () => void {
  const { logout } = useAuth();
  return useCallback(() => {
    void (async () => {
      if (signOutDialog.get()) return; // already asking
      const answer = signOutDialog.open({ kind: 'checking' });
      const id = signOutDialog.get()?.id;
      const decision = decideSignOut(await gatherFacts());
      // Closed (Cancel / Back) while checking: nothing more to do.
      if (signOutDialog.get()?.id === id) {
        if (!decision.allowed) {
          signOutDialog.update({ kind: 'blocked', title: decision.title, message: decision.message });
        } else {
          // Anything still waiting in the offline queue stays on this phone and is sent when this employee signs in again.
          const { pending, failed } = getOfflineStatus();
          const waiting = pending + failed;
          signOutDialog.update({ kind: 'confirm', message: signOutConfirmMessage(waiting), waiting });
        }
      }
      const choice = await answer;
      if (choice === 'open-on-duty') {
        router.push('/on-duty');
      } else if (choice === 'logout') {
        // The farewell covers the screen first; then the usual sign-out (unchanged) runs behind it.
        playSignOut(() => { void logout(); });
      }
    })();
  }, [logout]);
}
