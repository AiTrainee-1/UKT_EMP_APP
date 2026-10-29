// Public surface of the geo-tracking engine. Importing this file registers the Expo collector (and, on the phone, defines
// the background task); the app's entry (index.ts at the repo root) imports ./collector directly so that happens before the
// first screen on every start of the bundle, including the headless one the OS performs to deliver a location.
import './collector';

export { TRACKING_STATE_KEY, ensureTracking, startOnDutyTracking, stopTrackingForSignOut, trackingAvailable } from './actions';
export {
  useAcceptConsent,
  useJourney,
  useMyJourneys,
  useSessionJourney,
  useTrackingHealth,
  useTrackingLifecycle,
  useTrackingSetup,
  useTrackingSnapshot,
  useTrackingState,
} from './useTracking';
export type { TrackerEngine, TrackingServerState, TrackingConfig } from './types.ts';
export { registerEngine } from './engineRegistry.ts';
