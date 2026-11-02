import React from 'react';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { monthLabel, type CalMonth } from '../../lib/monthSwitch';

/**
 * Under a month-scoped screen's view cards: "1 request waiting in October 2026 · Show". A request still waiting for approval
 * that belongs to another month than the one on screen (a request for the 31st still pending on the 1st) would
 * otherwise vanish from the list when the month turns. Tapping it opens that month on Waiting. Counts come from
 * waitingInOtherMonths() in src/lib/requestViews.ts; renders nothing when there are none.
 */
export function WaitingElsewhereNote({
  count,
  month,
  onShow,
  style,
  testID = 'waiting-elsewhere',
}: {
  count: number;
  month: CalMonth | null;
  onShow: (month: CalMonth) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!count || !month) return null;
  const text =
    count === 1
      ? `1 request waiting in ${monthLabel(month)}`
      : `${count} requests waiting in other months (latest ${monthLabel(month)})`;
  return (
    <TouchableOpacity
      style={[styles.note, style]}
      onPress={() => onShow(month)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${text}. Show it.`}
      testID={testID}
    >
      <MaterialCommunityIcons name="timer-sand" size={15} color={Colors.statusYellow} />
      <Text style={styles.text} numberOfLines={2}>{text}</Text>
      <Text style={styles.show}>Show</Text>
      <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.primary} />
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    note: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.badgeYellowBg,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 10,
    },
    text: { flex: 1, color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
    show: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
  });
