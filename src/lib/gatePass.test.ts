import test from 'node:test';
import assert from 'node:assert/strict';

import { gatePassFileName, gatePassView } from './gatePass.ts';

test('a pass waiting for approval never shows a QR, even if one was sent (On-Duty or manual)', () => {
  for (const source of ['on_duty', 'manual']) {
    const v = gatePassView({ id: 1, status: 'pending', source, qrToken: 'P.abc' });
    assert.equal(v.state, 'waiting');
    assert.equal(v.qr, null);
    assert.equal(v.awaitingApproval, true);
    assert.equal(v.title, 'Pending approval');
  }
});

test('a manual pass waiting for approval has no QR yet', () => {
  const v = gatePassView({ id: 2, status: 'pending', source: 'manual' });
  assert.equal(v.state, 'waiting');
  assert.equal(v.qr, null);
});

test('approved with a QR is valid; rejected never shows one', () => {
  assert.equal(gatePassView({ id: 3, status: 'approved', source: 'manual', qrToken: 'P.x' }).state, 'valid');
  const rejected = gatePassView({ id: 4, status: 'rejected', source: 'on_duty', qrToken: 'P.x' });
  assert.equal(rejected.state, 'rejected');
  assert.equal(rejected.qr, null);
  assert.equal(rejected.title, 'On-Duty not approved');
});

test('out, return QR, back in', () => {
  assert.equal(gatePassView({ id: 5, status: 'approved', exitedAt: '2026-11-24T10:00:00Z' }).state, 'out');
  const ret = gatePassView({ id: 5, status: 'approved', exitedAt: 'x', returnQrToken: 'R.y' });
  assert.equal(ret.state, 'return-ready');
  assert.equal(ret.qr?.kind, 'return');
  assert.equal(gatePassView({ id: 5, status: 'approved', exitedAt: 'x', enteredAt: 'y' }).state, 'returned');
});

test('an approved pass without a QR any more has expired', () => {
  const v = gatePassView({ id: 6, status: 'approved', source: 'on_duty' });
  assert.equal(v.state, 'expired');
  assert.equal(v.live, false);
});

test('file name', () => {
  assert.equal(gatePassFileName({ id: 77 }), 'gate-pass-OUT-77.png');
});
