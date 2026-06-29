import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

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

const variantMap: Record<BadgeVariant, { bg: string; text: string }> = {
  present:   { bg: Colors.badgeGreenBg, text: Colors.badgeGreenText },
  approved:  { bg: Colors.badgeGreenBg, text: Colors.badgeGreenText },
  paid:      { bg: Colors.badgeGreenBg, text: Colors.badgeGreenText },
  absent:    { bg: Colors.badgeRedBg,   text: Colors.badgeRedText },
  rejected:  { bg: Colors.badgeRedBg,   text: Colors.badgeRedText },
  late:      { bg: Colors.badgeYellowBg, text: Colors.badgeYellowText },
  pending:   { bg: Colors.badgePendingBg, text: Colors.badgePendingText },
  generated: { bg: Colors.badgePendingBg, text: Colors.badgePendingText },
  onleave:   { bg: Colors.badgeBlueBg,  text: Colors.badgeBlueText },
};

export function Badge({ label, variant = 'pending' }: BadgeProps) {
  const colors = variantMap[variant] ?? variantMap.pending;
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
