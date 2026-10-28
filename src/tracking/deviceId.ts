// The installation id the server pairs with every sequence number: UNIQUE(employee, device, seq). It must outlive the
// SQLite file (see the sequence note in queue.ts), so it is kept in SecureStore with a copy in the queue's meta table.

/** "d-<time base36>-<20 hex>": unguessable enough for an installation id, never longer than the server's 64 characters. */
export function makeDeviceId(random: () => number = Math.random, now: number = Date.now()): string {
  const hex = Array.from({ length: 20 }, () => Math.floor(random() * 16).toString(16)).join('');
  return `d-${now.toString(36)}-${hex}`;
}

export interface DeviceIdStores {
  /** SecureStore: survives clearing the database. */
  secureGet(): Promise<string | null>;
  secureSet(id: string): Promise<void>;
  /** The queue's meta table. */
  metaGet(): Promise<string | null>;
  metaSet(id: string): Promise<void>;
}

/** The stored id if there is one in either place (healing the other), else a new one saved in both. */
export async function resolveDeviceId(stores: DeviceIdStores, create: () => string = makeDeviceId): Promise<string> {
  let id = await stores.secureGet().catch(() => null);
  const fromMeta = id ? null : await stores.metaGet().catch(() => null);
  id = id ?? fromMeta ?? create();
  await Promise.all([stores.secureSet(id).catch(() => undefined), stores.metaSet(id).catch(() => undefined)]);
  return id;
}
