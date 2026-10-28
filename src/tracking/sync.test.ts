// Run with `npm test`. The uploader: the request body the server expects (and what the app's axios client turns it into),
// the batching / back-off rules, deletion only after the server's ack, trackActive:false, CONSENT_REQUIRED, 401 and offline.
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';

import { decamelizeKeys } from '../lib/caseKeys.ts';
import { DEFAULT_CONFIG, META, SYNC } from './constants.ts';
import { createQueue } from './queue.ts';
import {
  backoffMs,
  buildBatchBody,
  chooseAck,
  classifyBatchError,
  createSyncer,
  shouldSyncOnTick,
} from './sync.ts';
import type { BatchBody, SendResult, SyncDeps } from './sync.ts';
import { openNodeSqlite } from './testing/nodeSqlite.ts';
import type { BatchResponse, HealthSnapshot, NewEvent, NewPoint, QueueBatch } from './types.ts';

const T0 = 1_700_000_000_000;

const point = (n: number): NewPoint => ({
  recordedAt: T0 + n * 10_000,
  latitude: 11.0168 + n / 100_000,
  longitude: 76.9558,
  accuracy: 6.5,
  speed: 1.4,
  bearing: 180,
  altitude: 412.5,
  activity: 'walking',
  battery: 71,
  charging: false,
  network: 'cell',
  provider: 'fused',
  isMocked: false,
});

const event = (n: number, kind: NewEvent['kind'] = 'GPS_OFF', extra: Partial<NewEvent> = {}): NewEvent => ({
  kind,
  startedAt: T0 + n * 10_000,
  ...extra,
});

const HEALTH: HealthSnapshot = {
  permission: 'always',
  locationEnabled: true,
  backgroundRestricted: null,
  batteryOptimised: false,
  powerSave: false,
  batteryPct: 71,
  charging: false,
  network: 'cell',
};

const okResponse = (over: Partial<BatchResponse> = {}): BatchResponse => ({
  ok: true,
  ackSeq: null,
  accepted: 0,
  duplicates: 0,
  rejected: 0,
  trackActive: true,
  endReason: null,
  serverTime: null,
  config: null,
  ...over,
});

/** A server that stores what it is sent, keyed by seq (so a re-sent row is a duplicate), like UNIQUE(employee, device, seq). */
function fakeServer(options: { trackActive?: boolean; endReason?: string | null; acceptOnly?: (seq: number) => boolean } = {}) {
  const have = new Set<number>();
  const bodies: BatchBody[] = [];
  return {
    have,
    bodies,
    options,
    handle(body: BatchBody): SendResult {
      bodies.push(body);
      let accepted = 0;
      let duplicates = 0;
      let rejected = 0;
      const rows = [...body.points, ...body.events];
      for (const r of rows) {
        if (options.trackActive === false) {
          rejected++;
          continue;
        }
        if (options.acceptOnly && !options.acceptOnly(r.seq)) {
          rejected++;
          continue;
        }
        if (have.has(r.seq)) duplicates++;
        else {
          have.add(r.seq);
          accepted++;
        }
      }
      return {
        kind: 'ok',
        data: okResponse({
          ackSeq: have.size ? Math.max(...have) : null,
          accepted,
          duplicates,
          rejected,
          trackActive: options.trackActive ?? true,
          endReason: options.endReason ?? null,
        }),
      };
    },
  };
}

function setup(over: Partial<SyncDeps> = {}, server = fakeServer()) {
  const db = openNodeSqlite();
  const queue = createQueue(db);
  let now = T0 + 3_600_000;
  const calls = { send: 0, ended: [] as (string | null)[], consent: 0, configs: [] as unknown[] };
  const deps: SyncDeps = {
    queue,
    send: async (body) => {
      calls.send++;
      return server.handle(body);
    },
    health: async () => HEALTH,
    app: () => ({ version: '5.0.0', os: 'android', osVersion: '14', model: 'Redmi Note 12' }),
    deviceId: async () => 'dev-abc-123',
    currentEmployeeId: async () => 42,
    config: async () => DEFAULT_CONFIG,
    now: () => now,
    random: () => 0.5,
    onTrackEnded: (reason) => calls.ended.push(reason),
    onConsentRequired: () => {
      calls.consent++;
    },
    onConfig: (c) => {
      calls.configs.push(c);
    },
    ...over,
  };
  return {
    queue,
    server,
    calls,
    syncer: createSyncer(deps),
    advance(ms: number) {
      now += ms;
    },
    get now() {
      return now;
    },
  };
}

// ------------------------------------------------------------------------------------------- request body

test('the batch body has exactly the contract keys, ISO times and no null optionals', async () => {
  const q = createQueue(openNodeSqlite());
  await q.enqueuePoints([point(1)]);
  await q.enqueueEvent(event(2, 'GPS_OFF', { latitude: 11.1, longitude: 77.2, meta: { reason: 'x' } }));
  await q.enqueueEvent(event(3, 'APP_KILLED', { endedAt: T0 + 99_000 }));
  const batch = (await q.peekBatch()) as QueueBatch;
  const body = buildBatchBody({
    deviceId: 'dev-1',
    app: { version: '5.0.0', os: 'android', osVersion: '14', model: 'M' },
    health: HEALTH,
    batch,
  });
  assert.deepEqual(Object.keys(body), ['deviceId', 'app', 'health', 'points', 'events']);
  assert.deepEqual(Object.keys(body.app), ['version', 'os', 'osVersion', 'model']);
  assert.deepEqual(Object.keys(body.health), [
    'permission',
    'locationEnabled',
    'backgroundRestricted',
    'batteryOptimised',
    'powerSave',
    'batteryPct',
    'charging',
    'network',
  ]);
  assert.deepEqual(Object.keys(body.points[0]), [
    'seq',
    'recordedAt',
    'latitude',
    'longitude',
    'accuracy',
    'speed',
    'bearing',
    'altitude',
    'activity',
    'battery',
    'charging',
    'network',
    'provider',
    'isMocked',
  ]);
  assert.equal(body.points[0].recordedAt, new Date(T0 + 10_000).toISOString());
  assert.equal(body.points[0].isMocked, false);
  assert.deepEqual(Object.keys(body.events[0]), ['seq', 'kind', 'startedAt', 'latitude', 'longitude', 'meta']);
  assert.deepEqual(Object.keys(body.events[1]), ['seq', 'kind', 'startedAt', 'endedAt']);
  assert.equal(body.events[1].endedAt, new Date(T0 + 99_000).toISOString());
});

test('what the axios client puts on the wire: every key becomes snake_case at every depth, values untouched', async () => {
  const q = createQueue(openNodeSqlite());
  await q.enqueuePoints([point(1)]);
  await q.enqueueEvent(event(2, 'PERMISSION_CHANGED', { meta: { from: 'always', to: 'while_using' } }));
  const batch = (await q.peekBatch()) as QueueBatch;
  const wire = decamelizeKeys(
    buildBatchBody({ deviceId: 'dev-1', app: { version: '5.0.0', os: 'android', osVersion: '14', model: 'M' }, health: HEALTH, batch }),
  );
  assert.equal(wire.device_id, 'dev-1');
  assert.equal(wire.app.os_version, '14');
  assert.equal(wire.health.location_enabled, true);
  assert.equal(wire.health.battery_pct, 71);
  assert.equal(wire.health.background_restricted, null);
  assert.equal(wire.points[0].recorded_at, new Date(T0 + 10_000).toISOString());
  assert.equal(wire.points[0].is_mocked, false);
  assert.equal(wire.events[0].started_at, new Date(T0 + 20_000).toISOString());
  assert.deepEqual(wire.events[0].meta, { from: 'always', to: 'while_using' });
  assert.equal(wire.events[0].kind, 'PERMISSION_CHANGED');
  // nothing camelCase is left anywhere in the keys
  const keys: string[] = [];
  (function walk(v: any) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (keys.push(k), walk(x));
  })(wire);
  assert.deepEqual(keys.filter((k) => /[A-Z]/.test(k)), []);
});

test('event meta keys are chosen to survive the conversion unchanged (snake_case or single words)', async () => {
  const { createEventDetector, inferInterruption } = await import('./events.ts');
  const meta: Record<string, unknown>[] = [];
  const store = { get: async () => null, cas: async () => true };
  const d = createEventDetector(store);
  const evs = await d.observe({
    now: T0, permission: 'always', locationEnabled: false, network: 'none', airplane: true, powerSave: true,
    batteryPct: 5, charging: false, batteryOptimised: true, mocked: true, location: null,
  });
  for (const e of evs) if (e.meta) meta.push(e.meta);
  for (const e of inferInterruption({ lastHeartbeatAt: T0, now: T0 + 3_600_000, expectedIntervalMs: 1000, bootAt: T0 + 100 })) {
    if (e.meta) meta.push(e.meta);
  }
  assert.ok(meta.length >= 4);
  for (const m of meta) assert.deepEqual(decamelizeKeys(m), m);
});

// ------------------------------------------------------------------------------------------- pure policy

test('shouldSyncOnTick: 30 points, or 60 s since the last attempt; never when empty, backing off or waiting for consent', () => {
  const base = { points: 5, events: 0, now: T0 + 100_000, lastAttemptAt: T0 + 70_000, nextAt: null, config: DEFAULT_CONFIG, blockedByConsent: false };
  assert.equal(shouldSyncOnTick(base), false, '30 s since the last attempt, 5 points');
  assert.equal(shouldSyncOnTick({ ...base, points: 30 }), true, '30 points');
  assert.equal(shouldSyncOnTick({ ...base, now: T0 + 130_000 }), true, '60 s');
  assert.equal(shouldSyncOnTick({ ...base, lastAttemptAt: null }), true, 'never attempted');
  assert.equal(shouldSyncOnTick({ ...base, points: 0, events: 1, now: T0 + 130_000 }), true, 'events count as queued data');
  assert.equal(shouldSyncOnTick({ ...base, points: 0, events: 0, now: T0 + 999_999 }), false, 'nothing queued');
  assert.equal(shouldSyncOnTick({ ...base, points: 99, nextAt: T0 + 200_000 }), false, 'inside the back-off window');
  assert.equal(shouldSyncOnTick({ ...base, points: 99, blockedByConsent: true }), false);
  assert.equal(shouldSyncOnTick({ ...base, points: 12, config: { ...DEFAULT_CONFIG, uploadBatchPoints: 10 } }), true, 'the batch size is the server\'s');
  assert.equal(
    shouldSyncOnTick({ ...base, config: { ...DEFAULT_CONFIG, uploadIntervalSeconds: 20 } }),
    true,
    'the interval is the server\'s',
  );
});

test('backoffMs doubles from 5 s, caps at 10 min, and jitters by 20 %', () => {
  assert.equal(backoffMs(0), 0);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => backoffMs(n)), [5000, 10_000, 20_000, 40_000, 80_000]);
  assert.equal(backoffMs(30), SYNC.maxBackoffMs);
  assert.equal(backoffMs(1, 0), 4000);
  assert.ok(Math.abs(backoffMs(1, 0.999) - 6000) < 5);
});

test('classifyBatchError sorts HTTP and network failures', () => {
  assert.deepEqual(classifyBatchError({ message: 'Network Error' }), { kind: 'failed', reason: 'offline' });
  assert.deepEqual(classifyBatchError({ code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' }), { kind: 'failed', reason: 'timeout' });
  assert.deepEqual(classifyBatchError({ response: { status: 401 } }), { kind: 'unauthorized' });
  assert.deepEqual(classifyBatchError({ response: { status: 403, data: { code: 'CONSENT_REQUIRED' } } }), { kind: 'consent_required' });
  assert.deepEqual(classifyBatchError({ response: { status: 403, data: { code: 'consent_required' } } }), { kind: 'consent_required' });
  assert.deepEqual(classifyBatchError({ response: { status: 403, data: { error: 'nope' } } }), { kind: 'failed', reason: 'client', status: 403 });
  assert.deepEqual(classifyBatchError({ response: { status: 413 } }), { kind: 'too_large' });
  assert.deepEqual(classifyBatchError({ response: { status: 429, headers: { 'retry-after': '30' } } }), {
    kind: 'failed', reason: 'throttled', status: 429, retryAfterMs: 30_000,
  });
  assert.deepEqual(classifyBatchError({ response: { status: 502 } }), { kind: 'failed', reason: 'server', status: 502 });
  assert.deepEqual(classifyBatchError({ response: { status: 400 } }), { kind: 'failed', reason: 'client', status: 400 });
  assert.deepEqual(classifyBatchError(undefined), { kind: 'failed', reason: 'offline' });
});

test('chooseAck: capped to the window, finished when every row was classified, released when the server wants none', () => {
  const batch = { points: [{ seq: 11 }, { seq: 12 }, { seq: 14 }], events: [{ seq: 13 }], minSeq: 11, maxSeq: 14, hasMore: false } as unknown as QueueBatch;
  assert.equal(chooseAck(okResponse({ accepted: 4, ackSeq: 14 }), batch), 14);
  assert.equal(chooseAck(okResponse({ accepted: 2, ackSeq: 12 }), batch), 12, 'a partial ack deletes only up to it');
  assert.equal(chooseAck(okResponse({ accepted: 2, ackSeq: 900 }), batch), 14, 'never above what was sent');
  assert.equal(chooseAck(okResponse({ accepted: 3, rejected: 1, ackSeq: 13 }), batch), 14, 'a refused last row does not stall the queue');
  assert.equal(chooseAck(okResponse({ accepted: 0, duplicates: 4, ackSeq: 14 }), batch), 14, 'all duplicates (the first response was lost)');
  assert.equal(chooseAck(okResponse({ accepted: 0, rejected: 4, trackActive: false, ackSeq: null }), batch), 14);
  assert.equal(chooseAck(okResponse({ accepted: 0, trackActive: false, ackSeq: 0 }), batch), 14, 'no track at all');
  assert.equal(chooseAck(okResponse({ accepted: 1, ackSeq: 5 }), batch), null, 'an ack below the window deletes nothing');
  assert.equal(chooseAck(okResponse({ accepted: 1, ackSeq: null }), batch), null);
});

// ------------------------------------------------------------------------------------------- the syncer

test('a sync uploads the oldest rows and deletes them only after the server acknowledged them', async () => {
  const t = setup();
  await t.queue.enqueuePoints([point(1), point(2), point(3)]);
  await t.queue.enqueueEvent(event(4));
  const out = await t.syncer.syncNow('foreground');
  assert.equal(out.status, 'synced');
  assert.equal(out.sent, 4);
  assert.equal(out.acked, 4);
  assert.equal(t.server.bodies.length, 1);
  assert.equal(t.server.bodies[0].deviceId, 'dev-abc-123');
  assert.equal(t.server.bodies[0].points.length, 3);
  assert.equal(t.server.bodies[0].events.length, 1);
  assert.deepEqual(await t.queue.counts(), { points: 0, events: 0, oldestPointAt: null, newestPointAt: null });
  assert.equal(await t.queue.getMeta(META.syncLastOkAt), String(t.now));
});

test('an empty queue sends nothing', async () => {
  const t = setup();
  const out = await t.syncer.syncNow('foreground');
  assert.equal(out.status, 'empty');
  assert.equal(t.calls.send, 0);
});

test('batching rules on the tick: waits below 30 points inside 60 s, sends at 30 points, sends once 60 s have passed', async () => {
  const t = setup();
  await t.queue.enqueuePoints(Array.from({ length: 5 }, (_, i) => point(i)));
  assert.equal((await t.syncer.syncNow('tick')).status, 'synced', 'the first tick has never attempted: goes');
  await t.queue.enqueuePoints(Array.from({ length: 5 }, (_, i) => point(10 + i)));
  t.advance(10_000);
  assert.equal((await t.syncer.syncNow('tick')).status, 'skipped', '5 points, 10 s since the last attempt');
  assert.equal(t.calls.send, 1);
  await t.queue.enqueuePoints(Array.from({ length: 25 }, (_, i) => point(20 + i)));
  t.advance(5_000);
  assert.equal((await t.syncer.syncNow('tick')).status, 'synced', '30 points queued');
  assert.equal(t.calls.send, 2);
  await t.queue.enqueuePoints([point(99)]);
  t.advance(30_000);
  assert.equal((await t.syncer.syncNow('tick')).status, 'skipped');
  t.advance(31_000);
  assert.equal((await t.syncer.syncNow('tick')).status, 'synced', '61 s later');
  assert.equal(t.calls.send, 3);
});

test('app foreground and network restore upload at once, but never hammer: two seconds between attempts', async () => {
  const t = setup();
  await t.queue.enqueuePoints([point(1)]);
  assert.equal((await t.syncer.syncNow('foreground')).status, 'synced');
  await t.queue.enqueuePoints([point(2)]);
  assert.equal((await t.syncer.syncNow('network_restored')).status, 'skipped', 'less than 2 s since the last attempt');
  t.advance(3000);
  assert.equal((await t.syncer.syncNow('network_restored')).status, 'synced');
});

test('a queue bigger than one request is drained in contiguous windows of at most 500 points', async () => {
  const t = setup();
  await t.queue.enqueuePoints(Array.from({ length: 1200 }, (_, i) => point(i)));
  const out = await t.syncer.syncNow('flush');
  assert.equal(out.status, 'synced');
  assert.equal(t.server.bodies.length, 3);
  assert.deepEqual(t.server.bodies.map((b) => b.points.length), [500, 500, 200]);
  assert.equal(t.server.have.size, 1200);
  assert.equal((await t.queue.counts()).points, 0);
  const seqs = t.server.bodies.flatMap((b) => b.points.map((p) => p.seq));
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
});

test('offline: the request fails, EVERYTHING stays queued, and the retry waits 5 s, then 10 s ... (exponential back-off)', async () => {
  let offline = true;
  const server = fakeServer();
  const t = setup(
    { send: async (body) => (offline ? { kind: 'failed', reason: 'offline' } : server.handle(body)) },
    server,
  );
  await t.queue.enqueuePoints([point(1), point(2)]);
  await t.queue.enqueueEvent(event(3, 'NETWORK_LOST'));
  assert.equal((await t.syncer.syncNow('foreground')).status, 'failed');
  assert.equal((await t.queue.counts()).points, 2);
  assert.equal((await t.queue.counts()).events, 1);
  let st = await t.syncer.status();
  assert.equal(st.failures, 1);
  assert.equal(st.nextAt, t.now + 5000);
  assert.equal(st.lastError, 'offline');

  t.advance(70_000); // the interval would allow it, the back-off window (5 s) has passed too
  assert.equal((await t.syncer.syncNow('tick')).status, 'failed');
  st = await t.syncer.status();
  assert.equal(st.failures, 2);
  assert.equal(st.nextAt, t.now + 10_000);

  t.advance(5_000);
  assert.equal((await t.syncer.syncNow('tick')).status, 'backoff', 'inside the 10 s window the tick does not even try');

  // the network returns: that trigger is allowed through the back-off
  offline = false;
  t.advance(3_000);
  assert.equal((await t.syncer.syncNow('network_restored')).status, 'synced');
  st = await t.syncer.status();
  assert.equal(st.failures, 0);
  assert.equal(st.nextAt, null);
  assert.equal(st.lastError, null);
  assert.deepEqual(await t.queue.counts(), { points: 0, events: 0, oldestPointAt: null, newestPointAt: null });
});

test('the back-off is capped at ten minutes', async () => {
  const t = setup({ send: async () => ({ kind: 'failed', reason: 'server', status: 503 }) });
  await t.queue.enqueuePoints([point(1)]);
  for (let i = 0; i < 20; i++) {
    t.advance(11 * 60_000);
    await t.syncer.syncNow('foreground');
  }
  const st = await t.syncer.status();
  assert.equal(st.failures, 20);
  assert.equal(st.nextAt, t.now + SYNC.maxBackoffMs);
});

test('a 429 with Retry-After waits as told', async () => {
  const t = setup({ send: async () => ({ kind: 'failed', reason: 'throttled', status: 429, retryAfterMs: 45_000 }) });
  await t.queue.enqueuePoints([point(1)]);
  await t.syncer.syncNow('foreground');
  assert.equal((await t.syncer.status()).nextAt, t.now + 45_000);
});

test('a lost response is harmless: the same rows are re-sent and come back as duplicates, then are deleted', async () => {
  let loseNext = true;
  const server = fakeServer();
  const t = setup(
    {
      send: async (body) => {
        const res = server.handle(body); // the server stored it...
        if (loseNext) {
          loseNext = false;
          return { kind: 'failed', reason: 'timeout' }; // ...but the phone never heard back
        }
        return res;
      },
    },
    server,
  );
  await t.queue.enqueuePoints([point(1), point(2)]);
  assert.equal((await t.syncer.syncNow('foreground')).status, 'failed');
  assert.equal((await t.queue.counts()).points, 2);
  t.advance(10_000);
  const out = await t.syncer.syncNow('foreground');
  assert.equal(out.status, 'synced');
  assert.equal((await t.queue.counts()).points, 0);
  assert.equal(server.have.size, 2, 'the server holds each row once');
  assert.deepEqual(server.bodies[0].points.map((p) => p.seq), server.bodies[1].points.map((p) => p.seq), 'identical seqs on the re-send');
});

test('a partial acknowledgement deletes only up to it', async () => {
  const t = setup({
    send: async (body) => ({
      kind: 'ok',
      data: okResponse({ accepted: 2, ackSeq: body.points[1].seq }),
    }),
  });
  const seqs = await t.queue.enqueuePoints([point(1), point(2), point(3), point(4)]);
  const out = await t.syncer.syncNow('foreground');
  assert.equal(out.acked, 2);
  const left = await t.queue.peekBatch();
  assert.deepEqual(left?.points.map((p) => p.seq), [seqs[2], seqs[3]]);
});

test('an ok answer that takes nothing we can verify is a failure: nothing is deleted and it backs off', async () => {
  const t = setup({ send: async () => ({ kind: 'ok', data: okResponse({ accepted: 0, ackSeq: 0 }) }) });
  await t.queue.enqueuePoints([point(1)]);
  const out = await t.syncer.syncNow('foreground');
  assert.equal(out.status, 'failed');
  assert.equal(out.detail, 'no_ack');
  assert.equal((await t.queue.counts()).points, 1);
});

test('trackActive:false: what the server took is acknowledged, the end is reported once with the reason, the rest is released', async () => {
  const server = fakeServer({ trackActive: false, endReason: 'rejected' });
  const t = setup({}, server);
  await t.queue.enqueuePoints([point(1), point(2)]);
  const out = await t.syncer.syncNow('flush');
  assert.equal(out.trackActive, false);
  assert.deepEqual(t.calls.ended, ['rejected']);
  assert.equal((await t.queue.counts()).points, 0, 'not re-sent on every trigger for ever');
  assert.equal(await t.queue.getMeta(META.syncTrackEnded), 'rejected');
});

test('trackActive:false after the server accepted late data (inside its 5 minute window): the data is kept by the server and acked', async () => {
  const t = setup({
    send: async (body) => ({
      kind: 'ok',
      data: okResponse({ accepted: body.points.length, ackSeq: body.points[body.points.length - 1].seq, trackActive: false, endReason: 'manual' }),
    }),
  });
  await t.queue.enqueuePoints([point(1), point(2)]);
  const out = await t.syncer.syncNow('flush');
  assert.equal(out.acked, 2);
  assert.deepEqual(t.calls.ended, ['manual']);
});

test('a later answer that says the track is active again clears the "ended" mark', async () => {
  let active = false;
  const t = setup({
    send: async (body) => ({ kind: 'ok', data: okResponse({ accepted: body.points.length, ackSeq: body.points[0].seq + body.points.length - 1, trackActive: active }) }),
  });
  await t.queue.enqueuePoints([point(1)]);
  await t.syncer.syncNow('flush');
  assert.ok(await t.queue.getMeta(META.syncTrackEnded));
  active = true;
  await t.queue.enqueuePoints([point(2)]);
  t.advance(5000);
  await t.syncer.syncNow('flush');
  assert.equal(await t.queue.getMeta(META.syncTrackEnded), null);
});

test('CONSENT_REQUIRED keeps everything, tells the controller, and the tick stays quiet until consent is given or the app is reopened', async () => {
  let consented = false;
  let sends = 0;
  const server = fakeServer();
  const t = setup(
    {
      send: async (body) => {
        sends++;
        return consented ? server.handle(body) : { kind: 'consent_required' };
      },
    },
    server,
  );
  await t.queue.enqueuePoints([point(1), point(2)]);
  const out = await t.syncer.syncNow('foreground');
  assert.equal(out.status, 'consent_required');
  assert.equal(t.calls.consent, 1);
  assert.equal((await t.queue.counts()).points, 2);
  assert.equal((await t.syncer.status()).blockedByConsent, true);
  assert.equal((await t.syncer.status()).failures, 0, 'a missing consent is not a transport failure');

  t.advance(120_000);
  assert.equal((await t.syncer.syncNow('tick')).status, 'skipped', 'ticks do not keep asking');
  assert.equal(sends, 1);

  consented = true;
  await t.syncer.clearConsentBlock();
  t.advance(3000);
  assert.equal((await t.syncer.syncNow('tick')).status, 'synced');
  assert.equal(server.have.size, 2);
});

test('401 keeps the queue and is not counted as a transport failure', async () => {
  const t = setup({ send: async () => ({ kind: 'unauthorized' }) });
  await t.queue.enqueuePoints([point(1)]);
  const out = await t.syncer.syncNow('foreground');
  assert.equal(out.status, 'unauthorized');
  assert.equal((await t.queue.counts()).points, 1);
  assert.equal((await t.syncer.status()).failures, 0);
  assert.equal((await t.syncer.status()).lastError, 'unauthorized');
});

test('nothing is uploaded when nobody is signed in, or under a different employee than the one the data belongs to', async () => {
  let who: number | null = null;
  const t = setup({ currentEmployeeId: async () => who });
  await t.queue.enqueuePoints([point(1)]);
  assert.equal((await t.syncer.syncNow('foreground')).status, 'no_auth');
  who = 7;
  await t.queue.setMeta(META.ownerEmployeeId, '42');
  assert.equal((await t.syncer.syncNow('foreground')).status, 'owner_mismatch');
  assert.equal(t.calls.send, 0);
  who = 42;
  assert.equal((await t.syncer.syncNow('foreground')).status, 'synced');
});

test('413 halves the window until it fits', async () => {
  const sizes: number[] = [];
  const server = fakeServer();
  const t = setup(
    {
      send: async (body) => {
        sizes.push(body.points.length);
        return body.points.length > 100 ? { kind: 'too_large' } : server.handle(body);
      },
    },
    server,
  );
  await t.queue.enqueuePoints(Array.from({ length: 300 }, (_, i) => point(i)));
  const out = await t.syncer.syncNow('flush');
  assert.equal(out.status, 'synced');
  assert.deepEqual(sizes.slice(0, 4), [300, 250, 125, 62], 'each 413 halves the window');
  assert.equal(server.have.size, 300);
});

test('two triggers at once share one request (single flight)', async () => {
  const server = fakeServer();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  const t = setup({ send: async (body) => (await gate, server.handle(body)) }, server);
  await t.queue.enqueuePoints([point(1)]);
  const a = t.syncer.syncNow('foreground');
  const b = t.syncer.syncNow('network_restored');
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(t.server.bodies.length, 1);
  assert.equal(ra.status, 'synced');
  assert.equal(rb.status, 'synced');
});

test('flush waits for a sync already running, then drains what arrived meanwhile', async () => {
  const server = fakeServer();
  let release: () => void = () => undefined;
  let first = true;
  const gate = new Promise<void>((r) => (release = r));
  const t = setup(
    {
      send: async (body) => {
        if (first) {
          first = false;
          await gate;
        }
        return server.handle(body);
      },
    },
    server,
  );
  await t.queue.enqueuePoints([point(1)]);
  const running = t.syncer.syncNow('tick');
  await t.queue.enqueuePoints([point(2)]);
  const flushing = t.syncer.flush();
  release();
  await running;
  const out = await flushing;
  assert.ok(out.status === 'synced' || out.status === 'empty');
  assert.equal((await t.queue.counts()).points, 0);
  assert.equal(server.have.size, 2);
});

test('the server config in a response is handed on (the collector re-tunes from it)', async () => {
  const cfg = { ...DEFAULT_CONFIG, sampleMovingSeconds: 5 };
  const t = setup({
    send: async (body) => ({ kind: 'ok', data: okResponse({ accepted: body.points.length, ackSeq: body.points[0].seq, config: cfg }) }),
  });
  await t.queue.enqueuePoints([point(1)]);
  await t.syncer.syncNow('foreground');
  assert.deepEqual(t.calls.configs, [cfg]);
});

test('an unexpected exception inside a sync never escapes (the collector must not crash) and leaves the queue intact', async () => {
  const t = setup({
    send: async () => {
      throw new Error('boom');
    },
  });
  await t.queue.enqueuePoints([point(1)]);
  const out = await t.syncer.syncNow('foreground');
  assert.equal(out.status, 'failed');
  assert.match(out.detail ?? '', /boom/);
  assert.equal((await t.queue.counts()).points, 1);
});
