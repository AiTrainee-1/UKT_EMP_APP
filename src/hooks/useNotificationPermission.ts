import { useSyncExternalStore } from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';

import { makeSafeLoader } from '../lib/expoGo';
import { IS_EXPO_GO } from '../lib/expoGoRuntime';
import { accessFromAndroidResult, accessFromExpo, createHoldSet, type NotificationAccess } from '../lib/notificationNudge';
import { ensureNotificationChannel } from './usePushToken';

/*
 * Reading and asking for the app's notification permission, for the "Turn on notifications" popup (owner 2026-11-25,
 * src/components/notifications/NotificationPermissionPopup.tsx). The rules are in src/lib/notificationNudge.ts.
 *
 * Reading never shows anything; asking (askNotificationAccess) opens the phone's own dialog and is only ever called from
 * a tap on the popup's button - never from an AppState / foreground handler (the keyboard loop of 2026-11-25).
 *
 * expo-notifications cannot even be loaded inside Expo Go on Android (src/lib/expoGo.ts), so there the permission is read
 * and asked through React Native's PermissionsAndroid (POST_NOTIFICATIONS, Android 13+) instead. Where neither can say
 * (web, Expo Go on iOS, Android 12 or older in Expo Go) the answer is null and the popup does not show.
 */

const loadNotifications = makeSafeLoader(
  () => require('expo-notifications') as typeof import('expo-notifications'),
  (error) => {
    if (__DEV__) console.log('[notification popup] expo-notifications is not available:', String(error));
  },
);

function expoNotifications(): typeof import('expo-notifications') | null {
  if (Platform.OS === 'web' || IS_EXPO_GO) return null;
  return loadNotifications();
}

/** Android 13 (API 33): the first version where notifications need a runtime permission. */
const ANDROID_13 = 33;

function androidApiLevel(): number {
  return Platform.OS === 'android' ? Number(Platform.Version) || 0 : 0;
}

/** Set once PermissionsAndroid answered "never ask again" (it cannot be read back without asking). */
let androidNeverAskAgain = false;

/** What the phone says about the app's notifications now, or null when it cannot say. Shows nothing. */
export async function readNotificationAccess(): Promise<NotificationAccess | null> {
  if (Platform.OS === 'web') return null;
  const Notifications = expoNotifications();
  if (Notifications) {
    try {
      const res = await Notifications.getPermissionsAsync();
      return accessFromExpo({ granted: res.granted, status: res.status, canAskAgain: res.canAskAgain, iosStatus: res.ios?.status ?? null });
    } catch {
      // fall through to Android's own check
    }
  }
  if (Platform.OS === 'android' && androidApiLevel() >= ANDROID_13) {
    try {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      return { granted, canAskAgain: granted || !androidNeverAskAgain };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Opens the phone's "Allow notifications?" dialog (only from a tap), then reads the answer back. Returns null when the
 * phone cannot say.
 */
export async function askNotificationAccess(): Promise<NotificationAccess | null> {
  if (Platform.OS === 'web') return null;
  const Notifications = expoNotifications();
  if (Notifications) {
    try {
      // From Android 13 the dialog does not appear until the app has a notification channel.
      await ensureNotificationChannel(Notifications).catch(() => {});
      await Notifications.requestPermissionsAsync();
      return await readNotificationAccess();
    } catch {
      // fall through to Android's own request
    }
  }
  if (Platform.OS === 'android' && androidApiLevel() >= ANDROID_13) {
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (result === 'never_ask_again') androidNeverAskAgain = true;
      return accessFromAndroidResult(result);
    } catch {
      return null;
    }
  }
  return readNotificationAccess();
}

/** The phone's settings page for this app (where notifications can be switched on). */
export function openNotificationSettings(): void {
  if (Platform.OS === 'web') return;
  void Linking.openSettings().catch(() => {});
}

// ── things that hold the popup back ─────────────────────────────────────────

const holds = createHoldSet();

/**
 * Keeps the notification popup out of the way while `on` (the first-run permission dialogs, the "Permission Needed"
 * card, the app tour). Each caller uses its own key and turns it off again.
 */
export function holdNotificationPopup(key: string, on: boolean): void {
  holds.set(key, on);
}

/** True while something holds the popup back. */
export function useNotificationPopupHeld(): boolean {
  return useSyncExternalStore(holds.subscribe, holds.held, holds.held);
}
