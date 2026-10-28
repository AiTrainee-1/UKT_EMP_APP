// Turns what the server sent (already camelCased by src/lib/api.ts) into the typed shapes the engine uses. Defensive on
// purpose: an older or newer backend may omit or rename a field, and a missing field must never crash a background task.
import type { BatchResponse, TrackInfo, TrackingConfig, TrackingServerState } from './types.ts';
import { DEFAULT_CONFIG } from './constants.ts';

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

/** Clamps every setting into a range the collector can safely run with (HR may type anything on the portal). */
export function normalizeConfig(raw: unknown, base: TrackingConfig = DEFAULT_CONFIG): TrackingConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    sampleMovingSeconds: num(r.sampleMovingSeconds, base.sampleMovingSeconds, 2, 600),
    sampleStillSeconds: num(r.sampleStillSeconds, base.sampleStillSeconds, 10, 3600),
    distanceFilterM: num(r.distanceFilterM, base.distanceFilterM, 0, 500),
    uploadBatchPoints: Math.round(num(r.uploadBatchPoints, base.uploadBatchPoints, 1, 500)),
    uploadIntervalSeconds: num(r.uploadIntervalSeconds, base.uploadIntervalSeconds, 5, 3600),
    maxAccuracyM: num(r.maxAccuracyM, base.maxAccuracyM, 5, 5000),
  };
}

function normalizeTrack(raw: unknown): TrackInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = intOrNull(r.id) ?? intOrNull(r.trackId);
  if (id == null) return null;
  return {
    id,
    sessionId: intOrNull(r.sessionId),
    startedAt: strOrNull(r.startedAt),
    endsAt: strOrNull(r.endsAt),
    state: strOrNull(r.state),
  };
}

export function normalizeTrackingState(raw: unknown): TrackingServerState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const track = normalizeTrack(r.track);
  return {
    supported: true,
    enabled: r.enabled !== false,
    // Some servers send only `track`: an active one means active.
    active: typeof r.active === 'boolean' ? r.active : track != null,
    consentRequired: r.consentRequired === true,
    noticeVersion: Math.max(0, Math.trunc(num(r.noticeVersion, 1, 0, 1_000_000))),
    noticeText: typeof r.noticeText === 'string' ? r.noticeText : '',
    serverTime: strOrNull(r.serverTime),
    track,
    config: normalizeConfig(r.config),
    punchPhotos: r.punchPhotos === 2 ? 2 : 1,
  };
}

/** The state of a server that has no /tracking routes (HTTP 404): nothing to record. */
export const UNSUPPORTED_STATE: TrackingServerState = {
  supported: false,
  enabled: false,
  active: false,
  consentRequired: false,
  noticeVersion: 0,
  noticeText: '',
  serverTime: null,
  track: null,
  config: DEFAULT_CONFIG,
  punchPhotos: 1,
};

export function normalizeBatchResponse(raw: unknown): BatchResponse {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    ok: r.ok === true,
    ackSeq: intOrNull(r.ackSeq),
    accepted: Math.max(0, intOrNull(r.accepted) ?? 0),
    duplicates: Math.max(0, intOrNull(r.duplicates) ?? 0),
    rejected: Math.max(0, intOrNull(r.rejected) ?? 0),
    trackActive: boolOrNull(r.trackActive),
    endReason: strOrNull(r.endReason),
    serverTime: strOrNull(r.serverTime),
    config: r.config && typeof r.config === 'object' ? normalizeConfig(r.config) : null,
  };
}
