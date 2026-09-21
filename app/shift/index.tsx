import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format, startOfWeek, addDays, isSameDay, isToday, isBefore } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useShift } from '../../src/hooks/useShift';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useShiftStats } from '../../src/hooks/useShiftStats';
import { useCasualLeaves } from '../../src/hooks/useCasualLeave';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const now = new Date();
const month = now.getMonth() + 1;
const year = now.getFullYear();
const weekStart = startOfWeek(now, { weekStartsOn: 1 });
const weekDates = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

/**
 * `topInset` -who is responsible for clearing the status bar.
 *
 * This screen is mounted twice: as the My Shift TAB (no header, so the screen
 * must inset itself or its first card sits under the status bar -that was the
 * collapsed top border) and as the pushed /shift STACK route, which has a
 * header already providing that space. Passing it in keeps one screen serving
 * both without either double-insetting or none at all.
 */
export default function ShiftScreen({ topInset = false }: { topInset?: boolean }) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const { data: shift, isLoading } = useShift(user?.employeeId ?? null);
  const { data: employee } = useEmployee(user?.employeeId ?? null);
  const { data: stats } = useShiftStats(month, year);
  const { data: approvedCL } = useCasualLeaves(user?.employeeId ?? null, { status: 'approved', month, year });

  const isProduction = employee?.employmentType === 'production';
  const presentDays = stats?.dailyLogs.filter((d) => !!d.firstPunch).length ?? 0;

  const workingDays = useMemo(() => {
    if (!shift) return [];
    if (isProduction) return ALL_DAYS; // production works every day incl. Sunday
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    if (!shift.saturdayOff) days.push('Sat');
    return days;
  }, [shift, isProduction]);

  const weekStatusStyles = {
    green: { pill: { backgroundColor: Colors.badgeGreenBg }, text: { color: Colors.statusGreen } },
    blue: { pill: { backgroundColor: Colors.badgeBlueBg }, text: { color: Colors.categoryTracking } },
    amber: { pill: { backgroundColor: Colors.badgeYellowBg }, text: { color: Colors.statusYellow } },
    muted: { pill: { backgroundColor: Colors.bgSurfaceLow }, text: { color: Colors.textMuted } },
  } as const;

  const header = (
    <View style={styles.header}>
      {!topInset && (
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>My Shift</Text>
        <Text style={styles.headerSubtitle}>{format(now, 'MMMM yyyy')} · Assigned Schedule & Monthly Timing</Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={topInset ? ['top', 'bottom'] : ['bottom']}>
        {header}
        <View style={styles.pad}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (!shift) {
    return (
      <SafeAreaView style={styles.safe} edges={topInset ? ['top', 'bottom'] : ['bottom']}>
        {header}
        <EmptyState
          icon="clock-outline"
          title="No shift assigned"
          subtitle="Your shift details will appear here once assigned by HR"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={topInset ? ['top', 'bottom'] : ['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />
      {header}
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        {/* Main Card */}
        <LinearGradient
          colors={Colors.gradientPrimary}
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
                { label: 'Present', value: presentDays, icon: 'check-circle-outline', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
                { label: 'Absent', value: stats.absentDays, icon: 'close-circle-outline', color: Colors.statusRed, bg: Colors.badgeRedBg },
                { label: 'Late Count', value: stats.totalLateCount, icon: 'clock-alert-outline', color: Colors.statusYellow, bg: Colors.badgeYellowBg },
                { label: 'Half Shifts', value: stats.halfShiftDays, icon: 'clock-time-four-outline', color: Colors.statusYellow, bg: Colors.badgeYellowBg },
                { label: 'CL Approved', value: approvedCL?.length ?? 0, icon: 'calendar-check-outline', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
              ].map(({ label, value, icon, color, bg }) => (
                <View key={label} style={[styles.statBox, { width: '20%' }]}>
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
          <View style={styles.weekHeaderRow}>
            <Text style={styles.cardTitle}>Weekly Schedule</Text>
            <Text style={styles.weekRange}>
              {format(weekStart, 'd MMM')} – {format(addDays(weekStart, 6), 'd MMM')}
            </Text>
          </View>
          <View style={styles.weekList}>
            {weekDates.map((date) => {
              const dayAbbr = ALL_DAYS[(date.getDay() + 6) % 7];
              const isWorking = workingDays.includes(dayAbbr);
              const log = stats?.dailyLogs.find((d) => isSameDay(new Date(d.date), date));
              const today = isToday(date);
              const past = isBefore(date, now) && !today;

              let statusLabel = 'Upcoming';
              let statusTone: 'green' | 'blue' | 'muted' | 'amber' = 'muted';
              if (!isWorking) {
                statusLabel = 'Off Day';
                statusTone = 'muted';
              } else if (today) {
                statusLabel = 'Today';
                statusTone = 'blue';
              } else if (log?.firstPunch) {
                statusLabel = log.isLate ? 'Late In' : 'Completed';
                statusTone = log.isLate ? 'amber' : 'green';
              } else if (past) {
                statusLabel = 'Absent';
                statusTone = 'amber';
              }

              return (
                <View key={date.toISOString()} style={[styles.weekRow, today && styles.weekRowToday]}>
                  <View style={[styles.weekDateBadge, today && styles.weekDateBadgeToday]}>
                    <Text style={[styles.weekDateDow, today && styles.weekDateTextToday]}>{format(date, 'EEE').toUpperCase()}</Text>
                    <Text style={[styles.weekDateNum, TabularNums, today && styles.weekDateTextToday]}>{format(date, 'd')}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.weekRowTime}>
                      {isWorking ? `${shift.startTime} – ${shift.endTime}` : 'Off Day'}
                    </Text>
                    {log?.firstPunch && (
                      <Text style={styles.weekRowSub}>
                        In {log.firstPunch}{log.lastPunch ? ` · Out ${log.lastPunch}` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.weekStatusPill, weekStatusStyles[statusTone].pill]}>
                    <Text style={[styles.weekStatusText, weekStatusStyles[statusTone].text]}>{statusLabel}</Text>
                  </View>
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

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },

  pad: { padding: 16, paddingBottom: 40, gap: 12 },

  shiftCard: {
    borderRadius: BorderRadius.xxl,
    padding: 22,
    gap: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 15 },
      android: { elevation: 8 },
    }),
  },
  shiftCardDeco: {
    position: 'absolute', top: -30, right: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  shiftHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftName: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 21, flexShrink: 1 },
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
  timeValue: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 26 },
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
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 4,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  cardTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14, marginBottom: 8 },
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

  weekHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  weekRange: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  weekList: { gap: 8, marginTop: 4 },
  weekRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.md,
    padding: 10,
  },
  weekRowToday: { backgroundColor: Colors.primaryFixed, borderWidth: 1, borderColor: Colors.primary },
  weekDateBadge: { width: 42, height: 46, borderRadius: BorderRadius.sm, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  weekDateBadgeToday: { backgroundColor: Colors.primary },
  weekDateDow: { color: Colors.textMuted, fontSize: 8, fontWeight: '800' },
  weekDateNum: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 15 },
  weekDateTextToday: { color: '#fff' },
  weekRowTime: { color: Colors.textPrimary, fontSize: 12.5, fontWeight: '700' },
  weekRowSub: { color: Colors.textMuted, fontSize: 10.5, marginTop: 2 },
  weekStatusPill: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  weekStatusText: { fontSize: 10, fontWeight: '800' },

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
