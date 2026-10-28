// Tunables and fixed names of the geo-tracking engine. Pure.
import type { TrackingConfig } from './types.ts';

/** The expo-task-manager task the location updates are delivered to (defined at module scope in collector.ts). */
export const LOCATION_TASK_NAME = 'uktextiles-onduty-location';

/** The text of the Android foreground-service notification that keeps the route recording alive. */
export const FOREGROUND_NOTIFICATION = {
  title: 'On-duty tracking is on',
  body: 'UKTextiles is recording your on-duty route',
  color: '#1E3A8A',
} as const;

/**
 * The device also sends TRACKING_STARTED / TRACKING_STOPPED events (with the last known place, which the server's own
 * lifecycle events do not have). They carry meta.origin = 'device' so a server that writes its own can tell them apart.
 */
export const SEND_LIFECYCLE_EVENTS = true;

/** What a server with no config yet (or an old one) gets; the real values come from /tracking/state and every batch. */
export const DEFAULT_CONFIG: TrackingConfig = {
  sampleMovingSeconds: 3,
  sampleStillSeconds: 60,
  distanceFilterM: 10,
  uploadBatchPoints: 30,
  uploadIntervalSeconds: 60,
  maxAccuracyM: 100,
};

/** Contract limits of one POST /tracking/batch. */
export const BATCH_LIMITS = { maxPoints: 500, maxEvents: 100 } as const;

/** Queue caps: the oldest points go first when a phone has been offline for days; events are tiny and kept. */
export const QUEUE_LIMITS = { maxPoints: 20000, maxEvents: 5000 } as const;

export const THRESHOLDS = {
  /** A fix within this many metres (or 1.5 x its accuracy, whichever is bigger) of the cluster anchor is "still". */
  stillRadiusM: 40,
  /** ... for this long before the engine wants the slow, balanced mode. */
  stillAfterSeconds: 120,
  /** A fix further than this from the anchor, or faster than movingSpeedMps, means "moving" again. */
  leaveRadiusM: 60,
  movingSpeedMps: 1.5,
  /** GPS speed below this is standing still; below walkingMaxMps is walking; anything faster is a vehicle. */
  stillSpeedMps: 0.5,
  walkingMaxMps: 2.2,
  /** Fixes worse than this are useless (a cell tower) and are not even stored; the server filters by its own max_accuracy_m. */
  hopelessAccuracyM: 2000,
  lowBatteryPct: 15,
  lowBatteryRearmPct: 20,
  /** The phone's clock differs from the server's by more than this: CLOCK_CHANGED. */
  clockSkewMs: 120_000,
  /** The engine is deemed killed after this many missed heartbeat intervals. */
  killedAfterIntervals: 2.5,
  minKilledSeconds: 180,
} as const;

export const SYNC = {
  /** First retry delay; doubles per consecutive failure up to maxBackoffMs. */
  baseBackoffMs: 5_000,
  maxBackoffMs: 10 * 60_000,
  /** Triggers that are not the periodic tick never hammer: at least this long between two attempts. */
  minGapMs: 2_000,
  /** One sync run uploads at most this many batches (the rest waits for the next trigger). */
  maxBatchesPerRun: 20,
  /** A task tick never waits longer than this for the network, so the OS job is not held open. */
  taskTimeoutMs: 20_000,
} as const;

/** How often the app asks the server whether a track is active (self-heal), from a background task tick. */
export const SELF_HEAL_MIN_INTERVAL_MS = 60_000;

/** A running engine whose heartbeat is older than this many sample intervals is restarted (foreground only, at most every 10 min). */
export const STALE_HEARTBEAT_INTERVALS = 3;
export const STALE_RESTART_COOLDOWN_MS = 10 * 60_000;

/** Keys of the queue's `meta` table. */
export const META = {
  deviceId: 'device_id',
  seqSeeded: 'seq_seeded',
  ownerEmployeeId: 'owner_employee_id',
  engineTrack: 'engine.track', // JSON {trackId, sessionId, config}
  engineMode: 'engine.mode',
  engineStartedAt: 'engine.started_at',
  engineError: 'engine.last_error',
  modeBlockedUntil: 'engine.mode_blocked_until',
  heartbeat: 'engine.heartbeat_at',
  lastPointAt: 'engine.last_point_at',
  coreState: 'core.state', // JSON, collectorCore.ts
  lastLocation: 'core.last_location', // JSON {latitude, longitude, at}
  syncFailures: 'sync.failures',
  syncNextAt: 'sync.next_at',
  syncLastAttemptAt: 'sync.last_attempt_at',
  syncLastOkAt: 'sync.last_ok_at',
  syncLastError: 'sync.last_error',
  syncBlockedConsent: 'sync.blocked_consent',
  syncTrackEnded: 'sync.track_ended',
  config: 'server.config',
  lastEnsureAt: 'ctl.last_ensure_at',
  lastRestartAt: 'ctl.last_restart_at',
  droppedPoints: 'queue.dropped_points',
  signalPrefix: 'sig.',
} as const;
