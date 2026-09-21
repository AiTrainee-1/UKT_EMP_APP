// UKTextiles — "Modern Industrial Enterprise" Design System
// (matches the Stitch project "Minimalist Light Mobile UI")
export const Colors = {
  // ─── Brand / Primary — Deep Sapphire ───────────────────
  primary: '#1E3A8A',
  // Royal Blue: the theme's "interactive" role (active switches, links,
  // splash background) — kept under the existing `primaryLight` key rather
  // than adding a new one, since every current call site already treats it
  // as "a lighter, more energetic primary" (see leave.tsx switch tracks,
  // Toast info border, index.tsx splash bg).
  primaryLight: '#2563EB',
  primaryFixed: '#DBEAFE',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#1E3A8A',

  // Header/hero gradient used across nearly every screen's top banner —
  // named here so every screen sources the same two stops instead of
  // hand-repeating the literal.
  gradientPrimary: ['#1E3A8A', '#2563EB'] as const,

  // Deep navy → sapphire — for hero sections that want more weight/drama
  // than the everyday gradientPrimary (e.g. Profile's parallax hero).
  gradientRoyal: ['#0F172A', '#1E3A8A', '#2563EB'] as const,
  // Blue → amber — an accent gradient for celebratory/reward-flavored UI
  // (e.g. a milestone banner), not used as a default background.
  gradientGoldAccent: ['#1E3A8A', '#D97706'] as const,

  // ─── Secondary (warm amber) ────────────────────────────
  secondary: '#D97706',
  secondaryContainer: '#FDE68A',
  secondaryFixed: '#FEF3C7',
  onSecondaryContainer: '#92400E',

  // ─── Tertiary (on-duty brown-amber) ────────────────────
  // Stitch's "action-onduty" category color is #815600 — an exact overlap
  // with the previous tertiary value, kept as-is.
  tertiary: '#815600',
  tertiaryContainer: '#FDE9C8',

  // ─── Backgrounds (light) ───────────────────────────────
  bgLight: '#F8FAFC',
  bgCard: '#FFFFFF',
  bgSurface: '#F8FAFC',
  bgSurfaceLow: '#F1F5F9',
  bgSurfaceMid: '#E9EEF3',
  bgSurfaceHigh: '#E2E8F0',
  bgSurfaceHighest: '#CBD5E1',
  bgInput: '#FFFFFF',

  // ─── Text ──────────────────────────────────────────────
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',

  // ─── Status (soft tint blocks) ──────────────────────────
  clayGreen: '#ECFDF5',
  clayRed: '#FFF1F2',
  clayYellow: '#FFFBEB',
  clayOrange: '#FFEDD5',
  clayBlue: '#EFF6FF',

  // ─── Status (vivid, for badges/icons) ─────────────────
  statusGreen: '#059669',
  statusRed: '#E11D48',
  statusYellow: '#D97706',
  statusOrange: '#E67E22',
  statusBlue: '#2563EB',
  statusGrey: '#475569',
  // On-leave: net-new semantic status, previously folded into `secondary`.
  statusLeave: '#8E44AD',

  // ─── Badge backgrounds ─────────────────────────────────
  badgeGreenBg: '#ECFDF5',
  badgeGreenText: '#047857',
  badgeRedBg: '#FFF1F2',
  badgeRedText: '#BE123C',
  badgeYellowBg: '#FFFBEB',
  badgeYellowText: '#B45309',
  badgePendingBg: '#F1F5F9',
  badgePendingText: '#475569',
  badgeBlueBg: '#DBEAFE',
  badgeBlueText: '#1E3A8A',
  badgeLeaveBg: '#FAF5FF',
  badgeLeaveText: '#7E22CE',

  // ─── Category action colors (quick-action tiles, icons) ─
  categoryOnDuty: '#815600',
  categoryPunch: '#5E35B1',
  categoryPermission: '#2980B9',
  categoryOutpass: '#009688',
  categorySalary: '#27AE60',
  categoryShift: '#E67E22',
  categoryTracking: '#0369A1',
  categoryDocs: '#00897B',
  categoryChat: '#0984E3',
  categoryDestructive: '#C62828',

  // ─── Error ─────────────────────────────────────────────
  error: '#ba1a1a',
  errorContainer: '#FFF1F2',
  onErrorContainer: '#93000a',

  // ─── Borders ───────────────────────────────────────────
  border: '#E2E8F0',
  outline: '#94A3B8',
  outlineVariant: '#CBD5E1',
};
