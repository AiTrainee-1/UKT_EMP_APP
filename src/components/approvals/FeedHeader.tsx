import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import type { ApprovalStatus } from '../../lib/approvalsHistory';
import { headerTitle } from '../../lib/approvalsFeed';
import { statusMeta } from './categoryMeta';

/**
 * The header in front of each status group of the all-statuses list (owner 2026-11-25): "Waiting for your decision · 3"
 * on an amber band first, then "Approved · 12" and "Rejected · 4". `empty`: nothing waits for this head ("All caught
 * up"), shown above the decided requests so the head sees it at once.
 */
export function FeedHeader({ status, count, empty }: { status: ApprovalStatus; count: number; empty?: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const m = statusMeta(Colors)[status];
  const pending = status === 'pending';

  if (pending && empty) {
    return (
      <View style={[styles.band, styles.caughtUp]} accessibilityRole="header" testID="approvals-header-caught-up">
        <MaterialCommunityIcons name="check-all" size={16} color={Colors.statusGreen} />
        <Text style={[styles.title, { color: Colors.statusGreen }]}>All caught up</Text>
        <Text style={styles.note} numberOfLines={1}>Nothing waits for your decision.</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.band, pending ? { backgroundColor: m.bg, borderColor: m.color } : styles.plain]}
      accessibilityRole="header"
      accessibilityLabel={`${headerTitle(status)}, ${count}`}
      testID={`approvals-header-${status}`}
    >
      <MaterialCommunityIcons name={(pending ? 'bell-ring-outline' : m.icon) as any} size={16} color={m.color} />
      <Text style={[styles.title, { color: pending ? Colors.textPrimary : Colors.textSecondary }]}>{headerTitle(status)}</Text>
      {/* amber text colour as the fill, its pale/deep tint as the number: readable in light and dark */}
      <View style={[styles.count, { backgroundColor: pending ? Colors.badgeYellowText : Colors.bgSurfaceHigh }]}>
        <Text style={[styles.countText, { color: pending ? Colors.badgeYellowBg : Colors.textSecondary }]}>{count}</Text>
      </View>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    band: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      marginTop: 4,
    },
    plain: { borderColor: 'transparent', paddingHorizontal: 4, paddingVertical: 4 },
    caughtUp: { backgroundColor: Colors.badgeGreenBg, borderColor: Colors.badgeGreenBg },
    title: { fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
    note: { flex: 1, color: Colors.textSecondary, fontSize: 12, textAlign: 'right' },
    count: { minWidth: 24, paddingHorizontal: 7, paddingVertical: 1, borderRadius: BorderRadius.full, alignItems: 'center' },
    countText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  });
