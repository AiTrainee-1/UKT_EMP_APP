import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  type?: string;
}

export function useAppNotifications(employeeId: number | null) {
  return useQuery({
    queryKey: ['app-notifications', employeeId],
    queryFn: async (): Promise<AppNotification[]> => {
      try {
        const res = await api.get(`/notifications?employeeId=${employeeId}`);
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
    enabled: !!employeeId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/notifications/${id}/read`);
    },
    onSuccess: (_, id) => {
      queryClient.setQueriesData(
        { queryKey: ['app-notifications'] },
        (old: AppNotification[] | undefined) =>
          old ? old.map(n => n.id === id ? { ...n, isRead: true } : n) : old
      );
    },
  });
}
