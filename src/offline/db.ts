// expo-sqlite behind the offline queue's SqlDb (src/offline/queue.ts). The file lives in the app's own storage, survives the
// app being killed and updated, and is opened lazily. Used from both the app and the background sync task.
import * as SQLite from 'expo-sqlite';

import type { SqlDb, SqlValue } from '../tracking/sql';

export const OFFLINE_DB_NAME = 'uktextiles-offline.db';

export function openOfflineDb(): SqlDb {
  let opening: Promise<SQLite.SQLiteDatabase> | null = null;
  const db = () => {
    if (!opening) {
      opening = SQLite.openDatabaseAsync(OFFLINE_DB_NAME).catch((err) => {
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
