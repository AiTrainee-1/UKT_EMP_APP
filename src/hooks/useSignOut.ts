import { useCallback } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';

import { useAuth } from './useAuth';
import { fetchTrackingState } from '../tracking/api';
import { trackingAvailable } from '../tracking/actions';
import { LOCATION_TASK_NAME } from '../tracking/constants';
import { decideSignOut, type SignOutFacts } from '../lib/signOutGuard';

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

/**
 * The "Logout" every screen offers: refused with an explanation while an On-Duty day is running (src/lib/signOutGuard.ts),
 * otherwise the usual "Are you sure?" and sign-out. Only the person's own sign-out goes through here; the server ending
 * the session (401) or a deactivated account still signs out at once (app/_layout.tsx).
 */
export function useConfirmSignOut(): () => void {
  const { logout } = useAuth();
  return useCallback(() => {
    void (async () => {
      const decision = decideSignOut(await gatherFacts());
      if (!decision.allowed) {
        Alert.alert(decision.title, decision.message, [
          { text: 'OK', style: 'cancel' },
          { text: 'Open On-Duty', onPress: () => router.push('/on-duty') },
        ]);
        return;
      }
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: () => { void logout(); } },
      ]);
    })();
  }, [logout]);
}
