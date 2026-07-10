import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface MobileHomeSummary {
  date: string;
  presentToday: number;
  absentToday: number;
  onLeaveToday: number;
  pendingRequestsCount: number;
}

export function useMobileHomeSummary() {
  return useQuery({
    queryKey: ['mobile-home-summary'],
    queryFn: async (): Promise<MobileHomeSummary | null> => {
      try {
        const res = await api.get('/dashboard/mobile-home-summary');
        return res.data as MobileHomeSummary;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export interface LiveFeedItem {
  employeeName: string;
  department: string;
  event: 'in' | 'out';
  time: string;
  date: string;
}

export function useLiveFeed(limit = 20) {
  return useQuery({
    queryKey: ['attendance-live-feed', limit],
    queryFn: async (): Promise<LiveFeedItem[]> => {
      try {
        const res = await api.get('/attendance/live-feed', { params: { limit } });
        return Array.isArray(res.data?.items) ? res.data.items : [];
      } catch {
        return [];
      }
    },
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
}
