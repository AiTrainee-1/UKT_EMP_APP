// expo-sqlite behind the queue's SqlDb. The database file lives in the app's own storage, survives the app being killed and
// updated, and is opened lazily so importing this file costs nothing. Used from both the app and the background task.
import * as SQLite from 'expo-sqlite';

import type { SqlDb, SqlValue } from '../sql.ts';

export const TRACKING_DB_NAME = 'uktextiles-tracking.db';

export function openTrackingDb(): SqlDb {
  let opening: Promise<SQLite.SQLiteDatabase> | null = null;
  const db = () => {
    if (!opening) {
      opening = SQLite.openDatabaseAsync(TRACKING_DB_NAME).catch((err) => {
        opening = null; // retry on the next call
        throw err;
      });
    }
    return opening;
  };
  return {
    async exec(sql) {
      await (await db()).execAsync(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      const r = await (await db()).runAsync(sql, params);
      return { lastInsertRowId: r.lastInsertRowId, changes: r.changes };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return (await (await db()).getAllAsync<T>(sql, params)) as T[];
    },
    async first<T>(sql: string, params: SqlValue[] = []) {
      return (await (await db()).getFirstAsync<T>(sql, params)) as T | null;
    },
  };
}
