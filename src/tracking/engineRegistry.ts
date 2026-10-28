// Where the active TrackerEngine is registered. The Expo collector (collector.ts) registers itself when it is imported; a
// future native module registers its own implementation here instead, and nothing else in src/tracking changes.
import type { TrackerEngine, TrackingMode } from './types.ts';

let current: TrackerEngine | null = null;
let switcher: ModeSwitcher | null = null;

/**
 * Changes the running collector between the fast ("moving") and slow ("still") location request; true when it changed.
 * Optional: an engine with no such notion simply never registers one.
 */
export type ModeSwitcher = (wanted: TrackingMode) => Promise<boolean>;

export function registerModeSwitcher(fn: ModeSwitcher | null): void {
  switcher = fn;
}

export function getModeSwitcher(): ModeSwitcher | null {
  return switcher;
}

export function registerEngine(engine: TrackerEngine): void {
  current = engine;
}

export function getEngine(): TrackerEngine {
  if (!current) {
    throw new Error('No tracker engine is registered: import "src/tracking/collector" (or your native engine) at app start.');
  }
  return current;
}

export function hasEngine(): boolean {
  return current != null;
}
