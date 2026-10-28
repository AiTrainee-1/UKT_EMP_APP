// Run with `npm test`. The on-phone upload queue: one device-wide sequence for points and events, contiguous upload windows,
// deletion only up to the acknowledged sequence, and recovery after the process dies (a closed and re-opened database file).
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createQueue } from './queue.ts';
import { openNodeSqlite } from './testing/nodeSqlite.ts';
import type { NewEvent, NewPoint } from './types.ts';

const point = (n: number, extra: Partial<NewPoint> = {}): NewPoint => ({
  recordedAt: 1_700_000_000_000 + n * 10_000,
  latitude: 11.0 + n / 10_000,
  longitude: 77.0 + n / 10_000,
  accuracy: 8,
  speed: 1.2,
  bearing: 90,
  altitude: 410,
  activity: 'walking',
  battery: 80,
  charging: false,
  network: 'cell',
  provider: 'fused',
  isMocked: false,
  ...extra,
});

const event = (n: number, kind: NewEvent['kind'] = 'GPS_OFF'): NewEvent => ({
  kind,
  startedAt: 1_700_000_000_000 + n * 10_000,
  latitude: 11,
  longitude: 77,
  meta: { n },
});

function tempFile(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'uktq-'));
  return { path: join(dir, 'tracking.db'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('points and events draw their sequence numbers from ONE device-wide, strictly increasing counter', async () => {
  const q = createQueue(openNodeSqlite());
  const a = await q.enqueuePoints([point(1), point(2)]);
  const e = await q.enqueueEvent(event(3));
  const b = await q.enqueuePoints([point(4)]);
  const f = await q.enqueueEvent(event(5, 'GPS_ON'));
  const all = [...a, e, ...b, f];
  assert.deepEqual(all, [...all].sort((x, y) => x - y));
  assert.equal(new Set(all).size, all.length);
  assert.equal(e, a[1] + 1);
  assert.equal(b[0], e + 1);
});

test('peekBatch returns the oldest rows in seq order, both kinds merged, without deleting them', async () => {
  const q = createQueue(openNodeSqlite());
  await q.enqueuePoints([point(1)]);
  await q.enqueueEvent(event(2));
  await q.enqueuePoints([point(3)]);
  const batch = await q.peekBatch();
  assert.ok(batch);
  assert.equal(batch.points.length, 2);
  assert.equal(batch.events.length, 1);
  assert.equal(batch.points[0].latitude, point(1).latitude);
  assert.equal(batch.events[0].kind, 'GPS_OFF');
  assert.deepEqual(batch.events[0].meta, { n: 2 });
  assert.equal(batch.hasMore, false);
  assert.equal(batch.minSeq, batch.points[0].seq);
  assert.equal(batch.maxSeq, batch.points[1].seq);
  // nothing was deleted
  const again = await q.peekBatch();
  assert.equal(again?.points.length, 2);
  assert.equal(await q.peekBatch({ maxPoints: 0, maxEvents: 0 }), null);
});

test('an empty queue has no batch', async () => {
  const q = createQueue(openNodeSqlite());
  assert.equal(await q.peekBatch(), null);
  assert.deepEqual(await q.counts(), { points: 0, events: 0, oldestPointAt: null, newestPointAt: null });
});

test('the upload window is CONTIGUOUS in seq: a cap on one kind never lets a later row of the other kind jump ahead', async () => {
  // seq order: p p p E p p  with a cap of 2 points per batch. Taking "2 points + the event" would skip the third point, and an
  // ack of the event's seq would then delete a point that was never sent.
  const q = createQueue(openNodeSqlite());
  const [p1, p2, p3] = await q.enqueuePoints([point(1), point(2), point(3)]);
  const ev = await q.enqueueEvent(event(4));
  await q.enqueuePoints([point(5), point(6)]);
  const batch = await q.peekBatch({ maxPoints: 2, maxEvents: 10 });
  assert.ok(batch);
  assert.deepEqual(batch.points.map((p) => p.seq), [p1, p2]);
  assert.equal(batch.events.length, 0, 'the event sits behind the third point, so it must wait');
  assert.equal(batch.maxSeq, p2);
  assert.equal(batch.hasMore, true);
  const next = await q.peekBatch({ maxPoints: 2, maxEvents: 10 });
  assert.equal(next?.points[0].seq, p1, 'peek does not consume');
  await q.ack(batch.maxSeq);
  const second = await q.peekBatch({ maxPoints: 2, maxEvents: 10 });
  assert.ok(second);
  assert.equal(second.points[0].seq, p3);
  assert.equal(second.events[0]?.seq, ev);
});

test('the event cap works the same way', async () => {
  const q = createQueue(openNodeSqlite());
  await q.enqueueEvent(event(1));
  await q.enqueueEvent(event(2));
  const p = (await q.enqueuePoints([point(3)]))[0];
  const batch = await q.peekBatch({ maxPoints: 5, maxEvents: 1 });
  assert.equal(batch?.events.length, 1);
  assert.equal(batch?.points.length, 0, 'the point is behind the second event');
  assert.ok(batch && batch.maxSeq < p);
});

test('ack deletes exactly the rows up to the acknowledged seq, in both tables, and nothing above it', async () => {
  const q = createQueue(openNodeSqlite());
  const [p1] = await q.enqueuePoints([point(1)]);
  const e1 = await q.enqueueEvent(event(2));
  const [p2, p3] = await q.enqueuePoints([point(3), point(4)]);
  const gone = await q.ack(e1);
  assert.deepEqual(gone, { points: 1, events: 1 });
  const left = await q.peekBatch();
  assert.deepEqual(left?.points.map((p) => p.seq), [p2, p3]);
  assert.equal(left?.events.length, 0);
  assert.ok(p1 < e1 && e1 < p2);
  // acking again (a re-sent batch's second response) is harmless
  assert.deepEqual(await q.ack(e1), { points: 0, events: 0 });
  assert.equal((await q.counts()).points, 2);
});

test('sequence numbers are never re-used after everything was acknowledged and deleted', async () => {
  const q = createQueue(openNodeSqlite());
  const seqs = await q.enqueuePoints([point(1), point(2), point(3)]);
  await q.ack(seqs[2]);
  assert.equal((await q.counts()).points, 0);
  const [after] = await q.enqueuePoints([point(4)]);
  assert.ok(after > seqs[2], 'a recycled number would be dropped by the server as a duplicate');
});

test('crash recovery: after the process dies the unacknowledged rows are still there, in order, and the counter goes on', async () => {
  const f = tempFile();
  try {
    let db = openNodeSqlite(f.path);
    let q = createQueue(db);
    const first = await q.enqueuePoints([point(1), point(2)]);
    await q.enqueueEvent(event(3));
    await q.ack(first[0]); // the first point was delivered, the second point and the event were not
    await q.setMeta('engine.heartbeat_at', '12345');
    db.close(); // "kill -9": no clean shutdown of the queue object

    db = openNodeSqlite(f.path);
    q = createQueue(db);
    const batch = await q.peekBatch();
    assert.ok(batch);
    assert.deepEqual(batch.points.map((p) => p.seq), [first[1]]);
    assert.equal(batch.events.length, 1);
    assert.ok(batch.events[0].seq > first[1]);
    assert.equal(await q.getMeta('engine.heartbeat_at'), '12345');
    const [next] = await q.enqueuePoints([point(9)]);
    assert.ok(next > batch.maxSeq, 'the counter carried on instead of restarting');
    db.close();
  } finally {
    f.cleanup();
  }
});

test('a re-created database seeds its counter from the clock, above everything a wiped database ever handed out', async () => {
  // The device id survives in SecureStore while the SQLite file can be wiped (clear data, corruption). A fresh file that
  // counted from 1 again would collide with rows the server already has under the same (employee, device, seq).
  const t0 = 1_800_000_000_000;
  const first = createQueue(openNodeSqlite(), { now: () => t0 });
  const old = await first.enqueuePoints(Array.from({ length: 50 }, (_, i) => point(i)));
  const fresh = createQueue(openNodeSqlite(), { now: () => t0 + 60_000 }); // a minute later, brand new file
  const [n] = await fresh.enqueuePoints([point(1)]);
  assert.ok(n > old[old.length - 1]);
  assert.equal(n, Math.floor((t0 + 60_000) / 1000) + 1);
});

test('when the queue overflows the OLDEST points are dropped and counted, events are kept', async () => {
  const q = createQueue(openNodeSqlite(), { maxPoints: 5 });
  const seqs = await q.enqueuePoints(Array.from({ length: 8 }, (_, i) => point(i)));
  await q.enqueueEvent(event(99));
  const counts = await q.counts();
  assert.equal(counts.points, 5);
  assert.equal(counts.events, 1);
  const batch = await q.peekBatch();
  assert.equal(batch?.points[0].seq, seqs[3], 'points 0..2 were the oldest');
  assert.equal(await q.getMeta('queue.dropped_points'), '3');
});

test('clear() drops queued rows but the counter keeps going', async () => {
  const q = createQueue(openNodeSqlite());
  const seqs = await q.enqueuePoints([point(1), point(2)]);
  await q.clear();
  assert.equal(await q.peekBatch(), null);
  const [n] = await q.enqueuePoints([point(3)]);
  assert.ok(n > seqs[1]);
});

test('meta: get / set / delete, JSON, compare-and-swap and prefix delete', async () => {
  const q = createQueue(openNodeSqlite());
  assert.equal(await q.getMeta('k'), null);
  await q.setMeta('k', 'v1');
  await q.setMeta('k', 'v2');
  assert.equal(await q.getMeta('k'), 'v2');
  await q.setMeta('k', null);
  assert.equal(await q.getMeta('k'), null);

  await q.setJson('j', { a: 1 });
  assert.deepEqual(await q.getJson('j'), { a: 1 });
  await q.setMeta('bad', '{not json');
  assert.equal(await q.getJson('bad'), null);

  // CAS: only one of two racing writers wins
  assert.equal(await q.casMeta('sig.gps', null, 'on'), true);
  assert.equal(await q.casMeta('sig.gps', null, 'on'), false, 'already set');
  assert.equal(await q.casMeta('sig.gps', 'on', 'off'), true);
  assert.equal(await q.casMeta('sig.gps', 'on', 'off'), false, 'someone else already moved it');
  assert.equal(await q.getMeta('sig.gps'), 'off');

  await q.setMeta('sig.net', 'on');
  await q.setMeta('other', 'x');
  await q.deleteMetaPrefix('sig.');
  assert.equal(await q.getMeta('sig.gps'), null);
  assert.equal(await q.getMeta('sig.net'), null);
  assert.equal(await q.getMeta('other'), 'x');
});

test('concurrent enqueues from the same context never interleave a point with a lost sequence number', async () => {
  const q = createQueue(openNodeSqlite());
  const results = await Promise.all([
    q.enqueuePoints([point(1), point(2), point(3)]),
    q.enqueueEvent(event(4)),
    q.enqueuePoints([point(5), point(6)]),
    q.enqueueEvent(event(7, 'GPS_ON')),
  ]);
  const flat = results.flat();
  assert.equal(new Set(flat).size, 7);
  const batch = await q.peekBatch();
  assert.equal(batch?.points.length, 5);
  assert.equal(batch?.events.length, 2);
});
