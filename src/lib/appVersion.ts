import Constants from 'expo-constants';

/**
 * The version of this build, from app.json ("version"): the one place to change when a new
 * release is made. Everything that shows or compares the version reads it from here, so the
 * splash screen, login page, profile and the "New Version Available" check can never disagree.
 */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '3.0.0';

/** "v3.0.0", for the small version pills. */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
