// The controller decides WHEN the collector runs. The server is the only authority on whether a track is active (it starts
// when the On-Duty request is submitted and ends only by Done / the 4th punch / the day-end job / a rejection), so the phone
// never decides to stop on its own: it asks GET /tracking/state, on app start, whenever the app comes to the foreground,
// right after a request is submitted, and (throttled) on every collector tick, and then makes the engine match:
//
//      server: active track          engine: not running   -> start   (consent given, permission there, app on screen)
//      server: active track          engine: running       -> keep    (or restart: a different track / a dead service)
//      server: no active track       engine: running       -> flush the queue, then stop
//      server unreachable                                  -> keep what is there; resume from the cached track if needed
//
// `decide` is the pure rule; `createController` runs it against the real engine, queue and sync.
import type {
  ActiveTrack,
  EngineStatus,
  NewEvent,
  PermissionLevel,
  TrackerEngine,
  TrackingServerState,
} from './types.ts';
import type { TrackingQueue } from './queue.ts';
import type { Syncer } from './sync.ts';
import { inferInterruption } from './events.ts';
import {
  META,
  SELF_HEAL_MIN_INTERVAL_MS,
  SEND_LIFECYCLE_EVENTS,
  STALE_HEARTBEAT_INTERVALS,
  STALE_RESTART_COOLDOWN_MS,
} from './constants.ts';

export type EnsureReason =
  | 'app_start'
  | 'foreground'
  | 'tick'
  | 'request_submitted'
  | 'manual'
  | 'sign_in'
  | 'track_ended'
  | 'consent_accepted'
  | 'permission_changed';

export type BlockedBy = 'consent' | 'permission' | 'foreground' | 'unsupported';

export interface DecisionInput {
  /** What GET /tracking/state said; null = it could not be asked (offline, server error). */
  state: TrackingServerState | null;
  /** A batch response already said trackActive:false (authoritative even when the state call fails). */
  serverSaysEnded: boolean;
  engineRunning: boolean;
  engineTrackId: number | null;
  /** The track the engine last ran with (persisted), for resuming while offline. */
  cachedTrack: ActiveTrack | null;
  permission: PermissionLevel;
  appForeground: boolean;
  /** A running engine whose heartbeat has gone quiet for too long, and has not been restarted recently. */
  heartbeatStale: boolean;
}

export type DecisionAction = 'keep' | 'start' | 'restart' | 'stop' | 'blocked';

export interface Decision {
  action: DecisionAction;
  reason: string;
  blockedBy?: BlockedBy;
  track?: ActiveTrack;
}

function trackFromState(state: TrackingServerState): ActiveTrack | null {
  if (!state.track) return null;
  return { trackId: state.track.id, sessionId: state.track.sessionId, config: state.config };
}

export function decide(input: DecisionInput): Decision {
  const { state } = input;

  if (state == null) {
    // The server could not be asked. Only an authoritative "ended" from a batch stops the engine; being offline never does.
    if (input.serverSaysEnded) {
      return input.engineRunning ? { action: 'stop', reason: 'server_said_ended' } : { action: 'keep', reason: 'already_stopped' };
    }
    if (!input.engineRunning && input.cachedTrack && input.permission !== 'denied' && input.appForeground) {
      return { action: 'start', reason: 'offline_resume', track: input.cachedTrack };
    }
    return { action: 'keep', reason: 'server_unreachable' };
  }

  if (!state.supported) {
    return input.engineRunning
      ? { action: 'stop', reason: 'server_has_no_tracking' }
      : { action: 'blocked', reason: 'unsupported', blockedBy: 'unsupported' };
  }
  if (!state.enabled) {
    return input.engineRunning ? { action: 'stop', reason: 'tracking_disabled_by_hr' } : { action: 'keep', reason: 'tracking_disabled_by_hr' };
  }
  const track = trackFromState(state);
  // An answer that says "active" but carries no usable track is a server we cannot read, not "the track ended": never stop on it.
  if (state.active && !track) return { action: 'keep', reason: 'active_without_track_id' };
  if (!state.active || !track) {
    return input.engineRunning ? { action: 'stop', reason: 'no_active_track' } : { action: 'keep', reason: 'no_active_track' };
  }

  if (input.engineRunning) {
    if (input.engineTrackId !== track.trackId) {
      // The employee's NEXT track (a new request after the old one ended). Restarting needs the service to be startable.
      return input.appForeground
        ? { action: 'restart', reason: 'different_track', track }
        : { action: 'keep', reason: 'new_track_waits_for_foreground' };
    }
    if (input.heartbeatStale && input.appForeground) {
      return { action: 'restart', reason: 'stale_heartbeat', track };
    }
    return { action: 'keep', reason: 'running', track };
  }

  if (state.consentRequired) return { action: 'blocked', reason: 'consent_required', blockedBy: 'consent', track };
  if (input.permission === 'denied') return { action: 'blocked', reason: 'location_permission_denied', blockedBy: 'permission', track };
  if (!input.appForeground) return { action: 'blocked', reason: 'needs_foreground_to_start', blockedBy: 'foreground', track };
  return { action: 'start', reason: 'active_track_not_running', track };
}

export interface ControllerProbe {
  permission(): Promise<PermissionLevel>;
  isForeground(): boolean;
  /** When the phone last booted (epoch ms), null when it cannot be read. */
  bootAt(): Promise<number | null>;
}

export interface ControllerDeps {
  engine: TrackerEngine;
  queue: Pick<TrackingQueue, 'getMeta' | 'setMeta' | 'getJson' | 'setJson' | 'clear' | 'deleteMetaPrefix' | 'enqueueEvent' | 'counts'>;
  syncer: Pick<Syncer, 'flush'>;
  fetchState(): Promise<TrackingServerState>;
  probe: ControllerProbe;
  currentEmployeeId(): Promise<number | null>;
  now(): number;
  /** Runs `fn` after the current call stack (setTimeout 0 in the app; immediate in tests). */
  schedule?(fn: () => void): void;
  /** How long the final flush may take before the engine is stopped anyway. */
  flushTimeoutMs?: number;
  /** Called with every state read (for the server clock, the cached config ...). Errors in it are swallowed. */
  onState?(state: TrackingServerState): void | Promise<void>;
}

export interface EnsureResult {
  decision: Decision;
  started: boolean;
  stopped: boolean;
  state: TrackingServerState | null;
  skipped?: 'throttled' | 'no_auth';
}

export interface Controller {
  ensure(reason: EnsureReason, options?: { serverSaysEnded?: boolean }): Promise<EnsureResult>;
  /** Signing out: stop recording on this phone (nothing can upload without a token). The queue is kept for the same employee. */
  stopForSignOut(): Promise<void>;
  /** The syncer saw trackActive:false: reconcile on the next turn (the sync run that saw it is still finishing). */
  onTrackEndedByServer(endReason: string | null): void;
}

interface LastLocation {
  latitude: number;
  longitude: number;
  at: number;
}

export function createController(deps: ControllerDeps): Controller {
  const { engine, queue, syncer, probe } = deps;
  const schedule = deps.schedule ?? ((fn: () => void) => void setTimeout(fn, 0));
  const flushTimeoutMs = deps.flushTimeoutMs ?? 20_000;
  let running: Promise<EnsureResult> | null = null;

  async function lastPlace(): Promise<{ latitude: number; longitude: number } | null> {
    const loc = await queue.getJson<LastLocation>(META.lastLocation);
    return loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
      ? { latitude: loc.latitude, longitude: loc.longitude }
      : null;
  }

  async function lifecycleEvent(kind: 'TRACKING_STARTED' | 'TRACKING_STOPPED', meta: Record<string, unknown>) {
    if (!SEND_LIFECYCLE_EVENTS) return;
    const place = await lastPlace();
    const event: NewEvent = { kind, startedAt: deps.now(), ...(place ?? {}), meta: { origin: 'device', ...meta } };
    await queue.enqueueEvent(event);
  }

  async function startEngine(track: ActiveTrack, employeeId: number, reason: string): Promise<boolean> {
    const cached = await queue.getJson<ActiveTrack>(META.engineTrack);
    const fresh = !cached || cached.trackId !== track.trackId;
    if (fresh) {
      // A new track: no memory of the last one's signals, no heartbeat to compare with.
      await queue.deleteMetaPrefix(META.signalPrefix);
      await queue.setMeta(META.heartbeat, null);
      await queue.setMeta(META.coreState, null);
    } else {
      // The same track coming back: if the engine was silent for long, record that it was killed / the phone rebooted.
      const hb = Number(await queue.getMeta(META.heartbeat));
      const expectedIntervalMs = Math.max(track.config.sampleMovingSeconds, track.config.sampleStillSeconds) * 1000;
      const events = inferInterruption({
        lastHeartbeatAt: Number.isFinite(hb) && hb > 0 ? hb : null,
        now: deps.now(),
        expectedIntervalMs,
        bootAt: await probe.bootAt().catch(() => null),
        location: await lastPlace(),
      });
      for (const e of events) await queue.enqueueEvent(e);
    }
    await queue.setMeta(META.ownerEmployeeId, String(employeeId));
    // The track and the heartbeat are written BEFORE the engine starts: its first fix can arrive within milliseconds, and the
    // task ignores fixes while no track is recorded as running.
    await queue.setJson(META.engineTrack, track);
    await queue.setMeta(META.heartbeat, String(deps.now()));
    const res = await engine.start(track);
    if (!res.ok) {
      await queue.setMeta(META.engineError, `${res.reason}: ${res.message}`);
      if (cached && !fresh) await queue.setJson(META.engineTrack, cached);
      else await queue.setMeta(META.engineTrack, null);
      return false;
    }
    await queue.setMeta(META.engineError, null);
    if (fresh) await lifecycleEvent('TRACKING_STARTED', { reason });
    return true;
  }

  async function finishTrack(reason: string): Promise<void> {
    // The last place and the end of the track go into the queue first so they ride the final flush.
    await lifecycleEvent('TRACKING_STOPPED', { reason });
    await Promise.race([
      syncer.flush().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, flushTimeoutMs)),
    ]);
    await engine.stop(reason);
    await queue.setMeta(META.engineTrack, null);
    await queue.setMeta(META.heartbeat, null);
    await queue.setMeta(META.coreState, null);
    await queue.deleteMetaPrefix(META.signalPrefix);
    const left = await queue.counts();
    // Rows still waiting (offline at the end) stay tied to their employee until they have gone up.
    if (left.points + left.events === 0) await queue.setMeta(META.ownerEmployeeId, null);
  }

  async function doEnsure(reason: EnsureReason, options: { serverSaysEnded?: boolean }): Promise<EnsureResult> {
    const employeeId = await deps.currentEmployeeId();
    if (employeeId == null) {
      return { decision: { action: 'keep', reason: 'not_signed_in' }, started: false, stopped: false, state: null, skipped: 'no_auth' };
    }

    if (reason === 'tick') {
      const last = Number(await queue.getMeta(META.lastEnsureAt));
      if (Number.isFinite(last) && last > 0 && deps.now() - last < SELF_HEAL_MIN_INTERVAL_MS) {
        return { decision: { action: 'keep', reason: 'throttled' }, started: false, stopped: false, state: null, skipped: 'throttled' };
      }
    }
    await queue.setMeta(META.lastEnsureAt, String(deps.now()));

    // Data that belongs to another employee (someone else signed in on this phone) is never uploaded under this token.
    const owner = Number(await queue.getMeta(META.ownerEmployeeId));
    if (Number.isFinite(owner) && owner > 0 && owner !== employeeId) {
      await engine.stop('owner_changed');
      await queue.clear();
      await queue.setMeta(META.engineTrack, null);
      await queue.setMeta(META.heartbeat, null);
      await queue.setMeta(META.ownerEmployeeId, null);
      await queue.deleteMetaPrefix(META.signalPrefix);
    }

    let state: TrackingServerState | null = null;
    try {
      state = await deps.fetchState();
    } catch {
      state = null;
    }
    if (state) {
      try {
        await deps.onState?.(state);
      } catch {
        // a failing observer must never change what the controller decides
      }
    }

    const status: EngineStatus = await engine.status();
    const cachedTrack = await queue.getJson<ActiveTrack>(META.engineTrack);
    const hb = Number(await queue.getMeta(META.heartbeat));
    const config = state?.config ?? cachedTrack?.config;
    const staleAfterMs = config
      ? Math.max(config.sampleMovingSeconds, config.sampleStillSeconds) * 1000 * STALE_HEARTBEAT_INTERVALS
      : Infinity;
    const lastRestart = Number(await queue.getMeta(META.lastRestartAt));
    const heartbeatStale =
      status.running &&
      Number.isFinite(hb) &&
      hb > 0 &&
      deps.now() - hb > staleAfterMs &&
      !(Number.isFinite(lastRestart) && deps.now() - lastRestart < STALE_RESTART_COOLDOWN_MS);

    const decision = decide({
      state,
      serverSaysEnded: options.serverSaysEnded === true,
      engineRunning: status.running,
      engineTrackId: status.trackId ?? cachedTrack?.trackId ?? null,
      cachedTrack,
      permission: await probe.permission(),
      appForeground: probe.isForeground(),
      heartbeatStale,
    });

    let started = false;
    let stopped = false;
    if (decision.action === 'start' && decision.track) {
      started = await startEngine(decision.track, employeeId, reason);
    } else if (decision.action === 'restart' && decision.track) {
      await engine.stop(decision.reason);
      await queue.setMeta(META.lastRestartAt, String(deps.now()));
      started = await startEngine(decision.track, employeeId, decision.reason);
    } else if (decision.action === 'stop') {
      await finishTrack(decision.reason);
      stopped = true;
    }
    return { decision, started, stopped, state };
  }

  function ensure(reason: EnsureReason, options: { serverSaysEnded?: boolean } = {}): Promise<EnsureResult> {
    if (running) {
      // A periodic tick is happy with the answer of the run already in progress. Anything else (a request was just
      // submitted, the app came to the foreground) may know something that run did not, so it gets a run of its own.
      if (reason === 'tick') return running;
      return running.then(() => ensure(reason, options));
    }
    const p = doEnsure(reason, options)
      .catch(
        (err): EnsureResult => ({
          decision: { action: 'keep', reason: `error: ${String((err as Error)?.message ?? err)}` },
          started: false,
          stopped: false,
          state: null,
        }),
      )
      .finally(() => {
        if (running === p) running = null;
      });
    running = p;
    return p;
  }

  return {
    ensure,

    async stopForSignOut() {
      await engine.stop('signed_out');
      await queue.setMeta(META.heartbeat, null);
      await queue.setMeta(META.coreState, null);
      await queue.deleteMetaPrefix(META.signalPrefix);
    },

    onTrackEndedByServer(_endReason) {
      schedule(() => {
        void ensure('track_ended', { serverSaysEnded: true });
      });
    },
  };
}
