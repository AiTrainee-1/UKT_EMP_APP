import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../src/hooks/useAuth';
import { useShift } from '../../src/hooks/useShift';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useShiftStats } from '../../src/hooks/useShiftStats';
import { useCasualLeaves } from '../../src/hooks/useCasualLeave';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const now = new Date();
const month = now.getMonth() + 1;
const year = now.getFullYear();

export default function ShiftScreen() {
  const { user } = useAuth();
  const { data: shift, isLoading } = useShift(user?.employeeId ?? null);
  const { data: employee } = useEmployee(user?.employeeId ?? null);
  const { data: stats } = useShiftStats(month, year);
  const { data: approvedCL } = useCasualLeaves(user?.employeeId ?? null, { status: 'approved', month, year });

  const isProduction = employee?.employmentType === 'production';

  const workingDays = useMemo(() => {
    if (!shift) return [];
    if (isProduction) return ALL_DAYS; // production works every day incl. Sunday
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    if (!shift.saturdayOff) days.push('Sat');
    return days;
  }, [shift, isProduction]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.pad}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (!shift) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          icon="clock-outline"
          title="No shift assigned"
          subtitle="Your shift details will appear here once assigned by HR"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#006496" />
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        {/* Main Card */}
        <LinearGradient
          colors={['#006496', '#0090d0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.shiftCard}
        >
          <View style={styles.shiftCardDeco} />
          <View style={styles.shiftHeaderRow}>
            <Text style={styles.shiftName}>{shift.shiftName}</Text>
            <View style={styles.typeBadge}>
              <MaterialCommunityIcons
                name={isProduction ? 'factory' : 'briefcase-outline'}
                size={13}
                color="#fff"
              />
              <Text style={styles.typeBadgeText}>{isProduction ? 'Production' : 'Staff'}</Text>
            </View>
          </View>
          <View style={styles.timeRow}>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>Start Time</Text>
              <Text style={styles.timeValue}>{shift.startTime}</Text>
            </View>
            <View style={styles.timeArrowWrap}>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
            </View>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>End Time</Text>
              <Text style={styles.timeValue}>{shift.endTime}</Text>
            </View>
          </View>
          {shift.isCustomTime && (
            <View style={styles.customChip}>
              <MaterialCommunityIcons name="pencil-outline" size={12} color="#fff" />
              <Text style={styles.customChipText}>Custom timing set by HR</Text>
            </View>
          )}
        </LinearGradient>

        {/* Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Shift Details</Text>
          {[
            { icon: 'timer-outline', label: 'Grace Period', value: `${shift.gracePeriod} min` },
            ...(!isProduction
              ? [
                  { icon: 'calendar-week-outline', label: 'Saturday Off', value: shift.saturdayOff ? 'Yes' : 'No' },
                  ...(shift.lunchDurationMinutes
                    ? [{ icon: 'food-outline', label: 'Lunch Duration', value: `${shift.lunchDurationMinutes} min` }]
                    : []),
                  ...(shift.firstHalfEnd
                    ? [{ icon: 'clock-time-four-outline', label: 'First Half Ends', value: shift.firstHalfEnd }]
                    : []),
                ]
              : [{ icon: 'calendar-check-outline', label: 'Sunday', value: 'Working Day' }]),
          ].map(({ icon, label, value }) => (
            <View key={label} style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <View style={styles.detailIconWrap}>
                  <MaterialCommunityIcons name={icon as any} size={16} color={Colors.primary} />
                </View>
                <Text style={styles.detailLabel}>{label}</Text>
              </View>
              <Text style={styles.detailValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Monthly Summary */}
        {stats && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>This Month's Summary</Text>
            <View style={styles.statsGrid}>
              {[
                { label: 'Late Count', value: stats.totalLateCount, icon: 'clock-alert-outline', color: Colors.statusYellow, bg: Colors.badgeYellowBg },
                { label: 'Half Shifts', value: stats.halfShiftDays, icon: 'clock-time-four-outline', color: Colors.statusYellow, bg: Colors.badgeYellowBg },
                { label: 'CL Approved', value: approvedCL?.length ?? 0, icon: 'calendar-check-outline', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
                { label: 'Absent', value: stats.absentDays, icon: 'close-circle-outline', color: Colors.statusRed, bg: Colors.badgeRedBg },
              ].map(({ label, value, icon, color, bg }) => (
                <View key={label} style={styles.statBox}>
                  <View style={[styles.statIconWrap, { backgroundColor: bg }]}>
                    <MaterialCommunityIcons name={icon as any} size={16} color={color} />
                  </View>
                  <Text style={styles.statValue}>{value}</Text>
                  <Text style={styles.statLbl}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.totalShiftsRow}>
              <Text style={styles.totalShiftsLabel}>Total Working Shifts</Text>
              <Text style={styles.totalShiftsValue}>{stats.totalEffectiveShifts}</Text>
            </View>
          </View>
        )}

        {/* Permission usage & deduction impact — every employee gets 3 free
            lates/permissions a month (combined pool); each additional 3
            beyond that costs a ¼ shift. Same numbers HR sees on Report Log. */}
        {stats && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Permission Usage & Deductions</Text>
            <Text style={styles.deductionNote}>
              3 free lates/permissions per month (combined). Every 3 beyond that costs a ¼ shift
              deduction from salary.
            </Text>
            <View style={styles.statsGrid}>
              {[
                {
                  label: 'Permissions Used', value: `${stats.summary.permissionsUsed}/3`,
                  icon: 'hand-back-left-outline', color: Colors.primary, bg: Colors.primaryFixed,
                },
                {
                  label: 'Billable', value: stats.summary.billableLateCount,
                  icon: 'alert-circle-outline',
                  color: stats.summary.billableLateCount > 0 ? Colors.statusRed : Colors.statusGreen,
                  bg: stats.summary.billableLateCount > 0 ? Colors.badgeRedBg : Colors.badgeGreenBg,
                },
                {
                  label: 'Shift Deductions', value: stats.summary.shiftDeductions,
                  icon: 'minus-circle-outline',
                  color: stats.summary.shiftDeductions > 0 ? Colors.statusRed : Colors.statusGreen,
                  bg: stats.summary.shiftDeductions > 0 ? Colors.badgeRedBg : Colors.badgeGreenBg,
                },
              ].map(({ label, value, icon, color, bg }) => (
                <View key={label} style={styles.statBox}>
                  <View style={[styles.statIconWrap, { backgroundColor: bg }]}>
                    <MaterialCommunityIcons name={icon as any} size={16} color={color} />
                  </View>
                  <Text style={styles.statValue}>{value}</Text>
                  <Text style={styles.statLbl}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.totalShiftsRow}>
              <Text style={styles.totalShiftsLabel}>Salary Impact</Text>
              <Text style={[styles.totalShiftsValue, stats.summary.salaryDeductionAmount > 0 && { color: Colors.statusRed }]}>
                ₹{stats.summary.salaryDeductionAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        )}

        {/* Weekly Schedule */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly Schedule</Text>
          <View style={styles.daysRow}>
            {ALL_DAYS.map((day) => {
              const isWorking = workingDays.includes(day);
              return (
                <View key={day} style={[styles.dayChip, isWorking && styles.dayChipActive]}>
                  <Text style={[styles.dayText, isWorking && styles.dayTextActive]}>{day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.infoText}>
            Shift details are managed by HR. Contact HR to request a shift change.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  pad: { padding: 16, paddingBottom: 40, gap: 12 },

  shiftCard: {
    borderRadius: BorderRadius.xxl,
    padding: 22,
    gap: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 6, height: 10 }, shadowOpacity: 0.22, shadowRadius: 18 },
      android: { elevation: 8 },
    }),
  },
  shiftCardDeco: {
    position: 'absolute', top: -30, right: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  shiftHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftName: { color: '#fff', fontSize: 21, fontWeight: '900', flexShrink: 1 },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  typeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  timeBlock: { flex: 1, gap: 4 },
  timeLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
  timeValue: { color: '#fff', fontSize: 26, fontWeight: '900' },
  timeArrowWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  customChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  customChipText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    gap: 4,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  cardTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  deductionNote: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16, marginBottom: 8 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIconWrap: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  detailLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  detailValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statBox: { width: '25%', alignItems: 'center', gap: 6, paddingVertical: 6 },
  statIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { color: Colors.textPrimary, fontSize: 15, fontWeight: '900' },
  statLbl: { color: Colors.textMuted, fontSize: 9, fontWeight: '600', textAlign: 'center' },
  totalShiftsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
  },
  totalShiftsLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  totalShiftsValue: { color: Colors.primary, fontSize: 18, fontWeight: '900' },

  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
    backgroundColor: 'transparent',
  },
  dayChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFixed,
  },
  dayText: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  dayTextActive: { color: Colors.primary },

  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 12,
    alignItems: 'flex-start',
  },
  infoText: { color: Colors.textMuted, fontSize: 12, flex: 1, lineHeight: 18 },
});
