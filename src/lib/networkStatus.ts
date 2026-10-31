/**
 * Whether the phone has internet, and the connection banner that goes with it (the rules are the pure state machine in
 * src/lib/networkBanner.ts; this file only feeds it and acts on it).
 *
 *  - expo-network reports the phone's network (start-up read, change events, and a fresh read every time the app comes
 *    back to the front, in case an event was missed while it was in the background).
 *  - Our own API client reports every answer from the server (`noteServerAnswered`, src/lib/api.ts): proof that the
 *    internet works even when Android says the network has no confirmed internet.
 *  - TanStack Query follows it: queries pause while offline and pick up again when the internet is back
 *    (`onlineManager`), and stale data refreshes when the app comes back to the front (`focusManager`).
 *  - When the internet comes back the banner says "Reconnecting..." and the root layout's re-check runs (session
 *    re-check + refetch); "Connected" then shows briefly.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { focusManager, onlineManager } from '@tanstack/react-query';

import {
  CONNECTED_VISIBLE_MS,
  INITIAL_NETWORK_BANNER,
  isOnline,
  networkOnline,
  reduceNetworkBanner,
  type NetworkBannerEvent,
  type NetworkBannerState,
} from './networkBanner';

/** The longest "Reconnecting..." waits for the re-check before giving up on it. */
const RECHECK_LIMIT_MS = 20000;

let state: NetworkBannerState = INITIAL_NETWORK_BANNER;
const listeners = new Set<() => void>();

let recheck: (() => Promise<boolean>) | null = null;
let recheckGeneration = 0;
let connectedTimer: ReturnType<typeof setTimeout> | null = null;

function withLimit<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

async function runRecheck() {
  const generation = ++recheckGeneration;
  const ok = recheck ? await withLimit(recheck(), RECHECK_LIMIT_MS, false) : true;
  // A newer reconnect (or going offline again) has taken over: this answer is stale.
  if (generation !== recheckGeneration) return;
  dispatch({ type: 'recheck-done', ok });
}

function dispatch(event: NetworkBannerEvent) {
  const prev = state;
  const next = reduceNetworkBanner(prev, event);
  if (next === prev) return;
  state = next;
  listeners.forEach((listener) => listener());

  if (next.phase === 'reconnecting' && prev.phase !== 'reconnecting') void runRecheck();
  if (next.phase !== 'reconnecting' && prev.phase === 'reconnecting') recheckGeneration++;

  if (next.phase === 'connected' && prev.phase !== 'connected') {
    if (connectedTimer) clearTimeout(connectedTimer);
    connectedTimer = setTimeout(() => {
      connectedTimer = null;
      dispatch({ type: 'connected-shown' });
    }, CONNECTED_VISIBLE_MS);
  }
}

function applyNetworkState(ns: Network.NetworkState | null | undefined) {
  if (!ns) return;
  dispatch({ type: 'network', isConnected: ns.isConnected, isInternetReachable: ns.isInternetReachable });
}

function readNow(): Promise<void> {
  return Network.getNetworkStateAsync().then(applyNetworkState, () => {
    /* no reading: keep what we have */
  });
}

export function getNetworkBanner(): NetworkBannerState {
  return state;
}

export function subscribeNetworkBanner(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The connection banner state (re-renders on change). */
export function useNetworkBanner(): NetworkBannerState {
  return useSyncExternalStore(subscribeNetworkBanner, getNetworkBanner, getNetworkBanner);
}

/** True unless the phone has said it is offline. */
export function isNetworkOnline(): boolean {
  return isOnline(state);
}

/** Called by the API client on every answer from our server. */
export function noteServerAnswered() {
  dispatch({ type: 'server-answered' });
}

/**
 * The phone's network as of now (true / false), or null when it could not say within `timeoutMs`. Used at start-up so
 * an offline launch opens with the stored sign-in instead of waiting for a request to time out.
 */
export async function readNetworkOnline(timeoutMs = 1500): Promise<boolean | null> {
  const ns = await withLimit<Network.NetworkState | null>(Network.getNetworkStateAsync(), timeoutMs, null);
  applyNetworkState(ns);
  return networkOnline(state);
}

// TanStack Query follows this store (instead of its browser-only default), and treats "app in front" as focus.
onlineManager.setEventListener((setOnline) => {
  const listener = () => setOnline(isOnline(state));
  listeners.add(listener);
  listener();
  return () => {
    listeners.delete(listener);
  };
});

focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (appState) => handleFocus(appState === 'active'));
  return () => subscription.remove();
});

/**
 * Starts watching the network. `onReconnect` runs each time the internet comes back ("Reconnecting..."): it resolves
 * true when the server answered (then "Connected" shows briefly), false when it did not (the banner hides and the
 * server-status store shows "Can't reach the server"). Returns the stop function.
 */
export function startNetworkMonitoring(onReconnect: () => Promise<boolean>): () => void {
  recheck = onReconnect;

  let networkSubscription: { remove: () => void } | null = null;
  try {
    networkSubscription = Network.addNetworkStateListener(applyNetworkState);
  } catch {
    // No native module (an old build): the start-up read and the app-resume reads still work.
  }
  void readNow();

  const appStateSubscription = AppState.addEventListener('change', (appState) => {
    if (appState === 'active') void readNow();
  });

  return () => {
    if (recheck === onReconnect) recheck = null;
    networkSubscription?.remove();
    appStateSubscription.remove();
  };
}
