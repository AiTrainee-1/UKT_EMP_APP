import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';

type BadgeVariant =
  | 'present'
  | 'absent'
  | 'late'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'onleave'
  | 'generated'
  | 'paid';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const makeVariantMap = (Colors: Palette): Record<BadgeVariant, { bg: string; text: string }> => ({
  present:   { bg: Colors.badgeGreenBg, text: Colors.badgeGreenText },
  approved:  { bg: Colors.badgeGreenBg, text: Colors.badgeGreenText },
  paid:      { bg: Colors.badgeGreenBg, text: Colors.badgeGreenText },
  absent:    { bg: Colors.badgeRedBg,   text: Colors.badgeRedText },
  rejected:  { bg: Colors.badgeRedBg,   text: Colors.badgeRedText },
  late:      { bg: Colors.badgeYellowBg, text: Colors.badgeYellowText },
  pending:   { bg: Colors.badgePendingBg, text: Colors.badgePendingText },
  generated: { bg: Colors.badgePendingBg, text: Colors.badgePendingText },
  onleave:   { bg: Colors.badgeBlueBg,  text: Colors.badgeBlueText },
});

export function Badge({ label, variant = 'pending' }: BadgeProps) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const variantMap = makeVariantMap(Colors);

  const colors = variantMap[variant] ?? variantMap.pending;
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
