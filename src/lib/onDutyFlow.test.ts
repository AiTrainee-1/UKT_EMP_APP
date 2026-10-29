// Run with `npm test`. The On-Duty page as one process: seven steps (request, approval & tracking, four geo-punches, done) and
// which of them is done, current, upcoming, rejected or skipped; any open punch slot stays recordable (any order).
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFlow } from './onDutyFlow.ts';
import type { FlowInput, FlowSession, FlowSlot, FlowVerification } from './onDutyFlow.ts';

const verification = (n: number, status: FlowVerification['status'] = 'approved'): FlowVerification => ({
  punchDate: '2026-10-28', punchTime: `09:0${n}:00`, status, latitude: 11.1085, longitude: 77.3411, accuracyM: 14.5,
});

/** Four slots; `filled` maps punch number -> the verification already recorded in it. */
const slotsOf = (filled: Record<number, FlowVerification | 'recorded'> = {}): FlowSlot[] =>
  [1, 2, 3, 4].map((n) => {
    const f = filled[n];
    const v = f && f !== 'recorded' ? f : null;
    return {
      punchNumber: n,
      punchType: n % 2 ? 'IN' : 'OUT',
      status: f === 'recorded' ? 'recorded' : v ? (v.status === 'approved' ? 'approved' : v.status === 'pending' ? 'pending' : 'available') : 'available',
      available: !f || (v != null && v.status === 'rejected'),
      verification: v,
    } as FlowSlot;
  });

const session = (over: Partial<FlowSession> = {}): FlowSession => ({
  status: 'active', destination: 'ABC Textiles', isProvisional: false, createdAt: '2026-10-28T03:30:00Z', startedAt: '2026-10-28T03:30:00Z',
  completedAt: null, completionReason: null, ...over,
});

const input = (over: Partial<FlowInput> = {}): FlowInput => ({
  session: session(), slots: slotsOf(), composing: false, approvalWaiting: null, photos: 2, trackingOn: true, trackingProblem: false, ...over,
});

const states = (f: ReturnType<typeof buildFlow>) => f.steps.map((s) => s.state);

test('there are always seven steps in the same order', () => {
  const f = buildFlow(input());
  assert.deepEqual(f.steps.map((s) => s.key), ['request', 'approval', 'punch1', 'punch2', 'punch3', 'punch4', 'done']);
  assert.deepEqual(f.steps.map((s) => s.index), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(f.total, 7);
});

test('no request yet: step 1 is the current one and everything after it waits', () => {
  const f = buildFlow(input({ session: null, slots: [] }));
  assert.deepEqual(states(f), ['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(f.current, 'request');
  assert.equal(f.headline, 'Step 1 of 7');
  assert.equal(f.nextPunch, null);
  assert.equal(f.steps[2].recordable, false, 'nothing can be recorded before a request exists');
  assert.match(f.steps[2].note, /2 photos and your location/);
  assert.match(buildFlow(input({ session: null, slots: [], photos: 1 })).steps[2].note, /a photo and your location/);
});

test('a request waiting for approval (an older backend): step 2 is current and no punch can be recorded yet', () => {
  const f = buildFlow(input({ session: session({ status: 'pending_hr' }), approvalWaiting: 'Waiting for HR' }));
  assert.deepEqual(states(f), ['done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(f.steps[1].note, 'Waiting for HR');
  assert.ok(f.steps.slice(2, 6).every((s) => !s.recordable));
  assert.match(f.steps[2].note, /opens once your request is approved/);
  assert.equal(f.headline, 'Step 2 of 7');
  assert.equal(buildFlow(input({ session: session({ status: 'pending_hod' }) })).steps[1].note, 'Waiting for approval');
});

test('just submitted (active, nothing punched): approval & tracking is done and Geo-punch 1 is the current step', () => {
  const f = buildFlow(input());
  assert.deepEqual(states(f), ['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(f.current, 'punch1');
  assert.equal(f.nextPunch, 1);
  assert.equal(f.headline, 'Step 3 of 7');
  assert.equal(f.steps[0].note, 'ABC Textiles');
  assert.ok(f.steps[0].time, 'the request time is shown');
  assert.equal(f.steps[1].note, 'Route is being recorded');
  assert.equal(f.steps[1].warn, false);
  assert.ok(f.steps.slice(2, 6).every((s) => s.recordable), 'every open slot can be recorded');
});

test('two punches in: they are done with time, place and status, and punch 3 is current', () => {
  const f = buildFlow(input({ slots: slotsOf({ 1: verification(1), 2: verification(2, 'pending') }) }));
  assert.deepEqual(states(f), ['done', 'done', 'done', 'done', 'current', 'upcoming', 'upcoming']);
  assert.equal(f.punchesDone, 2);
  assert.equal(f.nextPunch, 3);
  assert.equal(f.current, 'punch3');
  assert.equal(f.steps[2].badge?.label, 'Approved');
  assert.equal(f.steps[3].badge?.label, 'Pending approval');
  assert.equal(f.steps[2].place, '11.1085, 77.3411');
  assert.ok(f.steps[2].time, 'the punch time is shown (read as IST, then in the phone zone)');
  assert.equal(f.steps[2].note, 'Check-In');
  assert.equal(f.steps[3].note, 'Check-Out');
});

test('punches can be recorded in any order: with 2 and 4 in, the lowest open slot (1) is current and 3 stays recordable', () => {
  const f = buildFlow(input({ slots: slotsOf({ 2: verification(2), 4: verification(4) }) }));
  assert.deepEqual(states(f), ['done', 'done', 'current', 'done', 'upcoming', 'done', 'upcoming']);
  assert.equal(f.nextPunch, 1);
  assert.equal(f.steps[4].recordable, true, 'punch 3 is still open');
  assert.equal(f.punchesDone, 2);
});

test('a slot filled from the biometric device or Office Geo Punch is done ("already recorded"), not offered again', () => {
  const f = buildFlow(input({ slots: slotsOf({ 1: 'recorded' }) }));
  assert.equal(f.steps[2].state, 'done');
  assert.equal(f.steps[2].note, 'Check-In · already recorded');
  assert.equal(f.steps[2].recordable, false);
  assert.equal(f.current, 'punch2');
});

test('a punch HR rejected is open again: it is the current step, marked Rejected, and can be recorded again', () => {
  const f = buildFlow(input({ slots: slotsOf({ 1: verification(1), 2: verification(2, 'rejected') }) }));
  assert.equal(f.current, 'punch2');
  assert.equal(f.steps[3].badge?.label, 'Rejected');
  assert.equal(f.steps[3].badge?.tone, 'red');
  assert.match(f.steps[3].note, /Record it again/);
  assert.equal(f.steps[3].recordable, true);
  assert.equal(f.punchesDone, 1);
  // a rejected punch that is not the lowest open slot stays a problem step, still recordable
  const g = buildFlow(input({ slots: slotsOf({ 2: verification(2, 'rejected') }) }));
  assert.deepEqual([g.steps[2].state, g.steps[3].state], ['current', 'problem']);
  assert.equal(g.steps[3].recordable, true);
});

test('all four in while the session is still active: the Done step is the current one', () => {
  const all = { 1: verification(1), 2: verification(2), 3: verification(3), 4: verification(4, 'pending') };
  const f = buildFlow(input({ slots: slotsOf(all) }));
  assert.deepEqual(states(f), ['done', 'done', 'done', 'done', 'done', 'done', 'current']);
  assert.equal(f.current, 'done');
  assert.equal(f.nextPunch, null);
  assert.match(f.steps[6].note, /All 4 punches for today are in/);
});

test('a session still waiting for approval but already punchable (provisional) says so and lets the employee carry on', () => {
  const f = buildFlow(input({ session: session({ isProvisional: true }), approvalWaiting: 'Waiting for your Department Head' }));
  assert.equal(f.steps[1].state, 'done');
  assert.match(f.steps[1].note, /Waiting for your Department Head/);
  assert.match(f.steps[1].note, /You can keep punching/);
  assert.equal(f.current, 'punch1');
});

test('tracking trouble marks step 2 with a warning but never blocks a punch', () => {
  const f = buildFlow(input({ trackingProblem: true }));
  assert.equal(f.steps[1].state, 'done');
  assert.equal(f.steps[1].warn, true);
  assert.match(f.steps[1].note, /not being recorded/);
  assert.equal(f.current, 'punch1');
  // and with tracking switched off for this employee nothing about a route is claimed
  assert.equal(buildFlow(input({ trackingOn: false })).steps[1].note, 'Approved');
});

test('completed: every step is finished, with the way it ended; open slots read "not recorded"', () => {
  const done = session({ status: 'completed', completedAt: '2026-10-28T05:26:00Z', completionReason: 'auto_4th_punch' });
  const all = { 1: verification(1), 2: verification(2), 3: verification(3), 4: verification(4) };
  const f = buildFlow(input({ session: done, slots: slotsOf(all) }));
  assert.deepEqual(states(f), ['done', 'done', 'done', 'done', 'done', 'done', 'done']);
  assert.equal(f.current, null);
  assert.equal(f.headline, 'Completed');
  assert.equal(f.steps[6].note, 'Ended automatically after all 4 punches');
  assert.equal(f.steps[1].note, 'Route recording has stopped');
  // ended early by the employee with only two punches
  const early = buildFlow(input({ session: session({ status: 'completed', completionReason: 'manual', completedAt: '2026-10-28T05:00:00Z' }), slots: slotsOf({ 1: verification(1), 2: verification(2) }) }));
  assert.deepEqual(states(early), ['done', 'done', 'done', 'done', 'skipped', 'skipped', 'done']);
  assert.equal(early.steps[4].note, 'Check-In · not recorded');
  assert.equal(early.steps[6].note, 'You marked it Done');
  assert.equal(early.punchesDone, 2);
});

test('rejected: step 2 is the problem and the rest will not happen', () => {
  const f = buildFlow(input({ session: session({ status: 'rejected' }), slots: slotsOf({ 1: verification(1) }) }));
  assert.deepEqual(states(f), ['done', 'problem', 'done', 'skipped', 'skipped', 'skipped', 'skipped']);
  assert.equal(f.current, null);
  assert.equal(f.headline, 'Request rejected');
  assert.equal(f.steps[1].badge?.label, 'Rejected');
  assert.ok(f.steps.every((s) => !s.recordable));
});

test('composing a new request after one has ended brings step 1 back as the current step', () => {
  const ended = session({ status: 'completed', completedAt: '2026-10-28T05:00:00Z', completionReason: 'manual' });
  const f = buildFlow(input({ session: ended, composing: true }));
  assert.equal(f.current, 'request');
  assert.equal(f.steps[0].state, 'current');
  assert.ok(f.steps.slice(2, 6).every((s) => !s.recordable));
});

test('the server sent no slots yet: the four slots are still laid out as open, IN/OUT/IN/OUT', () => {
  const f = buildFlow(input({ slots: [] }));
  assert.deepEqual(f.steps.slice(2, 6).map((s) => s.punchType), ['IN', 'OUT', 'IN', 'OUT']);
  assert.equal(f.nextPunch, 1);
});
