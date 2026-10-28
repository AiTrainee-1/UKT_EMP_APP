// Run with `npm test`. Connectivity / integrity events: GPS off -> on pairing, the other paired signals, permission downgrades,
// battery and mock-location edges, clock skew, and the app-killed / device-rebooted inference from the heartbeat.
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEventDetector, inferInterruption } from './events.ts';
import type { Observation, SignalStore } from './events.ts';
import { createQueue } from './queue.ts';
import { openNodeSqlite } from './testing/nodeSqlite.ts';

function memoryStore(): SignalStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(key) {
      return data.get(key) ?? null;
    },
    async cas(key, from, to) {
      const cur = data.get(key) ?? null;
      if (cur !== from) return false;
      if (to == null) data.delete(key);
      else data.set(key, to);
      return true;
    },
  };
}

const T0 = 1_700_000_000_000;
const obs = (over: Partial<Observation> = {}): Observation => ({
  now: T0,
  permission: 'always',
  locationEnabled: true,
  network: 'wifi',
  airplane: false,
  powerSave: false,
  batteryPct: 80,
  charging: false,
  batteryOptimised: false,
  mocked: false,
  location: { latitude: 11.1, longitude: 77.3 },
  ...over,
});

const kinds = (events: { kind: string }[]) => events.map((e) => e.kind);

test('a healthy phone produces no events, and the first look at every signal is silent', async () => {
  const d = createEventDetector(memoryStore());
  assert.deepEqual(await d.observe(obs()), []);
  assert.deepEqual(await d.observe(obs({ now: T0 + 10_000 })), []);
});

test('GPS off then on is a GPS_OFF and a GPS_ON, each stamped with its own time and the last known place', async () => {
  const d = createEventDetector(memoryStore());
  await d.observe(obs());
  const off = await d.observe(obs({ now: T0 + 60_000, locationEnabled: false }));
  assert.deepEqual(kinds(off), ['GPS_OFF']);
  assert.equal(off[0].startedAt, T0 + 60_000);
  assert.equal(off[0].latitude, 11.1);
  assert.equal(off[0].longitude, 77.3);
  // still off on the next tick: the interval is already open, nothing new
  assert.deepEqual(await d.observe(obs({ now: T0 + 70_000, locationEnabled: false })), []);
  const on = await d.observe(obs({ now: T0 + 300_000, locationEnabled: true }));
  assert.deepEqual(kinds(on), ['GPS_ON']);
  assert.equal(on[0].startedAt, T0 + 300_000);
  assert.deepEqual(await d.observe(obs({ now: T0 + 310_000 })), []);
});

test('GPS that is already off when the tracking first looks is reported, and its later return closes it', async () => {
  const d = createEventDetector(memoryStore());
  assert.deepEqual(kinds(await d.observe(obs({ locationEnabled: false }))), ['GPS_OFF']);
  assert.deepEqual(kinds(await d.observe(obs({ now: T0 + 5000, locationEnabled: true }))), ['GPS_ON']);
});

test('an unknown reading (null) never opens or closes an interval', async () => {
  const d = createEventDetector(memoryStore());
  await d.observe(obs({ locationEnabled: false }));
  assert.deepEqual(await d.observe(obs({ locationEnabled: null, network: 'unknown', airplane: null })), []);
});

test('network lost / restored, airplane on / off and power-save on / off pair the same way', async () => {
  const d = createEventDetector(memoryStore());
  await d.observe(obs());
  assert.deepEqual(kinds(await d.observe(obs({ now: T0 + 1, network: 'none', airplane: true, powerSave: true }))), [
    'NETWORK_LOST',
    'AIRPLANE_ON',
    'POWER_SAVE_ON',
  ]);
  assert.deepEqual(kinds(await d.observe(obs({ now: T0 + 2, network: 'cell', airplane: false, powerSave: false }))), [
    'NETWORK_RESTORED',
    'AIRPLANE_OFF',
    'POWER_SAVE_OFF',
  ]);
});

test('wifi -> cell is not a network loss', async () => {
  const d = createEventDetector(memoryStore());
  await d.observe(obs({ network: 'wifi' }));
  assert.deepEqual(await d.observe(obs({ network: 'cell' })), []);
});

test('permission changes are events from the second look on: always -> while_using -> denied, and back up', async () => {
  const d = createEventDetector(memoryStore());
  assert.deepEqual(await d.observe(obs({ permission: 'always' })), []);
  const down = await d.observe(obs({ permission: 'while_using' }));
  assert.deepEqual(kinds(down), ['PERMISSION_CHANGED']);
  assert.deepEqual(down[0].meta, { from: 'always', to: 'while_using' });
  const denied = await d.observe(obs({ permission: 'denied' }));
  assert.deepEqual(denied[0].meta, { from: 'while_using', to: 'denied' });
  const back = await d.observe(obs({ permission: 'always' }));
  assert.deepEqual(back[0].meta, { from: 'denied', to: 'always' });
  assert.deepEqual(await d.observe(obs({ permission: 'unknown' })), [], 'unknown is not a level');
});

test('low battery fires once under 15 %, re-arms above 20 % or on the charger, and never while charging', async () => {
  const d = createEventDetector(memoryStore());
  assert.deepEqual(await d.observe(obs({ batteryPct: 40 })), []);
  const low = await d.observe(obs({ batteryPct: 14 }));
  assert.deepEqual(kinds(low), ['LOW_BATTERY']);
  assert.deepEqual(low[0].meta, { pct: 14 });
  assert.deepEqual(await d.observe(obs({ batteryPct: 12 })), [], 'already reported');
  assert.deepEqual(await d.observe(obs({ batteryPct: 17 })), [], 'between 15 and 20 the state holds');
  assert.deepEqual(await d.observe(obs({ batteryPct: 14 })), [], 'still the same low spell');
  await d.observe(obs({ batteryPct: 40 })); // re-armed
  assert.deepEqual(kinds(await d.observe(obs({ batteryPct: 9 }))), ['LOW_BATTERY']);
  const charging = createEventDetector(memoryStore());
  assert.deepEqual(await charging.observe(obs({ batteryPct: 5, charging: true })), []);
});

test('mock location fires on the rising edge only', async () => {
  const d = createEventDetector(memoryStore());
  assert.deepEqual(await d.observe(obs({ mocked: false })), []);
  assert.deepEqual(kinds(await d.observe(obs({ mocked: true }))), ['MOCK_LOCATION']);
  assert.deepEqual(await d.observe(obs({ mocked: true })), []);
  assert.deepEqual(await d.observe(obs({ mocked: false })), []);
  assert.deepEqual(kinds(await d.observe(obs({ mocked: true }))), ['MOCK_LOCATION']);
  assert.deepEqual(await d.observe(obs({ mocked: null })), [], 'no fix, no opinion');
});

test('battery optimisation switching on is a BACKGROUND_RESTRICTED event', async () => {
  const d = createEventDetector(memoryStore());
  assert.deepEqual(kinds(await d.observe(obs({ batteryOptimised: true }))), ['BACKGROUND_RESTRICTED']);
  assert.deepEqual(await d.observe(obs({ batteryOptimised: true })), []);
  assert.deepEqual(await d.observe(obs({ batteryOptimised: false })), []);
});

test('events carry no place when none is known', async () => {
  const d = createEventDetector(memoryStore());
  await d.observe(obs({ location: null }));
  const off = await d.observe(obs({ location: null, locationEnabled: false }));
  assert.equal('latitude' in off[0], false);
});

test('two contexts seeing the same change emit it once between them (compare-and-swap)', async () => {
  const store = memoryStore();
  const a = createEventDetector(store);
  const b = createEventDetector(store);
  await a.observe(obs());
  const [ra, rb] = await Promise.all([
    a.observe(obs({ locationEnabled: false })),
    b.observe(obs({ locationEnabled: false })),
  ]);
  assert.equal(ra.length + rb.length, 1);
});

test('the detector works on the real queue meta table (a restart does not forget GPS was off)', async () => {
  const db = openNodeSqlite();
  const q = createQueue(db);
  const store: SignalStore = { get: q.getMeta, cas: q.casMeta };
  const first = createEventDetector(store);
  await first.observe(obs());
  assert.deepEqual(kinds(await first.observe(obs({ locationEnabled: false }))), ['GPS_OFF']);
  // "restart": a brand-new detector over the same stored state
  const second = createEventDetector(store);
  assert.deepEqual(await second.observe(obs({ locationEnabled: false })), []);
  assert.deepEqual(kinds(await second.observe(obs({ locationEnabled: true }))), ['GPS_ON']);
  await q.deleteMetaPrefix('sig.');
  // after a reset (a new track) the first look is a first look again
  assert.deepEqual(await createEventDetector(store).observe(obs({ locationEnabled: true })), []);
});

test('clock skew: a big difference from the server is one CLOCK_CHANGED, a small one nothing, and it re-arms', async () => {
  const d = createEventDetector(memoryStore());
  assert.deepEqual(await d.observeClock(T0, T0 + 30_000), []);
  const skewed = await d.observeClock(T0, T0 + 10 * 60_000);
  assert.deepEqual(kinds(skewed), ['CLOCK_CHANGED']);
  assert.deepEqual(skewed[0].meta, { skew_seconds: 600 });
  assert.deepEqual(await d.observeClock(T0, T0 + 11 * 60_000), [], 'still skewed: already reported');
  assert.deepEqual(await d.observeClock(T0, T0 + 1000), [], 'back in sync: silent');
  assert.deepEqual(kinds(await d.observeClock(T0, T0 - 15 * 60_000)), ['CLOCK_CHANGED'], 'a clock running behind counts too');
});

// ---------------------------------------------------------------- restart / kill inference

test('heartbeat: a short silence is normal and records nothing', () => {
  const out = inferInterruption({
    lastHeartbeatAt: T0,
    now: T0 + 5 * 60_000,
    expectedIntervalMs: 300_000,
    bootAt: null,
  });
  assert.deepEqual(out, []);
});

test('heartbeat: no previous heartbeat (a fresh track) is not an interruption', () => {
  assert.deepEqual(inferInterruption({ lastHeartbeatAt: null, now: T0, expectedIntervalMs: 300_000, bootAt: null }), []);
});

test('heartbeat: a long silence is APP_KILLED covering the silent interval plus APP_RESTARTED now', () => {
  const out = inferInterruption({
    lastHeartbeatAt: T0,
    now: T0 + 3 * 3600_000,
    expectedIntervalMs: 300_000,
    bootAt: T0 - 86_400_000, // booted long before: the phone did not reboot
    location: { latitude: 11, longitude: 77 },
  });
  assert.deepEqual(kinds(out), ['APP_KILLED', 'APP_RESTARTED']);
  assert.equal(out[0].startedAt, T0);
  assert.equal(out[0].endedAt, T0 + 3 * 3600_000);
  assert.equal(out[1].startedAt, T0 + 3 * 3600_000);
  assert.deepEqual(out[0].meta, { inferred: true, gap_seconds: 10_800 });
  assert.equal(out[1].latitude, 11);
});

test('heartbeat: a phone that booted after the last heartbeat is a DEVICE_BOOT (inferred) and a restart, not a kill', () => {
  const bootAt = T0 + 2 * 3600_000;
  const out = inferInterruption({
    lastHeartbeatAt: T0,
    now: T0 + 2 * 3600_000 + 120_000,
    expectedIntervalMs: 300_000,
    bootAt,
  });
  assert.deepEqual(kinds(out), ['DEVICE_BOOT', 'APP_RESTARTED']);
  assert.equal(out[0].startedAt, bootAt);
  assert.deepEqual(out[0].meta, { inferred: true, via: 'uptime', gap_seconds: 7320 });
  assert.equal(out.some((e) => (e.kind as string) === 'DEVICE_SHUTDOWN'), false, 'no shutdown time is knowable: none is made up');
});

test('heartbeat: the kill threshold follows the slowest sampling interval, with a floor', () => {
  const slow = inferInterruption({ lastHeartbeatAt: T0, now: T0 + 10 * 60_000, expectedIntervalMs: 300_000, bootAt: null });
  assert.deepEqual(slow, [], '10 min of silence is inside 2.5 x 5 min');
  const fast = inferInterruption({ lastHeartbeatAt: T0, now: T0 + 2 * 60_000, expectedIntervalMs: 10_000, bootAt: null });
  assert.deepEqual(fast, [], 'floor of 3 minutes');
  const fastKilled = inferInterruption({ lastHeartbeatAt: T0, now: T0 + 4 * 60_000, expectedIntervalMs: 10_000, bootAt: null });
  assert.deepEqual(kinds(fastKilled), ['APP_KILLED', 'APP_RESTARTED']);
});
