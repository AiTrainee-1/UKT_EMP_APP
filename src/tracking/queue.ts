// The on-phone upload queue. Everything the collector records (GPS points AND events such as "GPS turned off") is written
// here first and only deleted after the server has acknowledged it, so nothing is lost to a dead signal, a crash or a
// killed app. Pure apart from the injected SqlDb (expo-sqlite on the phone, node:sqlite in the tests).
//
// Sequence numbers. Every point and every event gets a `seq` from ONE device-wide counter (the AUTOINCREMENT of
// `seq_log`), which the server stores as UNIQUE(employee, device, seq): that is what makes a re-sent batch harmless.
//  * AUTOINCREMENT never re-uses a number, even after the acknowledged rows are deleted (MAX(seq)+1 would).
//  * The counter is seeded with the current epoch SECONDS when the database is first created. The device id outlives the
//    database (it lives in SecureStore), so a re-created database must not start again at 1 and collide with rows the
//    server already has; a wipe is always at least a second apart from the last number handed out (fewer than one row is
//    written per second), so the new counter is always above the old one.
//  * A crash between taking a number and writing the row only burns a number: gaps are harmless, because uploads are
//    contiguous WINDOWS of the sequence (see peekBatch) and an ack deletes `seq <= ackSeq`.
import type { SqlDb, SqlValue } from './sql.ts';
import type { NewEvent, NewPoint, QueueBatch, QueuedEvent, QueuedPoint } from './types.ts';
import { BATCH_LIMITS, META, QUEUE_LIMITS } from './constants.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
CREATE TABLE IF NOT EXISTS seq_log (seq INTEGER PRIMARY KEY AUTOINCREMENT);
CREATE TABLE IF NOT EXISTS points (
  seq INTEGER PRIMARY KEY NOT NULL,
  recorded_at INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  speed REAL,
  bearing REAL,
  altitude REAL,
  activity TEXT NOT NULL,
  battery INTEGER,
  charging INTEGER,
  network TEXT NOT NULL,
  provider TEXT NOT NULL,
  mocked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  lat REAL,
  lng REAL,
  meta TEXT
);
`;

export interface QueueOptions {
  now?: () => number;
  maxPoints?: number;
  maxEvents?: number;
}

export interface QueueCounts {
  points: number;
  events: number;
  oldestPointAt: number | null;
  newestPointAt: number | null;
}

export interface TrackingQueue {
  enqueuePoints(points: NewPoint[]): Promise<number[]>;
  enqueueEvent(event: NewEvent): Promise<number>;
  /** The next contiguous window of rows (at most the given caps), or null when the queue is empty. Does not delete. */
  peekBatch(limits?: { maxPoints?: number; maxEvents?: number }): Promise<QueueBatch | null>;
  /** Deletes every row with seq <= upToSeq (both tables). */
  ack(upToSeq: number): Promise<{ points: number; events: number }>;
  counts(): Promise<QueueCounts>;
  /** Drops every queued row (not the counter, not the meta). */
  clear(): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;
  /** Compare-and-swap: sets `to` only if the stored value is `from` (null = absent). True when this caller won. */
  casMeta(key: string, from: string | null, to: string | null): Promise<boolean>;
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown): Promise<void>;
  deleteMetaPrefix(prefix: string): Promise<void>;
}

interface PointRow {
  seq: number;
  recorded_at: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  bearing: number | null;
  altitude: number | null;
  activity: string;
  battery: number | null;
  charging: number | null;
  network: string;
  provider: string;
  mocked: number;
}

interface EventRow {
  seq: number;
  kind: string;
  started_at: number;
  ended_at: number | null;
  lat: number | null;
  lng: number | null;
  meta: string | null;
}

function toPoint(r: PointRow): QueuedPoint {
  return {
    seq: r.seq,
    recordedAt: r.recorded_at,
    latitude: r.lat,
    longitude: r.lng,
    accuracy: r.accuracy,
    speed: r.speed,
    bearing: r.bearing,
    altitude: r.altitude,
    activity: r.activity as QueuedPoint['activity'],
    battery: r.battery,
    charging: r.charging == null ? null : r.charging === 1,
    network: r.network as QueuedPoint['network'],
    provider: r.provider as QueuedPoint['provider'],
    isMocked: r.mocked === 1,
  };
}

function toEvent(r: EventRow): QueuedEvent {
  let meta: Record<string, unknown> | null = null;
  if (r.meta) {
    try {
      meta = JSON.parse(r.meta);
    } catch {
      meta = null;
    }
  }
  return {
    seq: r.seq,
    kind: r.kind as QueuedEvent['kind'],
    startedAt: r.started_at,
    endedAt: r.ended_at,
    latitude: r.lat,
    longitude: r.lng,
    meta,
  };
}

const noop = () => undefined;

export function createQueue(db: SqlDb, options: QueueOptions = {}): TrackingQueue {
  const now = options.now ?? (() => Date.now());
  const maxPoints = options.maxPoints ?? QUEUE_LIMITS.maxPoints;
  const maxEvents = options.maxEvents ?? QUEUE_LIMITS.maxEvents;

  // One statement sequence at a time from this JS context (the statements of one logical operation must not interleave
  // with another operation's); SQLite itself serialises writers from other contexts.
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn);
    chain = run.then(noop, noop);
    return run;
  }

  let ready: Promise<void> | null = null;
  function ensureReady(): Promise<void> {
    if (!ready) {
      ready = (async () => {
        await db.exec('PRAGMA journal_mode = WAL;');
        await db.exec('PRAGMA busy_timeout = 5000;');
        await db.exec(SCHEMA);
        const seeded = await db.first<{ value: string }>('SELECT value FROM meta WHERE key = ?', [META.seqSeeded]);
        if (!seeded) {
          const base = Math.floor(now() / 1000);
          // INSERT OR IGNORE never lowers the counter, so a repeated seed (a crash before the flag below) is harmless.
          await db.run('INSERT OR IGNORE INTO seq_log(seq) VALUES (?)', [base]);
          await db.run('INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)', [META.seqSeeded, String(base)]);
        }
      })().catch((err) => {
        ready = null; // let the next call retry
        throw err;
      });
    }
    return ready;
  }

  const op = <T>(fn: () => Promise<T>): Promise<T> =>
    serial(async () => {
      await ensureReady();
      return fn();
    });

  async function nextSeq(): Promise<number> {
    const res = await db.run('INSERT INTO seq_log DEFAULT VALUES');
    return res.lastInsertRowId;
  }

  async function pruneOverflow(): Promise<void> {
    const c = await db.first<{ c: number }>('SELECT COUNT(*) AS c FROM points');
    const count = c?.c ?? 0;
    if (count > maxPoints) {
      const over = count - maxPoints;
      await db.run('DELETE FROM points WHERE seq IN (SELECT seq FROM points ORDER BY seq LIMIT ?)', [over]);
      const dropped = await db.first<{ value: string }>('SELECT value FROM meta WHERE key = ?', [META.droppedPoints]);
      const total = (dropped ? Number(dropped.value) || 0 : 0) + over;
      await db.run(
        'INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [META.droppedPoints, String(total)],
      );
    }
    const e = await db.first<{ c: number }>('SELECT COUNT(*) AS c FROM events');
    const eventCount = e?.c ?? 0;
    if (eventCount > maxEvents) {
      await db.run('DELETE FROM events WHERE seq IN (SELECT seq FROM events ORDER BY seq LIMIT ?)', [
        eventCount - maxEvents,
      ]);
    }
  }

  function getMeta(key: string): Promise<string | null> {
    return op(async () => {
      const row = await db.first<{ value: string | null }>('SELECT value FROM meta WHERE key = ?', [key]);
      return row?.value ?? null;
    });
  }

  function setMeta(key: string, value: string | null): Promise<void> {
    return op(async () => {
      if (value == null) {
        await db.run('DELETE FROM meta WHERE key = ?', [key]);
      } else {
        await db.run(
          'INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, value],
        );
      }
    });
  }

  return {
    enqueuePoints(points) {
      return op(async () => {
        const seqs: number[] = [];
        for (const p of points) {
          const seq = await nextSeq();
          await db.run(
            `INSERT INTO points(seq, recorded_at, lat, lng, accuracy, speed, bearing, altitude, activity, battery, charging, network, provider, mocked)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              seq,
              Math.round(p.recordedAt),
              p.latitude,
              p.longitude,
              p.accuracy,
              p.speed,
              p.bearing,
              p.altitude,
              p.activity,
              p.battery,
              p.charging == null ? null : p.charging ? 1 : 0,
              p.network,
              p.provider,
              p.isMocked ? 1 : 0,
            ],
          );
          seqs.push(seq);
        }
        if (points.length) await pruneOverflow();
        return seqs;
      });
    },

    enqueueEvent(event) {
      return op(async () => {
        const seq = await nextSeq();
        await db.run(
          'INSERT INTO events(seq, kind, started_at, ended_at, lat, lng, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            seq,
            event.kind,
            Math.round(event.startedAt),
            event.endedAt == null ? null : Math.round(event.endedAt),
            event.latitude ?? null,
            event.longitude ?? null,
            event.meta ? JSON.stringify(event.meta) : null,
          ],
        );
        await pruneOverflow();
        return seq;
      });
    },

    peekBatch(limits = {}) {
      return op(async () => {
        const capPoints = Math.max(0, limits.maxPoints ?? BATCH_LIMITS.maxPoints);
        const capEvents = Math.max(0, limits.maxEvents ?? BATCH_LIMITS.maxEvents);
        // One extra row of each kind so we can tell whether the window stops at a cap.
        const pointRows = await db.all<PointRow>('SELECT * FROM points ORDER BY seq LIMIT ?', [capPoints + 1]);
        const eventRows = await db.all<EventRow>('SELECT * FROM events ORDER BY seq LIMIT ?', [capEvents + 1]);
        if (pointRows.length === 0 && eventRows.length === 0) return null;

        // Merge by seq and stop at the first row that would exceed its cap: the window stays contiguous in `seq`, which is
        // what makes "delete everything up to the server's ackSeq" safe (no later, unsent row can sit below it).
        const points: QueuedPoint[] = [];
        const events: QueuedEvent[] = [];
        let pi = 0;
        let ei = 0;
        while (pi < pointRows.length || ei < eventRows.length) {
          const nextPoint = pi < pointRows.length ? pointRows[pi] : null;
          const nextEvent = ei < eventRows.length ? eventRows[ei] : null;
          const takePoint = nextPoint != null && (nextEvent == null || nextPoint.seq < nextEvent.seq);
          if (takePoint) {
            if (points.length >= capPoints) break;
            points.push(toPoint(nextPoint));
            pi++;
          } else if (nextEvent) {
            if (events.length >= capEvents) break;
            events.push(toEvent(nextEvent));
            ei++;
          }
        }
        const taken = points.length + events.length;
        if (taken === 0) return null;
        const seqs = [...points.map((p) => p.seq), ...events.map((e) => e.seq)];
        return {
          points,
          events,
          minSeq: Math.min(...seqs),
          maxSeq: Math.max(...seqs),
          hasMore: pointRows.length + eventRows.length > taken,
        };
      });
    },

    ack(upToSeq) {
      return op(async () => {
        const p = await db.run('DELETE FROM points WHERE seq <= ?', [upToSeq]);
        const e = await db.run('DELETE FROM events WHERE seq <= ?', [upToSeq]);
        await db.run('DELETE FROM seq_log WHERE seq <= ?', [upToSeq]);
        return { points: p.changes, events: e.changes };
      });
    },

    counts() {
      return op(async () => {
        const p = await db.first<{ c: number; o: number | null; n: number | null }>(
          'SELECT COUNT(*) AS c, MIN(recorded_at) AS o, MAX(recorded_at) AS n FROM points',
        );
        const e = await db.first<{ c: number }>('SELECT COUNT(*) AS c FROM events');
        return {
          points: p?.c ?? 0,
          events: e?.c ?? 0,
          oldestPointAt: p?.o ?? null,
          newestPointAt: p?.n ?? null,
        };
      });
    },

    clear() {
      return op(async () => {
        await db.run('DELETE FROM points');
        await db.run('DELETE FROM events');
        await db.run('DELETE FROM seq_log');
      });
    },

    getMeta,
    setMeta,
    casMeta(key, from, to) {
      return op(async () => {
        let res;
        if (from == null) {
          if (to == null) return true;
          res = await db.run('INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)', [key, to]);
        } else if (to == null) {
          res = await db.run('DELETE FROM meta WHERE key = ? AND value = ?', [key, from]);
        } else {
          res = await db.run('UPDATE meta SET value = ? WHERE key = ? AND value = ?', [to, key, from] as SqlValue[]);
        }
        return res.changes === 1;
      });
    },

    async getJson<T>(key: string): Promise<T | null> {
      const raw = await getMeta(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },

    setJson(key, value) {
      return setMeta(key, JSON.stringify(value));
    },

    deleteMetaPrefix(prefix) {
      return op(async () => {
        await db.run('DELETE FROM meta WHERE key LIKE ?', [`${prefix}%`]);
      });
    },
  };
}
