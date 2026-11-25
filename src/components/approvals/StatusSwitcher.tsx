import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { useReduceMotion } from '../../lib/motionPrefs';
import { APPROVAL_STATUSES, type ApprovalStatus, type StatusCounts } from '../../lib/approvalsHistory';
import { filterCaption, type ApprovalFilter } from '../../lib/approvalsFeed';
import { statusMeta } from './categoryMeta';

/**
 * Pending / Approved / Rejected for the chosen category as three count cards that double as quick filters (owner
 * 2026-11-25): the list shows every status by default (Pending first); tapping a card shows only that status, tapping
 * it again shows them all (`onToggle`, src/lib/approvalsFeed.ts toggleFilter). The chosen card lifts and takes its
 * status colour. `counts` null = not known yet (a dash, never a wrong 0).
 */
export function StatusSwitcher({
  value,
  counts,
  onToggle,
  onShowAll,
}: {
  value: ApprovalFilter;
  /** A status left out (or null) is not known: it shows a dash. */
  counts: Partial<StatusCounts> | null;
  onToggle: (s: ApprovalStatus) => void;
  onShowAll: () => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  const meta = statusMeta(Colors);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {APPROVAL_STATUSES.map((s) => {
          const m = meta[s];
          const active = s === value;
          const count = counts?.[s] ?? null;
          // Something waits for this head: the Pending card keeps an amber edge even when not chosen.
          const waiting = s === 'pending' && !!count && !active;
          return (
            <MotiView
              key={s}
              style={styles.cell}
              animate={{ scale: active && !reduceMotion ? 1.03 : 1, translateY: active && !reduceMotion ? -2 : 0 }}
              transition={{ type: 'timing', duration: reduceMotion ? 0 : 180 }}
            >
              <TouchableOpacity
                onPress={() => onToggle(s)}
                activeOpacity={0.85}
                style={[styles.card, waiting && { borderColor: m.color }, active && { backgroundColor: m.bg, borderColor: m.color }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${m.label}${count != null ? `, ${count}` : ''}`}
                accessibilityHint={active ? 'Shows every request again' : `Shows only ${m.label.toLowerCase()} requests`}
                testID={`approvals-status-${s}`}
              >
                <View style={styles.top}>
                  <MaterialCommunityIcons name={m.icon as any} size={16} color={m.color} />
                  {s === 'pending' && !!count && <View style={[styles.dot, { backgroundColor: m.color }]} />}
                  {active && s !== 'pending' && <MaterialCommunityIcons name="filter-variant" size={14} color={m.color} />}
                </View>
                <Text style={[styles.count, active && { color: m.color }]}>{count ?? '–'}</Text>
                <Text style={[styles.label, active && styles.labelActive]}>{m.label}</Text>
              </TouchableOpacity>
            </MotiView>
          );
        })}
      </View>
      <View style={styles.captionRow}>
        <Text style={styles.caption} numberOfLines={2} testID="approvals-filter-caption">
          {filterCaption(value)}
        </Text>
        {value !== 'all' && (
          <TouchableOpacity
            onPress={onShowAll}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Show all requests"
            testID="approvals-show-all"
          >
            <Text style={styles.showAll}>Show all</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    row: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
    cell: { flex: 1 },
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: Colors.outlineVariant,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 2,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
        android: { elevation: 1 },
      }),
    },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dot: { width: 7, height: 7, borderRadius: 4 },
    count: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 22, fontVariant: ['tabular-nums'] },
    label: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 11.5 },
    labelActive: { color: Colors.textPrimary },
    captionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
    caption: { flex: 1, color: Colors.textMuted, fontSize: 11.5, lineHeight: 15 },
    showAll: { color: Colors.primaryLight, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },
  });
