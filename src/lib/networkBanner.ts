/**
 * The connection banner's state machine. Pure (no React Native, no expo-network), tested in networkBanner.test.ts;
 * src/lib/networkStatus.ts feeds it the phone's network events and runs the re-check it asks for.
 *
 *   online --(internet lost)--> OFFLINE "No internet connection. Please turn on your internet."
 *   OFFLINE --(internet back)--> RECONNECTING "Reconnecting..." (the session is re-checked, screens refetch)
 *   RECONNECTING --(re-check answered)--> CONNECTED "Connected" (briefly) --> hidden
 *   RECONNECTING --(server did not answer)--> hidden, and the server-status store shows "Can't reach the server"
 *   any --(internet lost)--> OFFLINE
 *
 * "Offline" is what the phone reports: no active network, or (Android) a network without confirmed internet. Because
 * that second signal is occasionally wrong, an answer from our own server proves the internet works and overrides it
 * until the phone reports a change again. "No network at all" is never overridden.
 */

export type BannerPhase = 'hidden' | 'offline' | 'reconnecting' | 'connected';

export interface NetworkBannerState {
  /** expo-network `isConnected` (null: not known yet). */
  connected: boolean | null;
  /** expo-network `isInternetReachable` (null: not known yet). */
  reachable: boolean | null;
  /** Our server answered since the phone last reported a change. */
  serverAnswered: boolean;
  phase: BannerPhase;
}

export type NetworkBannerEvent =
  | { type: 'network'; isConnected?: boolean | null; isInternetReachable?: boolean | null }
  | { type: 'server-answered' }
  /** The reconnect re-check finished: `ok` when the server answered. */
  | { type: 'recheck-done'; ok: boolean }
  /** "Connected" has been on screen long enough. */
  | { type: 'connected-shown' };

/** How long "Connected" stays up before the banner goes away. */
export const CONNECTED_VISIBLE_MS = 2000;

export const INITIAL_NETWORK_BANNER: NetworkBannerState = {
  connected: null,
  reachable: null,
  serverAnswered: false,
  phase: 'hidden',
};

function asFlag(value: boolean | null | undefined): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** True / false, or null while the phone has not said anything yet (callers treat null as online). */
export function networkOnline(state: Pick<NetworkBannerState, 'connected' | 'reachable' | 'serverAnswered'>): boolean | null {
  // No network at all is never overridden: a late answer to a request sent just before the network went is not proof.
  if (state.connected === false) return false;
  if (state.reachable === false) return state.serverAnswered;
  if (state.serverAnswered) return true;
  if (state.connected === null && state.reachable === null) return null;
  return true;
}

/** Same as networkOnline, with "not known yet" counted as online (nothing is paused or announced on a guess). */
export function isOnline(state: NetworkBannerState): boolean {
  return networkOnline(state) !== false;
}

function withOnlineChange(prev: NetworkBannerState, next: NetworkBannerState): NetworkBannerState {
  const was = networkOnline(prev);
  const now = networkOnline(next);
  if (now === false) return next.phase === 'offline' ? next : { ...next, phase: 'offline' };
  // Back from a known offline state: re-check. From "not known" to online (app start): nothing to announce.
  if (was === false && now === true) return { ...next, phase: 'reconnecting' };
  return next;
}

export function reduceNetworkBanner(state: NetworkBannerState, event: NetworkBannerEvent): NetworkBannerState {
  switch (event.type) {
    case 'network': {
      const connected = asFlag(event.isConnected);
      const reachable = asFlag(event.isInternetReachable);
      if (connected === state.connected && reachable === state.reachable) return state;
      return withOnlineChange(state, { ...state, connected, reachable, serverAnswered: false });
    }
    case 'server-answered': {
      if (state.serverAnswered) return state;
      return withOnlineChange(state, { ...state, serverAnswered: true });
    }
    case 'recheck-done': {
      if (state.phase !== 'reconnecting') return state;
      return { ...state, phase: event.ok ? 'connected' : 'hidden' };
    }
    case 'connected-shown': {
      if (state.phase !== 'connected') return state;
      return { ...state, phase: 'hidden' };
    }
    default:
      return state;
  }
}

/** What the banner shows: the network phase first, then the older "Can't reach the server" notice. */
export type BannerView = 'none' | 'offline' | 'reconnecting' | 'connected' | 'server-down';

export interface BannerViewFacts {
  phase: BannerPhase;
  /** src/lib/serverStatus.ts: requests are getting no answer. */
  serverOffline: boolean;
  /** The employee closed the "Can't reach the server" notice for this outage. */
  serverDismissed: boolean;
  signedIn: boolean;
  /** The app is still restoring the sign-in (the startup screen is up). */
  startingUp: boolean;
}

export function bannerView(f: BannerViewFacts): BannerView {
  if (f.startingUp) return 'none';
  if (f.phase !== 'hidden') return f.phase;
  // The login screens show the support contact inline instead of the server bar.
  if (f.serverOffline && !f.serverDismissed && f.signedIn) return 'server-down';
  return 'none';
}

export const BANNER_TEXT: Record<Exclude<BannerView, 'none'>, string> = {
  offline: 'No internet connection. Please turn on your internet.',
  reconnecting: 'Reconnecting...',
  connected: 'Connected',
  'server-down': "Can't reach the server",
};
