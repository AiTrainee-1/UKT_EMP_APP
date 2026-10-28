// What the phone looks like right now (permissions, location services, network, battery, power-save, notifications), read
// through Expo modules only. Every read is wrapped: a probe that fails answers "unknown" (null / 'unknown'), never throws,
// because it runs inside a background task where an exception would drop the tick.
import { AppState, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Network from 'expo-network';

import { APP_VERSION } from '../../lib/appVersion';
import { IS_EXPO_GO } from '../../lib/expoGoRuntime';
import type { Observation } from '../events.ts';
import type { AppInfo, HealthSnapshot, NetworkKind, PermissionLevel } from '../types.ts';

export interface Probe {
  permission(): Promise<PermissionLevel>;
  locationEnabled(): Promise<boolean | null>;
  network(): Promise<NetworkKind>;
  airplane(): Promise<boolean | null>;
  battery(): Promise<{ pct: number | null; charging: boolean | null; powerSave: boolean | null }>;
  batteryOptimised(): Promise<boolean | null>;
  notifications(): Promise<boolean | null>;
  appInfo(): AppInfo;
  /** When the phone last booted. Always null here: see the note on bootAt below. */
  bootAt(): Promise<number | null>;
  isForeground(): boolean;
  health(): Promise<HealthSnapshot>;
  observation(extra: { now: number; mocked: boolean | null; location: Observation['location'] }): Promise<Observation>;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export function networkKindOf(state: Network.NetworkState | null | undefined): NetworkKind {
  if (!state) return 'unknown';
  if (state.isConnected === false || state.type === Network.NetworkStateType.NONE || state.isInternetReachable === false) return 'none';
  if (state.type === Network.NetworkStateType.WIFI || state.type === Network.NetworkStateType.ETHERNET) return 'wifi';
  if (state.type === Network.NetworkStateType.CELLULAR) return 'cell';
  return 'unknown';
}

export function createProbe(): Probe {
  const probe: Probe = {
    permission: () =>
      safe<PermissionLevel>(async () => {
        const fg = await Location.getForegroundPermissionsAsync();
        if (!fg.granted) return 'denied';
        const bg = await Location.getBackgroundPermissionsAsync();
        return bg.granted ? 'always' : 'while_using';
      }, 'unknown'),

    locationEnabled: () => safe<boolean | null>(() => Location.hasServicesEnabledAsync(), null),

    network: () => safe<NetworkKind>(async () => networkKindOf(await Network.getNetworkStateAsync()), 'unknown'),

    airplane: () =>
      Platform.OS === 'android' ? safe<boolean | null>(() => Network.isAirplaneModeEnabledAsync(), null) : Promise.resolve(null),

    battery: () =>
      safe(async () => {
        const s = await Battery.getPowerStateAsync();
        const pct = s.batteryLevel >= 0 ? Math.round(s.batteryLevel * 100) : null;
        const charging = s.batteryState === Battery.BatteryState.CHARGING || s.batteryState === Battery.BatteryState.FULL;
        return { pct, charging: s.batteryState === Battery.BatteryState.UNKNOWN ? null : charging, powerSave: s.lowPowerMode };
      }, { pct: null, charging: null, powerSave: null } as { pct: number | null; charging: boolean | null; powerSave: boolean | null }),

    batteryOptimised: () =>
      Platform.OS === 'android' ? safe<boolean | null>(() => Battery.isBatteryOptimizationEnabledAsync(), null) : Promise.resolve(null),

    notifications: () =>
      safe<boolean | null>(async () => {
        if (Platform.OS === 'web' || IS_EXPO_GO) return null;
        // Deferred require: merely importing expo-notifications throws in Expo Go (see src/hooks/useNotifications.ts).
        const Notifications = require('expo-notifications') as typeof import('expo-notifications');
        return (await Notifications.getPermissionsAsync()).status === 'granted';
      }, null),

    appInfo: () => ({
      version: APP_VERSION,
      os: Platform.OS,
      osVersion: Device.osVersion ?? String(Platform.Version),
      model: Device.modelName ?? Device.modelId ?? 'unknown',
    }),

    // Expo's uptime clock on Android (SystemClock.uptimeMillis) does not count deep sleep, so "now - uptime" lands AFTER
    // the real boot whenever the phone slept, and would report reboots that never happened. A reboot cannot be dated from
    // managed Expo; a native TrackerEngine can supply SystemClock.elapsedRealtime() here later.
    bootAt: async () => null,

    isForeground: () => AppState.currentState === 'active',

    async health() {
      const [permission, locationEnabled, network, battery, batteryOptimised] = await Promise.all([
        probe.permission(),
        probe.locationEnabled(),
        probe.network(),
        probe.battery(),
        probe.batteryOptimised(),
      ]);
      return {
        permission,
        locationEnabled,
        // Android's "restricted background" bucket is not readable from Expo; battery optimisation is the nearest signal.
        backgroundRestricted: null,
        batteryOptimised,
        powerSave: battery.powerSave,
        batteryPct: battery.pct,
        charging: battery.charging,
        network,
      };
    },

    async observation(extra) {
      const [permission, locationEnabled, network, airplane, battery, batteryOptimised] = await Promise.all([
        probe.permission(),
        probe.locationEnabled(),
        probe.network(),
        probe.airplane(),
        probe.battery(),
        probe.batteryOptimised(),
      ]);
      return {
        now: extra.now,
        permission,
        locationEnabled,
        network,
        airplane,
        powerSave: battery.powerSave,
        batteryPct: battery.pct,
        charging: battery.charging,
        batteryOptimised,
        mocked: extra.mocked,
        location: extra.location,
      };
    },
  };
  return probe;
}

/** Calls back when the connection changes (wifi/cell/none). Returns the unsubscribe function. */
export function subscribeNetwork(cb: () => void): () => void {
  try {
    const sub = Network.addNetworkStateListener(() => cb());
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}
