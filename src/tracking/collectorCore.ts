// The decisions of the location collector, as pure functions: which fixes become queue rows, what the person seems to be
// doing, and whether the OS location request should change between the fast "moving" and the slow "still" setting.
// The native part (expo-location, the background task) is src/tracking/collector.ts and only calls these.
//
// Why the distance filter is applied HERE and not by the OS: Android's fused provider honours `distanceInterval` by staying
// silent until the phone has moved that far. A phone that stands still would then deliver nothing at all, and the server
// could not tell "standing still" from "no signal". So the OS is asked for a fix every `sampleMovingSeconds` regardless, and
// this module keeps a point only if the person moved, or as the heartbeat every `sampleStillSeconds` while they have not.
import type { NetworkKind, NewPoint, RawLocation, TrackingConfig, TrackingMode } from './types.ts';
import { THRESHOLDS } from './constants.ts';
import { derivedSpeedMps, guessActivity, haversineM, isFiniteNumber, isValidCoordinate } from './geo.ts';

export interface CoreState {
  mode: TrackingMode;
  /** Where the current "cluster" of nearby fixes began; null until the first fix. */
  anchor: { latitude: number; longitude: number; at: number } | null;
  /** The last fix that was KEPT (the reference for the distance filter and the heartbeat). */
  last: { latitude: number; longitude: number; at: number; accuracy: number | null; mocked: boolean } | null;
  /** The newest fix timestamp seen, kept or not: older or equal ones are duplicates (some phones deliver a fix twice). */
  lastSeenAt: number;
}

export const INITIAL_CORE_STATE: CoreState = { mode: 'moving', anchor: null, last: null, lastSeenAt: 0 };

export interface CoreContext {
  battery: number | null;
  charging: boolean | null;
  network: NetworkKind;
  config: TrackingConfig;
}

export interface CoreResult {
  state: CoreState;
  points: NewPoint[];
  /** Unusable fixes (not a coordinate, or an accuracy of kilometres). */
  dropped: number;
  /** Valid fixes that carried nothing new (the person has not moved) and were not stored. */
  skipped: number;
  wantedMode: TrackingMode;
  /** The newest valid fix, kept or not (the "last known place"). */
  newest: RawLocation | null;
}

/** A valid OS speed in m/s, else null (Android reports -1 or 0 with no fix quality for "unknown"). */
function osSpeed(v: number | null): number | null {
  return isFiniteNumber(v) && v >= 0 ? v : null;
}

function osBearing(v: number | null): number | null {
  return isFiniteNumber(v) && v >= 0 && v <= 360 ? v : null;
}

export function processLocations(prev: CoreState, locations: RawLocation[], ctx: CoreContext): CoreResult {
  const state: CoreState = {
    mode: prev.mode,
    anchor: prev.anchor ? { ...prev.anchor } : null,
    last: prev.last ? { ...prev.last } : null,
    lastSeenAt: prev.lastSeenAt,
  };
  const points: NewPoint[] = [];
  let dropped = 0;
  let skipped = 0;
  let newest: RawLocation | null = null;
  let anchorReset = false;
  let lastSpeed: number | null = null;

  const heartbeatMs = Math.max(1000, ctx.config.sampleStillSeconds * 1000);
  const sorted = [...locations].sort((a, b) => a.timestamp - b.timestamp);

  for (const loc of sorted) {
    if (!isFiniteNumber(loc.timestamp) || loc.timestamp <= state.lastSeenAt) {
      continue; // a duplicate delivery or an out-of-order fix: neither stored nor counted
    }
    if (!isValidCoordinate(loc.latitude, loc.longitude)) {
      dropped++;
      continue;
    }
    const accuracy = isFiniteNumber(loc.accuracy) && loc.accuracy >= 0 ? loc.accuracy : null;
    if (accuracy != null && accuracy > THRESHOLDS.hopelessAccuracyM) {
      dropped++;
      continue;
    }
    state.lastSeenAt = loc.timestamp;
    newest = loc;
    const here = { latitude: loc.latitude, longitude: loc.longitude, at: loc.timestamp };

    // --- the stillness cluster -------------------------------------------------------------------------------------------
    const leaveRadius = Math.max(THRESHOLDS.leaveRadiusM, 1.5 * (accuracy ?? 0));
    anchorReset = false;
    if (!state.anchor || haversineM(state.anchor.latitude, state.anchor.longitude, here.latitude, here.longitude) > leaveRadius) {
      state.anchor = { ...here };
      anchorReset = true;
    }

    // --- speed: the OS value, else derived from the last kept fix when that was recent ------------------------------------
    let speed = osSpeed(loc.speed);
    if (speed == null && state.last && here.at - state.last.at <= 60_000) {
      speed = derivedSpeedMps(state.last, here);
    }
    lastSpeed = speed;

    const stillFor = here.at - state.anchor.at;
    const movingEvidence = anchorReset && stillFor === 0 && state.last != null ? true : (speed ?? 0) >= THRESHOLDS.movingSpeedMps;
    const isStill = !movingEvidence && stillFor >= THRESHOLDS.stillAfterSeconds * 1000;

    // --- keep or skip ----------------------------------------------------------------------------------------------------
    let keep = false;
    if (!state.last) keep = true;
    else {
      const moved = haversineM(state.last.latitude, state.last.longitude, here.latitude, here.longitude);
      // Poor fixes jitter by about their accuracy: movement smaller than that is noise, not travel.
      const noiseFloor = Math.max(ctx.config.distanceFilterM, Math.min(accuracy ?? 0, 100) * 0.8);
      if (moved >= noiseFloor) keep = true;
      else if (here.at - state.last.at >= heartbeatMs) keep = true;
      else if (loc.mocked !== state.last.mocked) keep = true;
    }

    if (keep) {
      points.push({
        recordedAt: loc.timestamp,
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy,
        speed,
        bearing: osBearing(loc.heading),
        altitude: isFiniteNumber(loc.altitude) ? loc.altitude : null,
        activity: guessActivity(speed, isStill),
        battery: ctx.battery,
        charging: ctx.charging,
        network: ctx.network,
        provider: 'fused',
        isMocked: loc.mocked === true,
      });
      state.last = { ...here, accuracy, mocked: loc.mocked === true };
    } else {
      skipped++;
    }
  }

  // --- which OS request do we want now? (hysteresis: it only flips on evidence) ------------------------------------------
  let wantedMode = state.mode;
  if (newest && state.anchor) {
    const stillFor = newest.timestamp - state.anchor.at;
    const moving = anchorReset || (lastSpeed ?? 0) >= THRESHOLDS.movingSpeedMps;
    if (moving) wantedMode = 'moving';
    else if (stillFor >= THRESHOLDS.stillAfterSeconds * 1000) wantedMode = 'still';
  }
  return { state, points, dropped, skipped, wantedMode, newest };
}

export interface LocationRequestSpec {
  accuracy: 'high' | 'balanced';
  timeIntervalMs: number;
  /** Always 0: see the note at the top of this file. */
  distanceIntervalM: number;
}

/** The OS request for a mode: GPS-grade at the moving interval, or balanced (cell / wifi) at the slow interval. */
export function requestSpecFor(mode: TrackingMode, config: TrackingConfig): LocationRequestSpec {
  if (mode === 'still') {
    return { accuracy: 'balanced', timeIntervalMs: Math.round(config.sampleStillSeconds * 1000), distanceIntervalM: 0 };
  }
  return { accuracy: 'high', timeIntervalMs: Math.round(config.sampleMovingSeconds * 1000), distanceIntervalM: 0 };
}

/**
 * Android will not START a foreground service from the background (expo-location throws ForegroundServiceStartNotAllowed
 * from startLocationUpdatesAsync before it even looks at the running one), and changing the request means calling it again.
 * So a mode change is only attempted while the app is on screen, and not again for a while after a refusal; otherwise the
 * collector keeps its current request and the wish is applied the next time the app is opened.
 */
export function shouldSwitchMode(input: {
  wanted: TrackingMode;
  current: TrackingMode | null;
  appForeground: boolean;
  now: number;
  blockedUntil: number | null;
}): boolean {
  if (input.current == null || input.wanted === input.current) return false;
  if (!input.appForeground) return false;
  if (input.blockedUntil != null && input.now < input.blockedUntil) return false;
  return true;
}

/** How long a refused mode switch is not retried. */
export const MODE_SWITCH_RETRY_MS = 10 * 60_000;
