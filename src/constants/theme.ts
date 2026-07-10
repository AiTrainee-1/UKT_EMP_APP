import { Platform, StyleSheet } from 'react-native';
import { Colors } from './colors';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
};

// ─── Claymorphism shadow helpers ─────────────────────────────────────────
// React Native only supports one shadow direction, so we approximate the
// clay "lifted" feel with a slightly larger, softened shadow + elevation.
export const ClayElevation = {
  low: Platform.select({
    ios: {
      shadowColor: '#006496',
      shadowOffset: { width: 4, height: 6 },
      shadowOpacity: 0.10,
      shadowRadius: 12,
    },
    android: { elevation: 4 },
    default: {},
  }),
  mid: Platform.select({
    ios: {
      shadowColor: '#006496',
      shadowOffset: { width: 6, height: 8 },
      shadowOpacity: 0.13,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
    default: {},
  }),
  high: Platform.select({
    ios: {
      shadowColor: '#006496',
      shadowOffset: { width: 8, height: 12 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
    },
    android: { elevation: 10 },
    default: {},
  }),
  button: Platform.select({
    ios: {
      shadowColor: '#006496',
      shadowOffset: { width: 4, height: 8 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
    },
    android: { elevation: 8 },
    default: {},
  }),
};

// ─── Shared style objects ─────────────────────────────────────────────────
export const CardStyle = StyleSheet.create({
  clay: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    ...ClayElevation.low,
  },
});

export const InputStyle = StyleSheet.create({
  clay: {
    backgroundColor: Colors.bgInput,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: 15,
    borderWidth: 0,
  },
});
