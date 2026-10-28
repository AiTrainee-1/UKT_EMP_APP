// Turns what the phone looks like RIGHT NOW (an Observation) into the connectivity / integrity events the server stores:
// GPS off/on, network lost/restored, airplane, power-save, permission change, low battery, mock location, background
// restriction, clock skew, and the "app was killed / restarted / the phone rebooted" inference from the heartbeat.
//
// Edge detection. The last known value of every signal lives in the queue's `meta` table (key prefix `sig.`) and a change is
// recorded with a compare-and-swap, so two JS contexts looking at the same change (the app's UI and the background task)
// emit ONE event between them, and a restart of the app does not forget that GPS was already off.
//
// Pairing. An interval event is sent as two events, GPS_OFF then GPS_ON; the server closes the open GPS_OFF with the GPS_ON
// (see "Events" in the contract: *_ON / *_RESTORED never make a row of their own). Both are queued with the time they
// happened, so a NETWORK_LOST that happened offline reaches the server, in order, after the connection is back.
import type { NewEvent, NetworkKind, PermissionLevel } from './types.ts';
import { META, THRESHOLDS } from './constants.ts';

export interface SignalStore {
  get(key: string): Promise<string | null>;
  /** Sets `to` only if the current value is `from` (null = absent); true when this caller made the change. */
  cas(key: string, from: string | null, to: string | null): Promise<boolean>;
}

export interface Observation {
  now: number;
  permission: PermissionLevel;
  locationEnabled: boolean | null;
  network: NetworkKind;
  airplane: boolean | null;
  powerSave: boolean | null;
  batteryPct: number | null;
  charging: boolean | null;
  batteryOptimised: boolean | null;
  /** Whether the newest fix the OS gave us was flagged as mock; null when there was no fix. */
  mocked: boolean | null;
  /** The last place we know (for the event's latitude / longitude). */
  location: { latitude: number; longitude: number } | null;
}

export interface EventDetector {
  observe(obs: Observation): Promise<NewEvent[]>;
  observeClock(serverTimeMs: number, nowMs: number, location?: Observation['location']): Promise<NewEvent[]>;
}

export function createEventDetector(store: SignalStore, prefix: string = META.signalPrefix): EventDetector {
  /** Moves a signal to `next`; resolves with the previous value when THIS caller made the change, else undefined. */
  async function move(signal: string, next: string): Promise<{ prev: string | null } | undefined> {
    const key = prefix + signal;
    const prev = await store.get(key);
    if (prev === next) return undefined;
    const won = await store.cas(key, prev, next);
    return won ? { prev } : undefined;
  }

  return {
    async observe(obs) {
      const out: NewEvent[] = [];
      const at = obs.now;
      const place = obs.location ? { latitude: obs.location.latitude, longitude: obs.location.longitude } : {};
      const push = (kind: NewEvent['kind'], meta?: Record<string, unknown>) =>
        out.push({ kind, startedAt: at, ...place, ...(meta ? { meta } : {}) });

      // A two-state signal: "bad" is the state whose entry is an event (GPS off), "ok" the state whose entry closes it.
      // First sight of a signal that is already "ok" is silent; first sight of one that is already "bad" is an event.
      const pair = async (signal: string, bad: boolean | null, badKind: NewEvent['kind'], okKind: NewEvent['kind']) => {
        if (bad == null) return;
        const moved = await move(signal, bad ? 'bad' : 'ok');
        if (!moved) return;
        if (bad) push(badKind);
        else if (moved.prev != null) push(okKind);
      };

      await pair('gps', obs.locationEnabled == null ? null : !obs.locationEnabled, 'GPS_OFF', 'GPS_ON');
      await pair('net', obs.network === 'unknown' ? null : obs.network === 'none', 'NETWORK_LOST', 'NETWORK_RESTORED');
      await pair('airplane', obs.airplane, 'AIRPLANE_ON', 'AIRPLANE_OFF');
      await pair('powersave', obs.powerSave, 'POWER_SAVE_ON', 'POWER_SAVE_OFF');

      // Permission: always -> while_using -> denied is a downgrade (and the reverse an upgrade); both are worth knowing.
      if (obs.permission !== 'unknown') {
        const moved = await move('perm', obs.permission);
        if (moved && moved.prev != null) push('PERMISSION_CHANGED', { from: moved.prev, to: obs.permission });
      }

      // Low battery: below 15 % and not charging; it re-arms once the level is back above 20 % or the charger is on.
      if (obs.batteryPct != null) {
        const prev = await store.get(`${prefix}lowbat`);
        let next: 'low' | 'ok' | null = null;
        if (obs.batteryPct < THRESHOLDS.lowBatteryPct && obs.charging !== true) next = 'low';
        else if (obs.batteryPct >= THRESHOLDS.lowBatteryRearmPct || obs.charging === true) next = 'ok';
        else if (prev == null) next = 'ok';
        if (next && next !== prev) {
          const won = await store.cas(`${prefix}lowbat`, prev, next);
          if (won && next === 'low') push('LOW_BATTERY', { pct: Math.round(obs.batteryPct) });
        }
      }

      // Mock location: the rising edge (a clean fix followed by a mocked one, or a mocked first fix).
      if (obs.mocked != null) {
        const moved = await move('mock', obs.mocked ? 'mock' : 'clean');
        if (moved && obs.mocked) push('MOCK_LOCATION');
      }

      // The app is exempt from battery optimisation or not: while it is not, the OS may stop it in the background.
      if (obs.batteryOptimised != null) {
        const moved = await move('bgrestricted', obs.batteryOptimised ? 'on' : 'off');
        if (moved && obs.batteryOptimised) push('BACKGROUND_RESTRICTED', { reason: 'battery_optimised' });
      }
      return out;
    },

    async observeClock(serverTimeMs, nowMs, location = null) {
      const skew = nowMs - serverTimeMs;
      const bad = Math.abs(skew) > THRESHOLDS.clockSkewMs;
      const moved = await move('clock', bad ? 'bad' : 'ok');
      if (!moved || !bad) return [];
      return [
        {
          kind: 'CLOCK_CHANGED',
          startedAt: nowMs,
          ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
          meta: { skew_seconds: Math.round(skew / 1000) },
        },
      ];
    },
  };
}

export interface InterruptionInput {
  /** The last time the engine was known to be alive (epoch ms), null when there was none (a fresh track). */
  lastHeartbeatAt: number | null;
  now: number;
  /** The slowest the engine is meant to wake up, in ms (the longer of the still / moving sample intervals). */
  expectedIntervalMs: number;
  /** When the phone last booted (now - uptime), null when it cannot be read. */
  bootAt: number | null;
  location?: Observation['location'];
}

/**
 * Called when the engine starts or a task wakes up. The heartbeat is written on every tick; a long silence before this
 * moment means the engine was not running:
 *  - the phone booted after the last heartbeat -> DEVICE_BOOT (inferred from the uptime clock: the time of the boot is
 *    known, the time it was switched off is not, so no DEVICE_SHUTDOWN is made up) and APP_RESTARTED;
 *  - otherwise the app was killed (swiped away without a surviving service, an OEM task killer, force-stop) -> APP_KILLED
 *    covering the silent interval, and APP_RESTARTED now.
 * A short silence is normal (the OS batches wake-ups) and records nothing.
 */
export function inferInterruption(input: InterruptionInput): NewEvent[] {
  const { lastHeartbeatAt: hb, now } = input;
  if (hb == null || !(now > hb)) return [];
  const threshold = Math.max(
    THRESHOLDS.minKilledSeconds * 1000,
    THRESHOLDS.killedAfterIntervals * input.expectedIntervalMs,
  );
  const gapMs = now - hb;
  if (gapMs < threshold) return [];
  const place = input.location ? { latitude: input.location.latitude, longitude: input.location.longitude } : {};
  const gapSeconds = Math.round(gapMs / 1000);
  const out: NewEvent[] = [];
  const rebooted = input.bootAt != null && input.bootAt > hb;
  if (rebooted) {
    out.push({
      kind: 'DEVICE_BOOT',
      startedAt: input.bootAt as number,
      meta: { inferred: true, via: 'uptime', gap_seconds: gapSeconds },
    });
  } else {
    out.push({ kind: 'APP_KILLED', startedAt: hb, endedAt: now, ...place, meta: { inferred: true, gap_seconds: gapSeconds } });
  }
  out.push({ kind: 'APP_RESTARTED', startedAt: now, ...place, meta: { gap_seconds: gapSeconds, after_reboot: rebooted } });
  return out;
}
