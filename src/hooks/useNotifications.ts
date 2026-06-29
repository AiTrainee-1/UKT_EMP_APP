import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// expo-notifications remote push was removed from Expo Go in SDK 53.
// Local notifications still work, but we must skip any push-token setup.
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  try {
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
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch {
    // silently fail in unsupported environments
  }
}

export function useNotificationObserver(onTap?: (notification: Notifications.Notification) => void) {
  const receivedRef = useRef<Notifications.EventSubscription>();
  const responseRef = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    if (isExpoGo) return;
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
