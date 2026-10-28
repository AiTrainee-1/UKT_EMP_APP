// The smallest SQLite surface the queue needs. expo-sqlite implements it on the phone (platform/sqlite.ts); the tests
// implement it over Node's built-in `node:sqlite`, so the real SQL of the queue is exercised without a device.

export type SqlValue = string | number | null;

export interface SqlRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<SqlRunResult>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
}
