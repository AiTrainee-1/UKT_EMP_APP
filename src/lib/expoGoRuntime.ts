import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import { isExpoGoEnvironment } from './expoGo';

/**
 * True when this JavaScript is running inside the Expo Go client. `isRunningInExpoGo()` is Expo's own check (it looks for the
 * ExpoGo native module); the Constants-based check is the fallback. Evaluated once: it cannot change while the app runs.
 *
 * The first attempt used only `Constants.appOwnership`, which SDK 58 deprecates and no longer fills in Expo Go, so
 * expo-notifications was loaded there and crashed the start-up.
 */
export const IS_EXPO_GO: boolean = (() => {
  try {
    if (isRunningInExpoGo()) return true;
  } catch {
    // fall through to the Constants check
  }
  return isExpoGoEnvironment(Constants);
})();
