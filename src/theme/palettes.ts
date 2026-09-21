import { Colors as LightPalette } from '../constants/colors';

/**
 * Two full palettes over one key set.
 *
 * `light` is re-exported from constants/colors so there is exactly one
 * definition of it.
 *
 * `dark` is derived from the same source the light palette already draws
 * from: the light tokens (`#F8FAFC`/`#0F172A`/`#334155`/`#64748B`/`#E2E8F0`/
 * `#CBD5E1`) are literally Tailwind's slate-50/900/700/500/200/300. Reading
 * that same slate ramp the other direction (950/900/800/700/600/500→400)
 * gives a dark surface/text/border scale with the hue held automatically
 * consistent, instead of a hand-picked, unrelated set of hex constants.
 * Brand and status hues keep their identity but move lighter/more saturated
 * for legibility on a dark ground, following the same technique this file
 * already used for its previous (teal) dark palette.
 *
 * Two rules:
 *  1. Surfaces climb in lightness with elevation — on a dark ground,
 *     "raised" means lighter, the opposite of the light ramp.
 *  2. Brand/status colors used as text or icon fills get a lighter step
 *     than the light-mode value; colors used only as a soft tint block get
 *     a deep, low-lightness tint of the same hue instead of a pastel.
 */

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
  // Deep Sapphire reads as near-black on a dark ground; lighten to a
  // legible blue for icon/text use (primary's dominant role in this app).
  primary: '#60A5FA',
  primaryLight: '#3B82F6',
  primaryFixed: '#1E3A5F',
  onPrimary: '#0B1220',
  onPrimaryContainer: '#93C5FD',

  gradientPrimary: ['#0B1220', '#1E3A5F'] as const,
  gradientRoyal: ['#0B1220', '#111827', '#1E3A5F'] as const,
  gradientGoldAccent: ['#1E3A5F', '#78350F'] as const,

  // ─── Secondary (warm amber) ────────────────────────────
  secondary: '#FBBF24',
  secondaryContainer: '#78350F',
  secondaryFixed: '#5C2E0A',
  onSecondaryContainer: '#FCD34D',

  // ─── Tertiary (on-duty brown-amber) ────────────────────
  tertiary: '#D9A441',
  tertiaryContainer: '#4A3208',

  // ─── Backgrounds ───────────────────────────────────────
  // Derived ramp: slate-950 → slate-700, so elevation reads correctly.
  bgLight: '#0B1220',
  bgCard: '#111827',
  bgSurface: '#0B1220',
  bgSurfaceLow: '#0F172A',
  bgSurfaceMid: '#152238',
  bgSurfaceHigh: '#1E293B',
  bgSurfaceHighest: '#334155',
  bgInput: '#111827',

  // ─── Text ──────────────────────────────────────────────
  textPrimary: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',

  // ─── Status (soft tint blocks → deep tints) ────────────
  // Light mode fills these with pale tints; at full strength on a dark
  // ground they'd glow, so each becomes a deep tint carrying the same hue.
  clayGreen: '#0F2E22',
  clayRed: '#3F1720',
  clayYellow: '#3D2E0A',
  clayOrange: '#3D220A',
  clayBlue: '#0F2A4A',

  // ─── Status (vivid, for badges/icons) ─────────────────
  statusGreen: '#34D399',
  statusRed: '#FB7185',
  statusYellow: '#FBBF24',
  statusOrange: '#FB923C',
  statusBlue: '#38BDF8',
  statusGrey: '#94A3B8',
  statusLeave: '#C084FC',

  // ─── Badge backgrounds ─────────────────────────────────
  badgeGreenBg: '#0F2E22',
  badgeGreenText: '#6EE7B7',
  badgeRedBg: '#3F1720',
  badgeRedText: '#FCA5A5',
  badgeYellowBg: '#3D2E0A',
  badgeYellowText: '#FCD34D',
  badgePendingBg: '#1E293B',
  badgePendingText: '#94A3B8',
  badgeBlueBg: '#0F2A4A',
  badgeBlueText: '#93C5FD',
  badgeLeaveBg: '#2E1065',
  badgeLeaveText: '#D8B4FE',

  // ─── Category action colors ────────────────────────────
  categoryOnDuty: '#D9A441',
  categoryPunch: '#9575CD',
  categoryPermission: '#5DADE2',
  categoryOutpass: '#2DD4BF',
  categorySalary: '#4ADE80',
  categoryShift: '#FB923C',
  categoryTracking: '#38BDF8',
  categoryDocs: '#2DD4BF',
  categoryChat: '#38BDF8',
  categoryDestructive: '#FB7185',

  // ─── Error ─────────────────────────────────────────────
  error: '#FF9C92',
  errorContainer: '#4a1f1f',
  onErrorContainer: '#ffdad6',

  // ─── Borders ───────────────────────────────────────────
  border: '#1E293B',
  outline: '#64748B',
  outlineVariant: '#334155',
};
