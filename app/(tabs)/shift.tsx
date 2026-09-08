import ShiftScreen from '../shift/index';

/**
 * My Shift is a primary tab now, not only a pushed stack screen.
 *
 * The screen itself still lives at app/shift/index.tsx so every existing link
 * to /shift (Quick Actions, the side drawer, deep links) keeps working — this
 * renders the same component rather than duplicating it.
 *
 * `topInset` because the tab has no header: without it the first card renders
 * underneath the status bar.
 */
export default function ShiftTab() {
  return <ShiftScreen topInset />;
}
