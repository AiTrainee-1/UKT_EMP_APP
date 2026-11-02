import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { hrTone } from '../../lib/hrEdit';
import { changeText, historyNewestFirst, type CLHistory, type CLHistoryKind } from '../../lib/casualLeave';

const KIND_ICON: Record<CLHistoryKind, string> = {
  opening: 'calendar-plus',
  approved: 'check-circle-outline',
  pending: 'clock-outline',
  rejected: 'close-circle-outline',
  lapsed: 'timer-sand-complete',
};

/** How many lines show before "Show all". */
const FOLDED = 5;

/**
 * "Balance history" (GET /casual-leaves/history): every move of the year's Casual Leave balance in the server's own words
 * ("12 → 11 on 05 Nov: Casual Leave approved (Full day, 05 Nov 2026)"), newest first. A line HR's attendance edit caused
 * carries a "by HR" tag in the HR-edit indigo (the same colour the attendance calendar uses for HR edits).
 */
export function ClBalanceHistory({ history }: { history: CLHistory }) {
  const { C: Colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [all, setAll] = useState(false);
  const hr = hrTone(isDark);
  const lines = historyNewestFirst(history.entries);
  const shown = all ? lines : lines.slice(0, FOLDED);

  const tint = (kind: CLHistoryKind) =>
    kind === 'approved'
      ? Colors.primary
      : kind === 'pending'
        ? Colors.statusYellow
        : kind === 'rejected'
          ? Colors.statusRed
          : kind === 'opening'
            ? Colors.statusGreen
            : Colors.statusGrey;

  return (
    <View style={styles.card} testID="cl-history">
      {shown.map((e, i) => (
        <View
          key={`${e.kind}-${e.on}-${i}`}
          style={[styles.row, i > 0 && styles.rowLine]}
          accessible
          accessibilityLabel={`${e.text}${e.source === 'hr_edit' ? '. by HR.' : ''}`}
        >
          <View style={[styles.icon, { backgroundColor: `${tint(e.kind)}1F` }]}>
            <MaterialCommunityIcons name={KIND_ICON[e.kind] as any} size={15} color={tint(e.kind)} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.text}>{e.text}</Text>
            {e.source === 'hr_edit' && (
              <View style={[styles.hrTag, { backgroundColor: hr.fill }]}>
                <Text style={[styles.hrTagText, { color: hr.ink }]}>by HR</Text>
              </View>
            )}
          </View>
          <Text style={[styles.change, { color: e.change > 0 ? Colors.statusGreen : e.change < 0 ? Colors.textPrimary : Colors.textMuted }, TabularNums]}>
            {changeText(e.change)}
          </Text>
        </View>
      ))}
      {lines.length > FOLDED && (
        <TouchableOpacity
          onPress={() => setAll((v) => !v)}
          style={styles.more}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ expanded: all }}
          testID="cl-history-more"
        >
          <Text style={styles.moreText}>{all ? 'Show fewer' : `Show all ${lines.length}`}</Text>
          <MaterialCommunityIcons name={all ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
    rowLine: { borderTopWidth: 1, borderTopColor: Colors.outlineVariant },
    icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    text: { color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    hrTag: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
    hrTagText: { fontSize: 10, fontWeight: '800' },
    change: { fontFamily: FontFamily.displayBold, fontSize: 14, minWidth: 30, textAlign: 'right' },
    more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44 },
    moreText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },
  });
