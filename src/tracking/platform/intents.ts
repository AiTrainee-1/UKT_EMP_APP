// Opens Android settings screens from the intent lists in oem.ts: each is tried in order until one exists on this phone,
// ending with this app's own "App info" page (Linking.openSettings) which every phone has.
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';

import { LOCATION_SETTINGS_INTENT, batteryOptimisationIntents } from '../oem.ts';
import type { IntentSpec } from '../oem.ts';

export const APP_PACKAGE: string = Constants.expoConfig?.android?.package ?? 'net.uktex.employee';
export const APP_LABEL: string = Constants.expoConfig?.name ?? 'uktextiles';

/** Tries each intent until one opens; true when a settings screen was shown. */
export async function launchFirstAvailable(intents: IntentSpec[]): Promise<boolean> {
  if (Platform.OS !== 'android') {
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
  }
  for (const spec of intents) {
    try {
      await IntentLauncher.startActivityAsync(spec.action, {
        ...(spec.packageName && spec.className ? { packageName: spec.packageName, className: spec.className } : {}),
        ...(spec.data ? { data: spec.data } : {}),
        ...(spec.extra ? { extra: spec.extra } : {}),
      });
      return true;
    } catch {
      // not on this phone / this OS version: next candidate
    }
  }
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}

export function openBatteryOptimisation(): Promise<boolean> {
  return launchFirstAvailable(batteryOptimisationIntents(APP_PACKAGE));
}

export function openLocationSettings(): Promise<boolean> {
  return launchFirstAvailable([LOCATION_SETTINGS_INTENT]);
}

export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // nothing else to try
  }
}
