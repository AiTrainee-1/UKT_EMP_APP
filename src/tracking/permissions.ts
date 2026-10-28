// The permission requests of the set-up screens. Each is tied to a button tap (the only reliable way to get the Android
// dialog to show) and returns the resulting level, read back from the OS rather than trusted from the dialog's answer.
import { Platform } from 'react-native';
import * as Location from 'expo-location';

import { requestNotificationPermission } from '../hooks/useNotifications';
import type { PermissionLevel } from './types.ts';

export async function readLocationLevel(): Promise<PermissionLevel> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) return 'denied';
    if (Platform.OS === 'web') return 'while_using';
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.granted ? 'always' : 'while_using';
  } catch {
    return 'unknown';
  }
}

/** The normal "While using the app" location dialog. */
export async function requestForegroundLocation(): Promise<PermissionLevel> {
  try {
    await Location.requestForegroundPermissionsAsync();
  } catch {
    // fall through to the read-back
  }
  return readLocationLevel();
}

/**
 * "Allow all the time". On Android 11 and newer this cannot be a dialog: the OS sends the person to the app's location
 * settings page to pick it, and returns here when they come back. Only valid once foreground location is granted.
 */
export async function requestBackgroundLocation(): Promise<PermissionLevel> {
  try {
    await Location.requestBackgroundPermissionsAsync();
  } catch {
    // fall through to the read-back
  }
  return readLocationLevel();
}

export async function requestNotifications(): Promise<boolean> {
  return requestNotificationPermission();
}
