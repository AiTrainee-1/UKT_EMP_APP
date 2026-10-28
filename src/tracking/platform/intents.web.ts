// No phone settings in a browser; keeps expo-intent-launcher out of the web bundle.
import type { IntentSpec } from '../oem.ts';

export const APP_PACKAGE = 'net.uktex.employee';
export const APP_LABEL = 'uktextiles';

export async function launchFirstAvailable(_intents: IntentSpec[]): Promise<boolean> {
  return false;
}
export async function openBatteryOptimisation(): Promise<boolean> {
  return false;
}
export async function openLocationSettings(): Promise<boolean> {
  return false;
}
export async function openAppSettings(): Promise<void> {}
