// The "Turn on notifications" popup's rules (owner 2026-11-25). Pure: no React Native, tested in notificationNudge.test.ts.
// The popup is src/components/notifications/NotificationPermissionPopup.tsx; reading and asking for the permission is
// src/hooks/useNotificationPermission.ts.
//
// The popup must never cause a loop (2026-11-25, keyboard bug on Redmi / Infinix: every system permission dialog sends
// the app to the background and back). So:
//   - it is decided once per sign-in session, and only when notifications are really off;
//   - it shows at most once a day: the time it was last shown (or put off with "Not now") is kept on the phone;
//   - the system dialog is only opened by a tap on "Turn on notifications", never when the app comes back to the front
//     (coming back only closes the popup if notifications were turned on meanwhile).

/** AsyncStorage key: when the popup was last shown or put off (ms since 1970, as text). */
export const NOTIFICATION_NUDGE_KEY = 'uktextiles.notificationNudge.v1';

/** At most once a day. */
export const NOTIFICATION_NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** A time this far in the future means the phone's clock was moved back: it does not hold the popup off. */
const CLOCK_SLACK_MS = 60 * 1000;

/** What the phone says about the app's notifications. */
export interface NotificationAccess {
  granted: boolean;
  /** False once the phone will not show its "Allow notifications?" dialog again: only its settings can turn them on. */
  canAskAgain: boolean;
}

/** The stored "last shown" time, or null when there is none (or it is not a number). */
export function parseShownAt(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Whether to show the popup now: notifications are known to be off, and it was not shown (or put off) in the last day.
 * `access` null = the phone could not say (web, Expo Go on iOS): never shown then.
 */
export function shouldOfferNotifications(
  access: NotificationAccess | null,
  lastShownAt: number | null,
  now: number,
  cooldownMs: number = NOTIFICATION_NUDGE_COOLDOWN_MS,
): boolean {
  if (!access || access.granted) return false;
  if (lastShownAt == null) return true;
  if (lastShownAt > now + CLOCK_SLACK_MS) return true;
  return now - lastShownAt >= cooldownMs;
}

/** What "Turn on notifications" does: open the phone's own dialog while it still can, else the app's settings page. */
export function notificationButtonAction(access: NotificationAccess): 'ask' | 'settings' {
  return access.canAskAgain ? 'ask' : 'settings';
}

/**
 * expo-notifications' answer (getPermissionsAsync / requestPermissionsAsync) as NotificationAccess.
 *
 * `status` decides, not `granted`: on Android 13+ expo-notifications says granted (the runtime permission) with status
 * "denied" when the app's notifications are switched off in the phone's settings - then only the settings can turn
 * them back on, the dialog cannot.
 */
export function accessFromExpo(res: {
  granted?: boolean;
  status?: string;
  canAskAgain?: boolean;
  /** iOS: 2 = authorized, 3 = provisional, 4 = ephemeral all let notifications through. */
  iosStatus?: number | null;
}): NotificationAccess {
  const iosAllowed = res.iosStatus === 2 || res.iosStatus === 3 || res.iosStatus === 4;
  const granted = (res.status != null ? res.status === 'granted' : res.granted === true) || iosAllowed;
  if (granted) return { granted: true, canAskAgain: true };
  if (res.granted === true) return { granted: false, canAskAgain: false };
  return { granted: false, canAskAgain: res.canAskAgain !== false };
}

/** React Native's PermissionsAndroid answer for POST_NOTIFICATIONS (used where expo-notifications cannot load: Expo Go). */
export function accessFromAndroidResult(result: string): NotificationAccess {
  if (result === 'granted') return { granted: true, canAskAgain: true };
  return { granted: false, canAskAgain: result !== 'never_ask_again' };
}

/** Why the app wants notifications: the popup's list. */
export const NOTIFICATION_REASONS: readonly { icon: string; text: string }[] = [
  { icon: 'clipboard-check-outline', text: 'Approvals waiting for you' },
  { icon: 'file-document-edit-outline', text: 'Updates on your requests' },
  { icon: 'message-reply-text-outline', text: 'Replies to your enquiries' },
  { icon: 'qrcode', text: 'Your gate pass, when it is ready' },
];

// ── things that hold the popup back ─────────────────────────────────────────

/**
 * Named reasons to keep the popup out of the way for now (the first-run permission dialogs, the "Permission Needed" card,
 * the app tour). While any is on the popup waits; if it was already open it hides and comes back afterwards.
 */
export interface HoldSet {
  set(key: string, on: boolean): void;
  held(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createHoldSet(): HoldSet {
  const keys = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    set(key, on) {
      const had = keys.has(key);
      if (on === had) return;
      if (on) keys.add(key);
      else keys.delete(key);
      listeners.forEach((l) => l());
    },
    held: () => keys.size > 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
