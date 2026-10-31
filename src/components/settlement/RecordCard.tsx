import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius, ClayElevation } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { repaidRatio, rupees } from '../../lib/settlement';
import type { MyAdvance } from '../../hooks/useAdvances';
import { Bar, StatusPill, TypeIcon } from './parts';
import { DecisionBadge } from '../approval/ApprovalTrail';
import { deciderForAdvance } from '../../lib/approvalsDecider';

/** One application in the records list: what was asked and approved, where the repayment is, what comes next. */
export function RecordCard({ item, onPress }: { item: MyAdvance; onPress: () => void }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const decided = item.status === 'approved' || item.status === 'closed';
  const ratio = decided ? repaidRatio(item.amount, item.deductedTotal) : 0;
  const applied = item.createdAt ? applyDate(item.createdAt) : '';

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.typeLabel}, ${rupees(decided ? item.amount : item.requestedAmount)}, ${item.statusLabel}. Open details`}
    >
      <View style={styles.top}>
        <TypeIcon type={item.advanceType} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.type}>{item.typeLabel}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {applied ? `Applied ${applied}` : ''}
            {item.purpose ? `${applied ? ' · ' : ''}${item.purpose}` : ''}
          </Text>
        </View>
        <StatusPill status={item.status} advanceType={item.advanceType} deductedTotal={item.deductedTotal} />
      </View>

      {/* Who approved / rejected it (HR decides every application). */}
      <DecisionBadge decider={deciderForAdvance(item)} />

      <View style={styles.figures}>
        <View style={styles.figure}>
          <Text style={styles.figLabel}>{decided ? 'Approved' : 'Asked for'}</Text>
          <Text style={[styles.figValue, TabularNums]}>{rupees(decided ? item.amount : item.requestedAmount)}</Text>
          {item.approvedLess && (
            <Text style={[styles.figNote, { color: Colors.badgeYellowText }]}>of {rupees(item.requestedAmount)} asked</Text>
          )}
        </View>
        {item.advanceType === 'term' && item.emiAmount > 0 && item.status !== 'rejected' && (
          <View style={styles.figure}>
            <Text style={styles.figLabel}>Monthly EMI</Text>
            <Text style={[styles.figValue, TabularNums]}>{rupees(item.emiAmount)}</Text>
            {!!item.repaymentMonths && <Text style={styles.figNote}>{item.repaymentMonths} months</Text>}
          </View>
        )}
        {decided && (
          <View style={[styles.figure, { alignItems: 'flex-end' }]}>
            <Text style={styles.figLabel}>Still owed</Text>
            <Text style={[styles.figValue, TabularNums, { color: item.balanceDue > 0 ? Colors.statusRed : Colors.statusGreen }]}>
              {rupees(item.balanceDue)}
            </Text>
          </View>
        )}
      </View>

      {decided && (
        <View style={{ gap: 4 }}>
          <Bar ratio={ratio} color={item.status === 'closed' ? Colors.statusGreen : Colors.primaryLight} height={6} />
          <Text style={[styles.meta, TabularNums]}>
            {rupees(item.deductedTotal)} repaid of {rupees(item.amount)}
          </Text>
        </View>
      )}

      {item.status !== 'rejected' && !!item.deductionLabel && (
        <View style={styles.footer}>
          <MaterialCommunityIcons name="calendar-month-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.footerText} numberOfLines={2}>
            {item.status === 'closed'
              ? `Deducted ${item.deductionLabel}`
              : item.nextDeduction
                ? `Next: ${rupees(item.nextDeduction.amount)} from ${item.nextDeduction.label} salary`
                : `Deduction: ${item.deductionLabel}${item.status === 'pending' ? ' (if approved)' : ''}`}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.outline} />
        </View>
      )}
      {item.status === 'rejected' && (
        <View style={styles.footer}>
          <MaterialCommunityIcons name="information-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.footerText} numberOfLines={2}>
            {item.notes ? `HR: ${item.notes}` : 'Nothing will be deducted from your salary.'}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.outline} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "25 Oct 2026" in the phone's time zone; "" when it is not a date. */
export function applyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
    ...ClayElevation.low,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  type: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 15 },
  meta: { color: Colors.textMuted, fontSize: 12 },
  figures: { flexDirection: 'row', gap: 12 },
  figure: { flex: 1, gap: 1 },
  figLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  figValue: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
  figNote: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerText: { flex: 1, color: Colors.textSecondary, fontSize: 12.5 },
});
