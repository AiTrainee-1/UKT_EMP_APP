import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, isValid, parseISO } from 'date-fns';

import { useAuth } from '../../hooks/useAuth';
import { useOnDutyHistory, type OnDutyHistoryItem } from '../../hooks/useOnDutyHistory';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

const SHOWN = 5;

function chip(item: OnDutyHistoryItem, C: Palette): { label: string; fg: string; bg: string } {
  const s = item.approvalStatus ?? item.status;
  if (s === 'rejected') return { label: 'Rejected', fg: C.badgeRedText, bg: C.badgeRedBg };
  if (s === 'pending_hod' || s === 'pending_hr') {
    return item.employeeEndedAt
      ? { label: 'Ended · waiting for approval', fg: C.badgeYellowText, bg: C.badgeYellowBg }
      : { label: 'In progress · waiting for approval', fg: C.badgeBlueText, bg: C.badgeBlueBg };
  }
  if (s === 'active') return { label: 'In progress', fg: C.badgeBlueText, bg: C.badgeBlueBg };
  return { label: 'Completed', fg: C.badgeGreenText, bg: C.badgeGreenBg };
}

function dayOf(item: OnDutyHistoryItem): string {
  const raw = item.date ?? item.createdAt;
  if (!raw) return '';
  const d = parseISO(raw);
  return isValid(d) ? format(d, 'EEE, d MMM') : '';
}

/**
 * "Previous On-Duty" on the Apply tab (owner 2026-11-24: earlier records on the same page): the last few requests, each
 * with its day, place, how it stands and its punches; "See all" opens View Records.
 */
export function RecentOnDuty({ onSeeAll, excludeId }: { onSeeAll: () => void; excludeId?: number | null }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { data, isLoading } = useOnDutyHistory(user?.employeeId ?? null);
  const items = (data?.pages[0]?.items ?? []).filter((i) => i.id !== excludeId).slice(0, SHOWN);

  if (isLoading || !items.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Previous On-Duty</Text>
        <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="See all On-Duty records">
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>
      {items.map((item) => {
        const c = chip(item, C);
        const punches = item.punchCount ?? item.punches?.filter((p) => p.status !== 'rejected').length ?? 0;
        return (
          <Pressable
            key={item.id}
            onPress={onSeeAll}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`${dayOf(item)}, ${item.destination}, ${c.label}, ${punches} of 4 punches`}
          >
            <View style={styles.dateTile}>
              <MaterialCommunityIcons name="briefcase-outline" size={16} color={C.categoryOnDuty} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.dest} numberOfLines={1}>{item.destination}</Text>
              <Text style={styles.meta}>
                {dayOf(item)} · {punches} of 4 punches
              </Text>
              <View style={[styles.chip, { backgroundColor: c.bg }]}>
                <Text style={[styles.chipText, { color: c.fg }]}>{c.label}</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={C.textMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    title: { fontFamily: FontFamily.headlineSemibold, fontSize: 16, color: C.textPrimary },
    seeAll: { fontFamily: FontFamily.bodySemibold, fontSize: 13, color: C.primary },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: BorderRadius.lg,
      backgroundColor: C.bgCard,
      borderWidth: 1,
      borderColor: C.border,
    },
    dateTile: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.badgeYellowBg },
    dest: { fontFamily: FontFamily.bodySemibold, fontSize: 14, color: C.textPrimary },
    meta: { fontSize: 12, color: C.textMuted },
    chip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full, marginTop: 2 },
    chipText: { fontFamily: FontFamily.bodySemibold, fontSize: 11 },
  });
