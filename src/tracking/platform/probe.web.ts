// The browser: nothing to probe. Every answer is "unknown", which the issue list and the set-up steps treat as "not known",
// never as "fine". Keeps expo-battery / expo-network / expo-device out of the web bundle.
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
  bootAt(): Promise<number | null>;
  isForeground(): boolean;
  health(): Promise<HealthSnapshot>;
  observation(extra: { now: number; mocked: boolean | null; location: Observation['location'] }): Promise<Observation>;
}

export function createProbe(): Probe {
  const health: HealthSnapshot = {
    permission: 'unknown',
    locationEnabled: null,
    backgroundRestricted: null,
    batteryOptimised: null,
    powerSave: null,
    batteryPct: null,
    charging: null,
    network: 'unknown',
  };
  return {
    permission: async () => 'unknown',
    locationEnabled: async () => null,
    network: async () => 'unknown',
    airplane: async () => null,
    battery: async () => ({ pct: null, charging: null, powerSave: null }),
    batteryOptimised: async () => null,
    notifications: async () => null,
    appInfo: () => ({ version: 'web', os: 'web', osVersion: '', model: 'browser' }),
    bootAt: async () => null,
    isForeground: () => true,
    health: async () => health,
    observation: async (extra) => ({
      now: extra.now,
      permission: 'unknown',
      locationEnabled: null,
      network: 'unknown',
      airplane: null,
      powerSave: null,
      batteryPct: null,
      charging: null,
      batteryOptimised: null,
      mocked: extra.mocked,
      location: extra.location,
    }),
  };
}

export function subscribeNetwork(_cb: () => void): () => void {
  return () => undefined;
}
