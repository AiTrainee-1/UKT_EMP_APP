// The Live Tracking screen's data, READ ONLY: it reads the server's tracking state, the phone's tracking snapshot (service,
// queue, last point/upload, permissions, GPS, battery optimisation), today's On-Duty session, HR's live-sharing flag and the
// legacy ping loop, and turns them into the screen's view (src/lib/liveTrackingStatus.ts). It never starts or stops
// anything: the lifecycle stays in src/tracking/controller.ts (TrackingBridge) and app/_layout.tsx (LiveLocationTracker).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from './useAuth';
import { useEmployee } from './useEmployee';
import { isLiveTrackingActive, onLiveTrackingTick, useGeoPunchStatus } from './useGeoAttendance';
import { useTrackingSnapshot, useTrackingState } from '../tracking/useTracking';
import { buildLiveStatus } from '../lib/liveTrackingStatus';
import type { LiveStatusInput, LiveStatusView, StatusPlatform } from '../lib/liveTrackingStatus';

const platformOf = (): StatusPlatform => (Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web');

export interface LiveTrackingStatus {
  view: LiveStatusView;
  input: LiveStatusInput;
  /** Nothing to show yet (first loads still running). */
  loading: boolean;
  /** The server's tracking state could not be read (offline / server error). */
  serverError: boolean;
  /** The employee profile (HR's live-sharing flag) could not be read. */
  profileError: boolean;
  /** Nothing at all could be read. */
  failed: boolean;
  employee: { name?: string | null; code?: string | null; photoUrl?: string | null; meta?: string | null };
  refresh: () => Promise<void>;
}

export function useLiveTrackingStatus(): LiveTrackingStatus {
  const { user } = useAuth();
  const signedIn = !!user?.employeeId;
  const employeeQ = useEmployee(user?.employeeId ?? null);
  const stateQ = useTrackingState(signedIn);
  const geoQ = useGeoPunchStatus(signedIn);
  const { snapshot, refresh: refreshSnapshot } = useTrackingSnapshot(3000);

  // The older 45 s ping loop lives at module level in useGeoAttendance.ts: read whether it runs, and listen to its ticks.
  const [loopRunning, setLoopRunning] = useState(isLiveTrackingActive());
  const [lastPing, setLastPing] = useState<{ ok: boolean; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    onLiveTrackingTick((ok, at) => {
      setLastPing({ ok, at: at.getTime() });
      setLoopRunning(isLiveTrackingActive());
    });
    return () => onLiveTrackingTick(null);
  }, []);

  // A clock for the "2 min ago" texts, and a cheap re-read of whether the loop is running.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setLoopRunning(isLiveTrackingActive());
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Back from the phone's settings (a permission or GPS just changed): read everything again.
  const { refetch: refetchEmployee } = employeeQ;
  const { refetch: refetchState } = stateQ;
  const { refetch: refetchGeo } = geoQ;
  const refresh = useCallback(async () => {
    setNow(Date.now());
    setLoopRunning(isLiveTrackingActive());
    await Promise.all([
      refetchEmployee().catch(() => undefined),
      refetchState().catch(() => undefined),
      refetchGeo().catch(() => undefined),
      refreshSnapshot(),
    ]);
  }, [refetchEmployee, refetchState, refetchGeo, refreshSnapshot]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const emp = employeeQ.data;
  const state = stateQ.data;
  const session = geoQ.data?.onDutySession ?? null;
  const platform = platformOf();

  const input: LiveStatusInput = useMemo(
    () => ({
      now,
      platform,
      server:
        state && !stateQ.isError
          ? {
              supported: state.supported,
              enabled: state.enabled,
              active: state.active,
              consentRequired: state.consentRequired,
              track: state.track
                ? {
                    id: state.track.id,
                    sessionId: state.track.sessionId,
                    startedAt: state.track.startedAt,
                    endsAt: state.track.endsAt,
                    state: state.track.state,
                  }
                : null,
            }
          : null,
      phone: snapshot
        ? {
            engineRunning: snapshot.engine.running,
            engineMode: snapshot.engine.mode,
            queuedPoints: snapshot.queuedPoints,
            queuedEvents: snapshot.queuedEvents,
            droppedPoints: snapshot.droppedPoints,
            lastPointAt: snapshot.lastPointAt ?? snapshot.engine.lastPointAt,
            lastUploadAt: snapshot.sync.lastOkAt,
            uploadError: snapshot.sync.lastError,
            permission: snapshot.health.permission,
            locationEnabled: snapshot.health.locationEnabled,
            batteryOptimised: snapshot.health.batteryOptimised,
            powerSave: snapshot.health.powerSave,
            batteryPct: snapshot.health.batteryPct,
            network: snapshot.health.network,
            notificationsGranted: snapshot.notificationsGranted,
          }
        : null,
      session: session
        ? {
            id: session.id,
            destination: session.destination,
            status: session.status,
            approvalStatus: session.approvalStatus ?? session.status,
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            completionReason: session.completionReason,
          }
        : null,
      hr: {
        enabledByHr: emp ? !!emp.locationTrackingEnabled : employeeQ.isError ? false : null,
        loopRunning,
        lastPingAt: lastPing?.at ?? null,
        lastPingOk: lastPing ? lastPing.ok : null,
      },
      pending: (signedIn && stateQ.isLoading) || employeeQ.isLoading,
    }),
    [now, platform, state, stateQ.isError, stateQ.isLoading, snapshot, session, emp, employeeQ.isError, employeeQ.isLoading, loopRunning, lastPing, signedIn],
  );

  const view = useMemo(() => buildLiveStatus(input), [input]);
  const failed = stateQ.isError && employeeQ.isError && !snapshot;

  return {
    view,
    input,
    loading: input.pending && !snapshot && !state && !emp,
    serverError: stateQ.isError,
    profileError: employeeQ.isError,
    failed,
    employee: {
      name: emp?.name ?? user?.name ?? null,
      code: emp?.employeeCode ?? null,
      photoUrl: emp?.photoUrl ?? null,
      meta: emp?.departmentName ?? emp?.designationTitle ?? null,
    },
    refresh,
  };
}
