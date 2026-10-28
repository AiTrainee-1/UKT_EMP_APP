// The uploader: queue -> POST /tracking/batch. It never blocks the collector (the collector only writes the queue and then
// asks for a sync), never deletes a row before the server has acknowledged it, and never loses one to a failure: any error
// leaves the queue exactly as it was and backs off exponentially.
//
//  * Triggers: 30 queued points, or 60 s since the last attempt (both from the server's config), the app coming to the
//    foreground, the network coming back, a task tick, and the final flush when a track ends.
//  * One run uploads contiguous windows of the queue (see queue.ts peekBatch) until it is empty or something fails.
//  * ackSeq: rows are deleted up to the server's acknowledgement (never above what this window held). When the server
//    classified every row of the window (accepted + duplicates + rejected) the whole window is done even if its ackSeq is
//    lower (rejected rows are never going to be accepted); when it answers "no active track, nothing accepted" the rows are
//    unwanted and are released instead of being re-sent for ever.
//  * 403 CONSENT_REQUIRED keeps everything queued and waits for the employee to accept the notice.
//  * 401 keeps everything queued (the app signs the employee out through its own 401 handling; the rows upload after the
//    next sign-in of the SAME employee, and are never sent under another one's token).
import type {
  AppInfo,
  BatchResponse,
  HealthSnapshot,
  QueueBatch,
  QueuedEvent,
  QueuedPoint,
  TrackingConfig,
} from './types.ts';
import type { TrackingQueue } from './queue.ts';
import { BATCH_LIMITS, META, SYNC } from './constants.ts';
import { isoOf } from './geo.ts';

export type SyncTrigger = 'tick' | 'foreground' | 'network_restored' | 'manual' | 'flush' | 'stop';

// ----------------------------------------------------------------------------------------------- wire format

/**
 * The body as the code builds it, in camelCase, exactly as the contract writes it. The app's axios client decamelizes a JSON
 * body on the way out (deviceId -> device_id, recordedAt -> recorded_at, isMocked -> is_mocked, at every depth), and the server
 * accepts both spellings, so this is what is tested; see sync.test.ts.
 */
export interface BatchBody {
  deviceId: string;
  app: AppInfo;
  health: HealthSnapshot;
  points: WirePoint[];
  events: WireEvent[];
}

export interface WirePoint {
  seq: number;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  bearing: number | null;
  altitude: number | null;
  activity: string;
  battery: number | null;
  charging: boolean | null;
  network: string;
  provider: string;
  isMocked: boolean;
}

export interface WireEvent {
  seq: number;
  kind: string;
  startedAt: string;
  endedAt?: string;
  latitude?: number;
  longitude?: number;
  meta?: Record<string, unknown>;
}

export function toWirePoint(p: QueuedPoint): WirePoint {
  return {
    seq: p.seq,
    recordedAt: isoOf(p.recordedAt),
    latitude: p.latitude,
    longitude: p.longitude,
    accuracy: p.accuracy,
    speed: p.speed,
    bearing: p.bearing,
    altitude: p.altitude,
    activity: p.activity,
    battery: p.battery,
    charging: p.charging,
    network: p.network,
    provider: p.provider,
    isMocked: p.isMocked,
  };
}

export function toWireEvent(e: QueuedEvent): WireEvent {
  const out: WireEvent = { seq: e.seq, kind: e.kind, startedAt: isoOf(e.startedAt) };
  if (e.endedAt != null) out.endedAt = isoOf(e.endedAt);
  if (e.latitude != null) out.latitude = e.latitude;
  if (e.longitude != null) out.longitude = e.longitude;
  if (e.meta) out.meta = e.meta;
  return out;
}

export function buildBatchBody(input: {
  deviceId: string;
  app: AppInfo;
  health: HealthSnapshot;
  batch: QueueBatch;
}): BatchBody {
  return {
    deviceId: input.deviceId,
    app: input.app,
    health: input.health,
    points: input.batch.points.map(toWirePoint),
    events: input.batch.events.map(toWireEvent),
  };
}

// ----------------------------------------------------------------------------------------------- send results

export type SendResult =
  | { kind: 'ok'; data: BatchResponse }
  | { kind: 'consent_required' }
  | { kind: 'unauthorized' }
  | { kind: 'too_large' }
  | { kind: 'failed'; reason: 'offline' | 'timeout' | 'throttled' | 'server' | 'client'; status?: number; retryAfterMs?: number };

/** Sorts an axios-style error into what the syncer must do. Pure: takes the error, imports nothing. */
export function classifyBatchError(err: unknown): SendResult {
  const e = (err ?? {}) as {
    response?: { status?: number; data?: any; headers?: Record<string, any> };
    code?: string;
    message?: string;
  };
  const res = e.response;
  if (!res || typeof res.status !== 'number') {
    const timedOut = e.code === 'ECONNABORTED' || /timeout/i.test(e.message ?? '');
    return { kind: 'failed', reason: timedOut ? 'timeout' : 'offline' };
  }
  const status = res.status;
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 403) {
    const code = String(res.data?.code ?? res.data?.error?.code ?? '').toUpperCase();
    if (code === 'CONSENT_REQUIRED') return { kind: 'consent_required' };
    return { kind: 'failed', reason: 'client', status };
  }
  if (status === 413) return { kind: 'too_large' };
  if (status === 429) {
    const header = res.headers?.['retry-after'] ?? res.headers?.['Retry-After'];
    const seconds = Number(header);
    return {
      kind: 'failed',
      reason: 'throttled',
      status,
      ...(Number.isFinite(seconds) && seconds > 0 ? { retryAfterMs: Math.min(seconds * 1000, SYNC.maxBackoffMs) } : {}),
    };
  }
  if (status >= 500) return { kind: 'failed', reason: 'server', status };
  return { kind: 'failed', reason: 'client', status };
}

// ----------------------------------------------------------------------------------------------- pure policy

/** Exponential back-off: 5 s, 10 s, 20 s ... capped at 10 min, +-20 % jitter (`random` in [0, 1); 0.5 = none). */
export function backoffMs(failures: number, random = 0.5): number {
  if (failures <= 0) return 0;
  const raw = Math.min(SYNC.maxBackoffMs, SYNC.baseBackoffMs * 2 ** (failures - 1));
  return Math.round(raw * (0.8 + random * 0.4));
}

/** The periodic trigger: enough points, or the interval has run out, and not inside a back-off window. */
export function shouldSyncOnTick(input: {
  points: number;
  events: number;
  now: number;
  lastAttemptAt: number | null;
  nextAt: number | null;
  config: TrackingConfig;
  blockedByConsent: boolean;
}): boolean {
  if (input.points + input.events === 0) return false;
  if (input.blockedByConsent) return false;
  if (input.nextAt != null && input.now < input.nextAt) return false;
  if (input.points >= input.config.uploadBatchPoints) return true;
  return input.lastAttemptAt == null || input.now - input.lastAttemptAt >= input.config.uploadIntervalSeconds * 1000;
}

/** Which sequence number to delete up to after an `ok` answer for this window; null = nothing may be deleted. */
export function chooseAck(data: BatchResponse, batch: QueueBatch): number | null {
  const sent = batch.points.length + batch.events.length;
  const handled = data.accepted + data.duplicates + data.rejected;
  // No active track and nothing taken: the server does not want this data now or ever (an employee with no track, a track
  // closed longer ago than the late-upload window). Release it instead of re-sending it on every trigger.
  if (data.trackActive === false && data.accepted === 0 && data.duplicates === 0) return batch.maxSeq;
  // Every row was classified (taken, already had, or refused as invalid): the window is finished.
  if (handled >= sent) return batch.maxSeq;
  if (data.ackSeq != null) {
    const ack = Math.min(data.ackSeq, batch.maxSeq); // never above what this window carried
    return ack >= batch.minSeq ? ack : null;
  }
  return null;
}

// ----------------------------------------------------------------------------------------------- the syncer

export interface SyncDeps {
  queue: Pick<TrackingQueue, 'peekBatch' | 'ack' | 'counts' | 'getMeta' | 'setMeta'>;
  send(body: BatchBody): Promise<SendResult>;
  health(): Promise<HealthSnapshot>;
  app(): AppInfo;
  deviceId(): Promise<string>;
  /** The signed-in employee, null when nobody is. */
  currentEmployeeId(): Promise<number | null>;
  config(): Promise<TrackingConfig>;
  now(): number;
  random?(): number;
  onConfig?(config: TrackingConfig): void | Promise<void>;
  /** The server answered trackActive:false. Fire-and-forget: the controller flushes and stops after this run returns. */
  onTrackEnded?(endReason: string | null): void;
  onConsentRequired?(): void;
}

export type SyncStatusKind =
  | 'synced'
  | 'empty'
  | 'skipped'
  | 'backoff'
  | 'consent_required'
  | 'unauthorized'
  | 'no_auth'
  | 'owner_mismatch'
  | 'failed';

export interface SyncOutcome {
  status: SyncStatusKind;
  /** Rows put on the wire (points + events) / rows deleted from the queue. */
  sent: number;
  acked: number;
  trackActive: boolean | null;
  detail?: string;
}

export interface SyncStatus {
  points: number;
  events: number;
  failures: number;
  nextAt: number | null;
  lastAttemptAt: number | null;
  lastOkAt: number | null;
  lastError: string | null;
  blockedByConsent: boolean;
  trackEnded: boolean;
}

export interface Syncer {
  syncNow(trigger: SyncTrigger): Promise<SyncOutcome>;
  /** Drains the queue regardless of back-off; waits for a sync already running first. */
  flush(): Promise<SyncOutcome>;
  status(): Promise<SyncStatus>;
  /** The employee accepted the notice: lift the consent block. */
  clearConsentBlock(): Promise<void>;
}

const num = (v: string | null): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function createSyncer(deps: SyncDeps): Syncer {
  const { queue } = deps;
  let inFlight: Promise<SyncOutcome> | null = null;

  async function readPolicyState() {
    const [failures, nextAt, lastAttemptAt, lastOkAt, lastError, consent, ended] = await Promise.all([
      queue.getMeta(META.syncFailures),
      queue.getMeta(META.syncNextAt),
      queue.getMeta(META.syncLastAttemptAt),
      queue.getMeta(META.syncLastOkAt),
      queue.getMeta(META.syncLastError),
      queue.getMeta(META.syncBlockedConsent),
      queue.getMeta(META.syncTrackEnded),
    ]);
    return {
      failures: num(failures) ?? 0,
      nextAt: num(nextAt),
      lastAttemptAt: num(lastAttemptAt),
      lastOkAt: num(lastOkAt),
      lastError,
      blockedByConsent: consent === '1',
      trackEnded: ended != null,
    };
  }

  async function fail(reason: string, retryAfterMs?: number): Promise<void> {
    const state = await readPolicyState();
    const failures = state.failures + 1;
    const wait = retryAfterMs ?? backoffMs(failures, (deps.random ?? (() => 0.5))());
    await queue.setMeta(META.syncFailures, String(failures));
    await queue.setMeta(META.syncNextAt, String(deps.now() + wait));
    await queue.setMeta(META.syncLastError, reason);
  }

  async function run(trigger: SyncTrigger): Promise<SyncOutcome> {
    const employeeId = await deps.currentEmployeeId();
    if (employeeId == null) return { status: 'no_auth', sent: 0, acked: 0, trackActive: null };
    const owner = num(await queue.getMeta(META.ownerEmployeeId));
    if (owner != null && owner !== employeeId) {
      return { status: 'owner_mismatch', sent: 0, acked: 0, trackActive: null };
    }

    const now = deps.now();
    const state = await readPolicyState();
    const counts = await queue.counts();
    if (counts.points + counts.events === 0) return { status: 'empty', sent: 0, acked: 0, trackActive: null };

    // --- policy -----------------------------------------------------------------------------------------------------
    const forced = trigger === 'flush' || trigger === 'stop';
    if (trigger === 'tick') {
      const config = await deps.config();
      const go = shouldSyncOnTick({
        points: counts.points,
        events: counts.events,
        now,
        lastAttemptAt: state.lastAttemptAt,
        nextAt: state.nextAt,
        config,
        blockedByConsent: state.blockedByConsent,
      });
      if (!go) {
        const inBackoff = state.nextAt != null && now < state.nextAt;
        return { status: inBackoff ? 'backoff' : 'skipped', sent: 0, acked: 0, trackActive: null };
      }
    } else if (!forced && state.lastAttemptAt != null && now - state.lastAttemptAt < SYNC.minGapMs) {
      return { status: 'skipped', sent: 0, acked: 0, trackActive: null };
    }
    if (state.blockedByConsent && trigger !== 'tick') await queue.setMeta(META.syncBlockedConsent, null); // try again

    // --- upload ------------------------------------------------------------------------------------------------------
    const deviceId = await deps.deviceId();
    const app = deps.app();
    let capPoints: number = BATCH_LIMITS.maxPoints;
    let capEvents: number = BATCH_LIMITS.maxEvents;
    let sentTotal = 0;
    let ackedTotal = 0;
    let trackActive: boolean | null = null;
    let progressed = false;

    for (let i = 0; i < SYNC.maxBatchesPerRun; i++) {
      const batch = await queue.peekBatch({ maxPoints: capPoints, maxEvents: capEvents });
      if (!batch) break;
      let health: HealthSnapshot;
      try {
        health = await deps.health();
      } catch {
        health = {
          permission: 'unknown',
          locationEnabled: null,
          backgroundRestricted: null,
          batteryOptimised: null,
          powerSave: null,
          batteryPct: null,
          charging: null,
          network: 'unknown',
        };
      }
      const body = buildBatchBody({ deviceId, app, health, batch });
      const sent = batch.points.length + batch.events.length;
      await queue.setMeta(META.syncLastAttemptAt, String(deps.now()));
      const res = await deps.send(body);

      if (res.kind === 'consent_required') {
        await queue.setMeta(META.syncBlockedConsent, '1');
        await queue.setMeta(META.syncLastError, 'consent_required');
        deps.onConsentRequired?.();
        return { status: 'consent_required', sent: sentTotal, acked: ackedTotal, trackActive };
      }
      if (res.kind === 'unauthorized') {
        await queue.setMeta(META.syncLastError, 'unauthorized');
        return { status: 'unauthorized', sent: sentTotal, acked: ackedTotal, trackActive };
      }
      if (res.kind === 'too_large') {
        if (sent <= 1) {
          await fail('http_413');
          return { status: 'failed', sent: sentTotal, acked: ackedTotal, trackActive, detail: 'too_large' };
        }
        capPoints = Math.max(1, Math.floor(capPoints / 2));
        capEvents = Math.max(1, Math.floor(capEvents / 2));
        continue;
      }
      if (res.kind === 'failed') {
        await fail(res.status ? `http_${res.status}` : res.reason, res.retryAfterMs);
        return { status: 'failed', sent: sentTotal, acked: ackedTotal, trackActive, detail: res.reason };
      }

      const data = res.data;
      if (!data.ok) {
        await fail('not_ok');
        return { status: 'failed', sent: sentTotal, acked: ackedTotal, trackActive, detail: 'not_ok' };
      }
      sentTotal += sent;
      const ack = chooseAck(data, batch);
      if (data.config) await deps.onConfig?.(data.config);
      if (data.trackActive != null) trackActive = data.trackActive;
      if (ack == null) {
        // The server answered ok but took nothing we can verify: do not delete, do not loop; back off.
        await fail('no_ack');
        return { status: 'failed', sent: sentTotal, acked: ackedTotal, trackActive, detail: 'no_ack' };
      }
      const gone = await queue.ack(ack);
      ackedTotal += gone.points + gone.events;
      progressed = true;
      await queue.setMeta(META.syncFailures, null);
      await queue.setMeta(META.syncNextAt, null);
      await queue.setMeta(META.syncLastError, null);
      await queue.setMeta(META.syncLastOkAt, String(deps.now()));
      await queue.setMeta(META.syncBlockedConsent, null);
      if (data.trackActive === false) {
        await queue.setMeta(META.syncTrackEnded, data.endReason ?? 'ended');
        deps.onTrackEnded?.(data.endReason);
      } else if (data.trackActive === true) {
        await queue.setMeta(META.syncTrackEnded, null);
      }
      if (!batch.hasMore) break;
    }
    return { status: progressed ? 'synced' : 'empty', sent: sentTotal, acked: ackedTotal, trackActive };
  }

  function guarded(trigger: SyncTrigger): Promise<SyncOutcome> {
    if (inFlight) return inFlight;
    const p = run(trigger)
      .catch((err): SyncOutcome => ({
        status: 'failed',
        sent: 0,
        acked: 0,
        trackActive: null,
        detail: String((err as Error)?.message ?? err),
      }))
      .finally(() => {
        if (inFlight === p) inFlight = null;
      });
    inFlight = p;
    return p;
  }

  return {
    syncNow: (trigger) => guarded(trigger),

    async flush() {
      if (inFlight) await inFlight.catch(() => undefined);
      return guarded('flush');
    },

    async status() {
      const [counts, state] = await Promise.all([queue.counts(), readPolicyState()]);
      return { points: counts.points, events: counts.events, ...state };
    },

    async clearConsentBlock() {
      await queue.setMeta(META.syncBlockedConsent, null);
    },
  };
}
