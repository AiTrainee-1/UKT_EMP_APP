// TEST HELPER (never imported by app code): the queue's SqlDb over Node's built-in `node:sqlite`, so the real SQL of
// src/tracking/queue.ts runs under `npm test` without a phone. A file path makes "the app was killed and restarted" testable:
// closing and re-opening the same file is exactly what a process restart does to the on-phone database.
/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';

import type { SqlDb, SqlValue } from '../sql.ts';

export interface NodeSqlDb extends SqlDb {
  close(): void;
}

export function openNodeSqlite(path = ':memory:'): NodeSqlDb {
  const db = new DatabaseSync(path);
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: SqlValue[] = []) {
      const row = db.prepare(sql).get(...params);
      return (row ?? null) as T | null;
    },
    close() {
      db.close();
    },
  };
}
