// The Expo implementation of the TrackerEngine: expo-location's background location updates delivered to an
// expo-task-manager task, kept alive by an Android foreground service (the persistent "UKTextiles is recording your
// on-duty route" notification), so tracking continues with the screen off and after the app is swiped away.
//
// THIS FILE MUST BE IMPORTED AT THE APP'S ENTRY (index.ts): TaskManager.defineTask has to run at module scope on every start
// of the JS bundle, including the headless start the OS performs to deliver a location, otherwise the task is "not defined"
// and the fix is thrown away. Nothing else here runs at import time.
//
// What it does NOT do: decide anything. Which fixes are kept, the still/moving wish, events, uploads and the start/stop
// rules live in collectorCore.ts, events.ts, sync.ts and controller.ts (all pure and unit tested); this file only talks to
// expo-location / expo-task-manager. A native module can replace it by registering another TrackerEngine (engineRegistry.ts).
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { MODE_SWITCH_RETRY_MS, requestSpecFor, shouldSwitchMode } from './collectorCore.ts';
import { FOREGROUND_NOTIFICATION, LOCATION_TASK_NAME, META } from './constants.ts';
import { registerEngine, registerModeSwitcher } from './engineRegistry.ts';
import { getRuntime } from './runtime';
import type { ActiveTrack, EngineStartResult, EngineStatus, NewEvent, RawLocation, TrackerEngine, TrackingConfig, TrackingMode } from './types.ts';

function taskOptions(mode: TrackingMode, config: TrackingConfig): Location.LocationTaskOptions {
  const spec = requestSpecFor(mode, config);
  return {
    accuracy: spec.accuracy === 'high' ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: spec.timeIntervalMs,
    // 0 on purpose: Android's fused provider goes completely silent below this distance, and a silent phone looks offline.
    // The distance filter is applied in software (collectorCore.ts).
    distanceInterval: spec.distanceIntervalM,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.Other,
    foregroundService: {
      notificationTitle: FOREGROUND_NOTIFICATION.title,
      notificationBody: FOREGROUND_NOTIFICATION.body,
      notificationColor: FOREGROUND_NOTIFICATION.color,
      // Survive the app being swiped away: the whole point of the foreground service.
      killServiceOnDestroy: false,
    },
  };
}

function toRaw(loc: Location.LocationObject): RawLocation {
  const c = loc.coords;
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    accuracy: c.accuracy ?? null,
    speed: c.speed ?? null,
    heading: c.heading ?? null,
    altitude: c.altitude ?? null,
    timestamp: loc.timestamp,
    mocked: (loc as { mocked?: boolean }).mocked === true,
  };
}

function failure(err: unknown): EngineStartResult {
  const message = String((err as { message?: unknown })?.message ?? err);
  if (/ForegroundServiceStartNotAllowed|foreground service/i.test(message) && !/permission/i.test(message)) {
    return { ok: false, reason: 'foreground_required', message };
  }
  if (/Unauthorized|permission/i.test(message)) return { ok: false, reason: 'permission', message };
  return { ok: false, reason: 'error', message };
}

const expoEngine: TrackerEngine = {
  async start(track: ActiveTrack): Promise<EngineStartResult> {
    if (Platform.OS === 'web') return { ok: false, reason: 'unavailable', message: 'Background location is not available in a browser.' };
    const { queue } = getRuntime();
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (!fg.granted) return { ok: false, reason: 'permission', message: 'Location permission is not granted.' };
      const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      // A (re)start always begins in the fast mode: the first minutes of a journey matter more than a few percent of battery.
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, taskOptions('moving', track.config));
      await queue.setMeta(META.engineMode, 'moving');
      await queue.setMeta(META.engineStartedAt, String(Date.now()));
      return { ok: true, alreadyRunning: already };
    } catch (err) {
      return failure(err);
    }
  },

  async stop(): Promise<void> {
    if (Platform.OS === 'web') return;
    const { queue } = getRuntime();
    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch {
      // already stopped / never started
    }
    await queue.setMeta(META.engineMode, null);
    await queue.setMeta(META.engineStartedAt, null);
  },

  async status(): Promise<EngineStatus> {
    const empty: EngineStatus = {
      running: false, trackId: null, sessionId: null, mode: null, startedAt: null, lastPointAt: null, lastHeartbeatAt: null, lastError: null,
    };
    if (Platform.OS === 'web') return empty;
    const { queue } = getRuntime();
    const [running, track, mode, started, lastPoint, heartbeat, error] = await Promise.all([
      Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false),
      queue.getJson<ActiveTrack>(META.engineTrack),
      queue.getMeta(META.engineMode),
      queue.getMeta(META.engineStartedAt),
      queue.getMeta(META.lastPointAt),
      queue.getMeta(META.heartbeat),
      queue.getMeta(META.engineError),
    ]);
    const n = (v: string | null) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    return {
      running,
      trackId: running ? (track?.trackId ?? null) : null,
      sessionId: running ? (track?.sessionId ?? null) : null,
      mode: running && (mode === 'moving' || mode === 'still') ? mode : null,
      startedAt: n(started),
      lastPointAt: n(lastPoint),
      lastHeartbeatAt: n(heartbeat),
      lastError: error,
    };
  },

  enqueue(event: NewEvent): Promise<number> {
    return getRuntime().queue.enqueueEvent(event);
  },
};

/**
 * Moving <-> still. Calling startLocationUpdatesAsync again re-tunes the running task, but Android refuses to START a
 * foreground service from the background and expo-location checks that before it looks at the running one: so a switch is
 * only attempted while the app is on screen, and after a refusal not again for ten minutes. In the background the collector
 * simply keeps its current request (fast, if that is what it had).
 */
async function switchMode(wanted: TrackingMode): Promise<boolean> {
  const { queue } = getRuntime();
  const [current, blocked, track] = await Promise.all([
    queue.getMeta(META.engineMode),
    queue.getMeta(META.modeBlockedUntil),
    queue.getJson<ActiveTrack>(META.engineTrack),
  ]);
  const now = Date.now();
  if (
    !track ||
    !shouldSwitchMode({
      wanted,
      current: current === 'moving' || current === 'still' ? current : null,
      appForeground: AppState.currentState === 'active',
      now,
      blockedUntil: blocked != null && Number.isFinite(Number(blocked)) ? Number(blocked) : null,
    })
  ) {
    return false;
  }
  try {
    const cfg = (await queue.getJson<TrackingConfig>(META.config)) ?? track.config;
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, taskOptions(wanted, cfg));
    await queue.setMeta(META.engineMode, wanted);
    return true;
  } catch {
    await queue.setMeta(META.modeBlockedUntil, String(now + MODE_SWITCH_RETRY_MS)).catch(() => undefined);
    return false;
  }
}

registerEngine(expoEngine);
registerModeSwitcher(switchMode);

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(LOCATION_TASK_NAME, async ({ data, error }) => {
    try {
      const rt = getRuntime();
      if (error) {
        await rt.queue.setMeta(META.engineError, `task: ${error.message}`);
        return;
      }
      const locations = (data?.locations ?? []).map(toRaw);
      if (locations.length) await rt.ingestLocations(locations);
    } catch {
      // never throw out of a background task: the OS would count it as a crash and may stop delivering
    }
  });
}

export { expoEngine, taskOptions };
