// The browser has no background tracking, so no upload queue: this stub keeps expo-sqlite (and its WebAssembly build) out of
// the web bundle. Nothing on the web ever opens it (the tracking runtime is only started on Android / iOS).
import type { SqlDb } from '../sql.ts';

export const TRACKING_DB_NAME = 'uktextiles-tracking.db';

export function openTrackingDb(): SqlDb {
  const unavailable = async (): Promise<never> => {
    throw new Error('The tracking queue is not available in a browser.');
  };
  return { exec: unavailable, run: unavailable, all: unavailable, first: unavailable };
}
