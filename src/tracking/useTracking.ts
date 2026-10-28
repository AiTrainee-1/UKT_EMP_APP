// React hooks over the tracking runtime: the server state, the on-phone health snapshot (permission level, queue size, last
// sync ...), the issue list behind the red banner, the set-up steps, consent, and the employee's own journeys.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TRACKING_STATE_KEY, ensureTracking, trackingAvailable } from './actions';
import { fetchJourney, fetchMyJourneys, fetchTrackingState, postConsent } from './api';
import type { JourneyListParams } from './api';
import { computeSetupSteps, trackingIssues } from './onboarding.ts';
import type { HealthInput, SetupPlatform, SetupSnapshot, SetupStepId, TrackingIssue } from './onboarding.ts';
import { getRuntime } from './runtime';
import type { TrackingSnapshot } from './runtime';
import { readLocationLevel } from './permissions';
import type { TrackingServerState } from './types.ts';

const platformOf = (): SetupPlatform => (Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web');

/** GET /tracking/state, refreshed every 30 s while a screen shows it. `data.supported === false` = a server without tracking. */
export function useTrackingState(enabled = true) {
  return useQuery<TrackingServerState>({
    queryKey: TRACKING_STATE_KEY,
    queryFn: fetchTrackingState,
    enabled,
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 0,
  });
}

/**
 * What the phone itself knows right now, re-read every few seconds and whenever the app comes back to the front (the person
 * may just have changed a permission in Settings). null until the first read, and always null in a browser.
 */
export function useTrackingSnapshot(intervalMs = 5000) {
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const refresh = useCallback(async () => {
    if (!trackingAvailable) return;
    try {
      setSnapshot(await getRuntime().snapshot());
    } catch {
      // keep the previous snapshot: a failed read is not a finding
    }
  }, []);

  useEffect(() => {
    if (!trackingAvailable) return;
    refresh();
    const timer = setInterval(refresh, intervalMs);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh, intervalMs]);

  return { snapshot, refresh };
}

export interface TrackingHealthView {
  state: TrackingServerState | undefined;
  snapshot: TrackingSnapshot | null;
  /** Everything wrong or fragile, errors first. */
  issues: TrackingIssue[];
  /** Is a track active for this employee on the server (so tracking SHOULD be running). */
  trackActive: boolean;
  refresh: () => Promise<void>;
}

/** The issue list for the Tracking health screen and the red banner on the On-Duty page. */
export function useTrackingHealth(intervalMs = 5000): TrackingHealthView {
  const { data: state } = useTrackingState();
  const { snapshot, refresh } = useTrackingSnapshot(intervalMs);
  const trackActive = !!state && state.supported && state.enabled && state.active;

  const issues = useMemo(() => {
    if (!state || !state.supported) return [];
    // Without the phone's own reading (the first second, or a browser) only what the server says can be judged.
    const h = snapshot?.health;
    const input: HealthInput = {
      platform: platformOf(),
      trackActive,
      consentRequired: state.consentRequired,
      permission: h?.permission ?? 'unknown',
      locationEnabled: h?.locationEnabled ?? null,
      notificationsGranted: snapshot?.notificationsGranted ?? null,
      batteryOptimised: h?.batteryOptimised ?? null,
      powerSave: h?.powerSave ?? null,
      network: h?.network ?? 'unknown',
      engineRunning: snapshot?.engine.running ?? false,
      queuedPoints: snapshot?.queuedPoints ?? 0,
      sinceLastSyncMs: snapshot?.sync.lastOkAt != null ? snapshot.takenAt - snapshot.sync.lastOkAt : null,
      syncError: snapshot?.sync.lastError ?? null,
    };
    // A snapshot we do not have yet must not read as "permission denied / engine stopped": wait for it.
    if (!snapshot && platformOf() !== 'web') return [];
    return trackingIssues(input);
  }, [state, snapshot, trackActive]);

  return { state, snapshot, issues, trackActive, refresh };
}

const SKIPPED_KEY = 'uktextiles.trackingSetupSkipped.v1';

async function readSkipped(): Promise<SetupStepId[]> {
  try {
    const raw = await AsyncStorage.getItem(SKIPPED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is SetupStepId => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The set-up screen's data: the steps (consent -> location -> all the time -> notifications -> battery) and their state. */
export function useTrackingSetup() {
  const { data: state, isLoading, refetch } = useTrackingState();
  const { snapshot, refresh } = useTrackingSnapshot(2000);
  const [skipped, setSkipped] = useState<SetupStepId[]>([]);
  const [permission, setPermission] = useState<SetupSnapshot['permission']>('unknown');

  useEffect(() => {
    readSkipped().then(setSkipped);
    readLocationLevel().then(setPermission);
  }, []);

  // Re-read the permission whenever the snapshot refreshes (the person may be coming back from Settings).
  useEffect(() => {
    if (snapshot) setPermission(snapshot.health.permission);
  }, [snapshot]);

  const skip = useCallback(async (id: SetupStepId) => {
    const next = Array.from(new Set([...(await readSkipped()), id]));
    setSkipped(next);
    try {
      await AsyncStorage.setItem(SKIPPED_KEY, JSON.stringify(next));
    } catch {
      // not persisted: the step simply shows again next time
    }
  }, []);

  const setup: SetupSnapshot = {
    platform: platformOf(),
    consentRequired: state ? state.consentRequired : null,
    permission,
    notificationsGranted: snapshot?.notificationsGranted ?? null,
    batteryOptimised: snapshot?.health.batteryOptimised ?? null,
    skipped,
  };
  const steps = useMemo(() => computeSetupSteps(setup), [setup.platform, setup.consentRequired, setup.permission, setup.notificationsGranted, setup.batteryOptimised, skipped]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    setPermission(await readLocationLevel());
    await Promise.all([refresh(), refetch()]);
  }, [refresh, refetch]);

  return { state, steps, setup, isLoading, skip, reload, setPermission };
}

/** POST /tracking/consent, then start recording if a track is already active (consent was the only thing in the way). */
export function useAcceptConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noticeVersion: number) => {
      if (trackingAvailable) await getRuntime().acceptConsent(noticeVersion);
      else await postConsent('web-preview', noticeVersion);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TRACKING_STATE_KEY });
      await ensureTracking('consent_accepted');
      await queryClient.invalidateQueries({ queryKey: TRACKING_STATE_KEY });
    },
  });
}

/**
 * Mounted once, signed in (app/_layout.tsx): the self-heal. Asks the server what should be running when the app starts and
 * every time it comes to the front, uploads what is waiting, records network changes while the app is open, and refreshes the
 * screens when the runtime says the state changed.
 */
export function useTrackingLifecycle(employeeId: number | null | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!trackingAvailable || !employeeId) return;
    const rt = getRuntime();
    const refreshState = () => queryClient.invalidateQueries({ queryKey: TRACKING_STATE_KEY });

    ensureTracking('app_start').then(() => {
      refreshState();
      rt.observeNow('foreground').catch(() => undefined);
    });
    const appState = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      ensureTracking('foreground').then(() => {
        refreshState();
        rt.onForeground().catch(() => undefined);
        rt.observeNow('foreground').catch(() => undefined);
      });
    });
    const stopNetwork = rt.startNetworkWatch();
    const unsubscribe = rt.subscribe((event) => {
      if (event === 'consent_required' || event === 'state') refreshState();
    });
    return () => {
      appState.remove();
      stopNetwork();
      unsubscribe();
    };
  }, [employeeId, queryClient]);
}

// ---------------------------------------------------------------------------------------------------- my journeys

/** The employee's own journeys, newest first (GET /tracking/my-journeys). */
export function useMyJourneys(params: JourneyListParams = {}) {
  return useQuery({
    queryKey: ['my-journeys', params.from ?? null, params.to ?? null],
    queryFn: () => fetchMyJourneys(params),
    staleTime: 30_000,
  });
}

/** One journey with its segments, events and simplified path (GET /tracking/journeys/<id>); refreshed while it is still active. */
export function useJourney(id: number | null) {
  return useQuery({
    queryKey: ['my-journey', id],
    queryFn: () => fetchJourney(id as number),
    enabled: id != null && Number.isFinite(id),
    staleTime: 15_000,
    refetchInterval: (query) => (query.state.data?.track.status === 'active' ? 30_000 : false),
  });
}
