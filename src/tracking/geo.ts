// Small pure geometry / sanity helpers shared by the collector and the tests.
import type { ActivityKind } from './types.ts';
import { THRESHOLDS } from './constants.ts';

const EARTH_RADIUS_M = 6_371_000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres. */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Coordinates the server would accept (lat -90..90, lng -180..180, finite). 0,0 ("null island") is a failed fix. */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Speed in m/s from two timestamped places; null when the time did not advance. */
export function derivedSpeedMps(
  from: { latitude: number; longitude: number; at: number },
  to: { latitude: number; longitude: number; at: number },
): number | null {
  const dt = (to.at - from.at) / 1000;
  if (!(dt > 0)) return null;
  return haversineM(from.latitude, from.longitude, to.latitude, to.longitude) / dt;
}

/**
 * A GUESS at what the person is doing, from speed alone (this app has no motion-sensor access in managed Expo):
 * still < 0.5 m/s, walking < 2.2 m/s (about 8 km/h), anything faster is a vehicle. "running" and "bicycle" cannot be told
 * from a slow vehicle by GPS speed, so they are never reported; 'unknown' when there is no speed at all.
 */
export function guessActivity(speedMps: number | null, inStillMode: boolean): ActivityKind {
  if (inStillMode) return 'still';
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps < 0) return 'unknown';
  if (speedMps < THRESHOLDS.stillSpeedMps) return 'still';
  if (speedMps < THRESHOLDS.walkingMaxMps) return 'walking';
  return 'vehicle';
}

/** ISO-8601 (UTC, "Z") of an epoch-millisecond instant. */
export function isoOf(ms: number): string {
  return new Date(ms).toISOString();
}

/** Parses an ISO string or an epoch-ms number; null when it is neither. */
export function parseTime(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v) {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}
