import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { IS_EXPO_GO } from '../lib/expoGoRuntime';
import api from '../lib/api';
import { classifyPushError, getPushSetup, setPushSetup, type PushSetup } from '../lib/pushStatus';

// It's not enough to call expo-notifications' functions conditionally —
// merely *importing* the module runs a top-level side effect
// (DevicePushTokenAutoRegistration.fx.js) that throws in Expo Go on SDK 53+.
// app/_layout.tsx is evaluated eagerly at boot (unlike a screen under app/
// that's only loaded on navigation), so a static `import` here — even
// guarded at call-time — crashed the app before the guard ever ran. `require`
// inside the function defers evaluation until after isExpoGo has already
// returned, so Expo Go never touches the module at all.
const isExpoGo = IS_EXPO_GO;

const EAS_PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId;

/** The Android channel the server names in every push (backend/api/signals.py sends channelId "default"). */
const CHANNEL_ID = 'default';

let running: Promise<PushSetup> | null = null;

function record(setup: PushSetup): PushSetup {
  setPushSetup(setup);
  return setup;
}

/**
 * Android 8+ shows a push only through a channel; from Android 13 the permission prompt does not even appear until one
 * exists. A MAX-importance channel is what makes the message pop up on the lock screen and in the status bar with sound.
 * No `sound` key on purpose: leaving it out gives the phone's default notification sound ('default' is read as the name of
 * a custom sound file and logs an error). Safe to call again (it only updates the channel).
 */
export async function ensureNotificationChannel(Notifications: typeof import('expo-notifications')): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'UKTextiles alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
    showBadge: true,
  });
}

async function register(): Promise<PushSetup> {
  if (isExpoGo) return record({ state: 'expo_go' });
  if (!EAS_PROJECT_ID) return record({ state: 'no_project' });

  let Notifications: typeof import('expo-notifications');
  try {
    Notifications = require('expo-notifications') as typeof import('expo-notifications');
  } catch (error) {
    return record({ state: 'failed', detail: String(error) });
  }

  try {
    await ensureNotificationChannel(Notifications);

    // Only CHECKED here, never asked (owner 2026-11-25): this runs at sign-in and again every time the app comes back to
    // the front while the last try failed, and asking opens a system dialog, which sends the app to the background and
    // back - the loop that kept closing the keyboard on Redmi / Infinix. The "Turn on notifications" popup
    // (src/components/notifications/NotificationPermissionPopup.tsx) asks, on a tap, and registers again once allowed.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return record({ state: 'permission_denied' });

    let token: string;
    try {
      ({ data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID }));
    } catch (error) {
      // Without Firebase (google-services.json) in the build Android cannot give the app a push address at all.
      return record({ state: classifyPushError(error), detail: String(error) });
    }
    if (!token) return record({ state: 'failed', detail: 'No push token was returned' });

    try {
      await api.post('/my/push-token', { token, platform: 'expo' });
    } catch (error) {
      return record({ state: 'server_error', detail: String(error) });
    }
    return record({ state: 'ok' });
  } catch (error) {
    return record({ state: 'failed', detail: String(error) });
  }
}

/**
 * Creates the Android notification channel, checks notification permission (never asks: see register()), obtains this
 * device's Expo push token and registers it with the backend (POST /api/my/push-token), so server-side events (leave
 * approved, salary slip ready, chat message, ...) reach this phone's notification bar even when the app is closed — see
 * backend/api/signals.py.
 *
 * Never throws: what happened is kept in src/lib/pushStatus.ts, which the Notifications screen reads to tell the person
 * what is missing. No-ops under Expo Go. Calls made while one is running share its result.
 */
export function registerPushToken(): Promise<PushSetup> {
  if (!running) {
    running = register().finally(() => {
      running = null;
    });
  }
  return running;
}

/** Tries again only when the last attempt did not succeed (the app coming back to the front, the person pressing "Try again"). */
export function retryPushRegistrationIfNeeded(): Promise<PushSetup> {
  const current = getPushSetup();
  if (current.state === 'ok' || current.state === 'expo_go' || current.state === 'no_project') {
    return Promise.resolve(current);
  }
  return registerPushToken();
}
