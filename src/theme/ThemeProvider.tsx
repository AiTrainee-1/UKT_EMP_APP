import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { dark, light, Palette } from './palettes';

/**
 * App-wide light/dark theme.
 *
 * Three modes, not two: 'system' follows the phone, and is the default —
 * an employee who has their phone on dark at 6am shouldn't be handed a white
 * screen by us. 'light'/'dark' are explicit overrides from the side drawer.
 *
 * Consumers take colours from useTheme() rather than importing the static
 * `Colors` object, because React Native has no cascade: a StyleSheet created
 * at module load bakes its colour values in permanently and will never see a
 * theme change. useThemedStyles() exists to make that easy to do right —
 * pass a factory, get a stylesheet that is rebuilt when the palette flips.
 */

const STORAGE_KEY = 'uktex.themeMode';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeValue {
  /** The active palette. Named `C` because it appears in almost every style. */
  C: Palette;
  /** What actually resolved, after applying 'system'. */
  scheme: 'light' | 'dark';
  /** What the user chose. */
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** Cycles straight between light and dark, leaving 'system' behind. */
  toggle: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeValue>({
  C: light,
  scheme: 'light',
  mode: 'system',
  setMode: () => {},
  toggle: () => {},
  isDark: false,
});

function resolve(mode: ThemeMode, system: ColorSchemeName): 'light' | 'dark' {
  if (mode === 'system') return system === 'dark' ? 'dark' : 'light';
  return mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Light, deliberately — NOT 'system'. A phone already set to dark mode
  // must not make the app open dark before anyone has ever touched the
  // in-app Dark Mode switch; dark stays fully available, just opt-in (same
  // convention as the Employee Web App's ThemeContext.DEFAULT_MODE).
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [system, setSystem] = useState<ColorSchemeName>(Appearance.getColorScheme() ?? 'unspecified');

  // Restore the saved preference (including an explicit 'system' choice, if
  // the user picked "Auto" before). Until it lands we render 'light' per the
  // default above, so the worst case on a slow AsyncStorage read is a brief
  // light screen before a returning dark-mode user's own choice kicks in —
  // never the reverse.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
      })
      .catch(() => {});
  }, []);

  // Keep following the phone while mode === 'system'. The listener stays
  // subscribed regardless so switching back to 'system' is instantly correct.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    return () => sub.remove();
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  }, []);

  const scheme = resolve(mode, system);

  const toggle = useCallback(() => {
    setMode(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme, setMode]);

  const value = useMemo<ThemeValue>(
    () => ({
      C: scheme === 'dark' ? dark : light,
      scheme,
      mode,
      setMode,
      toggle,
      isDark: scheme === 'dark',
    }),
    [scheme, mode, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/**
 * Build a StyleSheet from the active palette, rebuilt only when the palette
 * changes. This is the piece that makes dark mode actually work: a
 * module-level `StyleSheet.create({ color: Colors.textPrimary })` captures
 * the light value once, at import, and no theme change will ever reach it.
 *
 *   const styles = useThemedStyles((C) => StyleSheet.create({ ... }));
 */
export function useThemedStyles<T>(factory: (C: Palette) => T): T {
  const { C } = useTheme();
  return useMemo(() => factory(C), [C]); // eslint-disable-line react-hooks/exhaustive-deps
}
