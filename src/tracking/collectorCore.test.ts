// Run with `npm test`. The collector's decisions on synthetic GPS fixes: which become queue rows, the stillness / activity
// guess, the moving <-> still request switch and the rule that a switch is never attempted from the background.
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_CORE_STATE,
  MODE_SWITCH_RETRY_MS,
  processLocations,
  requestSpecFor,
  shouldSwitchMode,
} from './collectorCore.ts';
import type { CoreContext, CoreState } from './collectorCore.ts';
import { DEFAULT_CONFIG } from './constants.ts';
import { haversineM } from './geo.ts';
import type { RawLocation } from './types.ts';

const T0 = 1_700_000_000_000;
const LAT0 = 11.0168;
const LNG0 = 76.9558;
const M = 1 / 111_195; // one metre of latitude, in degrees

const ctx: CoreContext = { battery: 77, charging: false, network: 'cell', config: DEFAULT_CONFIG };

function fix(tSeconds: number, northM = 0, over: Partial<RawLocation> = {}): RawLocation {
  return {
    latitude: LAT0 + northM * M,
    longitude: LNG0,
    accuracy: 8,
    speed: null,
    heading: null,
    altitude: 410,
    timestamp: T0 + tSeconds * 1000,
    mocked: false,
    ...over,
  };
}

/** Feeds fixes one by one (as the OS would deliver them) and returns everything that was kept. */
function run(fixes: RawLocation[], start: CoreState = INITIAL_CORE_STATE, c: CoreContext = ctx) {
  let state = start;
  const kept: ReturnType<typeof processLocations>['points'] = [];
  let last = processLocations(state, [], c);
  for (const f of fixes) {
    last = processLocations(state, [f], c);
    state = last.state;
    kept.push(...last.points);
  }
  return { state, kept, last };
}

test('the first valid fix is always kept, stamped with battery, charging, network and the fix time', () => {
  const r = processLocations(INITIAL_CORE_STATE, [fix(0, 0, { speed: 1.1, heading: 88, altitude: 411 })], ctx);
  assert.equal(r.points.length, 1);
  assert.deepEqual(r.points[0], {
    recordedAt: T0,
    latitude: LAT0,
    longitude: LNG0,
    accuracy: 8,
    speed: 1.1,
    bearing: 88,
    altitude: 411,
    activity: 'walking',
    battery: 77,
    charging: false,
    network: 'cell',
    provider: 'fused',
    isMocked: false,
  });
});

test('garbage never reaches the queue: bad coordinates, kilometre-wide accuracy; duplicates and old fixes are ignored', () => {
  const r = processLocations(
    INITIAL_CORE_STATE,
    [
      fix(0, 0, { latitude: NaN }),
      fix(1, 0, { latitude: 91 }),
      fix(2, 0, { latitude: 0, longitude: 0 }),
      fix(3, 0, { accuracy: 5000 }),
      fix(4),
    ],
    ctx,
  );
  assert.equal(r.points.length, 1);
  assert.equal(r.dropped, 4);
  // the same fix delivered again (some phones do), and an older one, across calls
  const again = processLocations(r.state, [fix(4), fix(2)], ctx);
  assert.equal(again.points.length, 0);
  assert.equal(again.dropped, 0);
  assert.equal(again.skipped, 0);
});

test('fixes in a delivery are processed in time order even if they arrive shuffled', () => {
  const r = processLocations(INITIAL_CORE_STATE, [fix(20, 60), fix(0, 0), fix(10, 30)], ctx);
  assert.deepEqual(r.points.map((p) => p.recordedAt), [T0, T0 + 10_000, T0 + 20_000]);
});

test('walking: a point is kept each time the person has moved the distance filter (10 m), not on every fix', () => {
  // 1.4 m/s -> 4.2 m per 3 s fix: every third fix passes 10 m
  const fixes = Array.from({ length: 13 }, (_, i) => fix(i * 3, i * 4.2));
  const { kept } = run(fixes);
  assert.ok(kept.length >= 4 && kept.length <= 6, `kept ${kept.length}`);
  for (let i = 1; i < kept.length; i++) {
    const d = haversineM(kept[i - 1].latitude, kept[i - 1].longitude, kept[i].latitude, kept[i].longitude);
    assert.ok(d >= 10, `consecutive kept points are at least the filter apart (${d.toFixed(1)} m)`);
  }
});

test('driving: every fix moves more than the filter, so every fix is kept, and the activity is a vehicle', () => {
  const fixes = Array.from({ length: 6 }, (_, i) => fix(i * 10, i * 150, { speed: 15 }));
  const { kept } = run(fixes);
  assert.equal(kept.length, 6);
  assert.ok(kept.every((p) => p.activity === 'vehicle'));
});

test('standing still: jitter inside the radius is skipped and ONE heartbeat point is kept per still interval (60 s)', () => {
  const fixes = Array.from({ length: 70 }, (_, i) => fix(i * 10, (i % 3) * 3)); // jitters 0..6 m, 700 s
  const { kept, last } = run(fixes);
  // first fix, then a heartbeat every 60 s
  assert.deepEqual(kept.map((p) => (p.recordedAt - T0) / 1000), [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660]);
  assert.ok(last.state.last != null);
});

test('a stationary person is labelled still, and the engine wants the slow mode after two minutes - not before', () => {
  const fixes = Array.from({ length: 20 }, (_, i) => fix(i * 10, 0, { speed: 0 }));
  let state: CoreState = INITIAL_CORE_STATE;
  const modes: string[] = [];
  for (const f of fixes) {
    const r = processLocations(state, [f], ctx);
    state = r.state;
    modes.push(r.wantedMode);
  }
  assert.equal(modes[0], 'moving', 'a first fix wants the default');
  assert.equal(modes[11], 'moving', '110 s of stillness: not yet');
  assert.equal(modes[12], 'still', '120 s of stillness');
  assert.equal(modes[19], 'still');
});

test('leaving the place wakes the fast mode at once, and the points after that are not "still"', () => {
  const fixes: RawLocation[] = [];
  for (let i = 0; i <= 15; i++) fixes.push(fix(i * 10, 0, { speed: 0 })); // 150 s still
  fixes.push(fix(300, 400, { speed: 6 })); // next fix, 400 m away
  const before = run(fixes.slice(0, 16));
  assert.equal(before.last.wantedMode, 'still');
  const after = processLocations({ ...before.state, mode: 'still' }, [fixes[16]], ctx);
  assert.equal(after.wantedMode, 'moving');
  assert.equal(after.points.length, 1);
  assert.equal(after.points[0].activity, 'vehicle');
});

test('the still classification is by position, so it survives a mode switch that was refused', () => {
  // collector stuck in "moving" mode (background, switch refused): fixes every 10 s, nobody moves
  const fixes = Array.from({ length: 40 }, (_, i) => fix(i * 10));
  const { kept } = run(fixes);
  assert.equal(kept.length, 7); // the first fix + a 60 s heartbeat (60 ... 360 s)
  assert.equal(kept[kept.length - 1].activity, 'still');
});

test('a speed the OS did not report is derived from the previous kept fix', () => {
  const { kept } = run([fix(0, 0), fix(10, 100)]);
  assert.equal(kept.length, 2);
  assert.ok(kept[1].speed != null && Math.abs(kept[1].speed - 10) < 0.2, `derived ${kept[1].speed}`);
  assert.equal(kept[1].activity, 'vehicle');
});

test('an OS speed of -1 (unknown) and a heading of -1 are stored as nulls, not as numbers', () => {
  const r = processLocations(INITIAL_CORE_STATE, [fix(0, 0, { speed: -1, heading: -1 })], ctx);
  assert.equal(r.points[0].speed, null);
  assert.equal(r.points[0].bearing, null);
  assert.equal(r.points[0].activity, 'unknown');
});

test('mock location: kept and flagged, and a change of mock status forces a point even without movement', () => {
  const { kept } = run([fix(0), fix(10, 0, { mocked: true }), fix(20, 0, { mocked: true }), fix(30)]);
  assert.deepEqual(kept.map((p) => p.isMocked), [false, true, false]);
});

test('a poor fix does not pass for movement: the noise floor follows its accuracy', () => {
  // accuracy 60 m -> floor 48 m: a 30 m wobble is noise
  const { kept } = run([fix(0, 0, { accuracy: 60 }), fix(10, 30, { accuracy: 60 }), fix(20, -20, { accuracy: 60 })]);
  assert.equal(kept.length, 1);
});

test('requestSpecFor: GPS grade at the moving interval, balanced at the slow one, never a distance filter', () => {
  assert.deepEqual(requestSpecFor('moving', DEFAULT_CONFIG), { accuracy: 'high', timeIntervalMs: 3000, distanceIntervalM: 0 });
  assert.deepEqual(requestSpecFor('still', DEFAULT_CONFIG), { accuracy: 'balanced', timeIntervalMs: 60_000, distanceIntervalM: 0 });
  const tuned = { ...DEFAULT_CONFIG, sampleMovingSeconds: 5, sampleStillSeconds: 120 };
  assert.equal(requestSpecFor('moving', tuned).timeIntervalMs, 5000);
  assert.equal(requestSpecFor('still', tuned).timeIntervalMs, 120_000);
});

test('shouldSwitchMode: only on a wish, only on screen, not while a refusal is cooling down', () => {
  const base = { wanted: 'still' as const, current: 'moving' as const, appForeground: true, now: 1000, blockedUntil: null };
  assert.equal(shouldSwitchMode(base), true);
  assert.equal(shouldSwitchMode({ ...base, wanted: 'moving' }), false, 'already there');
  assert.equal(shouldSwitchMode({ ...base, current: null }), false, 'nothing running');
  assert.equal(shouldSwitchMode({ ...base, appForeground: false }), false, 'Android refuses to (re)start the service from the background');
  assert.equal(shouldSwitchMode({ ...base, blockedUntil: 1000 + MODE_SWITCH_RETRY_MS }), false);
  assert.equal(shouldSwitchMode({ ...base, now: 1000 + MODE_SWITCH_RETRY_MS, blockedUntil: 1000 + MODE_SWITCH_RETRY_MS }), true);
});
