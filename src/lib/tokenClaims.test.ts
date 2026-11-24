import test from 'node:test';
import assert from 'node:assert/strict';

import { readClaims, renewalDue, RENEW_WHEN_LEFT_MS } from './tokenClaims.ts';

function jwt(claims: object): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS256' })}.${enc(claims)}.sig`;
}

const NOW = 1_800_000_000_000;

test('reads the claims of a token, including a non-ASCII name', () => {
  assert.deepEqual(readClaims(jwt({ role: 'employee', name: 'Ránjith' })), { role: 'employee', name: 'Ránjith' });
  assert.equal(readClaims('not-a-token'), null);
  assert.equal(readClaims(null), null);
});

test('an old 7-day token is renewed at once (upgraded into a session)', () => {
  assert.equal(renewalDue(jwt({ role: 'employee', exp: NOW / 1000 + 6 * 86400 }), NOW), true);
});

test('a fresh session token is left alone; an ageing one is renewed', () => {
  const fresh = jwt({ role: 'employee', kind: 'employee_session', exp: (NOW + RENEW_WHEN_LEFT_MS + 86400_000) / 1000 });
  const ageing = jwt({ role: 'employee', kind: 'employee_session', exp: (NOW + RENEW_WHEN_LEFT_MS - 1000) / 1000 });
  assert.equal(renewalDue(fresh, NOW), false);
  assert.equal(renewalDue(ageing, NOW), true);
});

test('never for an HR or a malformed token', () => {
  assert.equal(renewalDue(jwt({ role: 'hr', exp: 1 }), NOW), false);
  assert.equal(renewalDue('x.y.z', NOW), false);
  assert.equal(renewalDue(null, NOW), false);
});
