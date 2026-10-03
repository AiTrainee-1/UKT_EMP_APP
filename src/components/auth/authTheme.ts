// The look of the Login / Set Password / Forgot Password screens (and nothing else in the app).
//
// FONTS: the design asked for "Moste" and "Seatren". Those files are not in the project (and Seatren is free for personal
// use only), so two commercial-safe Google Fonts stand in, one per role:
//   display  (headlines, buttons, labels)  <- Moste's role  -> Sora
//   body     (sentences, field text)       <- Seatren's role -> Manrope
// To switch to the real fonts: put the font files in assets/fonts, load them with useFonts in app/_layout.tsx, and change
// the six names below. Nothing else needs to change.
export const AuthFont = {
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
  body: 'Manrope_500Medium',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
} as const;

export const AuthColors = {
  /** The header's base gradient: deep emerald to teal. The Lightfall animation is drawn over it. */
  gradient: ['#043B35', '#0B7A6B', '#14B8A6'] as const,
  accent: '#0E9F8E',
  accentDark: '#0B6E63',
  accentSoft: '#E6F7F4',
  /** The button's pill, and the circle that holds its dotted arrow. */
  pill: '#0A2E2B',
  pillCircle: '#5EEAD4',
  /** Lightfall streak colours: mint, teal and white against the emerald header. */
  streaks: ['#A7F3D0', '#5EEAD4', '#FFFFFF'] as string[],
  glow: '#0F766E',
};
