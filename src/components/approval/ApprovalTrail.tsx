import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import {
  trailRows,
  trailWorthShowing,
  waitingText,
  type ApprovalProgress,
  type ApprovalStepState,
} from '../../lib/approval';

const STATE_ICON: Record<ApprovalStepState, string> = {
  approved: 'check-circle',
  rejected: 'close-circle',
  skipped: 'skip-next-circle-outline',
  pending: 'clock-outline',
  waiting: 'circle-outline',
};

const stateColor = (state: ApprovalStepState, Colors: Palette) =>
  state === 'approved' ? Colors.statusGreen
  : state === 'rejected' ? Colors.statusRed
  : state === 'pending' ? Colors.statusYellow
  : Colors.outline;

/** "Waiting for HR": who a pending request is with now. Nothing once it is decided, or when the server sent no
 *  `approval` (an older backend). */
export function WaitingChip({
  approval,
  style,
}: {
  approval?: ApprovalProgress | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const text = waitingText(approval);
  if (!text) return null;
  return (
    <View style={[styles.chip, style]}>
      <MaterialCommunityIcons name="clock-outline" size={12} color={Colors.badgeBlueText} />
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

/** The request's path step by step: who holds each step, what became of it, and who decided it and when. Nothing when
 *  there is only one undecided step (the waiting chip already says all of it) or no `approval`. */
export function ApprovalTrail({
  approval,
  title = 'APPROVAL PROGRESS',
  style,
}: {
  approval?: ApprovalProgress | null;
  title?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (!trailWorthShowing(approval)) return null;
  return (
    <View style={[styles.trail, style]}>
      <Text style={styles.trailLabel}>{title}</Text>
      {trailRows(approval).map((row) => (
        <View key={row.key} style={styles.trailStep}>
          <View style={styles.trailRow}>
            <MaterialCommunityIcons name={STATE_ICON[row.state] as any} size={15} color={stateColor(row.state, Colors)} />
            <Text style={styles.trailText}>
              <Text style={styles.trailRole}>{row.role}: </Text>
              {row.text}
            </Text>
          </View>
          {!!row.comment && <Text style={styles.trailComment}>"{row.comment}"</Text>}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: Colors.badgeBlueBg,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { color: Colors.badgeBlueText, fontSize: 11.5, fontWeight: '700', flexShrink: 1 },

  trail: { gap: 5 },
  trailLabel: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  trailStep: { gap: 2 },
  trailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  trailText: { flex: 1, color: Colors.textSecondary, fontSize: 11.5, lineHeight: 16 },
  trailRole: { color: Colors.textPrimary, fontWeight: '700' },
  trailComment: { color: Colors.textMuted, fontSize: 11, fontStyle: 'italic', marginLeft: 21 },
});
