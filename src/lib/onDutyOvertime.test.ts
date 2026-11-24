import test from 'node:test';
import assert from 'node:assert/strict';

import { otRows, otSummary, overtimeStage } from './onDutyOvertime.ts';

test('server OT punches first (rejected left out), then the ones saved on the phone, numbered in order', () => {
  const rows = otRows(
    [
      { sequence: 2, punchTime: '20:15:00', status: 'pending' },
      { sequence: 1, punchTime: '19:05:00', status: 'approved' },
      { sequence: 3, punchTime: '20:30:00', status: 'rejected' },
    ],
    [{ capturedAt: new Date(2026, 10, 24, 21, 0).getTime() }],
  );
  assert.deepEqual(rows.map((r) => [r.number, r.time, r.state]), [
    [1, '7:05 PM', 'approved'],
    [2, '8:15 PM', 'pending'],
    [3, '9:00 PM', 'saved'],
  ]);
});

test('the OT summary', () => {
  assert.equal(otSummary(80), '1 h 20 min past your Night Punch time');
  assert.equal(otSummary(0), null);
});

test('after the four: choose first, then OT; nothing while the four are not in or the day is closed', () => {
  assert.equal(overtimeStage({ allFourIn: true, open: true, continued: false, otCount: 0 }), 'choose');
  assert.equal(overtimeStage({ allFourIn: true, open: true, continued: true, otCount: 0 }), 'overtime');
  assert.equal(overtimeStage({ allFourIn: true, open: true, continued: false, otCount: 2 }), 'overtime');
  assert.equal(overtimeStage({ allFourIn: false, open: true, continued: true, otCount: 0 }), 'none');
  assert.equal(overtimeStage({ allFourIn: true, open: false, continued: true, otCount: 1 }), 'none');
});
