/**
 * Expo Go detection and a loader for expo-notifications that can never throw.
 *
 * Why this exists: expo-notifications cannot run inside Expo Go on Android (since SDK 53 remote push is gone, and SDK 58's
 * module needs the native `ExpoTopicSubscriptionModule`, which Expo Go does not ship). Merely `require`-ing the package
 * throws there. The old guard (`Constants.appOwnership === 'expo'`) is deprecated in SDK 58 and no longer reliably says
 * "this is Expo Go", so the require ran and the whole root layout crashed ("Cannot find native module
 * 'ExpoTopicSubscriptionModule'", then "Cannot read property 'setNotificationHandler' of undefined").
 *
 * Two layers now: a better Expo Go check, and a loader that returns null instead of throwing whenever the module cannot be
 * loaded for any reason (Expo Go, an old build without the module, a test). Callers treat null as "no notifications here".
 */

export type ConstantsLike = {
  executionEnvironment?: string | null;
  appOwnership?: string | null;
};

/** True when the app is running inside the Expo Go client (not a development build, not a store build). */
export function isExpoGoEnvironment(constants: ConstantsLike): boolean {
  return constants.executionEnvironment === 'storeClient' || constants.appOwnership === 'expo';
}

/**
 * Wraps a loader so it runs at most once and never throws: the first failure is remembered (the module cannot appear later in
 * the same session) and every call after it returns null at once.
 */
export function makeSafeLoader<T>(load: () => T, onFail?: (error: unknown) => void): () => T | null {
  let done = false;
  let value: T | null = null;
  return () => {
    if (done) return value;
    done = true;
    try {
      value = load();
    } catch (error) {
      value = null;
      onFail?.(error);
    }
    return value;
  };
}
