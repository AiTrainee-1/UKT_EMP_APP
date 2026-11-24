// The browser build has no offline queue (it is a development aid): this stub keeps expo-sqlite and its WebAssembly build
// out of the web bundle. Saving something offline there fails with this message and the screen shows it.
import type { SqlDb } from '../tracking/sql';

export const OFFLINE_DB_NAME = 'uktextiles-offline.db';

export function openOfflineDb(): SqlDb {
  const unavailable = async (): Promise<never> => {
    throw new Error('Saving offline is not available in a browser.');
  };
  return { exec: unavailable, run: unavailable, all: unavailable, first: unavailable };
}
