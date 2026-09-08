import { Colors as LightPalette } from '../constants/colors';

/**
 * Two full palettes over one key set.
 *
 * `light` is re-exported from constants/colors so there is exactly one
 * definition of it.
 *
 * `dark` is built from the five brand colours supplied for dark mode:
 *
 *   #091413  ink      the app ground, and text sitting on a filled accent
 *   #285A48  moss     the top of the surface ramp, borders, dividers
 *   #408A71  jade     mid accent -fills, success, secondary emphasis
 *   #B0E4CC  mint     the primary text/icon accent on dark ground
 *   #234C6A  slate    the cool counterpoint -active pills, info, links
 *
 * Only the neutral steps BETWEEN ink and moss are derived; every accent is
 * one of the five. Two rules govern the assignment:
 *
 *  1. Surfaces climb in lightness with elevation. On a dark ground raised
 *     means lighter, the opposite of the light ramp, so bgLight is deepest
 *     and each "higher" surface moves toward moss.
 *  2. Anything used as text or an icon on the ground gets mint, not jade.
 *     Jade on ink is around 5:1 -fine for a fill or a bold label, short of
 *     comfortable for 11px secondary text, which this app has a lot of.
 */

const INK = '#091413';
const MOSS = '#285A48';
const JADE = '#408A71';
const MINT = '#B0E4CC';
const SLATE = '#234C6A';

/** The gradients are declared `as const` in constants/colors, which types
 *  them as their exact literal hex tuples -so a dark palette supplying any
 *  other colour fails to match. Widen just those three to string tuples;
 *  every flat colour key stays exactly as inferred, so a dark palette that
 *  misses a key is still a compile error. */
export type Palette = Omit<
  typeof LightPalette,
  'gradientPrimary' | 'gradientRoyal' | 'gradientGoldAccent'
> & {
  gradientPrimary: readonly [string, string];
  gradientRoyal: readonly [string, string, string];
  gradientGoldAccent: readonly [string, string];
};

export const light: Palette = LightPalette;

export const dark: Palette = {
  // ─── Brand / Primary ───────────────────────────────────
  // Mint is the primary, because `primary` is used as a text and icon colour
  // far more often than as a fill in this app (active tab, links, headings).
  primary: MINT,
  primaryLight: '#d6f2e5',
  primaryFixed: SLATE,     // the tinted pill behind an active icon
  onPrimary: INK,          // text on a mint-filled button
  onPrimaryContainer: MINT,

  // Headers keep their weight but move to the dark family. The old blue
  // gradient over a near-black app read as a bright slab floating on ink.
  gradientPrimary: [INK, MOSS] as const,
  gradientRoyal: [INK, '#132A24', MOSS] as const,
  gradientGoldAccent: [SLATE, JADE] as const,

  // ─── Secondary (golden → jade) ─────────────────────────
  // The light theme's gold has no counterpart in the dark five; jade takes
  // the "secondary emphasis" role so nothing falls back to an unmapped hue.
  secondary: MINT,
  secondaryContainer: MOSS,
  secondaryFixed: '#1A3229',
  onSecondaryContainer: MINT,

  // ─── Tertiary ──────────────────────────────────────────
  tertiary: JADE,
  tertiaryContainer: '#1A3229',

  // ─── Backgrounds ───────────────────────────────────────
  // Derived ramp: ink → moss, so elevation reads correctly.
  bgLight: INK,
  bgCard: '#10201C',
  bgSurface: INK,
  bgSurfaceLow: '#142822',
  bgSurfaceMid: '#1A3229',
  bgSurfaceHigh: '#1F4235',
  bgSurfaceHighest: MOSS,
  bgInput: '#142822',

  // ─── Text ──────────────────────────────────────────────
  textPrimary: '#e7f5ee',
  textSecondary: MINT,
  textMuted: '#7fae9b',

  // ─── Status (clay pastel → deep tints) ─────────────────
  // Light mode fills these large blocks with pastels; at full strength on a
  // dark ground they glow, so each becomes a deep tint carrying the same hue.
  clayGreen: '#17392c',
  clayRed: '#4a1f1f',
  clayYellow: '#3d3413',
  clayOrange: '#432a12',
  clayBlue: '#152f42',

  // ─── Status (vivid, for badges/icons) ─────────────────
  statusGreen: '#7fd3ad',
  statusRed: '#ff9c92',
  statusYellow: '#e8c46a',
  statusOrange: '#f5a869',
  statusBlue: '#8fc4ea',
  statusGrey: '#7fae9b',

  // ─── Badge backgrounds ─────────────────────────────────
  badgeGreenBg: '#17392c',
  badgeGreenText: MINT,
  badgeRedBg: '#4a1f1f',
  badgeRedText: '#ffb4ab',
  badgeYellowBg: '#3d3413',
  badgeYellowText: '#e8c46a',
  badgePendingBg: '#3d3413',
  badgePendingText: '#e8c46a',
  badgeBlueBg: SLATE,
  badgeBlueText: '#cfe6f7',

  // ─── Error ─────────────────────────────────────────────
  error: '#ff9c92',
  errorContainer: '#4a1f1f',
  onErrorContainer: '#ffdad6',

  // ─── Borders ───────────────────────────────────────────
  border: MOSS,
  outline: '#7fae9b',
  outlineVariant: '#1F4235',
};
