import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { Skeleton } from '../ui/Skeleton';
import { ClDial } from './ClDial';
import { daysText, type MonthCardState, type YearMonth } from '../../lib/casualLeave';

export const TONE_ICON: Record<MonthCardState['tone'], string> = {
  open: 'check-circle-outline',
  half: 'circle-half-full',
  used: 'calendar-check-outline',
  closed: 'lock-outline',
};

export function toneColors(tone: MonthCardState['tone'], Colors: Palette) {
  switch (tone) {
    case 'open':
      return { fg: Colors.statusGreen, bg: Colors.badgeGreenBg };
    case 'half':
      return { fg: Colors.statusYellow, bg: Colors.badgeYellowBg };
    case 'used':
      return { fg: Colors.primary, bg: Colors.primaryFixed };
    default:
      return { fg: Colors.statusGrey, bg: Colors.badgePendingBg };
  }
}

/**
 * The Casual Leave card on the Leave page: this month's state at a glance, the year so far as twelve small dials, and a
 * tap to the Casual Leave screen. Loading shows a skeleton; a failed load says so (never an empty year).
 */
export function ClEntryCard({
  state,
  months,
  year,
  takenDays,
  waitingDays,
  loading,
  failed,
  onPress,
  footer,
}: {
  state: MonthCardState | null;
  months: YearMonth[] | null;
  year: number;
  takenDays: number;
  waitingDays: number;
  loading: boolean;
  failed: boolean;
  onPress: () => void;
  footer?: React.ReactNode;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = toneColors(state?.tone ?? 'closed', Colors);
  const thisMonth = new Date().getMonth() + 1;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Casual Leave. ${state ? `${state.title}. ${state.detail}` : ''} Opens your Casual Leave.`}
      testID="cl-entry-card"
    >
      <View style={styles.topRow}>
        <View style={styles.icon}>
          <MaterialCommunityIcons name="calendar-star" size={20} color={Colors.secondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Casual Leave (CL)</Text>
          <Text style={styles.sub}>One paid day a month, or two half-days</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.textMuted} />
      </View>

      {loading ? (
        <View style={{ gap: 8 }}>
          <Skeleton width="55%" height={18} />
          <Skeleton width="90%" height={12} />
        </View>
      ) : state ? (
        <MotiView
          from={{ opacity: 0, translateY: 4 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 240 }}
          style={styles.stateRow}
        >
          <View style={[styles.stateChip, { backgroundColor: tone.bg }]}>
            <MaterialCommunityIcons name={TONE_ICON[state.tone] as any} size={14} color={tone.fg} />
            <Text style={[styles.stateChipText, { color: tone.fg }]}>{state.title}</Text>
          </View>
          <Text style={styles.detail} numberOfLines={2}>
            {state.detail}
          </Text>
        </MotiView>
      ) : null}

      {failed ? (
        <Text style={styles.failText}>Could not load your Casual Leave. Pull down to try again.</Text>
      ) : months ? (
        <View>
          <View style={styles.strip}>
            {months.map((m) => (
              <View key={m.month} style={styles.stripCell}>
                <ClDial slots={m.slots} size={18} />
                <Text style={[styles.stripLabel, m.month === thisMonth && { color: Colors.primary, fontWeight: '800' }]}>
                  {m.short.charAt(0)}
                </Text>
              </View>
            ))}
          </View>
          <Text style={[styles.totals, TabularNums]}>
            {daysText(takenDays)} taken in {year}
            {waitingDays > 0 ? ` · ${daysText(waitingDays)} waiting` : ''}
          </Text>
        </View>
      ) : null}
      {footer}
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 14,
      marginBottom: 14,
      gap: 12,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
        android: { elevation: 1 },
      }),
    },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: Colors.secondaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
    sub: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
    stateRow: { gap: 6 },
    stateChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      alignSelf: 'flex-start',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    stateChipText: { fontSize: 12, fontWeight: '800' },
    detail: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
    failText: { color: Colors.statusRed, fontSize: 12 },
    strip: { flexDirection: 'row', justifyContent: 'space-between' },
    stripCell: { alignItems: 'center', gap: 3 },
    stripLabel: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '600' },
    totals: { color: Colors.textMuted, fontSize: 11.5, marginTop: 8 },
  });
