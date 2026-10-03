import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format, startOfWeek, addDays, isToday, isBefore } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useShift } from '../../src/hooks/useShift';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useShiftStats, latePoolView, detectionFlags, latePoolNames, halfDayRule } from '../../src/hooks/useShiftStats';
import { useCasualLeaves } from '../../src/hooks/useCasualLeave';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import { DAY_TONES, type DayVisualKey } from '../../src/lib/attendanceVisual';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const isoOf = (d: Date) => format(d, 'yyyy-MM-dd');

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
  const { C: Colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // "Now" is read at render, not once at start-up: the screen stays mounted for days.
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  // A week can straddle two months (28 Sep - 4 Oct): the days of the other month live in that month's stats.
  const weekMonths = Array.from(new Set(weekDates.map((d) => `${d.getFullYear()}-${d.getMonth() + 1}`)))
    .filter((k) => k !== `${year}-${month}`)
    .map((k) => ({ year: Number(k.split('-')[0]), month: Number(k.split('-')[1]) }));
  const other = weekMonths[0];

  const { user } = useAuth();
  const { data: shift, isLoading } = useShift(user?.employeeId ?? null);
  const { data: employee } = useEmployee(user?.employeeId ?? null);
  const { data: stats } = useShiftStats(month, year);
  const otherStats = useShiftStats(other?.month ?? month, other?.year ?? year, { enabled: !!other });
  const { data: approvedCL } = useCasualLeaves(user?.employeeId ?? null, { status: 'approved', month, year });

  const isProduction = employee?.employmentType === 'production';
  const presentDays = stats?.dailyLogs.filter((d) => !!d.firstPunch).length ?? 0;
  // Deduction preview with the new API fields defaulted (older backends omit them); the company
  // `policy`, when present, wins over the summary's copies and says which checks are switched on.
  // Production staff get no split and the flat free allowance (see latePoolView).
  const pool = stats ? latePoolView(stats) : null;
  const detect = detectionFlags(stats);
  // The real half-day rule (company-wide times) -null on an older backend, and then nothing is
  // shown: the shift template's own "first half end" is no longer the rule.
  const halfRule = halfDayRule(stats?.policy);

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
  // Holiday / Sunday / leave pills use the SAME colours as the attendance calendar.
  const dayPill = (k: DayVisualKey) => ({
    pill: { backgroundColor: isDark ? DAY_TONES[k].fillDark : DAY_TONES[k].fillLight },
    text: { color: isDark ? DAY_TONES[k].inkDark : DAY_TONES[k].inkLight },
  });
  // The month's data a given day lives in: undefined while that month is still loading (or failed), so a past day
  // is never called Absent just because its month has not arrived.
  const logOf = (date: Date) => {
    const src = date.getMonth() + 1 === month && date.getFullYear() === year ? stats : otherStats.data;
    if (!src) return { loaded: false as const, log: undefined };
    return { loaded: true as const, log: src.dailyLogs.find((d) => d.date === isoOf(date)) };
  };

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
                  // Half-Day Detection: company-wide times from the API, not the shift template.
                  ...(halfRule
                    ? [
                        { icon: 'weather-sunset-up', label: 'Morning half', value: halfRule.morning },
                        { icon: 'weather-sunset-down', label: 'Evening half', value: halfRule.evening },
                      ]
                    : []),
                ]
              : [{ icon: 'calendar-check-outline', label: 'Sunday', value: 'Working Day' }]),
          ].map(({ icon, label, value }) => {
            const long = value.length > 24; // a sentence, not a figure: it gets the full width under its label
            return (
              <View key={label} style={[styles.detailRow, long && styles.detailRowStack]}>
                <View style={styles.detailLeft}>
                  <View style={styles.detailIconWrap}>
                    <MaterialCommunityIcons name={icon as any} size={16} color={Colors.primary} />
                  </View>
                  <Text style={styles.detailLabel}>{label}</Text>
                </View>
                <Text style={[styles.detailValue, long ? styles.detailValueLong : styles.detailValueShort]}>{value}</Text>
              </View>
            );
          })}
          {!isProduction && halfRule && (
            <Text style={[styles.deductionNote, { marginTop: 8, marginBottom: 0 }]}>
              Punches in both halves = Full Day, in one half = Half Day.
            </Text>
          )}
        </View>

        {/* Monthly Summary */}
        {stats && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>This Month's Summary</Text>
            <View style={styles.statsGrid}>
              {[
                { label: 'Present', value: presentDays, icon: 'check-circle-outline', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
                { label: 'Absent', value: stats.absentDays, icon: 'close-circle-outline', color: Colors.statusRed, bg: Colors.badgeRedBg },
                // Every day flagged late this month. Deliberately not called "Late-Ins": the
                // deduction card's Late-Ins is the pool's occurrence count, which can differ
                // (a day carrying an Excess permission is counted there as that permission).
                // Dropped when HR has switched Morning Late-In detection off.
                ...(detect.lateIn
                  ? [{ label: 'Days flagged late', value: stats.totalLateCount, icon: 'clock-alert-outline', color: Colors.statusYellow, bg: Colors.badgeYellowBg }]
                  : []),
                { label: 'Half Days', value: stats.halfShiftDays, icon: 'clock-time-four-outline', color: Colors.statusYellow, bg: Colors.badgeYellowBg },
                { label: 'CL Approved', value: approvedCL?.length ?? 0, icon: 'calendar-check-outline', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
              ].map(({ label, value, icon, color, bg }, _i, boxes) => (
                <View key={label} style={[styles.statBox, { width: `${100 / boxes.length}%` }]}>
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

        {/* Late & permission deduction preview — Late-Ins, Early-Outs and Excess
            permissions share one monthly pool; the first `freeAllowance` are
            free, the rest are billed as a shift deduction. Same numbers HR
            sees on Report Log. The per-kind split only exists on the rewritten
            backend, so it is shown only when the API sent it. */}
        {stats && pool && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Late & Permission Deductions</Text>
            <Text style={styles.deductionNote}>
              {latePoolNames(detect, pool.isProduction)} count toward one monthly pool. The first {pool.freeAllowance} are
              free; every one beyond that is billed as a shift deduction from salary.
            </Text>
            <View style={styles.statsGrid}>
              {[
                ...(pool.hasBreakdown
                  ? [
                      ...(detect.lateIn
                        ? [{
                            label: 'Late-Ins', value: pool.lateIn,
                            icon: 'clock-alert-outline', color: Colors.statusYellow, bg: Colors.badgeYellowBg,
                          }]
                        : []),
                      ...(detect.earlyOut
                        ? [{
                            label: 'Early-Outs', value: pool.earlyOut,
                            icon: 'logout', color: Colors.statusLeave, bg: Colors.badgeLeaveBg,
                          }]
                        : []),
                      {
                        label: 'Excess Permissions', value: pool.excess,
                        icon: 'alert-circle-outline', color: Colors.statusYellow, bg: Colors.badgeYellowBg,
                      },
                    ]
                  : []),
                {
                  label: 'Free Allowance', value: `${pool.freeUsed}/${pool.freeAllowance}`,
                  icon: 'hand-back-left-outline', color: Colors.primary, bg: Colors.primaryFixed,
                },
                {
                  label: 'Billable', value: pool.billable,
                  icon: 'alert-circle-outline',
                  color: pool.billable > 0 ? Colors.statusRed : Colors.statusGreen,
                  bg: pool.billable > 0 ? Colors.badgeRedBg : Colors.badgeGreenBg,
                },
                {
                  label: 'Shift Deductions', value: pool.shiftDeductions,
                  icon: 'minus-circle-outline',
                  color: pool.shiftDeductions > 0 ? Colors.statusRed : Colors.statusGreen,
                  bg: pool.shiftDeductions > 0 ? Colors.badgeRedBg : Colors.badgeGreenBg,
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
              <Text style={[styles.totalShiftsValue, pool.salaryDeductionAmount > 0 && { color: Colors.statusRed }]}>
                ₹{pool.salaryDeductionAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              const { loaded, log } = logOf(date);
              const today = isToday(date);
              const past = isBefore(date, now) && !today;

              // What was off about the day (Late-In / Early-Out / Half Day), and what
              // permission did about it. New keys with the old ones as fallback
              // (see readDayFlags): an older backend only knows isLate.
              const flagLabels: string[] = [];
              if (log?.isLate && detect.lateIn) flagLabels.push('Late-In');
              if (log?.isEarlyOut && detect.earlyOut) flagLabels.push('Early-Out');
              if (log?.isHalfShift) flagLabels.push('Half Day');
              const permNotes: string[] = [];
              if (log?.morningPermissionApplied) permNotes.push('Morning permission applied');
              if (log?.eveningPermissionApplied) permNotes.push('Evening permission applied');
              if (log?.morningPermissionExcess) permNotes.push('Morning permission Excess');
              if (log?.eveningPermissionExcess) permNotes.push('Evening permission Excess');
              if (log?.middlePermissionToday) permNotes.push('Middle One-Hour');
              // The pill carries the first flag; the sub-line spells out the rest.
              const extraNotes = [...(flagLabels.length > 1 ? flagLabels : []), ...permNotes];

              // What kind of day it is, in the order that matters: a holiday / Sunday off nobody worked, approved
              // leave, the shift's own off day, today, a worked day, then a day gone by with no punch.
              let statusLabel = 'Upcoming';
              let statusStyle: { pill: object; text: object } = weekStatusStyles.muted;
              let title = isWorking ? `${shift.startTime} – ${shift.endTime}` : 'Off Day';
              let subLine: string | null = null;
              if (loaded && log?.dayKind && !log.firstPunch) {
                if (log.dayKind === 'holiday') {
                  statusLabel = 'Holiday';
                  statusStyle = dayPill('holiday');
                  title = log.holidayName || 'Holiday';
                  subLine = log.holidayType
                    ? `${log.holidayType.charAt(0).toUpperCase()}${log.holidayType.slice(1)} holiday`
                    : 'Declared holiday';
                } else {
                  statusLabel = 'Sunday';
                  statusStyle = dayPill('sunday');
                  title = 'Weekly Off';
                }
              } else if (loaded && log?.isCasualLeave) {
                statusLabel = 'Casual Leave';
                statusStyle = dayPill('casualLeave');
                title = 'Casual Leave';
              } else if (loaded && log?.status === 'on_leave') {
                statusLabel = 'On Leave';
                statusStyle = dayPill('onLeave');
                title = 'On Leave';
              } else if (!isWorking) {
                statusLabel = 'Off Day';
              } else if (today) {
                statusLabel = 'Today';
                statusStyle = weekStatusStyles.blue;
              } else if (!loaded && past) {
                statusLabel = '—'; // that month's data has not arrived (yet): say nothing rather than guess
              } else if (log?.firstPunch) {
                statusLabel = flagLabels.length
                  ? `${flagLabels[0]}${flagLabels.length > 1 ? ` +${flagLabels.length - 1}` : ''}`
                  : 'Completed';
                statusStyle = flagLabels.length ? weekStatusStyles.amber : weekStatusStyles.green;
              } else if (past) {
                statusLabel = 'Absent';
                statusStyle = dayPill('absent');
              }

              return (
                <View key={date.toISOString()} style={[styles.weekRow, today && styles.weekRowToday]}>
                  <View style={[styles.weekDateBadge, today && styles.weekDateBadgeToday]}>
                    <Text style={[styles.weekDateDow, today && styles.weekDateTextToday]}>{format(date, 'EEE').toUpperCase()}</Text>
                    <Text style={[styles.weekDateNum, TabularNums, today && styles.weekDateTextToday]}>{format(date, 'd')}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.weekRowTime} numberOfLines={1}>{title}</Text>
                    {subLine && <Text style={styles.weekRowSub}>{subLine}</Text>}
                    {log?.firstPunch && (
                      <Text style={styles.weekRowSub}>
                        In {log.firstPunch}{log.lastPunch ? ` · Out ${log.lastPunch}` : ''}
                      </Text>
                    )}
                    {extraNotes.length > 0 && (
                      <Text style={styles.weekRowSub}>{extraNotes.join(' · ')}</Text>
                    )}
                    {/* Plain-language explanation of the day's boundary/flag, whenever the server sent one. */}
                    {!!log?.lateReason && <Text style={styles.weekRowSub}>{log.lateReason}</Text>}
                  </View>
                  <View style={[styles.weekStatusPill, statusStyle.pill]}>
                    <Text style={[styles.weekStatusText, statusStyle.text]} numberOfLines={1}>{statusLabel}</Text>
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
  detailRowStack: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  detailIconWrap: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  detailLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  detailValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  detailValueShort: { flex: 1, textAlign: 'right', marginLeft: 12 },
  detailValueLong: { fontSize: 12.5, lineHeight: 18, fontWeight: '600', color: Colors.textSecondary },

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
