// The offline queue: storage, what each answer means, and the sync pass (src/offline).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { classifySend, MAX_SERVER_ERROR_TRIES, newOpId, nextTryDelayMs, serverMessage } from './classify.ts';
import { createOfflineQueue } from './queue.ts';
import { runSyncPass } from './syncCore.ts';
import type { SendOutcome } from './classify.ts';
import type { QueuedOp } from './types.ts';
import { openNodeSqlite } from '../tracking/testing/nodeSqlite.ts';

const EMP = 42;

function leave(label = 'Leave', createdAt?: number) {
  return { employeeId: EMP, kind: 'leave.apply', label, method: 'POST' as const, url: '/leave-requests', body: { a: 1 }, createdAt };
}

test('only a 2xx is done; no answer, busy and down servers are retried', () => {
  assert.deepEqual(classifySend({ status: 201 }), { kind: 'done' });
  assert.equal(classifySend({ noResponse: true }).kind, 'retry');
  for (const status of [408, 429, 502, 503, 504]) assert.equal(classifySend({ status }).kind, 'retry', String(status));
  assert.equal(classifySend({ status: 409, data: { code: 'request_in_progress' } }).kind, 'retry');
  assert.equal(classifySend({ status: 401 }).kind, 'auth');
});

test('a refusal keeps the server words; an HTML 404 from a Wi-Fi page is retried', () => {
  assert.deepEqual(classifySend({ status: 400, data: { error: 'Reason is required' } }), {
    kind: 'failed',
    message: 'Reason is required',
  });
  assert.deepEqual(classifySend({ status: 409, data: { error: 'Already decided', code: 'not_pending' } }), {
    kind: 'failed',
    message: 'Already decided',
  });
  assert.equal(classifySend({ status: 404, data: '<html>login</html>' }).kind, 'retry');
  assert.equal(serverMessage(undefined, 418), 'The server could not accept this (error 418).');
});

test('a 500 is retried a few times, then marked failed', () => {
  assert.equal(classifySend({ status: 500 }, 0).kind, 'retry');
  assert.equal(classifySend({ status: 500 }, MAX_SERVER_ERROR_TRIES - 1).kind, 'failed');
});

test('backoff grows and is capped at 15 minutes; ids are unique', () => {
  assert.equal(nextTryDelayMs(1), 30_000);
  assert.equal(nextTryDelayMs(2), 60_000);
  assert.equal(nextTryDelayMs(20), 15 * 60_000);
  const ids = new Set(Array.from({ length: 200 }, () => newOpId()));
  assert.equal(ids.size, 200);
});

test('the queue keeps order, survives a restart, and deletes only what was confirmed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'offline-'));
  const file = join(dir, 'q.db');
  try {
    let db = openNodeSqlite(file);
    let q = createOfflineQueue(db);
    const a = await q.enqueue(leave('A', 1000));
    const b = await q.enqueue(leave('B', 2000));
    await q.enqueue({ ...leave('Other', 1500), employeeId: 7 });
    assert.equal(a.idempotencyKey, a.id);
    db.close();

    // the app was killed: everything is still there
    db = openNodeSqlite(file);
    q = createOfflineQueue(db);
    assert.deepEqual((await q.list(EMP)).map((o) => o.label), ['A', 'B']);
    assert.deepEqual(await q.counts(EMP), { pending: 2, failed: 0 });

    await q.markFailed(a.id, 'No', 5000);
    assert.deepEqual(await q.counts(EMP), { pending: 1, failed: 1 });
    assert.deepEqual((await q.due(EMP, 10_000)).map((o) => o.id), [b.id]);
    await q.markRetry(b.id, 'offline', 5000, 60_000);
    assert.equal((await q.due(EMP, 10_000)).length, 0);
    assert.equal((await q.due(EMP, 60_000)).length, 1);

    await q.retryNow(a.id);
    assert.equal((await q.get(a.id))?.status, 'pending');
    await q.markDone(a.id);
    assert.equal(await q.get(a.id), null);
    const discarded = await q.discard(b.id);
    assert.equal(discarded?.label, 'B');
    assert.equal((await q.list(EMP)).length, 0);
    assert.equal((await q.list(7)).length, 1);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function scenario(answers: SendOutcome[]) {
  const db = openNodeSqlite();
  const queue = createOfflineQueue(db);
  for (let i = 0; i < answers.length; i++) await queue.enqueue(leave(`op${i}`, 1000 + i));
  const sentKeys: string[] = [];
  const done: string[] = [];
  let call = 0;
  const result = await runSyncPass({
    queue,
    employeeId: EMP,
    now: () => 50_000,
    send: async (op: QueuedOp) => {
      sentKeys.push(op.idempotencyKey);
      const answer = answers[call++];
      if (!answer) throw new Error('network');
      return answer;
    },
    onDone: (op) => {
      done.push(op.label);
    },
  });
  return { result, queue, sentKeys, done, db };
}

test('a sync pass sends oldest first and removes what the server took', async () => {
  const { result, queue, done } = await scenario([{ status: 201 }, { status: 200 }]);
  assert.deepEqual(done, ['op0', 'op1']);
  assert.deepEqual(result, { sent: 2, failed: 0, stoppedBy: null, remaining: 0 });
  assert.equal((await queue.list(EMP)).length, 0);
});

test('no connection stops the pass and keeps the rest in order', async () => {
  const { result, queue } = await scenario([{ status: 201 }, { noResponse: true }, { status: 201 }]);
  assert.equal(result.sent, 1);
  assert.equal(result.stoppedBy, 'retry');
  const left = await queue.list(EMP);
  assert.deepEqual(left.map((o) => o.label), ['op1', 'op2']);
  assert.equal(left[0].attempts, 1);
  assert.ok(left[0].nextTryAt > 50_000);
});

test('a refusal is kept as failed and the next one still goes', async () => {
  const { result, queue } = await scenario([{ status: 400, data: { error: 'Bad date' } }, { status: 201 }]);
  assert.deepEqual(result, { sent: 1, failed: 1, stoppedBy: null, remaining: 0 });
  const [failed] = await queue.list(EMP);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.lastError, 'Bad date');
});

test('a 401 stops the pass and deletes nothing', async () => {
  const { result, queue } = await scenario([{ status: 401 }, { status: 201 }]);
  assert.equal(result.stoppedBy, 'auth');
  assert.equal((await queue.list(EMP)).length, 2);
});

test('the same operation is always sent with the same Idempotency-Key', async () => {
  const db = openNodeSqlite();
  const queue = createOfflineQueue(db);
  const op = await queue.enqueue(leave('x', 1));
  const keys: string[] = [];
  const deps = {
    queue,
    employeeId: EMP,
    now: () => 10_000_000,
    send: async (o: QueuedOp) => {
      keys.push(o.idempotencyKey);
      return keys.length === 1 ? { noResponse: true } : { status: 201 };
    },
  };
  await runSyncPass(deps);
  await queue.retryNow(op.id);
  await runSyncPass(deps);
  assert.deepEqual(keys, [op.idempotencyKey, op.idempotencyKey]);
  assert.equal((await queue.list(EMP)).length, 0);
});
