import { useSyncExternalStore } from 'react';
import { getServerStatus, subscribeServerStatus, type ServerStatus } from '../lib/serverStatus';

/** Whether the server is currently unreachable (see src/lib/serverStatus.ts). */
export function useServerStatus(): ServerStatus {
  return useSyncExternalStore(subscribeServerStatus, getServerStatus, getServerStatus);
}
