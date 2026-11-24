import { useQuery } from '@tanstack/react-query';

import { listQueuedOps, useOfflineStatus } from './engine';
import type { OpKind, QueuedOp } from './types';

/** What is still on the phone (oldest first), optionally only some kinds. Re-reads whenever the queue changes. */
export function useQueuedOps(kinds?: OpKind[]): QueuedOp[] {
  const { version } = useOfflineStatus();
  const { data } = useQuery({
    queryKey: ['offline-queue', version],
    queryFn: listQueuedOps,
    staleTime: 0,
    gcTime: 60_000,
    networkMode: 'always',
  });
  const all = data ?? [];
  return kinds ? all.filter((op) => kinds.includes(op.kind)) : all;
}

/** "2 min ago", "Yesterday 4:10 pm" ... for the queued cards. */
export function savedAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
