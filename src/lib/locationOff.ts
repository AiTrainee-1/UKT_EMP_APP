// "Your phone's location is off" in ONE place (owner 2026-11-25): what the popup says for each feature, and how to tell
// that a failed location request failed because location (GPS) is switched off. Pure: no React Native, tested in
// locationOff.test.ts. The popup is src/components/location/LocationOffPopup.tsx; the check that opens it is
// ensureLocationOn() in src/hooks/useLocationServices.ts.

/** Which feature needs the location: decides the popup's explanation. */
export type LocationReason = 'punch' | 'on_duty' | 'tracking' | 'general';

export interface LocationOffCopy {
  title: string;
  body: string;
}

export const LOCATION_OFF_TITLE = 'Your location is off';
export const LOCATION_ON_TITLE = 'Location is on';

const BODY: Record<LocationReason, string> = {
  punch: "Turn on your phone's location so we can check you are at your branch and record your punch.",
  on_duty: "Turn on your phone's location to record this On-Duty punch at the place you are.",
  tracking: "Your On-Duty route is not recorded while your phone's location is off. Turn it on to keep recording.",
  general: "Turn on your phone's location to use this.",
};

export function locationOffCopy(reason: LocationReason = 'general'): LocationOffCopy {
  return { title: LOCATION_OFF_TITLE, body: BODY[reason] ?? BODY.general };
}

/** What a punch screen says after the person closed the popup with location still off. */
export const LOCATION_STILL_OFF = 'Location is off. Turn it on, then try again.';

// expo-location's own errors when the phone's location is switched off: Android (CodedException names) and iOS.
const OFF_CODES = new Set([
  'ERR_CURRENT_LOCATION_IS_UNAVAILABLE',
  'ERR_LOCATION_SETTINGS_UNSATISFIED',
  'ERR_LOCATION_UNAVAILABLE',
  'ERR_LOCATION_SERVICES_DISABLED',
  'E_LOCATION_SERVICES_DISABLED',
  'E_LOCATION_SETTINGS_UNSATISFIED',
]);
const OFF_MESSAGE = /location services are (enabled|disabled)|unsatisfied device settings|location services? (is|are) (off|disabled|turned off)/i;

/** True when a location request failed because the phone's location is switched off. */
export function isLocationOffError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && OFF_CODES.has(code)) return true;
  return typeof message === 'string' && OFF_MESSAGE.test(message);
}
