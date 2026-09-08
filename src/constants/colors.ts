// UKTextiles — Claymorphism Light Design System
export const Colors = {
  // ─── Brand / Primary ───────────────────────────────────
  primary: '#006496',
  primaryLight: '#5dbbff',
  primaryFixed: '#cce5ff',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#004970',

  // Header/hero gradient used across nearly every screen's top banner —
  // named here so every screen sources the same two stops instead of
  // hand-repeating the literal.
  gradientPrimary: ['#006496', '#0090d0'] as const,

  // Deep blue → near-black — for hero sections that want more weight/drama
  // than the everyday gradientPrimary (e.g. Profile's parallax hero).
  gradientRoyal: ['#001f3f', '#004970', '#006496'] as const,
  // Blue → gold — an accent gradient for celebratory/reward-flavored UI
  // (e.g. a milestone banner), not used as a default background.
  gradientGoldAccent: ['#006496', '#c99a1f'] as const,

  // ─── Secondary (golden) ────────────────────────────────
  secondary: '#735c00',
  secondaryContainer: '#fed65b',
  secondaryFixed: '#ffe088',
  onSecondaryContainer: '#745c00',

  // ─── Tertiary (amber) ──────────────────────────────────
  tertiary: '#815600',
  tertiaryContainer: '#eba62e',

  // ─── Backgrounds (light) ───────────────────────────────
  bgLight: '#f6fafe',
  bgCard: '#ffffff',
  bgSurface: '#f6fafe',
  bgSurfaceLow: '#f0f4f8',
  bgSurfaceMid: '#eaeef2',
  bgSurfaceHigh: '#e4e9ed',
  bgSurfaceHighest: '#dfe3e7',
  bgInput: '#f0f4f8',

  // ─── Text ──────────────────────────────────────────────
  textPrimary: '#171c1f',
  textSecondary: '#3f4850',
  textMuted: '#6f7881',

  // ─── Status (clay pastel) ──────────────────────────────
  clayGreen: '#a5d6a7',
  clayRed: '#ef9a9a',
  clayYellow: '#ffe082',
  clayOrange: '#ffcc80',
  clayBlue: '#90caf9',

  // ─── Status (vivid, for badges/icons) ─────────────────
  statusGreen: '#2e7d32',
  statusRed: '#c62828',
  statusYellow: '#f57f17',
  statusOrange: '#d84315',
  statusBlue: '#006496',
  statusGrey: '#546e7a',

  // ─── Badge backgrounds ─────────────────────────────────
  badgeGreenBg: '#a5d6a7',
  badgeGreenText: '#1b5e20',
  badgeRedBg: '#ef9a9a',
  badgeRedText: '#b71c1c',
  badgeYellowBg: '#ffe082',
  badgeYellowText: '#e65100',
  badgePendingBg: '#fed65b',
  badgePendingText: '#745c00',
  badgeBlueBg: '#cce5ff',
  badgeBlueText: '#004970',

  // ─── Error ─────────────────────────────────────────────
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // ─── Borders ───────────────────────────────────────────
  border: '#bfc7d2',
  outline: '#6f7881',
  outlineVariant: '#dfe3e7',
};
