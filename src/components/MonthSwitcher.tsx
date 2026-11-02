import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius } from '../constants/theme';
import { FontFamily } from '../constants/typography';
import {
  canGoBack,
  canGoForward,
  currentMonth,
  monthLabel,
  shiftMonth,
  type CalMonth,
} from '../lib/monthSwitch';

/**
 * "‹ September 2026 ›" (with a calendar icon): the Attendance tab's month card, shared by every screen that filters its records by month
 * (owner 2026-11-02). The › arrow stops at `max` (the current month unless a screen says otherwise); the ‹ arrow goes
 * back without limit unless `min` is given. `right` fills the card's right end (Attendance puts its sync pill there).
 * The rules are src/lib/monthSwitch.ts.
 */
export function MonthSwitcher({
  value,
  onChange,
  min,
  max,
  right,
  style,
  testID = 'month-switcher',
}: {
  value: CalMonth;
  onChange: (month: CalMonth) => void;
  min?: CalMonth | null;
  max?: CalMonth | null;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const top = max ?? currentMonth(new Date());
  const back = canGoBack(value, min);
  const forward = canGoForward(value, top);
  const label = monthLabel(value);

  return (
    <View style={[styles.monthCard, style]} testID={testID}>
      <TouchableOpacity
        onPress={() => back && onChange(shiftMonth(value, -1))}
        style={styles.monthNavBtn}
        activeOpacity={0.7}
        disabled={!back}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        accessibilityState={{ disabled: !back }}
        testID={`${testID}-prev`}
      >
        <MaterialCommunityIcons name="chevron-left" size={20} color={back ? Colors.textPrimary : Colors.outline} />
      </TouchableOpacity>
      <View style={styles.monthLabelWrap} accessible accessibilityRole="text" accessibilityLabel={`Showing ${label}`}>
        <MaterialCommunityIcons name="calendar-month-outline" size={15} color={Colors.textMuted} />
        <Text style={styles.monthLabel} testID={`${testID}-label`}>{label}</Text>
      </View>
      <TouchableOpacity
        onPress={() => forward && onChange(shiftMonth(value, 1))}
        style={styles.monthNavBtn}
        activeOpacity={0.7}
        disabled={!forward}
        accessibilityRole="button"
        accessibilityLabel="Next month"
        accessibilityState={{ disabled: !forward }}
        testID={`${testID}-next`}
      >
        <MaterialCommunityIcons name="chevron-right" size={20} color={forward ? Colors.textPrimary : Colors.outline} />
      </TouchableOpacity>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
}) as object;

// The Attendance tab's month card, unchanged (app/(tabs)/attendance.tsx used to draw it itself).
const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    monthCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 14,
      ...cardShadow,
    },
    monthNavBtn: { padding: 4 },
    monthLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    monthLabel: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  });
