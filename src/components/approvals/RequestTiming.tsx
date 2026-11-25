import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import type { ApprovalCategory } from '../../lib/approvalsHistory';
import { requestTiming, type LeadTime, type LeadTone } from '../../lib/requestLeadTime';
import type { ApprovalItem } from './types';

const LEAD_ICON: Record<LeadTone, string> = {
  early: 'calendar-check-outline',
  sameDay: 'calendar-clock',
  late: 'calendar-alert',
};

function useLeadColors(tone: LeadTone) {
  const { C: Colors } = useTheme();
  return tone === 'early'
    ? { fg: Colors.badgeGreenText, bg: Colors.badgeGreenBg }
    : tone === 'sameDay'
      ? { fg: Colors.badgeYellowText, bg: Colors.badgeYellowBg }
      : { fg: Colors.badgeRedText, bg: Colors.badgeRedBg };
}

/** "Applied 3 days before" (green) / "Applied on the same day" (amber) / "Applied 2 days after" (red). */
export function LeadChip({ lead, testID }: { lead: LeadTime; testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  const { fg, bg } = useLeadColors(lead.tone);
  return (
    <View style={[styles.chip, { backgroundColor: bg }]} testID={testID}>
      <MaterialCommunityIcons name={LEAD_ICON[lead.tone] as any} size={12} color={fg} />
      <Text style={[styles.chipText, { color: fg }]} numberOfLines={1}>
        {lead.text}
      </Text>
    </View>
  );
}

/**
 * When a request is for, when it was submitted (date and time) and how far ahead it was applied (owner 2026-11-25,
 * src/lib/requestLeadTime.ts). `card`: two compact lines and the chip; `sheet`: a framed block in the decision sheet.
 */
export function RequestTiming({
  category,
  item,
  variant = 'card',
}: {
  category: ApprovalCategory;
  item: ApprovalItem;
  variant?: 'card' | 'sheet';
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = requestTiming(category, item);
  const sheet = variant === 'sheet';
  const forLabel = category === 'resignation' ? 'Last day' : 'For';
  const a11y = [`${forLabel} ${t.requested}`, t.submitted ? `Submitted ${t.submitted}` : null, t.lead?.text ?? null]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      style={sheet ? styles.sheetBox : styles.cardBox}
      accessible
      accessibilityLabel={a11y}
      testID={`approval-timing-${item.id}`}
    >
      <View style={styles.line}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={sheet ? 15 : 13} color={Colors.textMuted} />
        <Text style={[styles.label, sheet && styles.labelSheet]}>{forLabel}</Text>
        <Text style={[styles.value, sheet && styles.valueSheet]} numberOfLines={sheet ? 2 : 1}>
          {t.requested}
        </Text>
      </View>
      {!!t.submitted && (
        <View style={styles.line}>
          <MaterialCommunityIcons name="send-clock-outline" size={sheet ? 15 : 13} color={Colors.textMuted} />
          <Text style={[styles.label, sheet && styles.labelSheet]}>Submitted</Text>
          <Text style={[styles.value, sheet && styles.valueSheet]} numberOfLines={1}>
            {t.submitted}
          </Text>
        </View>
      )}
      {!!t.lead && (
        <View style={styles.chipRow}>
          <LeadChip lead={t.lead} testID={`approval-lead-${item.id}`} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    cardBox: { gap: 5 },
    sheetBox: {
      gap: 8,
      marginBottom: 4,
      padding: 12,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.bgSurfaceLow,
      borderWidth: 1,
      borderColor: Colors.outlineVariant,
    },
    line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    label: { color: Colors.textMuted, fontSize: 11.5, fontFamily: FontFamily.bodySemibold, minWidth: 62 },
    labelSheet: { fontSize: 12.5, minWidth: 74 },
    value: { color: Colors.textSecondary, fontSize: 12.5, flexShrink: 1 },
    valueSheet: { color: Colors.textPrimary, fontSize: 13.5, fontWeight: '600' },
    chipRow: { flexDirection: 'row' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
      maxWidth: '100%',
    },
    chipText: { fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  });
