import { Colors } from './colors';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export const BorderRadius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const CardStyle = {
  backgroundColor: Colors.bgCard,
  borderRadius: BorderRadius.xl,
  padding: Spacing.base,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 6,
};

export const InputStyle = {
  backgroundColor: Colors.bgInput,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: BorderRadius.md,
  paddingHorizontal: Spacing.base,
  paddingVertical: Spacing.md,
  color: Colors.textPrimary,
  fontSize: 15,
};
