import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import type { ApprovalProgress, ApprovalStepState } from '../../lib/approval';

const ICON: Record<ApprovalStepState, string> = {
  approved: 'check-circle',
  rejected: 'close-circle',
  skipped: 'skip-next-circle-outline',
  pending: 'clock-outline',
  waiting: 'circle-outline',
};

const SHORT: Record<string, string> = { hod: 'Dept Head', hr: 'HR' };

/**
 * The request's path in one line, for a card: "Dept Head ✓ › HR ◷". The full trail (who, when, comments) is in the
 * sheet (ApprovalTrail). Nothing for a single-step pipeline that is still undecided, or without an `approval` block.
 */
export function TrailStrip({ approval }: { approval?: ApprovalProgress | null }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const steps = approval && Array.isArray(approval.steps) ? approval.steps : [];
  if (!steps.length || (steps.length === 1 && (steps[0].state === 'pending' || steps[0].state === 'waiting'))) return null;

  const color = (s: ApprovalStepState) =>
    s === 'approved' ? Colors.statusGreen : s === 'rejected' ? Colors.statusRed : s === 'pending' ? Colors.statusYellow : Colors.outline;

  return (
    <View style={styles.row} accessibilityLabel="Approval path">
      {steps.map((step, i) => (
        <React.Fragment key={String(step.index ?? i)}>
          {i > 0 && <MaterialCommunityIcons name="chevron-right" size={13} color={Colors.outline} />}
          <View style={styles.step}>
            <MaterialCommunityIcons name={ICON[step.state] as any} size={13} color={color(step.state)} />
            <Text style={styles.text}>
              {(step.decidedBy && SHORT[step.decidedBy]) || (step.roles ?? []).map((r) => SHORT[r] ?? r).join(' / ')}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
    step: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.bgSurfaceLow,
    },
    text: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' },
  });
