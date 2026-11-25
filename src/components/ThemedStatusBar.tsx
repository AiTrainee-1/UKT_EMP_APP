import React from 'react';
import { StatusBar } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * The phone's status bar (clock, battery) for a screen whose top is the page background: dark icons on the light theme,
 * light icons on the dark theme (2026-11-25: a fixed "dark-content" made them disappear in dark mode). Screens under a
 * dark header (On-Duty, Company ...) keep their own light-content StatusBar.
 */
export function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />;
}
