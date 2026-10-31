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
import { statusMeta } from './categoryMeta';

/**
 * Pending / Approved / Rejected for the chosen category as three count cards. The chosen card lifts and takes its
 * status colour. `counts` null = not known yet (a dash, never a wrong 0).
 */
export function StatusSwitcher({
  value,
  counts,
  onChange,
}: {
  value: ApprovalStatus;
  /** A status left out (or null) is not known: it shows a dash. */
  counts: Partial<StatusCounts> | null;
  onChange: (s: ApprovalStatus) => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  const meta = statusMeta(Colors);

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {APPROVAL_STATUSES.map((s) => {
        const m = meta[s];
        const active = s === value;
        const count = counts?.[s] ?? null;
        return (
          <MotiView
            key={s}
            style={styles.cell}
            animate={{ scale: active && !reduceMotion ? 1.03 : 1, translateY: active && !reduceMotion ? -2 : 0 }}
            transition={{ type: 'timing', duration: reduceMotion ? 0 : 180 }}
          >
            <TouchableOpacity
              onPress={() => onChange(s)}
              activeOpacity={0.85}
              style={[styles.card, active && { backgroundColor: m.bg, borderColor: m.color }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${m.label}${count != null ? `, ${count}` : ''}`}
              testID={`approvals-status-${s}`}
            >
              <View style={styles.top}>
                <MaterialCommunityIcons name={m.icon as any} size={16} color={m.color} />
                {s === 'pending' && !!count && <View style={[styles.dot, { backgroundColor: m.color }]} />}
              </View>
              <Text style={[styles.count, active && { color: m.color }]}>{count ?? '–'}</Text>
              <Text style={[styles.label, active && styles.labelActive]}>{m.label}</Text>
            </TouchableOpacity>
          </MotiView>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
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
  });
