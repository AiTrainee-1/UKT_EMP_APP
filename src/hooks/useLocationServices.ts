// Is the phone's location (GPS) switched on? And, when it is not, the one popup that helps turn it on (owner 2026-11-25).
// The popup is src/components/location/LocationOffPopup.tsx, mounted once at the app root; its wording is
// src/lib/locationOff.ts.
//
//   if (!(await ensureLocationOn('punch'))) { ...say location is off...; return; }
//   const pos = await Location.getCurrentPositionAsync(...)   // and on isLocationOffError(err): promptLocationOn('punch')
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';

import { createOverlayStore } from '../lib/overlayStore';
import { isLocationOffError, type LocationReason } from '../lib/locationOff';

/** The popup: opened with the feature that needs the location, answered with whether location is now on. */
export const locationOffPrompt = createOverlayStore<{ reason: LocationReason }, boolean>(false);

/** true / false, or null when the phone cannot say (a browser, an error). */
export async function readLocationServices(): Promise<boolean | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return null;
  }
}

/**
 * True when the phone's location is on (or the phone cannot say: then the location request itself decides). When it is
 * off, shows the popup and resolves when the person turned it on (true) or closed the popup (false).
 */
export async function ensureLocationOn(reason: LocationReason): Promise<boolean> {
  const on = await readLocationServices();
  if (on !== false) return true;
  return locationOffPrompt.open({ reason });
}

/** Shows the popup now (a location request just failed because location is off). Resolves like ensureLocationOn. */
export function promptLocationOn(reason: LocationReason): Promise<boolean> {
  return locationOffPrompt.open({ reason });
}

/**
 * After a location request failed: when it failed because the phone's location is off, shows the popup.
 * 'not-off' = some other failure (no GPS fix indoors, permission...): the caller shows its usual message;
 * 'turned-on' = the person turned it on (ask them to try again); 'still-off' = they closed the popup.
 */
export async function handleLocationError(err: unknown, reason: LocationReason): Promise<'not-off' | 'turned-on' | 'still-off'> {
  if (!isLocationOffError(err)) return 'not-off';
  if ((await readLocationServices()) !== false) return 'not-off';
  return (await locationOffPrompt.open({ reason })) ? 'turned-on' : 'still-off';
}

/** What a punch screen says once the person turned location on from the popup that a failed request opened. */
export const LOCATION_NOW_ON = 'Location is on now. Try again.';

/**
 * Android's own "Turn on location" dialog (Google Play services). True when the person accepted it; false when they
 * declined or the phone has no such dialog (then "Open settings" is the way).
 */
export async function askToTurnOnLocation(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await Location.enableNetworkProviderAsync();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the phone's location is on, for a screen that shows it: read at once, again whenever the app comes back to
 * the front (the person may have switched it in the quick settings) and every `pollMs` while shown. null = unknown.
 */
export function useLocationServicesOn(pollMs = 6000): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () => {
      void readLocationServices().then((v) => {
        if (alive) setOn(v);
      });
    };
    check();
    const timer = setInterval(check, pollMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [pollMs]);
  return on;
}
