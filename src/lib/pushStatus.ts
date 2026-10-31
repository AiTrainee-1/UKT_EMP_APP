// Whether this phone can receive phone (push) notifications, and what to tell the person when it cannot.
//
// Pure on purpose (no React Native imports): the registration code in src/hooks/usePushToken.ts records what happened here, the
// Notifications screen reads it, and the words are testable. A push reaches a closed app only when ALL of these are true: the
// build has Firebase (FCM) credentials, the person allowed notifications, the phone's Expo token reached the server, and the
// server sent the push. The first three are decided on the phone, so the phone has to say which one is missing.

export type PushSetupState =
  | 'unknown' // not tried yet
  | 'ok' // permission given and the token is registered on the server
  | 'permission_denied' // the person (or Android) blocked notifications
  | 'fcm_missing' // this build has no Firebase (FCM) setup, so Android cannot give the app a push address
  | 'no_project' // the build has no Expo project id
  | 'expo_go' // Expo Go cannot receive push notifications at all
  | 'server_error' // got a token but the server did not take it (offline, signed out)
  | 'failed'; // anything else

export type PushSetup = { state: PushSetupState; detail?: string };

/** Android's / Expo's wording when a build was made without google-services.json (Firebase). */
const FCM_MISSING = /firebaseapp|\bfcm\b|google-services|googleservices|fetching the token failed|sender id|senderid/i;

/** What went wrong while asking Expo for the push token. */
export function classifyPushError(error: unknown): PushSetupState {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return FCM_MISSING.test(text) ? 'fcm_missing' : 'failed';
}

export type PushBanner = {
  title: string;
  body: string;
  /** What the button does: open the phone's settings for this app, or try to register again. */
  action: 'settings' | 'retry';
  actionLabel: string;
};

/** What the Notifications screen tells the person; null when there is nothing to say. */
export function describePushSetup(setup: PushSetup): PushBanner | null {
  switch (setup.state) {
    case 'permission_denied':
      return {
        title: 'Phone notifications are blocked',
        body: 'Allow notifications for UKTextiles in your phone settings to get alerts on the lock screen, even when the app is closed.',
        action: 'settings',
        actionLabel: 'Open settings',
      };
    case 'fcm_missing':
      return {
        title: 'This build cannot receive phone notifications yet',
        body: 'Notifications will still appear here in the app. Ask IT to install the latest version of the app (it needs Firebase set up).',
        action: 'retry',
        actionLabel: 'Check again',
      };
    case 'server_error':
      return {
        title: 'Phone notifications are not connected yet',
        body: 'The app could not register this phone with the server. Check your internet connection and try again.',
        action: 'retry',
        actionLabel: 'Try again',
      };
    case 'failed':
      return {
        title: 'Phone notifications could not be set up',
        body: 'Notifications still appear here in the app. Try again, or ask IT if it keeps happening.',
        action: 'retry',
        actionLabel: 'Try again',
      };
    default:
      return null;
  }
}

let current: PushSetup = { state: 'unknown' };
const listeners = new Set<() => void>();

export const getPushSetup = (): PushSetup => current;

export function setPushSetup(next: PushSetup): void {
  current = next;
  listeners.forEach((listener) => listener());
}

export function subscribePushSetup(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
