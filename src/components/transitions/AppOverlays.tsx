import React from 'react';

import { SignOutDialog } from '../auth/SignOutDialog';
import { LocationOffPopup } from '../location/LocationOffPopup';
import { NotificationPermissionPopup } from '../notifications/NotificationPermissionPopup';
import { AuthTransitionOverlay } from './AuthTransitionOverlay';

/**
 * The app-wide popups that any screen or flow can open (owner 2026-11-25), mounted once in app/_layout.tsx after the
 * screens: the logout confirmation (useConfirmSignOut), the "location is off" popup (ensureLocationOn), the "turn on
 * notifications" popup (opens itself, at most once a day, while notifications are off) and the sign-in / sign-out
 * transitions (src/lib/authTransition.ts). Each draws nothing until it is opened.
 */
export function AppOverlays() {
  return (
    <>
      <SignOutDialog />
      <NotificationPermissionPopup />
      <LocationOffPopup />
      <AuthTransitionOverlay />
    </>
  );
}
