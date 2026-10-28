// Shared types of the on-duty geo-tracking engine. Pure (no React Native / Expo imports) so the logic that uses them can be
// tested under Node (`npm test`). The server contract these mirror is described in docs/GEO_TRACKING.md.

export type PermissionLevel = 'always' | 'while_using' | 'denied' | 'unknown';
export type NetworkKind = 'wifi' | 'cell' | 'none' | 'unknown';
export type ActivityKind = 'still' | 'walking' | 'running' | 'vehicle' | 'bicycle' | 'unknown';
export type ProviderKind = 'gps' | 'fused' | 'network' | 'passive' | 'unknown';
export type TrackingMode = 'moving' | 'still';

/** Event kinds this app can send. DEVICE_SHUTDOWN is never sent (a phone cannot tell us it is about to power off). */
export type EventKind =
  | 'TRACKING_STARTED'
  | 'TRACKING_STOPPED'
  | 'GPS_OFF'
  | 'GPS_ON'
  | 'NETWORK_LOST'
  | 'NETWORK_RESTORED'
  | 'AIRPLANE_ON'
  | 'AIRPLANE_OFF'
  | 'POWER_SAVE_ON'
  | 'POWER_SAVE_OFF'
  | 'PERMISSION_CHANGED'
  | 'LOW_BATTERY'
  | 'MOCK_LOCATION'
  | 'CLOCK_CHANGED'
  | 'APP_RESTARTED'
  | 'APP_KILLED'
  | 'DEVICE_BOOT'
  | 'BACKGROUND_RESTRICTED';

/** One GPS fix as the OS gave it to us (expo-location's LocationObject, flattened). */
export interface RawLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  /** Epoch milliseconds of the fix. */
  timestamp: number;
  mocked: boolean;
}

/** A point before it has a sequence number. */
export interface NewPoint {
  recordedAt: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  bearing: number | null;
  altitude: number | null;
  activity: ActivityKind;
  battery: number | null;
  charging: boolean | null;
  network: NetworkKind;
  provider: ProviderKind;
  isMocked: boolean;
}

export interface QueuedPoint extends NewPoint {
  seq: number;
}

export interface NewEvent {
  kind: EventKind;
  startedAt: number;
  endedAt?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  meta?: Record<string, unknown> | null;
}

export interface QueuedEvent extends NewEvent {
  seq: number;
}

/** The window of the queue one upload carries: contiguous in `seq`, so an ack of `maxSeq` can never delete an unsent row. */
export interface QueueBatch {
  points: QueuedPoint[];
  events: QueuedEvent[];
  minSeq: number;
  maxSeq: number;
  /** More rows exist beyond this window. */
  hasMore: boolean;
}

/** From GET /tracking/state `config` and every batch response `config`. */
export interface TrackingConfig {
  sampleMovingSeconds: number;
  sampleStillSeconds: number;
  distanceFilterM: number;
  uploadBatchPoints: number;
  uploadIntervalSeconds: number;
  maxAccuracyM: number;
}

export interface TrackInfo {
  id: number;
  sessionId: number | null;
  startedAt: string | null;
  endsAt: string | null;
  state: string | null;
}

/** GET /tracking/state, normalised. `supported:false` = a server that has no geo-tracking yet (404). */
export interface TrackingServerState {
  supported: boolean;
  enabled: boolean;
  active: boolean;
  consentRequired: boolean;
  noticeVersion: number;
  noticeText: string;
  serverTime: string | null;
  track: TrackInfo | null;
  config: TrackingConfig;
  punchPhotos: 1 | 2;
}

export interface BatchResponse {
  ok: boolean;
  ackSeq: number | null;
  accepted: number;
  duplicates: number;
  rejected: number;
  trackActive: boolean | null;
  endReason: string | null;
  serverTime: string | null;
  config: TrackingConfig | null;
}

/** The `health` block of a batch, and what the Tracking health screen shows. */
export interface HealthSnapshot {
  permission: PermissionLevel;
  locationEnabled: boolean | null;
  backgroundRestricted: boolean | null;
  batteryOptimised: boolean | null;
  powerSave: boolean | null;
  batteryPct: number | null;
  charging: boolean | null;
  network: NetworkKind;
}

export interface AppInfo {
  version: string;
  os: string;
  osVersion: string;
  model: string;
}

/** What the engine records about itself in the queue's meta table (readable from any JS context). */
export interface EngineStatus {
  running: boolean;
  trackId: number | null;
  sessionId: number | null;
  mode: TrackingMode | null;
  startedAt: number | null;
  lastPointAt: number | null;
  lastHeartbeatAt: number | null;
  lastError: string | null;
}

export interface ActiveTrack {
  trackId: number;
  sessionId: number | null;
  config: TrackingConfig;
}

export type EngineStartResult =
  | { ok: true; alreadyRunning: boolean }
  | { ok: false; reason: 'permission' | 'foreground_required' | 'unavailable' | 'error'; message: string };

/**
 * The seam a native module can replace. Everything outside src/tracking/collector.ts talks to the collector through this
 * interface only: the sync, the controller, the hooks and the screens never import expo-location or expo-task-manager.
 */
export interface TrackerEngine {
  start(track: ActiveTrack): Promise<EngineStartResult>;
  stop(reason?: string): Promise<void>;
  status(): Promise<EngineStatus>;
  /** Put an event (GPS off, app killed, ...) into the upload queue; resolves with its sequence number. */
  enqueue(event: NewEvent): Promise<number>;
}
