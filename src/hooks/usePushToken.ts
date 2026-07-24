import Constants from 'expo-constants';
import api from '../lib/api';

// It's not enough to call expo-notifications' functions conditionally —
// merely *importing* the module runs a top-level side effect
// (DevicePushTokenAutoRegistration.fx.js) that throws in Expo Go on SDK 53+.
// app/_layout.tsx is evaluated eagerly at boot (unlike a screen under app/
// that's only loaded on navigation), so a static `import` here — even
// guarded at call-time — crashed the app before the guard ever ran. `require`
// inside the function defers evaluation until after isExpoGo has already
// returned, so Expo Go never touches the module at all.
const isExpoGo = Constants.appOwnership === 'expo';

const EAS_PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId;

/**
 * Requests notification permission, obtains this device's Expo push token,
 * and registers it with the backend (POST /api/my/push-token) so server-side
 * events (leave approved, salary slip ready, chat message, ...) can reach
 * this device even when the app is closed — see backend/api/signals.py.
 * No-ops entirely under Expo Go; safe to call unconditionally on login.
 */
export async function registerPushToken(): Promise<void> {
  if (isExpoGo || !EAS_PROJECT_ID) return;

  try {
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    if (!token) return;

    await api.post('/my/push-token', { token, platform: 'expo' });
  } catch {
    // Best-effort — the app works fine on in-app notifications alone if
    // this fails (permission denied, offline, older device, etc.).
  }
}
