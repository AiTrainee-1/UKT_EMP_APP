// Type system for the "Modern Industrial Enterprise" theme.
// Headlines: Plus Jakarta Sans. Body/labels: Inter. Loaded via
// @expo-google-fonts/* and gated behind useFonts() in app/_layout.tsx —
// until that resolves, these family names fall back to the OS default,
// which is harmless (just unstyled) rather than a crash.
export const FontFamily = {
  displayBold: 'PlusJakartaSans_700Bold',
  headlineSemibold: 'PlusJakartaSans_600SemiBold',
  bodyRegular: 'Inter_400Regular',
  bodySemibold: 'Inter_600SemiBold',
};

interface TextStyleSpec {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
}

export const TextStyle: Record<string, TextStyleSpec> = {
  displayHero: { fontFamily: FontFamily.displayBold, fontSize: 32, lineHeight: 40, letterSpacing: -0.4 },
  displayHeroMobile: { fontFamily: FontFamily.displayBold, fontSize: 28, lineHeight: 36, letterSpacing: -0.4 },
  headlineLg: { fontFamily: FontFamily.displayBold, fontSize: 24, lineHeight: 32, letterSpacing: -0.3 },
  headlineMd: { fontFamily: FontFamily.headlineSemibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.15 },
  headlineSm: { fontFamily: FontFamily.headlineSemibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  titleMd: { fontFamily: FontFamily.bodySemibold, fontSize: 16, lineHeight: 22 },
  bodyLg: { fontFamily: FontFamily.bodyRegular, fontSize: 16, lineHeight: 24 },
  bodyMd: { fontFamily: FontFamily.bodyRegular, fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: FontFamily.bodyRegular, fontSize: 13, lineHeight: 18 },
  labelLg: { fontFamily: FontFamily.bodySemibold, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  labelMd: { fontFamily: FontFamily.bodySemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  labelSm: { fontFamily: FontFamily.bodySemibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.3 },
  caption: { fontFamily: FontFamily.bodyRegular, fontSize: 12, lineHeight: 16 },
};

// Applied ad hoc on Text elements showing money/timestamps/counters, not
// globally — RN's equivalent of CSS `font-variant-numeric: tabular-nums`.
// Not `as const`: RN's TextStyle wants a mutable FontVariant[], and a
// readonly tuple fails style-array typing at every call site that spreads
// this into `style={[..., TabularNums]}`.
export const TabularNums: { fontVariant: NonNullable<import('react-native').TextStyle['fontVariant']> } = {
  fontVariant: ['tabular-nums'],
};
