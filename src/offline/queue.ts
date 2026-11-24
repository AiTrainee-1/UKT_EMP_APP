// The on-phone queue of operations made while the server could not be reached (src/offline). Pure apart from the
// injected SqlDb (expo-sqlite on the phone, node:sqlite in the tests): every write is one SQL statement, so a crash or a
// killed app never leaves half an operation behind, and a row is deleted ONLY when the server confirmed it (markDone).
import type { SqlDb } from '../tracking/sql.ts';
import { newOpId } from './classify.ts';
import type { NewOp, OpFile, QueueCounts, QueuedOp } from './types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ops (
  id TEXT PRIMARY KEY NOT NULL,
  employee_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  body TEXT,
  files TEXT NOT NULL DEFAULT '[]',
  invalidate TEXT NOT NULL DEFAULT '[]',
  meta TEXT NOT NULL DEFAULT '{}',
  idem_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_tried_at INTEGER,
  next_try_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ops_by_employee ON ops (employee_id, status, created_at);
`;

interface OpRow {
  id: string;
  employee_id: number;
  kind: string;
  label: string;
  method: string;
  url: string;
  body: string | null;
  files: string;
  invalidate: string;
  meta: string;
  idem_key: string;
  created_at: number;
  status: string;
  attempts: number;
  last_error: string | null;
  last_tried_at: number | null;
  next_try_at: number;
}

function parse<T>(text: string | null, fallback: T): T {
  if (text === null || text === undefined) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function fromRow(row: OpRow): QueuedOp {
  return {
    id: row.id,
    employeeId: Number(row.employee_id),
    kind: row.kind,
    label: row.label,
    method: row.method as QueuedOp['method'],
    url: row.url,
    body: parse<Record<string, unknown> | null>(row.body, null),
    files: parse<OpFile[]>(row.files, []),
    invalidate: parse<unknown[][]>(row.invalidate, []),
    meta: parse<Record<string, unknown>>(row.meta, {}),
    idempotencyKey: row.idem_key,
    createdAt: Number(row.created_at),
    status: row.status === 'failed' ? 'failed' : 'pending',
    attempts: Number(row.attempts),
    lastError: row.last_error,
    lastTriedAt: row.last_tried_at === null ? null : Number(row.last_tried_at),
    nextTryAt: Number(row.next_try_at),
  };
}

export interface OfflineQueue {
  enqueue(op: NewOp): Promise<QueuedOp>;
  get(id: string): Promise<QueuedOp | null>;
  /** Every operation of the employee, oldest first. */
  list(employeeId: number): Promise<QueuedOp[]>;
  /** The pending operations due now, oldest first (the sync order). */
  due(employeeId: number, now: number): Promise<QueuedOp[]>;
  counts(employeeId: number): Promise<QueueCounts>;
  /** The server has it: forget it. */
  markDone(id: string): Promise<void>;
  /** Nothing final happened: try again at `nextTryAt`. */
  markRetry(id: string, reason: string, now: number, nextTryAt: number): Promise<void>;
  /** The server refused it: keep it, failed, with its words. */
  markFailed(id: string, message: string, now: number): Promise<void>;
  /** The employee asked to send a failed / waiting one again now. */
  retryNow(id: string): Promise<void>;
  /** The employee chose to throw it away (the only other way a row leaves the phone). */
  discard(id: string): Promise<QueuedOp | null>;
}

export function createOfflineQueue(db: SqlDb): OfflineQueue {
  let ready: Promise<void> | null = null;
  const init = () => {
    if (!ready) {
      ready = db.exec(SCHEMA).catch((err) => {
        ready = null;
        throw err;
      });
    }
    return ready;
  };

  const get = async (id: string) => {
    await init();
    const row = await db.first<OpRow>('SELECT * FROM ops WHERE id = ?', [id]);
    return row ? fromRow(row) : null;
  };

  return {
    async enqueue(op) {
      await init();
      const id = op.id ?? newOpId();
      const createdAt = op.createdAt ?? Date.now();
      await db.run(
        `INSERT INTO ops (id, employee_id, kind, label, method, url, body, files, invalidate, meta, idem_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          op.employeeId,
          op.kind,
          op.label,
          op.method,
          op.url,
          op.body === undefined || op.body === null ? null : JSON.stringify(op.body),
          JSON.stringify(op.files ?? []),
          JSON.stringify(op.invalidate ?? []),
          JSON.stringify(op.meta ?? {}),
          op.idempotencyKey ?? id,
          createdAt,
        ],
      );
      return (await get(id)) as QueuedOp;
    },
    get,
    async list(employeeId) {
      await init();
      const rows = await db.all<OpRow>('SELECT * FROM ops WHERE employee_id = ? ORDER BY created_at, rowid', [employeeId]);
      return rows.map(fromRow);
    },
    async due(employeeId, now) {
      await init();
      const rows = await db.all<OpRow>(
        `SELECT * FROM ops WHERE employee_id = ? AND status = 'pending' AND next_try_at <= ? ORDER BY created_at, rowid`,
        [employeeId, now],
      );
      return rows.map(fromRow);
    },
    async counts(employeeId) {
      await init();
      const rows = await db.all<{ status: string; n: number }>(
        'SELECT status, COUNT(*) AS n FROM ops WHERE employee_id = ? GROUP BY status',
        [employeeId],
      );
      const counts: QueueCounts = { pending: 0, failed: 0 };
      for (const r of rows) {
        if (r.status === 'failed') counts.failed += Number(r.n);
        else counts.pending += Number(r.n);
      }
      return counts;
    },
    async markDone(id) {
      await init();
      await db.run('DELETE FROM ops WHERE id = ?', [id]);
    },
    async markRetry(id, reason, now, nextTryAt) {
      await init();
      await db.run(
        `UPDATE ops SET status = 'pending', attempts = attempts + 1, last_error = ?, last_tried_at = ?, next_try_at = ?
         WHERE id = ?`,
        [reason, now, nextTryAt, id],
      );
    },
    async markFailed(id, message, now) {
      await init();
      await db.run(
        `UPDATE ops SET status = 'failed', attempts = attempts + 1, last_error = ?, last_tried_at = ? WHERE id = ?`,
        [message, now, id],
      );
    },
    async retryNow(id) {
      await init();
      await db.run(`UPDATE ops SET status = 'pending', next_try_at = 0 WHERE id = ?`, [id]);
    },
    async discard(id) {
      const op = await get(id);
      if (op) await db.run('DELETE FROM ops WHERE id = ?', [id]);
      return op;
    },
  };
}
