import test from 'node:test';
import assert from 'node:assert/strict';

import { dayPunchViews, earnedShiftHint, earnedShiftText, kindOf, prefillDate, time12 } from './dayPunches.ts';

test('every punch with its source, oldest first; waiting / rejected / OT read as such', () => {
  const views = dayPunchViews([
    { time: '08:58:00', type: 'IN', source: 'biometric', kind: 'biometric' },
    { time: '13:00:00', type: 'OUT', source: 'geo:auto', kind: 'geo' },
    { time: '14:00:00', type: 'IN', source: 'on_duty:pending', kind: 'on_duty', counted: false, verification: 'pending' },
    { time: '19:30:00', type: 'OT', source: 'on_duty_ot', sourceLabel: 'OT Punch 1', kind: 'ot', counted: false, verification: 'pending' },
  ]);
  assert.deepEqual(views.map((v) => [v.time, v.direction, v.source]), [
    ['8:58 AM', 'In', 'Biometric'],
    ['1:00 PM', 'Out', 'Geo Punch'],
    ['2:00 PM', 'In', 'On-Duty'],
    ['7:30 PM', 'OT', 'OT Punch 1'],
  ]);
  assert.equal(views[2].detail, 'Waiting for HR');
  assert.equal(views[2].counted, false);
  assert.equal(views[3].detail, 'Overtime · waiting for approval');
});

test('an older server: the plain punch list, the kind worked out from the source', () => {
  const views = dayPunchViews(undefined, [{ time: '09:00', type: 'IN', source: 'missing_punch:approved', sourceLabel: 'Missing Punch' }]);
  assert.equal(views[0].source, 'Missing Punch');
  assert.equal(kindOf({ source: 'manual' }), 'hr');
  assert.equal(time12('00:05'), '12:05 AM');
});

test('earned shift', () => {
  assert.equal(earnedShiftText(1), '1.00 shift');
  assert.equal(earnedShiftText('0.5'), '0.50 shift');
  assert.equal(earnedShiftText(1.5), '1.50 shifts');
  assert.equal(earnedShiftText(null), null);
  assert.equal(earnedShiftHint(0.5), 'Half day');
  assert.equal(earnedShiftHint(0), 'No shift earned');
});

test('a form opens on the day the employee came from, when the window still takes it', () => {
  const now = new Date(2026, 10, 24, 10, 0);
  assert.equal(prefillDate('2026-11-20', now), '2026-11-20');
  assert.equal(prefillDate('2026-10-30', now), null); // last month after the 5th: closed
  assert.equal(prefillDate('2026-11-28', now), null); // the future, for a punch / permission
  assert.equal(prefillDate('2026-11-28', now, { allowFuture: true }), '2026-11-28');
  assert.equal(prefillDate('nonsense', now), null);
  assert.equal(prefillDate(['2026-11-03'], now), '2026-11-03');
  assert.equal(prefillDate('2026-10-30', new Date(2026, 10, 3)), '2026-10-30'); // grace days
});
