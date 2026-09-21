import { Platform } from 'react-native';

// 8pt grid (Stitch "Modern Industrial Enterprise" spacing scale).
// `md`/`lg` shift up from the previous 12/20 — every screen that pads with
// them will visibly reflow. That's expected: this is a full reskin.
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
};

// `xl` is redefined to land on 16px so the many call sites already using
// `BorderRadius.xl` for cards (Card.tsx, etc.) get the new "rounded-2xl"
// card radius without individually touching every call site.
export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 16,
  xxl: 24,
  full: 9999,
};

// ─── Elevation ────────────────────────────────────────────────────────────
// Flat, crisp-hairline elevation (Stitch spec) rather than the previous
// clay "lifted" look — shadow color moves from brand blue to slate
// (rgba(15,23,42,...)), radius/opacity shrink to a subtle ambient lift.
// Kept as `ClayElevation` (not renamed) so the ~9 existing call sites don't
// need touching — only the values change, which is what actually matters
// for the visual reskin.
export const ClayElevation = {
  // Level 1 — cards & modules.
  low: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
    },
    android: { elevation: 1 },
    default: {},
  }),
  // Level 2 — dropdowns & floating anchors (e.g. SlideToPunch).
  mid: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
    },
    android: { elevation: 3 },
    default: {},
  }),
  // Level 3 — modal sheets & FAB.
  high: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 15,
    },
    android: { elevation: 8 },
    default: {},
  }),
  button: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.10,
      shadowRadius: 10,
    },
    android: { elevation: 5 },
    default: {},
  }),
};

// On a dark ground, drop shadows barely read — a faint light border reads
// as the depth cue instead. Spread with `borderWidth:1, borderColor` at the
// call site when `isDark` is true; exported here so every screen sources
// the same literal instead of re-guessing an alpha value.
export const DarkElevationBorderColor = 'rgba(255,255,255,0.06)';
