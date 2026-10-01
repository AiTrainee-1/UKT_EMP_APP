/**
 * Where the on-screen keyboard is, and how far a view needs to move to stay clear of it.
 *
 * Kept free of React Native imports so it can be tested on its own. All numbers are
 * density-independent pixels, measured from the top of the window.
 *
 * Why this exists: an app that targets Android 15+ (every current EAS build) is drawn edge to
 * edge, and then the system no longer shrinks the window when the keyboard opens. Expo Go and
 * older builds still do. Code that assumes either behaviour is wrong in the other, so the
 * question asked here is only "is this view actually covered right now?", answered from where
 * the view really is. If the system already moved it, the answer is 0 and nothing is added.
 */

export interface KeyboardMetrics {
  /** Height RN reports for the keyboard, not counting the navigation bar under it. */
  height: number;
  /** Top edge of the keyboard as RN reports it (Android: the visible window's bottom edge). */
  screenY: number;
}

/**
 * Y of the keyboard's top edge.
 *
 * Two independent estimates, and the higher-up (smaller) one wins:
 *  - the size-based one: the display's height minus the keyboard and the navigation bar it sits over;
 *  - RN's own `screenY`, used only when it is plausible (below the top quarter of the screen and above
 *    the very bottom, where "the window wasn't resized" would leave it).
 */
export function keyboardTop(metrics: KeyboardMetrics, navBarInset: number, screenHeight: number): number {
  const bySize = screenHeight - (metrics.height + navBarInset);
  const reportedIsUsable = metrics.screenY > screenHeight * 0.25 && metrics.screenY < screenHeight;
  return reportedIsUsable ? Math.min(bySize, metrics.screenY) : bySize;
}

/** How far a view whose bottom edge is at `viewBottom` is covered by a keyboard starting at `top`. */
export function coveredBy(viewBottom: number, top: number): number {
  return Math.max(0, Math.round(viewBottom - top));
}

/**
 * How far to scroll so a focused input ends above the keyboard, or 0 if it already does.
 * `margin` leaves a little air between the text and the keyboard.
 */
export function scrollToReveal(inputBottom: number, top: number, margin = 16): number {
  return Math.max(0, Math.round(inputBottom + margin - top));
}
