// The tracking runtime: the real queue, uploader, event detector and controller wired to the phone, as ONE lazily built
// singleton per JS context. It is used by the screens (through useTracking.ts) AND by the background location task
// (collector.ts), which may run in a headless JS context of its own: nothing in here depends on React or on state the other
// context could not rebuild, because everything that must be shared lives in the SQLite queue's meta table.
import * as SecureStore from 'expo-secure-store';

import { getEmployeeId, getToken } from '../lib/auth';
import { fetchTrackingState, postBatch, postConsent } from './api';
import { createController } from './controller.ts';
import type { Controller } from './controller.ts';
import { INITIAL_CORE_STATE, processLocations } from './collectorCore.ts';
import type { CoreState } from './collectorCore.ts';
import { DEFAULT_CONFIG, META, SYNC } from './constants.ts';
import { resolveDeviceId } from './deviceId.ts';
import { getEngine, getModeSwitcher } from './engineRegistry.ts';
import { createEventDetector } from './events.ts';
import type { EventDetector } from './events.ts';
import { parseTime } from './geo.ts';
import { normalizeConfig } from './normalize.ts';
import { createProbe, subscribeNetwork } from './platform/probe';
import type { Probe } from './platform/probe';
import { openTrackingDb } from './platform/sqlite';
import { createQueue } from './queue.ts';
import type { TrackingQueue } from './queue.ts';
import { createSyncer } from './sync.ts';
import type { SyncStatus, SyncTrigger, Syncer } from './sync.ts';
import type {
  ActiveTrack,
  EngineStatus,
  HealthSnapshot,
  NewEvent,
  RawLocation,
  TrackerEngine,
  TrackingConfig,
  TrackingServerState,
} from './types.ts';

const DEVICE_ID_KEY = 'tracking_device_id';

export interface TrackingSnapshot {
  engine: EngineStatus;
  queuedPoints: number;
  queuedEvents: number;
  droppedPoints: number;
  sync: SyncStatus;
  health: HealthSnapshot;
  notificationsGranted: boolean | null;
  lastPointAt: number | null;
  lastHeartbeatAt: number | null;
  engineError: string | null;
  deviceId: string;
  takenAt: number;
}

export interface IngestResult {
  stored: number;
  skipped: number;
  dropped: number;
  ignored: boolean;
}

export type RuntimeListener = (event: 'consent_required' | 'state', payload?: TrackingServerState) => void;

export interface TrackingRuntime {
  queue: TrackingQueue;
  probe: Probe;
  syncer: Syncer;
  detector: EventDetector;
  controller: Controller;
  engine: TrackerEngine;
  deviceId(): Promise<string>;
  config(): Promise<TrackingConfig>;
  /** Everything the Tracking health screen and the hooks show, read in one go. */
  snapshot(): Promise<TrackingSnapshot>;
  /** The background task body: store the fixes, detect events, upload, self-heal. */
  ingestLocations(locations: RawLocation[]): Promise<IngestResult>;
  /** A look at the phone without a fix (app opened, network changed): events + upload. */
  observeNow(trigger: SyncTrigger): Promise<void>;
  /** Back to the fast request when the app comes to the front (the person is looking at the phone, probably on the move). */
  onForeground(): Promise<void>;
  acceptConsent(noticeVersion: number): Promise<void>;
  subscribe(listener: RuntimeListener): () => void;
  /** Starts the network listener (UI context only). Returns the stop function. */
  startNetworkWatch(): () => void;
}

let runtime: TrackingRuntime | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

const num = (v: string | null): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function build(): TrackingRuntime {
  const queue = createQueue(openTrackingDb());
  const probe = createProbe();
  const engine = getEngine();
  const listeners = new Set<RuntimeListener>();
  const emit: RuntimeListener = (event, payload) => listeners.forEach((l) => l(event, payload));
  let cachedDeviceId: string | null = null;
  let controller: Controller; // assigned below: the syncer's callbacks reach it only when they run

  const deviceId = async () => {
    if (cachedDeviceId) return cachedDeviceId;
    cachedDeviceId = await resolveDeviceId({
      secureGet: () => SecureStore.getItemAsync(DEVICE_ID_KEY),
      secureSet: (id) => SecureStore.setItemAsync(DEVICE_ID_KEY, id),
      metaGet: () => queue.getMeta(META.deviceId),
      metaSet: (id) => queue.setMeta(META.deviceId, id),
    });
    return cachedDeviceId;
  };

  const config = async (): Promise<TrackingConfig> => {
    const stored = await queue.getJson<TrackingConfig>(META.config);
    return stored ? normalizeConfig(stored) : DEFAULT_CONFIG;
  };

  /** The signed-in employee: only when a token is actually there to upload with. */
  const currentEmployeeId = async () => {
    const [id, token] = await Promise.all([getEmployeeId().catch(() => null), getToken().catch(() => null)]);
    return token ? id : null;
  };

  const detector = createEventDetector({ get: queue.getMeta, cas: queue.casMeta });

  const syncer = createSyncer({
    queue,
    send: postBatch,
    health: () => probe.health(),
    app: () => probe.appInfo(),
    deviceId,
    currentEmployeeId,
    config,
    now: () => Date.now(),
    onConfig: async (c) => {
      await queue.setJson(META.config, normalizeConfig(c, DEFAULT_CONFIG));
    },
    onTrackEnded: (reason) => controller.onTrackEndedByServer(reason),
    onConsentRequired: () => emit('consent_required'),
  });

  controller = createController({
    engine,
    queue,
    syncer,
    fetchState: fetchTrackingState,
    probe: { permission: () => probe.permission(), isForeground: () => probe.isForeground(), bootAt: () => probe.bootAt() },
    currentEmployeeId,
    now: () => Date.now(),
    onState: async (state) => {
      emit('state', state);
      if (state.supported && state.active) {
        await queue.setJson(META.config, state.config);
        const serverMs = parseTime(state.serverTime);
        if (serverMs != null) {
          for (const e of await detector.observeClock(serverMs, Date.now(), await lastPlace())) await queue.enqueueEvent(e);
        }
      }
    },
  });

  async function lastPlace() {
    const loc = await queue.getJson<{ latitude: number; longitude: number }>(META.lastLocation);
    return loc ? { latitude: loc.latitude, longitude: loc.longitude } : null;
  }

  async function enqueueAll(events: NewEvent[]) {
    for (const e of events) await queue.enqueueEvent(e);
  }

  const rt: TrackingRuntime = {
    queue,
    probe,
    syncer,
    detector,
    controller,
    engine,
    deviceId,
    config,

    async snapshot() {
      const [status, counts, sync, health, notifications, lastPoint, hb, err, id, dropped] = await Promise.all([
        engine.status(),
        queue.counts(),
        syncer.status(),
        probe.health(),
        probe.notifications(),
        queue.getMeta(META.lastPointAt),
        queue.getMeta(META.heartbeat),
        queue.getMeta(META.engineError),
        deviceId(),
        queue.getMeta(META.droppedPoints),
      ]);
      return {
        engine: status,
        queuedPoints: counts.points,
        queuedEvents: counts.events,
        droppedPoints: num(dropped) ?? 0,
        sync,
        health,
        notificationsGranted: notifications,
        lastPointAt: num(lastPoint),
        lastHeartbeatAt: num(hb),
        engineError: err,
        deviceId: id,
        takenAt: Date.now(),
      };
    },

    async ingestLocations(locations) {
      const track = await queue.getJson<ActiveTrack>(META.engineTrack);
      if (!track) return { stored: 0, skipped: 0, dropped: 0, ignored: true }; // a stray fix after the engine was stopped
      const now = Date.now();
      let stored = 0;
      let skipped = 0;
      let dropped = 0;
      let newest: RawLocation | null = null;
      let evented: NewEvent[] = [];

      // 1. the points first: nothing below may stop them reaching the queue
      try {
        const [coreState, battery, network, cfg] = await Promise.all([
          queue.getJson<CoreState>(META.coreState),
          probe.battery(),
          probe.network(),
          config(),
        ]);
        const result = processLocations(coreState ?? INITIAL_CORE_STATE, locations, {
          battery: battery.pct,
          charging: battery.charging,
          network,
          config: cfg,
        });
        if (result.points.length) await queue.enqueuePoints(result.points);
        stored = result.points.length;
        skipped = result.skipped;
        dropped = result.dropped;
        newest = result.newest;
        let state = result.state;
        if (result.newest) {
          await queue.setJson(META.lastLocation, {
            latitude: result.newest.latitude,
            longitude: result.newest.longitude,
            at: result.newest.timestamp,
          });
          await queue.setMeta(META.lastPointAt, String(result.newest.timestamp));
        }
        const switchMode = getModeSwitcher();
        if (switchMode && result.wantedMode !== state.mode && (await switchMode(result.wantedMode).catch(() => false))) {
          state = { ...state, mode: result.wantedMode };
        }
        await queue.setJson(META.coreState, state);
      } catch (err) {
        await queue.setMeta(META.engineError, `ingest: ${String((err as Error)?.message ?? err)}`).catch(() => undefined);
      }
      await queue.setMeta(META.heartbeat, String(now)).catch(() => undefined);

      // 2. what the phone looks like: GPS off, offline, battery, mock ...
      try {
        const place = newest ? { latitude: newest.latitude, longitude: newest.longitude } : await lastPlace();
        evented = await detector.observe(await probe.observation({ now, mocked: newest ? newest.mocked : null, location: place }));
        await enqueueAll(evented);
      } catch {
        // an event we could not record this tick will be seen again on the next one
      }

      // 3. upload (bounded, so the OS job is not held open on a dead network) and self-heal
      const trigger: SyncTrigger = evented.some((e) => e.kind === 'NETWORK_RESTORED') ? 'network_restored' : 'tick';
      await withTimeout(syncer.syncNow(trigger), SYNC.taskTimeoutMs);
      await withTimeout(controller.ensure('tick'), SYNC.taskTimeoutMs);
      return { stored, skipped, dropped, ignored: false };
    },

    async observeNow(trigger) {
      try {
        const track = await queue.getJson<ActiveTrack>(META.engineTrack);
        if (track) {
          const place = await lastPlace();
          await enqueueAll(await detector.observe(await probe.observation({ now: Date.now(), mocked: null, location: place })));
        }
      } catch {
        // see above
      }
      await syncer.syncNow(trigger);
    },

    async onForeground() {
      const switchMode = getModeSwitcher();
      if (!switchMode || (await queue.getMeta(META.engineMode)) !== 'still') return;
      if (!(await engine.status()).running) return;
      if (await switchMode('moving').catch(() => false)) {
        const state = await queue.getJson<CoreState>(META.coreState);
        if (state) await queue.setJson(META.coreState, { ...state, mode: 'moving' });
      }
    },

    async acceptConsent(noticeVersion) {
      await postConsent(await deviceId(), noticeVersion);
      await syncer.clearConsentBlock();
      emit('state');
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    startNetworkWatch() {
      let last: string | null = null;
      return subscribeNetwork(() => {
        void (async () => {
          const kind = await probe.network();
          if (kind === last) return;
          const wasOffline = last === 'none';
          last = kind;
          await rt.observeNow(wasOffline && kind !== 'none' ? 'network_restored' : 'tick');
        })();
      });
    },
  };
  return rt;
}

export function getRuntime(): TrackingRuntime {
  if (!runtime) runtime = build();
  return runtime;
}
