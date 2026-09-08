import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// It's not enough to gate expo-notifications calls behind an isExpoGo check
// — merely *importing* the module runs a top-level side effect
// (DevicePushTokenAutoRegistration.fx.js) that throws in Expo Go on SDK
// 53+, since remote push was removed from Expo Go there entirely. This file
// used to `import * as Notifications from 'expo-notifications'` at the top
// — and since app/_layout.tsx (which mounts useNotificationObserver) is
// evaluated eagerly at boot, that import ran unconditionally before any
// guard had a chance to run, crashing/erroring on every Expo Go launch.
// src/hooks/usePushToken.ts already solved this exact problem with a
// deferred `require()` inside the function body instead of a static
// top-level import; this file now does the same.
const isExpoGo = Constants.appOwnership === 'expo';

let handlerConfigured = false;

function getNotifications() {
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  if (!handlerConfigured) {
    handlerConfigured = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
  return Notifications;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  try {
    const Notifications = getNotifications();
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function showNotification(title: string, body: string) {
  if (isExpoGo) return;
  try {
    const Notifications = getNotifications();
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch {
    // silently fail in unsupported environments
  }
}

export function useNotificationObserver(onTap?: (notification: unknown) => void) {
  const receivedRef = useRef<{ remove: () => void } | null>(null);
  const responseRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (isExpoGo) return;
    const Notifications = getNotifications();
    receivedRef.current = Notifications.addNotificationReceivedListener(() => {});
    responseRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      onTap?.(response.notification);
    });
    return () => {
      receivedRef.current?.remove();
      responseRef.current?.remove();
    };
  }, []);
}
