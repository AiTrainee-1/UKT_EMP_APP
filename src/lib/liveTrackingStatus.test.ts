// Run with `npm test`. The Live Tracking screen as a read-only status: "is my location monitored?", "is it shared?", the phone
// checks (every fix helps tracking, none stops it) and the rules of when tracking runs.
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DAY_END,
  QUIET_AFTER_MS,
  buildLiveStatus,
  monitorAnswer,
  monitorSources,
  phoneChecks,
  sessionCard,
  shareAnswer,
  statTiles,
  trackingRules,
} from './liveTrackingStatus.ts';
import type { LiveStatusInput, PhoneInput, ServerTrackingInput, SessionInput } from './liveTrackingStatus.ts';

const NOW = Date.parse('2026-10-31T06:00:00.000Z');

const server = (over: Partial<ServerTrackingInput> = {}): ServerTrackingInput => ({
  supported: true,
  enabled: true,
  active: true,
  consentRequired: false,
  track: { id: 7, sessionId: 3, startedAt: '2026-10-31T03:30:00.000Z', endsAt: '2026-10-31T18:20:00.000Z', state: 'moving' },
  ...over,
});

const phone = (over: Partial<PhoneInput> = {}): PhoneInput => ({
  engineRunning: true,
  engineMode: 'moving',
  queuedPoints: 0,
  queuedEvents: 0,
  droppedPoints: 0,
  lastPointAt: NOW - 20_000,
  lastUploadAt: NOW - 40_000,
  uploadError: null,
  permission: 'always',
  locationEnabled: true,
  batteryOptimised: false,
  powerSave: false,
  batteryPct: 71,
  network: 'cell',
  notificationsGranted: true,
  ...over,
});

const session = (over: Partial<SessionInput> = {}): SessionInput => ({
  id: 3,
  destination: 'Avinashi dye house',
  status: 'active',
  approvalStatus: 'pending_hr',
  startedAt: '2026-10-31T03:30:00.000Z',
  completedAt: null,
  completionReason: null,
  ...over,
});

const input = (over: Partial<LiveStatusInput> = {}): LiveStatusInput => ({
  now: NOW,
  platform: 'android',
  server: server(),
  phone: phone(),
  session: session(),
  hr: { enabledByHr: false, loopRunning: false, lastPingAt: null, lastPingOk: null },
  pending: false,
  ...over,
});

const offDuty = (over: Partial<LiveStatusInput> = {}) =>
  input({ server: server({ active: false, track: null }), phone: phone({ engineRunning: false, lastPointAt: null }), session: null, ...over });

// ------------------------------------------------------------------------------------------------------------ monitored

test('an active On-Duty track is monitored, with how it ends', () => {
  const m = monitorAnswer(input());
  assert.equal(m.state, 'yes');
  assert.deepEqual(m.sources, ['on_duty']);
  assert.match(m.detail, /mark the duty Done/);
  assert.match(m.detail, /4th On-Duty punch/);
  assert.match(m.detail, /rejected/);
  assert.match(m.detail, /automatically at /);
});

test('no On-Duty and no HR sharing: not monitored', () => {
  const m = monitorAnswer(offDuty());
  assert.equal(m.state, 'no');
  assert.deepEqual(m.sources, []);
  assert.match(m.detail, /no active On-Duty/);
});

test('still loading and nothing known yet: checking, not "no"', () => {
  const m = monitorAnswer(offDuty({ server: null, phone: null, pending: true, hr: { enabledByHr: null, loopRunning: false, lastPingAt: null, lastPingOk: null } }));
  assert.equal(m.state, 'checking');
});

test('server unreachable but the phone is still recording: monitored (offline never stops it)', () => {
  const i = input({ server: null, phone: phone({ network: 'none' }) });
  assert.deepEqual(monitorSources(i), ['on_duty']);
  assert.equal(monitorAnswer(i).state, 'yes');
});

test('server unreachable and nothing running: "no", with a note that the office could not be reached', () => {
  const m = monitorAnswer(offDuty({ server: null }));
  assert.equal(m.state, 'no');
  assert.match(m.detail, /could not be reached/);
});

test('HR sharing flag alone is monitored', () => {
  const m = monitorAnswer(offDuty({ hr: { enabledByHr: true, loopRunning: true, lastPingAt: NOW - 10_000, lastPingOk: true } }));
  assert.equal(m.state, 'yes');
  assert.deepEqual(m.sources, ['hr_sharing']);
  assert.match(m.detail, /every 45 seconds while the app is open/);
});

test('an older server without /tracking: On-Duty is covered by the ping loop', () => {
  const i = input({ server: server({ supported: false, active: false, track: null }), phone: phone({ engineRunning: false }) });
  assert.deepEqual(monitorSources(i), ['on_duty_legacy']);
});

test('HR switched route tracking off during an active session: not monitored, and says why', () => {
  const m = monitorAnswer(input({ server: server({ enabled: false, active: false, track: null }), phone: phone({ engineRunning: false }) }));
  assert.equal(m.state, 'no');
  assert.match(m.detail, /HR has switched On-Duty route tracking off/);
});

test("today's On-Duty completed: not monitored, recording stopped", () => {
  const m = monitorAnswer(offDuty({ session: session({ status: 'completed', approvalStatus: 'completed', completionReason: 'manual' }) }));
  assert.equal(m.state, 'no');
  assert.match(m.detail, /has ended/);
});

// --------------------------------------------------------------------------------------------------------------- shared

test('recording and uploading: live, with the pulse', () => {
  const s = shareAnswer(input());
  assert.equal(s.state, 'live');
  assert.equal(s.tone, 'good');
  assert.equal(s.pulse, true);
  assert.match(s.detail, /Last location .* last sent/);
});

test('offline while recording: saved on the phone, still pulsing, sent later', () => {
  const s = shareAnswer(input({ phone: phone({ network: 'none', queuedPoints: 42 }) }));
  assert.equal(s.state, 'saved');
  assert.equal(s.pulse, true);
  assert.match(s.detail, /saved on the phone/);
  assert.match(s.detail, /42 locations are saved/);
});

test('consent missing blocks the route', () => {
  const s = shareAnswer(input({ server: server({ consentRequired: true }), phone: phone({ engineRunning: false }) }));
  assert.equal(s.state, 'blocked');
  assert.deepEqual(s.blockers, ['consent']);
  assert.equal(s.pulse, false);
});

test('permission denied blocks the route', () => {
  const s = shareAnswer(input({ phone: phone({ permission: 'denied', engineRunning: false }) }));
  assert.equal(s.state, 'blocked');
  assert.deepEqual(s.blockers, ['permission']);
});

test('GPS off blocks the route', () => {
  const s = shareAnswer(input({ phone: phone({ locationEnabled: false }) }));
  assert.deepEqual(s.blockers, ['gps']);
});

test('active track but the service is not running: blocked by "engine"', () => {
  const s = shareAnswer(input({ phone: phone({ engineRunning: false }) }));
  assert.equal(s.state, 'blocked');
  assert.deepEqual(s.blockers, ['engine']);
});

test('running but no location for a while: quiet, no pulse', () => {
  const s = shareAnswer(input({ phone: phone({ lastPointAt: NOW - QUIET_AFTER_MS - 60_000 }) }));
  assert.equal(s.state, 'quiet');
  assert.equal(s.pulse, false);
  assert.match(s.detail, /no new location for 6 min/);
});

test('not monitored: off, no pulse, mentions what is still waiting to upload', () => {
  const s = shareAnswer(offDuty({ phone: phone({ engineRunning: false, queuedPoints: 3 }) }));
  assert.equal(s.state, 'off');
  assert.equal(s.pulse, false);
  assert.match(s.detail, /3 locations from your last On-Duty are still waiting/);
});

test('On-Duty just ended but the service is still stopping: finishing', () => {
  const s = shareAnswer(offDuty({ phone: phone({ engineRunning: true }) }));
  assert.equal(s.state, 'finishing');
});

test('HR sharing: live while the loop pings, retrying after a failure, blocked before it was ever started', () => {
  const base = { enabledByHr: true, loopRunning: true, lastPingAt: NOW - 10_000, lastPingOk: true };
  assert.equal(shareAnswer(offDuty({ hr: base })).state, 'live');
  assert.equal(shareAnswer(offDuty({ hr: { ...base, lastPingOk: false } })).state, 'retrying');
  const notStarted = shareAnswer(offDuty({ hr: { ...base, loopRunning: false, lastPingAt: null, lastPingOk: null } }));
  assert.equal(notStarted.state, 'blocked');
  assert.deepEqual(notStarted.blockers, ['sharing_not_started']);
});

test('two channels: the best one answers, and a blocked one is still mentioned', () => {
  const s = shareAnswer(
    input({
      phone: phone({ engineRunning: false }),
      hr: { enabledByHr: true, loopRunning: true, lastPingAt: NOW - 5_000, lastPingOk: true },
    }),
  );
  assert.equal(s.state, 'live');
  assert.equal(s.channels.length, 2);
  assert.deepEqual(s.blockers, ['engine']);
  assert.match(s.detail, /On-Duty route: Not recording/);
});

test('a browser cannot read the phone: unknown, never "live"', () => {
  const s = shareAnswer(input({ platform: 'web', phone: null }));
  assert.equal(s.state, 'unknown');
  assert.equal(s.pulse, false);
  assert.deepEqual(phoneChecks(input({ platform: 'web', phone: null })), []);
  assert.deepEqual(statTiles(input({ platform: 'web', phone: null })), []);
});

// -------------------------------------------------------------------------------------------------------------- checks

test('checks: all good on a healthy phone, with no fix buttons', () => {
  const rows = phoneChecks(input());
  assert.ok(rows.every((r) => r.tone === 'good'));
  assert.ok(rows.every((r) => r.fix == null));
  assert.deepEqual(rows.map((r) => r.id), ['consent', 'permission', 'gps', 'battery_opt', 'battery_saver', 'internet', 'notifications']);
});

test('checks: every problem offers a fix that helps tracking (never a stop)', () => {
  const rows = phoneChecks(
    input({
      server: server({ consentRequired: true }),
      phone: phone({ permission: 'while_using', locationEnabled: false, batteryOptimised: true, notificationsGranted: false, powerSave: true, network: 'none' }),
    }),
  );
  const fix = Object.fromEntries(rows.map((r) => [r.id, r.fix]));
  assert.deepEqual(fix, {
    consent: 'consent',
    permission: 'allow_always',
    gps: 'location_settings',
    battery_opt: 'battery',
    battery_saver: null,
    internet: null,
    notifications: 'notifications',
  });
});

test('checks: a denied permission is red only while something should be recording', () => {
  const live = phoneChecks(input({ phone: phone({ permission: 'denied', engineRunning: false }) })).find((r) => r.id === 'permission');
  const idle = phoneChecks(offDuty({ phone: phone({ permission: 'denied', engineRunning: false }) })).find((r) => r.id === 'permission');
  assert.equal(live?.tone, 'bad');
  assert.equal(live?.fix, 'allow_location');
  assert.equal(idle?.tone, 'warn');
  assert.match(idle?.hint ?? '', /On-Duty days/);
});

test('checks: battery optimisation is an Android-only row; no consent row on a server without tracking', () => {
  assert.ok(!phoneChecks(input({ platform: 'ios' })).some((r) => r.id === 'battery_opt'));
  assert.ok(!phoneChecks(input({ server: server({ supported: false, active: false, track: null }) })).some((r) => r.id === 'consent'));
});

// --------------------------------------------------------------------------------------------------------------- tiles

test('tiles: last location, last sent (the newer of upload and ping), waiting; a ping tile only with live sharing', () => {
  const t = statTiles(input({ phone: phone({ queuedPoints: 5, lastUploadAt: NOW - 600_000 }), hr: { enabledByHr: true, loopRunning: true, lastPingAt: NOW - 30_000, lastPingOk: true } }));
  assert.deepEqual(t.map((x) => x.id), ['last_location', 'last_sent', 'waiting', 'last_ping']);
  assert.equal(t[1].value, '30 s ago');
  assert.equal(t[2].value, '5 locations');
  assert.equal(statTiles(input()).length, 3);
});

test('tiles: dropped points are reported', () => {
  const t = statTiles(input({ phone: phone({ queuedPoints: 20000, droppedPoints: 12 }) }));
  assert.match(t[2].hint ?? '', /12 oldest dropped/);
});

// ------------------------------------------------------------------------------------------------------------- session

test('session card: open session shows the approval state and how recording ends', () => {
  const c = sessionCard(input());
  assert.ok(c);
  assert.equal(c.open, true);
  assert.equal(c.approvalText, 'Waiting for HR approval');
  assert.equal(c.liveText, 'Moving');
  assert.match(c.endText, /mark it Done/);
});

test('session card: how a finished session ended', () => {
  assert.match(sessionCard(input({ session: session({ status: 'completed', approvalStatus: 'completed', completionReason: 'auto_4th_punch' }) }))?.endText ?? '', /all 4 On-Duty punches/);
  assert.match(sessionCard(input({ session: session({ status: 'rejected', approvalStatus: 'rejected' }) }))?.endText ?? '', /rejected/);
  assert.equal(sessionCard(input({ session: null })), null);
});

// --------------------------------------------------------------------------------------------------------------- rules

test('rules: when tracked, when not, offline, what HR sees', () => {
  const r = trackingRules({ server: null, hr: { enabledByHr: false, loopRunning: false, lastPingAt: null, lastPingOk: null } });
  assert.deepEqual(r.map((x) => x.id), ['active', 'not_active', 'offline', 'hr_sees']);
  const all = r.flatMap((x) => x.items).join('\n');
  assert.match(all, /submit an On-Duty request, even before it is approved/);
  assert.match(all, new RegExp(DEFAULT_DAY_END));
  assert.match(all, /days without an On-Duty request/);
  assert.match(all, /saved on your phone/);
  assert.match(all, /sent automatically/);
  assert.match(all, /Live location sharing is off for your account/);
  assert.doesNotMatch(all, /live map/);
});

test('rules: with HR sharing on, the 45 s app-open sharing and the live map are explained', () => {
  const all = trackingRules({ server: server(), hr: { enabledByHr: true, loopRunning: true, lastPingAt: null, lastPingOk: null } })
    .flatMap((x) => x.items)
    .join('\n');
  assert.match(all, /HR has turned on live location sharing/);
  assert.match(all, /does not run while the app is closed/);
  assert.match(all, /live map/);
  assert.doesNotMatch(all, new RegExp(DEFAULT_DAY_END)); // the track's own endsAt is used
});

test('nothing in the view offers a way to stop sharing', () => {
  const v = buildLiveStatus(
    input({ server: server({ consentRequired: true }), phone: phone({ permission: 'denied', locationEnabled: false, batteryOptimised: true, notificationsGranted: false }) }),
  );
  const words = [v.monitor.detail, v.share.detail, ...v.checks.map((c) => `${c.fixLabel ?? ''} ${c.hint ?? ''}`)].join(' ');
  assert.doesNotMatch(words, /\b(turn off|switch off sharing|stop sharing|disable)\b/i);
  assert.ok(v.needsAttention >= 4);
});
