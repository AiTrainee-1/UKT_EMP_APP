// Run with `npm test`. The self-heal decisions: the server is the authority on whether a track is active, and the controller
// makes the engine match it - start, keep, restart, stop (after a final flush) - without ever stopping on a failed read.
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';

import { createController, decide } from './controller.ts';
import type { ControllerDeps, DecisionInput } from './controller.ts';
import { DEFAULT_CONFIG, META } from './constants.ts';
import { createQueue } from './queue.ts';
import { openNodeSqlite } from './testing/nodeSqlite.ts';
import type {
  ActiveTrack,
  EngineStartResult,
  EngineStatus,
  NewEvent,
  PermissionLevel,
  TrackerEngine,
  TrackingServerState,
} from './types.ts';

const T0 = 1_700_000_000_000;

const serverState = (over: Partial<TrackingServerState> = {}): TrackingServerState => ({
  supported: true,
  enabled: true,
  active: true,
  consentRequired: false,
  noticeVersion: 1,
  noticeText: 'We record your route while you are on duty.',
  serverTime: null,
  track: { id: 9, sessionId: 5, startedAt: null, endsAt: null, state: 'moving' },
  config: DEFAULT_CONFIG,
  punchPhotos: 1,
  ...over,
});

const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  state: serverState(),
  serverSaysEnded: false,
  engineRunning: false,
  engineTrackId: null,
  cachedTrack: null,
  permission: 'always',
  appForeground: true,
  heartbeatStale: false,
  ...over,
});

// ------------------------------------------------------------------------------------------- decide (pure)

test('active track, engine not running, everything in place -> start', () => {
  const d = decide(input());
  assert.equal(d.action, 'start');
  assert.deepEqual(d.track, { trackId: 9, sessionId: 5, config: DEFAULT_CONFIG });
});

test('active track + running on the same track -> keep', () => {
  assert.equal(decide(input({ engineRunning: true, engineTrackId: 9 })).action, 'keep');
});

test('no active track + running -> stop; no active track + not running -> nothing', () => {
  const none = serverState({ active: false, track: null });
  assert.deepEqual(decide(input({ state: none, engineRunning: true, engineTrackId: 9 })), { action: 'stop', reason: 'no_active_track' });
  assert.equal(decide(input({ state: none })).action, 'keep');
});

test('"active" with no readable track is not "ended": a running engine is left alone', () => {
  const odd = serverState({ active: true, track: null });
  assert.deepEqual(decide(input({ state: odd, engineRunning: true, engineTrackId: 9 })), { action: 'keep', reason: 'active_without_track_id' });
  assert.equal(decide(input({ state: odd })).action, 'keep');
});

test('tracking switched off by HR stops a running engine, and starts nothing', () => {
  const off = serverState({ enabled: false });
  assert.equal(decide(input({ state: off, engineRunning: true, engineTrackId: 9 })).action, 'stop');
  assert.equal(decide(input({ state: off })).action, 'keep');
});

test('a server without tracking (404) starts nothing and stops a running engine', () => {
  const unsupported = serverState({ supported: false, enabled: false, active: false, track: null });
  assert.deepEqual(decide(input({ state: unsupported })), { action: 'blocked', reason: 'unsupported', blockedBy: 'unsupported' });
  assert.equal(decide(input({ state: unsupported, engineRunning: true })).action, 'stop');
});

test('a failed read NEVER stops a running engine (being offline is not "the track ended")', () => {
  assert.equal(decide(input({ state: null, engineRunning: true, engineTrackId: 9 })).action, 'keep');
});

test('a failed read with a cached track resumes a dead engine while the app is on screen', () => {
  const cached: ActiveTrack = { trackId: 9, sessionId: 5, config: DEFAULT_CONFIG };
  const d = decide(input({ state: null, cachedTrack: cached }));
  assert.equal(d.action, 'start');
  assert.equal(d.reason, 'offline_resume');
  assert.equal(decide(input({ state: null, cachedTrack: cached, appForeground: false })).action, 'keep');
  assert.equal(decide(input({ state: null, cachedTrack: cached, permission: 'denied' })).action, 'keep');
  assert.equal(decide(input({ state: null })).action, 'keep', 'nothing cached: nothing to resume');
});

test('a batch answer of trackActive:false is authoritative even when the state call fails', () => {
  assert.equal(decide(input({ state: null, serverSaysEnded: true, engineRunning: true })).action, 'stop');
  assert.equal(decide(input({ state: null, serverSaysEnded: true })).action, 'keep');
});

test('consent comes before any recording: with consent required nothing starts', () => {
  const d = decide(input({ state: serverState({ consentRequired: true }) }));
  assert.equal(d.action, 'blocked');
  assert.equal(d.blockedBy, 'consent');
});

test('a running engine keeps running when consent is withdrawn (uploads wait, the screens ask)', () => {
  assert.equal(decide(input({ state: serverState({ consentRequired: true }), engineRunning: true, engineTrackId: 9 })).action, 'keep');
});

test('no location permission: blocked by permission; "while using" is enough to start', () => {
  assert.equal(decide(input({ permission: 'denied' })).blockedBy, 'permission');
  assert.equal(decide(input({ permission: 'while_using' })).action, 'start');
  assert.equal(decide(input({ permission: 'unknown' })).action, 'start', 'a failed probe does not block; the engine checks again');
});

test('Android cannot start the foreground service from the background: blocked until the app is opened', () => {
  const d = decide(input({ appForeground: false }));
  assert.equal(d.action, 'blocked');
  assert.equal(d.blockedBy, 'foreground');
});

test('a new track while the old one is running restarts the engine, but only on screen', () => {
  const next = serverState({ track: { id: 10, sessionId: 6, startedAt: null, endsAt: null, state: 'waiting_first_fix' } });
  assert.equal(decide(input({ state: next, engineRunning: true, engineTrackId: 9 })).action, 'restart');
  assert.equal(decide(input({ state: next, engineRunning: true, engineTrackId: 9, appForeground: false })).action, 'keep');
});

test('a running engine whose heartbeat went quiet is restarted (a dead foreground service), on screen only', () => {
  const stale = input({ engineRunning: true, engineTrackId: 9, heartbeatStale: true });
  assert.deepEqual(decide(stale).action, 'restart');
  assert.equal(decide(stale).reason, 'stale_heartbeat');
  assert.equal(decide({ ...stale, appForeground: false }).action, 'keep');
});

// ------------------------------------------------------------------------------------------- the controller

function fakeEngine(initial: Partial<EngineStatus> = {}) {
  const calls: string[] = [];
  const status: EngineStatus = {
    running: false, trackId: null, sessionId: null, mode: null, startedAt: null, lastPointAt: null, lastHeartbeatAt: null, lastError: null,
    ...initial,
  };
  let nextStart: EngineStartResult = { ok: true, alreadyRunning: false };
  const engine: TrackerEngine = {
    async start(track) {
      calls.push(`start:${track.trackId}`);
      if (nextStart.ok) {
        status.running = true;
        status.trackId = track.trackId;
      }
      return nextStart;
    },
    async stop(reason) {
      calls.push(`stop:${reason ?? ''}`);
      status.running = false;
      status.trackId = null;
    },
    async status() {
      return { ...status };
    },
    async enqueue() {
      return 0;
    },
  };
  return {
    engine,
    calls,
    status,
    failNextStart(res: EngineStartResult) {
      nextStart = res;
    },
  };
}

function setup(over: Partial<ControllerDeps> = {}, state: TrackingServerState | Error = serverState(), engineInit: Partial<EngineStatus> = {}) {
  const queue = createQueue(openNodeSqlite());
  const eng = fakeEngine(engineInit);
  let now = T0;
  let employee: number | null = 42;
  let permission: PermissionLevel = 'always';
  let foreground = true;
  let boot: number | null = null;
  let current: TrackingServerState | Error = state;
  const flushes: string[] = [];
  const flushBehaviour = { delivers: false };
  const deps: ControllerDeps = {
    engine: eng.engine,
    queue,
    syncer: {
      async flush() {
        flushes.push('flush');
        if (flushBehaviour.delivers) await queue.ack(Number.MAX_SAFE_INTEGER); // the server took everything
        return { status: 'empty', sent: 0, acked: 0, trackActive: null };
      },
    },
    fetchState: async () => {
      if (current instanceof Error) throw current;
      return current;
    },
    probe: { permission: async () => permission, isForeground: () => foreground, bootAt: async () => boot },
    currentEmployeeId: async () => employee,
    now: () => now,
    schedule: (fn) => fn(),
    flushTimeoutMs: 50,
    ...over,
  };
  const controller = createController(deps);
  return {
    controller, queue, eng, flushes, flushBehaviour,
    setState(s: TrackingServerState | Error) { current = s; },
    setNow(n: number) { now = n; },
    advance(ms: number) { now += ms; },
    setEmployee(e: number | null) { employee = e; },
    setPermission(p: PermissionLevel) { permission = p; },
    setForeground(f: boolean) { foreground = f; },
    setBoot(b: number | null) { boot = b; },
  };
}

const events = async (q: ReturnType<typeof createQueue>): Promise<NewEvent[]> => (await q.peekBatch())?.events ?? [];

test('submitting an On-Duty request starts the engine at once and records TRACKING_STARTED with the owner', async () => {
  const t = setup();
  const r = await t.controller.ensure('request_submitted');
  assert.equal(r.started, true);
  assert.deepEqual(t.eng.calls, ['start:9']);
  assert.equal(await t.queue.getMeta(META.ownerEmployeeId), '42');
  assert.deepEqual(await t.queue.getJson(META.engineTrack), { trackId: 9, sessionId: 5, config: DEFAULT_CONFIG });
  const ev = await events(t.queue);
  assert.deepEqual(ev.map((e) => e.kind), ['TRACKING_STARTED']);
  assert.deepEqual(ev[0].meta, { origin: 'device', reason: 'request_submitted' });
});

test('a running engine on the same track is left alone by every later check', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  const r = await t.controller.ensure('foreground');
  assert.equal(r.decision.action, 'keep');
  assert.deepEqual(t.eng.calls, ['start:9']);
});

test('nobody signed in: nothing happens and the server is not asked', async () => {
  let asked = 0;
  const t = setup({ fetchState: async () => (asked++, serverState()) });
  t.setEmployee(null);
  const r = await t.controller.ensure('app_start');
  assert.equal(r.skipped, 'no_auth');
  assert.equal(asked, 0);
});

test('the periodic tick is throttled to one server check a minute; other reasons are not', async () => {
  let asked = 0;
  const t = setup({ fetchState: async () => (asked++, serverState({ active: false, track: null })) });
  await t.controller.ensure('tick');
  assert.equal(asked, 1);
  t.advance(30_000);
  const second = await t.controller.ensure('tick');
  assert.equal(second.skipped, 'throttled');
  assert.equal(asked, 1);
  const manual = await t.controller.ensure('foreground');
  assert.equal(asked, 2, 'a foreground check is never throttled');
  t.advance(61_000);
  await t.controller.ensure('tick');
  assert.equal(asked, 3);
});

test('the server ending the track: the final TRACKING_STOPPED + flush happen BEFORE the engine is stopped, then the state is cleared', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  t.setState(serverState({ active: false, track: null }));
  t.advance(120_000);
  const r = await t.controller.ensure('foreground');
  assert.equal(r.stopped, true);
  assert.deepEqual(t.flushes, ['flush']);
  assert.deepEqual(t.eng.calls, ['start:9', 'stop:no_active_track']);
  assert.equal(await t.queue.getMeta(META.engineTrack), null);
  assert.equal(await t.queue.getMeta(META.heartbeat), null);
  const ev = await events(t.queue);
  assert.deepEqual(ev.map((e) => e.kind), ['TRACKING_STARTED', 'TRACKING_STOPPED']);
  // the queue is empty of data but the stop event is still waiting for the flush to take it: the owner stays
  assert.equal(await t.queue.getMeta(META.ownerEmployeeId), '42');
});

test('once the final flush has delivered everything the owner mark is released; while rows wait it stays', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  t.flushBehaviour.delivers = true;
  t.setState(serverState({ active: false, track: null }));
  await t.controller.ensure('foreground');
  assert.equal(await t.queue.peekBatch(), null);
  assert.equal(await t.queue.getMeta(META.ownerEmployeeId), null);
});

test('an unreadable state never stops a running engine', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  t.setState(new Error('Network Error'));
  t.advance(120_000);
  const r = await t.controller.ensure('foreground');
  assert.equal(r.decision.action, 'keep');
  assert.equal(r.stopped, false);
  assert.deepEqual(t.eng.calls, ['start:9']);
});

test('a batch that said trackActive:false stops the engine on the next turn even if the state call fails', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  t.setState(new Error('Network Error'));
  t.controller.onTrackEndedByServer('manual'); // schedule runs immediately in the test
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(t.eng.calls, ['start:9', 'stop:server_said_ended']);
});

test('consent required: the engine is not started and the answer says why; accepting it and asking again starts it', async () => {
  const t = setup({}, serverState({ consentRequired: true }));
  const blocked = await t.controller.ensure('request_submitted');
  assert.equal(blocked.started, false);
  assert.equal(blocked.decision.blockedBy, 'consent');
  assert.deepEqual(t.eng.calls, []);
  t.setState(serverState());
  const ok = await t.controller.ensure('consent_accepted');
  assert.equal(ok.started, true);
});

test('permission denied or the app in the background: blocked, with the reason the screens act on', async () => {
  const t = setup();
  t.setPermission('denied');
  assert.equal((await t.controller.ensure('request_submitted')).decision.blockedBy, 'permission');
  t.setPermission('always');
  t.setForeground(false);
  t.advance(61_000); // past the tick throttle
  assert.equal((await t.controller.ensure('tick')).decision.blockedBy, 'foreground');
  assert.deepEqual(t.eng.calls, []);
});

test('an engine that refuses to start is reported and remembered (health screen), not treated as started', async () => {
  const t = setup();
  t.eng.failNextStart({ ok: false, reason: 'foreground_required', message: 'ForegroundServiceStartNotAllowedException' });
  const r = await t.controller.ensure('request_submitted');
  assert.equal(r.started, false);
  assert.match((await t.queue.getMeta(META.engineError)) ?? '', /foreground_required/);
  assert.equal(await t.queue.getMeta(META.engineTrack), null);
});

test('a new track replaces the old one: restart, with fresh signal state and no "killed" inference', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  await t.queue.setMeta('sig.gps', 'bad');
  t.setState(serverState({ track: { id: 10, sessionId: 6, startedAt: null, endsAt: null, state: 'moving' } }));
  t.advance(5 * 3600_000); // hours later: for a NEW track that silence means nothing
  const r = await t.controller.ensure('foreground');
  assert.equal(r.decision.action, 'restart');
  assert.deepEqual(t.eng.calls, ['start:9', 'stop:different_track', 'start:10']);
  assert.equal(await t.queue.getMeta('sig.gps'), null);
  const kinds = (await events(t.queue)).map((e) => e.kind);
  assert.equal(kinds.includes('APP_KILLED'), false);
});

test('the SAME track coming back after hours of silence records APP_KILLED + APP_RESTARTED from the heartbeat', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  await t.queue.ack(Number.MAX_SAFE_INTEGER);
  // the OS killed the app: the engine reports not running, the heartbeat is hours old
  t.eng.status.running = false;
  t.eng.status.trackId = null;
  t.advance(3 * 3600_000);
  const r = await t.controller.ensure('foreground');
  assert.equal(r.started, true);
  const ev = await events(t.queue);
  assert.deepEqual(ev.map((e) => e.kind), ['APP_KILLED', 'APP_RESTARTED']);
  assert.equal(ev[0].startedAt, T0);
  assert.equal(ev[0].endedAt, T0 + 3 * 3600_000);
});

test('the same track back after a PHONE REBOOT records DEVICE_BOOT (inferred) instead of APP_KILLED', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  await t.queue.ack(Number.MAX_SAFE_INTEGER);
  t.eng.status.running = false;
  t.advance(2 * 3600_000);
  t.setBoot(T0 + 3600_000);
  await t.controller.ensure('foreground');
  const ev = await events(t.queue);
  assert.deepEqual(ev.map((e) => e.kind), ['DEVICE_BOOT', 'APP_RESTARTED']);
  assert.equal(ev[0].startedAt, T0 + 3600_000);
});

test('a dead service (heartbeat stale while "running") is restarted once, then left alone for ten minutes', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  t.advance(30 * 60_000); // heartbeat is 30 min old, the stale limit is 3 x 300 s = 15 min
  const first = await t.controller.ensure('foreground');
  assert.equal(first.decision.reason, 'stale_heartbeat');
  assert.deepEqual(t.eng.calls.slice(-2), ['stop:stale_heartbeat', 'start:9']);
  // the restart wrote a fresh heartbeat, so the next look is fine anyway; force staleness to prove the cooldown
  await t.queue.setMeta(META.heartbeat, String(T0));
  t.advance(60_000);
  const second = await t.controller.ensure('foreground');
  assert.equal(second.decision.action, 'keep');
});

test('someone else signed in on this phone: the previous employee\'s queue is dropped, never uploaded under the new token', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  await t.queue.enqueuePoints([
    { recordedAt: T0, latitude: 11, longitude: 77, accuracy: 5, speed: 1, bearing: 0, altitude: 0, activity: 'walking', battery: 50, charging: false, network: 'wifi', provider: 'fused', isMocked: false },
  ]);
  t.setEmployee(7);
  t.setState(serverState({ active: false, track: null }));
  await t.controller.ensure('sign_in');
  assert.equal(await t.queue.peekBatch(), null);
  assert.equal(await t.queue.getMeta(META.ownerEmployeeId), null);
  assert.ok(t.eng.calls.includes('stop:owner_changed'));
});

test('signing out stops recording on the phone but keeps the queue for the same employee', async () => {
  const t = setup();
  await t.controller.ensure('request_submitted');
  await t.queue.enqueuePoints([
    { recordedAt: T0, latitude: 11, longitude: 77, accuracy: 5, speed: 1, bearing: 0, altitude: 0, activity: 'walking', battery: 50, charging: false, network: 'wifi', provider: 'fused', isMocked: false },
  ]);
  await t.controller.stopForSignOut();
  assert.ok(t.eng.calls.includes('stop:signed_out'));
  assert.equal((await t.queue.counts()).points, 1);
  assert.equal(await t.queue.getMeta(META.ownerEmployeeId), '42');
  assert.equal(await t.queue.getMeta(META.heartbeat), null, 'no "killed" for time spent signed out');
});

test('two checks at once make one pass; a non-tick check issued during a tick gets its own pass', async () => {
  let asked = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  const t = setup({
    fetchState: async () => {
      asked++;
      if (asked === 1) await gate;
      return serverState();
    },
  });
  const tick = t.controller.ensure('tick');
  const tick2 = t.controller.ensure('tick');
  const submitted = t.controller.ensure('request_submitted');
  release();
  await Promise.all([tick, tick2, submitted]);
  assert.equal(asked, 2, 'the two ticks shared a pass; the submit ran after it');
  assert.deepEqual(t.eng.calls, ['start:9']);
});

test('an exception inside a pass is contained (the app must not crash from a self-heal)', async () => {
  const t = setup({
    probe: { permission: async () => { throw new Error('probe broke'); }, isForeground: () => true, bootAt: async () => null },
  });
  const r = await t.controller.ensure('foreground');
  assert.equal(r.decision.action, 'keep');
  assert.match(r.decision.reason, /probe broke/);
});
