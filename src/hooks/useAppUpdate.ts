import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { APP_VERSION } from '../lib/appVersion';

/** What HR published for the newest build (Mobile App Login -> New Version in the HR portal). */
export interface AppUpdate {
  /** Whether that build is newer than this one. The server decides, so the rule lives in one place. */
  updateAvailable: boolean;
  latest: {
    version: string;
    downloadUrl: string;
    releaseNotes: string;
    /** The prompt can't be dismissed until the employee updates. */
    mandatory: boolean;
    publishedAt: string;
  } | null;
}

// How often to look while the app stays open; it also looks each time the app comes back to the front.
const CHECK_EVERY_MS = 10 * 60 * 1000;

/**
 * Asks the server whether a newer build of this app has been published. The check needs no login
 * (an old build may not be able to sign in at all) and an offline phone simply gets no prompt.
 */
export function useAppUpdate() {
  const query = useQuery<AppUpdate>({
    queryKey: ['app-update', APP_VERSION],
    // Updates are delivered as an APK, which only Android installs.
    enabled: Platform.OS === 'android',
    queryFn: async () => {
      const res = await api.get('/mobile-app/latest-version', {
        params: { platform: 'android', current: APP_VERSION },
      });
      return res.data as AppUpdate;
    },
    staleTime: 0,
    refetchInterval: CHECK_EVERY_MS,
    retry: 1,
  });

  const { refetch } = query;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  return query;
}
