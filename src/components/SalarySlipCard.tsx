import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { Badge } from './ui/Badge';
import { SalarySlip } from '../hooks/useSalarySlips';
import { BorderRadius } from '../constants/theme';
import { FontFamily, TabularNums } from '../constants/typography';
import { formatInr, slipCycleLabel, slipPeriodLabel } from '../lib/salaryInsights';

interface Props {
  slip: SalarySlip;
  onPress: () => void;
  /** What attendance cost in this period (from the salary insights), when known; 0 shows "Nothing lost". */
  lost?: number | null;
}

export function SalarySlipCard({ slip, onPress, lost }: Props) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const period = slipPeriodLabel(slip);
  const cycle = slipCycleLabel(slip);
  const net = formatInr(slip.netSalary);
  const lostText = lost == null ? null : lost > 0 ? `${formatInr(lost)} lost to attendance` : 'Nothing lost to attendance';
  const lostColor = lost && lost > 0 ? Colors.statusRed : Colors.statusGreen;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Salary slip ${period}${cycle ? `, ${cycle}` : ''}. Net pay ${net}.${lostText ? ` ${lostText}.` : ''}`}
    >
      <View style={styles.left}>
        <View style={styles.periodRow}>
          <Text style={styles.month}>{period}</Text>
          {!!cycle && (
            <View style={styles.cycleChip}>
              <Text style={styles.cycleText}>{cycle}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.net, TabularNums]}>{net}</Text>
        {!!lostText && (
          <View style={styles.lostRow}>
            <MaterialCommunityIcons name={lost && lost > 0 ? 'trending-down' : 'check-circle-outline'} size={13} color={lostColor} />
            <Text style={[styles.lostText, TabularNums, { color: lostColor }]}>{lostText}</Text>
          </View>
        )}
      </View>
      <View style={styles.right}>
        <Badge
          label={slip.emailedAt ? 'Emailed' : 'Generated'}
          variant={slip.emailedAt ? 'paid' : 'generated'}
        />
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={Colors.textMuted}
          style={{ marginTop: 8 }}
        />
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  left: {
    gap: 4,
    flex: 1,
    paddingRight: 8,
  },
  periodRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  month: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  cycleChip: {
    backgroundColor: Colors.badgeBlueBg,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cycleText: { color: Colors.badgeBlueText, fontSize: 10.5, fontWeight: '700' },
  net: {
    color: Colors.primary,
    fontFamily: FontFamily.displayBold,
    fontSize: 22,
  },
  lostRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lostText: { fontSize: 11.5, fontWeight: '700' },
  right: {
    alignItems: 'flex-end',
  },
});
