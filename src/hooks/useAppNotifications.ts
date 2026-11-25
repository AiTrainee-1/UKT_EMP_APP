import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface AppNotification {
  id: number;
  /** The headline of a notification made from a WhatsApp message ("Request Approved"); empty on the older one-liners. */
  title?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  type?: string;
  /**
   * What the notification is about, for its View button: { kind, id, date, role, category, label } (read by
   * src/lib/notificationTarget.ts). `null` = nothing to open; the key is ABSENT on an older server, which then falls back
   * to the `type`. Left raw on purpose: never trust its shape before normalizeTarget().
   */
  target?: unknown;
}

const KEY = ['app-notifications'] as const;

/**
 * The employee's notifications, newest first (the server sends up to its list cap in one answer).
 * A failed request is an error (owner 2026-11-25): it used to read as "no notifications", which also wiped the list the
 * phone already had. Now the last list stays on screen and the Notifications page offers "Try again" when it has none.
 */
export function useAppNotifications(employeeId: number | null) {
  return useQuery({
    queryKey: [...KEY, employeeId],
    queryFn: async (): Promise<AppNotification[]> => {
      const res = await api.get(`/notifications?employeeId=${employeeId}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!employeeId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

type Snapshot = [readonly unknown[], AppNotification[] | undefined][];

/** Marks rows read in every cached list at once (the tick shows straight away) and returns what to put back on failure. */
async function markInCache(client: QueryClient, isTarget: (n: AppNotification) => boolean): Promise<Snapshot> {
  await client.cancelQueries({ queryKey: KEY });
  const before = client.getQueriesData<AppNotification[]>({ queryKey: KEY });
  client.setQueriesData<AppNotification[]>({ queryKey: KEY }, (old) =>
    old ? old.map((n) => (isTarget(n) && !n.isRead ? { ...n, isRead: true } : n)) : old,
  );
  return before;
}

function restore(client: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, data]) => client.setQueryData(key, data));
}

/** Ticks one notification read: shown at once, put back if the server refuses (owner 2026-11-25: the to-do tick). */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/notifications/${id}/read`);
    },
    onMutate: async (id) => ({ snapshot: await markInCache(queryClient, (n) => n.id === id) }),
    onError: (_err, _id, ctx) => restore(queryClient, ctx?.snapshot),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.patch('/notifications/mark-all-read');
    },
    onMutate: async () => ({ snapshot: await markInCache(queryClient, () => true) }),
    onError: (_err, _vars, ctx) => restore(queryClient, ctx?.snapshot),
  });
}
