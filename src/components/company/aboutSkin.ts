import { createContext, useContext } from 'react';
import { Platform, type TextStyle } from 'react-native';

import { FontFamily } from '../../constants/typography';

/**
 * The About UK Textiles screen's own skin. Like the owner's demo sites it commits to a dark
 * midnight-indigo canvas with cream / royal-indigo colour blocks in BOTH app themes, so it does
 * not read from the app palette. Text pairs used here (all WCAG AA or better):
 *   cream #FCF0D6 / mutedOnDark on ink1 #0E0929 ............ 16.9 : 1 / 9 : 1
 *   butter #F3F298, pink #FF9DB0, peri #B9BCFF on ink1 ..... 15.8 / 9.6 / 10.9 : 1
 *   ink #140F33 / inkMuted #4A4466 / crimson on cream ...... 16.6 / 8.1 / 6.3 : 1
 *   cream / butter on royal #2E2F8F ........................ 9.7 / 9.4 : 1
 *   ink / crimson on butter ................................ 16 / 6 : 1
 * Crimson is only ever text on cream or butter; on the dark canvas it is a glow or a rule.
 */
export const SKIN = {
  ink0: '#010B13',
  ink1: '#0E0929',
  ink2: '#18124A',
  royal: '#2E2F8F',
  royalDeep: '#24256F',
  cream: '#FCF0D6',
  creamCard: '#FFF8EA',
  ink: '#140F33',
  inkMuted: '#4A4466',
  butter: '#F3F298',
  crimson: '#B40023',
  pink: '#FF9DB0',
  peri: '#B9BCFF',
  blueGlow: '#3340E0',
  mutedOnDark: 'rgba(252,240,214,0.76)',
  faintOnDark: 'rgba(252,240,214,0.62)',
  hairDark: 'rgba(252,240,214,0.14)',
  glass: 'rgba(255,255,255,0.055)',
  glassStrong: 'rgba(255,255,255,0.09)',
  hairCream: 'rgba(20,15,51,0.16)',
} as const;

export type Accent = 'butter' | 'peri' | 'pink';

export const ACCENT: Record<Accent, string> = { butter: SKIN.butter, peri: SKIN.peri, pink: SKIN.pink };

/** Font families the screen uses. The serif accent is an italic face; the fallback fakes it with fontStyle. */
export interface AboutFonts {
  display: string;
  displaySemi: string;
  serifItalic: TextStyle;
  mono: string;
  body: string;
  bodySemi: string;
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string;

export const LOADED_FONTS: AboutFonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  // The face itself is italic: adding fontStyle here would make Android slant it a second time.
  serifItalic: { fontFamily: 'InstrumentSerif_400Regular_Italic' },
  mono: MONO,
  body: FontFamily.bodyRegular,
  bodySemi: FontFamily.bodySemibold,
};

/** Used when the two display fonts could not be loaded: Sora (already in the app) and the system serif. */
export const FALLBACK_FONTS: AboutFonts = {
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
  serifItalic: { fontFamily: 'serif', fontStyle: 'italic' },
  mono: MONO,
  body: FontFamily.bodyRegular,
  bodySemi: FontFamily.bodySemibold,
};

export const AboutFontsContext = createContext<AboutFonts>(FALLBACK_FONTS);

export function useAboutFonts(): AboutFonts {
  return useContext(AboutFontsContext);
}

/**
 * A stylesheet hook that depends on the font set: built once per font set and shared by every
 * component that uses it (the font set changes at most once, when the fonts finish loading).
 */
export function createFontStyles<T>(factory: (f: AboutFonts) => T): () => T {
  const cache = new WeakMap<AboutFonts, T>();
  return function useFontStyles(): T {
    const fonts = useAboutFonts();
    let styles = cache.get(fonts);
    if (!styles) {
      styles = factory(fonts);
      cache.set(fonts, styles);
    }
    return styles;
  };
}
