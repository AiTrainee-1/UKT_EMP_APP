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
import { deciderFromApproval, deciderText, type Decider } from '../../lib/approvalsDecider';

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

/**
 * WHO approved or rejected a request, prominently: "Approved by HR (Meena) · 31 Oct, 10:05 AM" on a green (or red) band,
 * with an optional second line (`note`). Nothing when `decider` is null. Owner 2026-10-31: every decided request must
 * clearly show who decided it.
 */
export function DecisionBadge({
  decider,
  note,
  tone,
  style,
  testID,
}: {
  decider: Decider | null | undefined;
  note?: string | null;
  /** Overrides the colour (the head's "approved, waiting for HR" is blue). */
  tone?: 'approved' | 'rejected' | 'waiting';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!decider) return null;
  const t = tone ?? decider.decision;
  const fg = t === 'approved' ? Colors.badgeGreenText : t === 'rejected' ? Colors.badgeRedText : Colors.badgeBlueText;
  const bg = t === 'approved' ? Colors.badgeGreenBg : t === 'rejected' ? Colors.badgeRedBg : Colors.badgeBlueBg;
  const icon = t === 'waiting' ? 'progress-clock' : decider.decision === 'approved' ? 'check-decagram' : 'close-octagon';
  const text = deciderText(decider);
  return (
    <View
      style={[styles.decision, { backgroundColor: bg, borderColor: fg }, style]}
      accessible
      accessibilityLabel={note ? `${text}. ${note}` : text}
      testID={testID}
    >
      <MaterialCommunityIcons name={icon as any} size={17} color={fg} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.decisionText, { color: fg }]}>{text}</Text>
        {!!note && <Text style={[styles.decisionNote, { color: fg }]}>{note}</Text>}
      </View>
    </View>
  );
}

/**
 * Where a request stands, in one chip: "Waiting for HR" while it is pending, and once it is decided WHO decided it
 * ("Approved by HR (Meena) · 31 Oct, 10:05 AM", see DecisionBadge) - so every card that shows this chip names its
 * approver. `fallback` names the decider of an old request whose `approval` block cannot (approvedBy / reviewedBy
 * fields); `showDecision={false}` keeps the chip to the waiting state only (a screen that shows the decision itself).
 * Nothing when the server sent no `approval` and no fallback.
 */
export function WaitingChip({
  approval,
  style,
  showDecision = true,
  fallback,
}: {
  approval?: ApprovalProgress | null;
  style?: StyleProp<ViewStyle>;
  showDecision?: boolean;
  fallback?: Decider | null;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const text = waitingText(approval);
  if (!text) {
    if (!showDecision) return null;
    return <DecisionBadge decider={deciderFromApproval(approval) ?? fallback ?? null} style={style} />;
  }
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

  decision: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  decisionText: { fontSize: 13, fontWeight: '800', lineHeight: 17 },
  decisionNote: { fontSize: 11.5, fontWeight: '600', marginTop: 1, opacity: 0.9 },

  trail: { gap: 5 },
  trailLabel: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  trailStep: { gap: 2 },
  trailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  trailText: { flex: 1, color: Colors.textSecondary, fontSize: 11.5, lineHeight: 16 },
  trailRole: { color: Colors.textPrimary, fontWeight: '700' },
  trailComment: { color: Colors.textMuted, fontSize: 11, fontStyle: 'italic', marginLeft: 21 },
});
