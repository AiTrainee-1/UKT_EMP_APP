import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPunchTiles, clock12, durationText, endSummary } from './onDutyPunches.ts';

const slot = (n: number, extra: object = {}) => ({
  punchNumber: n,
  punchType: (n % 2 ? 'IN' : 'OUT') as 'IN' | 'OUT',
  status: 'available',
  available: true,
  ...extra,
});

test('names and expected times come from the server, with the usual day as the fallback', () => {
  const tiles = buildPunchTiles({
    slots: [slot(1, { name: 'Morning Punch', expectedTime: '08:30', expectedSource: 'shift' }), slot(2), slot(3), slot(4)],
    canPunch: true,
  });
  assert.deepEqual(tiles.map((t) => t.name), ['Morning Punch', 'Lunch Out', 'Lunch In', 'Night Punch']);
  assert.equal(tiles[0].expected, '8:30 AM');
  assert.equal(tiles[0].expectedFromShift, true);
  assert.equal(tiles[3].expected, '6:00 PM');
  assert.equal(tiles[1].expectedFromShift, false);
});

test('every open punch is selectable, in any order (the Night Punch before the others)', () => {
  const tiles = buildPunchTiles({ slots: [slot(1), slot(2), slot(3), slot(4)], canPunch: true });
  assert.ok(tiles.every((t) => t.selectable));
  const ended = buildPunchTiles({ slots: [slot(1), slot(2), slot(3), slot(4)], canPunch: false });
  assert.ok(ended.every((t) => !t.selectable));
});

test('done, waiting, saved on the phone and rejected punches read as such', () => {
  const tiles = buildPunchTiles({
    slots: [
      slot(1, { available: false, status: 'recorded', punchTime: '09:02:00', punchSource: 'biometric' }),
      slot(2, { available: false, status: 'pending', punchTime: '13:05:00' }),
      slot(3),
      slot(4),
    ],
    verifications: [{ punchNumber: 3, punchTime: '14:00:00', status: 'rejected', hrReviewComment: 'Blurred photo' }],
    queued: [{ punchNumber: 4, capturedAt: new Date(2026, 10, 24, 18, 10).getTime() }],
    canPunch: true,
  });
  assert.equal(tiles[0].state, 'done');
  assert.equal(tiles[0].statusLabel, 'Recorded by the biometric');
  assert.equal(tiles[0].time, '9:02 AM');
  assert.equal(tiles[1].statusLabel, 'Waiting for HR');
  assert.equal(tiles[2].state, 'open');
  assert.match(tiles[2].note ?? '', /Blurred photo/);
  assert.equal(tiles[3].state, 'saved');
  assert.equal(tiles[3].time, '6:10 PM');
  assert.equal(tiles[3].selectable, false);
});

test('the end summary names what is missing and how long the day ran', () => {
  const tiles = buildPunchTiles({
    slots: [slot(1, { available: false, status: 'pending' }), slot(2), slot(3), slot(4)],
    canPunch: true,
  });
  const s = endSummary(tiles, '2026-11-24T09:00:00Z', Date.parse('2026-11-24T12:30:00Z'));
  assert.equal(s.done.length, 1);
  assert.equal(s.missingNames, 'Lunch Out, Lunch In and Night Punch');
  assert.equal(durationText(s.durationMs), '3 h 30 min');
  assert.equal(durationText(40_000), 'less than a minute');
  assert.equal(durationText(null), '—');
});

test('clock12', () => {
  assert.equal(clock12('00:05'), '12:05 AM');
  assert.equal(clock12('12:00:59'), '12:00 PM');
  assert.equal(clock12('bad'), null);
});
