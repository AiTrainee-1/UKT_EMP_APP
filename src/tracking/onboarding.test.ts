// Run with `npm test`. The tracking set-up state machine (consent -> location -> all the time -> notifications -> battery),
// the issue list behind the red banner, and the per-brand battery guides.
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKLOG_POINTS,
  SYNC_STUCK_AFTER_MS,
  bannerIssues,
  computeSetupSteps,
  isReadyToTrack,
  isSetupComplete,
  nextSetupStep,
  trackingIssues,
} from './onboarding.ts';
import type { HealthInput, SetupSnapshot } from './onboarding.ts';
import { appDetailsIntent, batteryOptimisationIntents, detectOem, oemGuide } from './oem.ts';

const snap = (over: Partial<SetupSnapshot> = {}): SetupSnapshot => ({
  platform: 'android',
  consentRequired: true,
  permission: 'denied',
  notificationsGranted: false,
  batteryOptimised: true,
  skipped: [],
  ...over,
});

const ids = (s: SetupSnapshot) => computeSetupSteps(s).map((x) => `${x.id}:${x.status}`);

test('a fresh employee: every step is to do, consent first', () => {
  assert.deepEqual(ids(snap()), ['consent:todo', 'foreground:todo', 'background:todo', 'notifications:todo', 'battery:todo']);
  assert.equal(nextSetupStep(computeSetupSteps(snap())), 'consent');
  assert.equal(isReadyToTrack(computeSetupSteps(snap())), false);
});

test('the steps are taken in order and the next one follows each completed step', () => {
  let s = snap({ consentRequired: false });
  assert.equal(nextSetupStep(computeSetupSteps(s)), 'foreground');
  s = { ...s, permission: 'while_using' };
  assert.equal(nextSetupStep(computeSetupSteps(s)), 'background');
  assert.equal(isReadyToTrack(computeSetupSteps(s)), true, 'consent + foreground location are all the engine needs');
  s = { ...s, permission: 'always' };
  assert.equal(nextSetupStep(computeSetupSteps(s)), 'notifications');
  s = { ...s, notificationsGranted: true };
  assert.equal(nextSetupStep(computeSetupSteps(s)), 'battery');
  s = { ...s, batteryOptimised: false };
  assert.equal(nextSetupStep(computeSetupSteps(s)), null);
  assert.equal(isSetupComplete(computeSetupSteps(s)), true);
});

test('"Allow all the time" is recommended, not required: it can be skipped and the flow moves on', () => {
  const s = snap({ consentRequired: false, permission: 'while_using', skipped: ['background'] });
  const steps = computeSetupSteps(s);
  assert.equal(steps.find((x) => x.id === 'background')?.status, 'skipped');
  assert.equal(steps.find((x) => x.id === 'background')?.required, false);
  assert.equal(nextSetupStep(steps), 'notifications');
});

test('consent and foreground location can never be skipped', () => {
  const steps = computeSetupSteps(snap({ skipped: ['consent', 'foreground'] }));
  assert.equal(steps.find((x) => x.id === 'consent')?.status, 'todo');
  assert.equal(steps.find((x) => x.id === 'foreground')?.status, 'todo');
});

test('a step that gets done after it was skipped shows as done', () => {
  const steps = computeSetupSteps(snap({ consentRequired: false, permission: 'always', skipped: ['background'] }));
  assert.equal(steps.find((x) => x.id === 'background')?.status, 'done');
});

test('unknown readings keep a step open instead of calling it done', () => {
  const steps = computeSetupSteps(snap({ consentRequired: null, notificationsGranted: null, batteryOptimised: null }));
  assert.equal(steps.find((x) => x.id === 'consent')?.status, 'todo');
  assert.equal(steps.find((x) => x.id === 'notifications')?.status, 'todo');
  assert.equal(steps.find((x) => x.id === 'battery')?.status, 'todo');
});

test('battery optimisation is an Android step only; a browser only has the notice', () => {
  assert.equal(computeSetupSteps(snap({ platform: 'ios' })).find((x) => x.id === 'battery')?.status, 'not_applicable');
  const web = computeSetupSteps(snap({ platform: 'web' }));
  assert.deepEqual(web.map((x) => x.id + ':' + x.status), ['consent:todo', 'foreground:not_applicable', 'background:not_applicable', 'notifications:not_applicable', 'battery:not_applicable']);
  assert.equal(nextSetupStep(web), 'consent');
  const accepted = computeSetupSteps(snap({ platform: 'web', consentRequired: false }));
  assert.equal(nextSetupStep(accepted), null);
  assert.equal(isSetupComplete(accepted), true);
});

// ------------------------------------------------------------------------------------------------ issues

const health = (over: Partial<HealthInput> = {}): HealthInput => ({
  platform: 'android',
  trackActive: true,
  consentRequired: false,
  permission: 'always',
  locationEnabled: true,
  notificationsGranted: true,
  batteryOptimised: false,
  powerSave: false,
  network: 'wifi',
  engineRunning: true,
  queuedPoints: 0,
  sinceLastSyncMs: 20_000,
  syncError: null,
  ...over,
});

const issueIds = (h: HealthInput) => trackingIssues(h).map((i) => `${i.severity}:${i.id}`);

test('a healthy phone has no issues', () => {
  assert.deepEqual(issueIds(health()), []);
});

test('without an active track nothing is wrong (no banner for people who are not on duty)', () => {
  assert.deepEqual(issueIds(health({ trackActive: false, permission: 'denied', locationEnabled: false, engineRunning: false })), []);
});

test('errors: consent missing, permission off, phone location off, the engine not running', () => {
  assert.deepEqual(issueIds(health({ consentRequired: true, engineRunning: false })), ['error:consent']);
  assert.deepEqual(issueIds(health({ permission: 'denied', engineRunning: false })), ['error:permission_denied']);
  assert.deepEqual(issueIds(health({ locationEnabled: false })), ['error:location_off']);
  assert.deepEqual(issueIds(health({ engineRunning: false })), ['error:engine_stopped']);
});

test('warnings: only-while-using, battery optimisation, notifications off, battery saver, no internet', () => {
  assert.deepEqual(
    issueIds(health({ permission: 'while_using', batteryOptimised: true, notificationsGranted: false, powerSave: true, network: 'none' })),
    ['warning:permission_while_using', 'warning:battery_optimised', 'warning:notifications_off', 'warning:power_save', 'warning:offline'],
  );
});

test('errors sort before warnings, and only errors reach the red banner', () => {
  const all = trackingIssues(health({ locationEnabled: false, permission: 'while_using', batteryOptimised: true }));
  assert.equal(all[0].severity, 'error');
  assert.deepEqual(bannerIssues(all).map((i) => i.id), ['location_off']);
});

test('"not syncing" needs: online, data waiting, and a long time since the last acknowledged upload', () => {
  assert.deepEqual(issueIds(health({ queuedPoints: 12, sinceLastSyncMs: SYNC_STUCK_AFTER_MS + 1 })), ['warning:sync_stuck']);
  assert.deepEqual(issueIds(health({ queuedPoints: 12, sinceLastSyncMs: SYNC_STUCK_AFTER_MS - 1 })), []);
  assert.deepEqual(issueIds(health({ queuedPoints: 0, sinceLastSyncMs: SYNC_STUCK_AFTER_MS * 5 })), []);
  assert.deepEqual(issueIds(health({ queuedPoints: 12, sinceLastSyncMs: SYNC_STUCK_AFTER_MS * 2, network: 'none' })), ['warning:offline']);
  assert.deepEqual(issueIds(health({ queuedPoints: 12, sinceLastSyncMs: SYNC_STUCK_AFTER_MS * 2, syncError: 'consent_required' })), []);
});

test('a big backlog is a warning even when the last sync was recent', () => {
  assert.deepEqual(issueIds(health({ queuedPoints: BACKLOG_POINTS })), ['warning:backlog']);
});

test('every issue says how to fix it', () => {
  const fixes = trackingIssues(health({ consentRequired: true, permission: 'while_using', locationEnabled: false, batteryOptimised: true, engineRunning: false })).map((i) => i.fix);
  assert.ok(fixes.includes('consent'));
  assert.ok(fixes.includes('battery'));
  assert.ok(fixes.includes('permission'));
});

test('on the web there is nothing to check', () => {
  assert.deepEqual(trackingIssues(health({ platform: 'web', permission: 'denied' })), []);
});

// ------------------------------------------------------------------------------------------------ brands

test('brand detection: Xiaomi family, Oppo family, Vivo family, Samsung, Huawei family, everything else', () => {
  assert.equal(detectOem('Redmi', 'Xiaomi'), 'xiaomi');
  assert.equal(detectOem('POCO', 'Xiaomi'), 'xiaomi');
  assert.equal(detectOem('realme', 'realme'), 'oppo');
  assert.equal(detectOem('OnePlus', 'OnePlus'), 'oppo');
  assert.equal(detectOem('OPPO', 'OPPO'), 'oppo');
  assert.equal(detectOem('iQOO', 'vivo'), 'vivo');
  assert.equal(detectOem('vivo', 'vivo'), 'vivo');
  assert.equal(detectOem('samsung', 'samsung'), 'samsung');
  assert.equal(detectOem('HONOR', 'HUAWEI'), 'huawei');
  assert.equal(detectOem('google', 'Google'), 'other');
  assert.equal(detectOem(null, null), 'other');
});

test('every brand guide has written steps naming the app, and ends with the App info fallback', () => {
  for (const key of ['xiaomi', 'oppo', 'vivo', 'samsung', 'huawei', 'other'] as const) {
    const g = oemGuide(key, 'net.uktex.employee', 'uktextiles');
    assert.ok(g.steps.length >= 2, key);
    assert.ok(g.steps.some((s) => s.includes('uktextiles')), `${key} steps name the app`);
    const last = g.intents[g.intents.length - 1];
    assert.deepEqual(last, appDetailsIntent('net.uktex.employee'), `${key} falls back to App info`);
  }
  const xiaomi = oemGuide('xiaomi', 'net.uktex.employee', 'uktextiles');
  assert.equal(xiaomi.intents[0].className, 'com.miui.permcenter.autostart.AutoStartManagementActivity');
  assert.deepEqual(xiaomi.intents[1].extra, { package_name: 'net.uktex.employee', package_label: 'uktextiles' });
});

test('the battery step asks the system dialog first, then the list, then App info', () => {
  const intents = batteryOptimisationIntents('net.uktex.employee');
  assert.deepEqual(
    intents.map((i) => i.action),
    [
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
      'android.settings.APPLICATION_DETAILS_SETTINGS',
    ],
  );
  assert.equal(intents[0].data, 'package:net.uktex.employee');
});
