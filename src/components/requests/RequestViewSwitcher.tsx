import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { REQUEST_VIEWS, type RequestView } from '../../lib/requestViews';

/**
 * The four views every request screen offers (Waiting / This month / Approved / Rejected) as a row of count cards.
 * The chosen card lifts and fills with its colour; counts come from viewCounts() in src/lib/requestViews.ts.
 * `labels` lets a screen say what "This month" means there ("Taken this month", "Sent this month").
 */
export function RequestViewSwitcher({
  value,
  counts,
  onChange,
  labels,
  testID = 'request-views',
}: {
  value: RequestView;
  counts: Record<RequestView, number>;
  onChange: (view: RequestView) => void;
  labels?: Partial<Record<RequestView, string>>;
  testID?: string;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const meta: Record<RequestView, { label: string; icon: string; color: string; bg: string }> = {
    waiting: { label: 'Waiting', icon: 'timer-sand', color: Colors.statusYellow, bg: Colors.badgeYellowBg },
    month: { label: 'This month', icon: 'calendar-month-outline', color: Colors.primary, bg: Colors.primaryFixed },
    approved: { label: 'Approved', icon: 'check-circle-outline', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
    rejected: { label: 'Rejected', icon: 'close-circle-outline', color: Colors.statusRed, bg: Colors.badgeRedBg },
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID={testID}
      accessibilityRole="tablist"
    >
      {REQUEST_VIEWS.map((view) => {
        const m = meta[view];
        const active = view === value;
        return (
          <TouchableOpacity
            key={view}
            onPress={() => onChange(view)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${labels?.[view] ?? m.label}, ${counts[view]}`}
            testID={`${testID}-${view}`}
          >
            <MotiView
              animate={{
                translateY: active ? -2 : 0,
                scale: active ? 1 : 0.97,
                backgroundColor: active ? m.color : m.bg,
              }}
              transition={{ type: 'timing', duration: 220 }}
              style={styles.card}
            >
              <View style={styles.top}>
                <MaterialCommunityIcons name={m.icon as any} size={16} color={active ? '#fff' : m.color} />
                <Text style={[styles.count, { color: active ? '#fff' : Colors.textPrimary }]}>{counts[view]}</Text>
              </View>
              <Text style={[styles.label, { color: active ? '#fff' : Colors.textSecondary }]} numberOfLines={1}>
                {labels?.[view] ?? m.label}
              </Text>
            </MotiView>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    row: { gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
    card: { width: 104, borderRadius: BorderRadius.lg, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    count: { fontFamily: FontFamily.displayBold, fontSize: 20 },
    label: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  });
