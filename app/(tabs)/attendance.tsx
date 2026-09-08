import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { router } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useAttendance } from '../../src/hooks/useAttendance';
import { useShift } from '../../src/hooks/useShift';
import { useAttendanceSyncStatus } from '../../src/hooks/useGeoAttendance';
import { useCLEligibility } from '../../src/hooks/useCasualLeave';
import { AttendanceCalendar } from '../../src/components/AttendanceCalendar';
import { AttendanceTrendChart } from '../../src/components/AttendanceTrendChart';
import { GeoPunchCard } from '../../src/components/GeoPunchCard';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing } from '../../src/constants/theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Six figures in a 3×2 grid. Working Days leads because it's the
// denominator the rest are read against; Present/Absent are ordered to
// match the Home screen's overview card so the two never look reversed.
// Takes the palette explicitly -a plain builder, not a component, so it
// cannot reach the theme through a hook.
const SUMMARY = (Colors: Palette, data: any) => [
  { label: 'Working Days', value: data?.workingDays ?? 0, color: Colors.primary, bg: Colors.badgeBlueBg, icon: 'calendar-month-outline' },
  { label: 'Present', value: data?.present ?? 0, color: Colors.statusGreen, bg: Colors.badgeGreenBg, icon: 'check-circle' },
  { label: 'Absent', value: data?.absent ?? 0, color: Colors.statusRed, bg: Colors.badgeRedBg, icon: 'close-circle' },
  { label: 'Late', value: data?.late ?? 0, color: Colors.statusYellow, bg: Colors.badgeYellowBg, icon: 'clock-alert' },
  { label: 'Half Shift', value: data?.halfShift ?? 0, color: Colors.statusYellow, bg: Colors.badgeYellowBg, icon: 'clock-time-four-outline' },
  { label: 'Leave', value: data?.onLeave ?? 0, color: Colors.primary, bg: Colors.primaryFixed, icon: 'umbrella' },
];

export default function AttendanceScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user, logout } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const { data, isLoading, refetch, isRefetching } = useAttendance(
    user?.employeeId ?? null,
    month,
    year
  );
  const { data: shift } = useShift(user?.employeeId ?? null);
  const { data: syncStatus } = useAttendanceSyncStatus();
  const { data: clEligibility } = useCLEligibility(user?.employeeId ?? null);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    const atCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
    if (atCurrent) return;
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const atCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#006496" />

      <LinearGradient
        colors={Colors.gradientPrimary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerDeco} />
        <View style={styles.headerContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color="#fff" size={20} />
            <View>
              <Text style={styles.title}>Attendance</Text>
              <Text style={styles.subtitle}>Track your daily attendance</Text>
            </View>
          </View>
          <View style={styles.monthPill}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
              <MaterialCommunityIcons name="chevron-left" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{MONTHS[month - 1].slice(0, 3)} {year}</Text>
            <TouchableOpacity onPress={nextMonth} style={[styles.navBtn, atCurrent && styles.navBtnDisabled]}>
              <MaterialCommunityIcons name="chevron-right" size={20} color={atCurrent ? 'rgba(255,255,255,0.35)' : '#fff'} />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        <GeoPunchCard />

        {syncStatus?.pendingSync && (
          <View style={styles.syncWarning}>
            <MaterialCommunityIcons name="alert-outline" size={18} color={Colors.statusYellow} />
            <Text style={styles.syncWarningText}>
              Today's attendance may be incomplete — biometric punches haven't synced yet. It'll update once HR runs the next sync.
            </Text>
          </View>
        )}

        {/* Assigned shift */}
        {shift && (
          <TouchableOpacity style={styles.shiftBanner} onPress={() => router.push('/shift')} activeOpacity={0.8}>
            <View style={styles.shiftBannerIcon}>
              <MaterialCommunityIcons name="clock-outline" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shiftBannerLabel}>Assigned Shift</Text>
              <Text style={styles.shiftBannerValue}>
                {shift.shiftName} · {shift.startTime} – {shift.endTime}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Summary row */}
        {isLoading ? (
          <SkeletonCard lines={2} />
        ) : (
          <View style={styles.summaryRow}>
            {SUMMARY(Colors, data).map(({ label, value, color, bg, icon }) => (
              <View key={label} style={styles.summaryItem}>
                <View style={[styles.summaryIcon, { backgroundColor: bg }]}>
                  <MaterialCommunityIcons name={icon as any} size={18} color={color} />
                </View>
                <Text style={[styles.summaryNum, { color }]}>{value}</Text>
                <Text style={styles.summaryLabel}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Monthly trend chart */}
        {!isLoading && (
          <View style={styles.trendCard}>
            <Text style={styles.trendTitle}>Monthly Trend</Text>
            <AttendanceTrendChart records={data?.records ?? []} />
          </View>
        )}

        {/* Casual Leave eligibility */}
        {clEligibility && (
          <View style={styles.clCard}>
            <View style={styles.clHeader}>
              <MaterialCommunityIcons name="calendar-heart" size={16} color={Colors.primary} />
              <Text style={styles.clTitle}>Casual Leave</Text>
              <View style={[styles.clBadge, clEligibility.eligible ? styles.clBadgeOk : styles.clBadgeNo]}>
                <Text style={[styles.clBadgeText, clEligibility.eligible ? styles.clBadgeTextOk : styles.clBadgeTextNo]}>
                  {clEligibility.eligible ? 'Eligible' : 'Not Eligible'}
                </Text>
              </View>
            </View>
            {!clEligibility.eligible && !!clEligibility.reason && (
              <Text style={styles.clReason}>{clEligibility.reason}</Text>
            )}
            {clEligibility.yearlyEntitlement != null && (
              <View style={styles.clStatsRow}>
                <View style={styles.clStat}>
                  <Text style={styles.clStatNum}>{clEligibility.yearlyEntitlement}</Text>
                  <Text style={styles.clStatLabel}>Yearly Entitlement</Text>
                </View>
                <View style={styles.clStat}>
                  <Text style={[styles.clStatNum, { color: Colors.statusYellow }]}>{clEligibility.usedThisYear}</Text>
                  <Text style={styles.clStatLabel}>Used</Text>
                </View>
                <View style={styles.clStat}>
                  <Text style={[styles.clStatNum, { color: Colors.statusGreen }]}>{clEligibility.remainingThisYear}</Text>
                  <Text style={styles.clStatLabel}>Remaining</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Calendar card */}
        <View style={styles.calendarCard}>
          {isLoading ? (
            <SkeletonCard lines={5} />
          ) : (
            <AttendanceCalendar records={data?.records ?? []} month={month} year={year} />
          )}
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {[
            { label: 'Present', color: Colors.clayGreen },
            { label: 'Half Shift', color: Colors.clayYellow },
            { label: 'Absent', color: Colors.clayRed },
            { label: 'Late', color: Colors.clayYellow },
            { label: 'On Leave', color: Colors.clayBlue },
          ].map(({ label, color }) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        onLogout={handleLogout}
      />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  headerDeco: {
    position: 'absolute', top: -20, right: -20,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 2,
  },
  navBtn: { padding: 4, borderRadius: 20 },
  navBtnDisabled: { opacity: 0.4 },
  monthLabel: { color: '#fff', fontSize: 13, fontWeight: '700', minWidth: 64, textAlign: 'center' },

  content: { padding: 16, paddingBottom: 32, gap: 16 },

  syncWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.badgeYellowBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  syncWarningText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 12,
    lineHeight: 17,
  },

  shiftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 12,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  shiftBannerIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  shiftBannerLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  shiftBannerValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700', marginTop: 1 },

  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 18,          // breathing room between the two rows of the 3×2 grid
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    paddingVertical: 18,
    paddingHorizontal: 4,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.10, shadowRadius: 14 },
      android: { elevation: 4 },
    }),
  },
  // 33.33% = three per row, so the six stats form an even 3×2 grid.
  // (At the previous 20% the sixth stat wrapped to a row of its own.)
  summaryItem: { alignItems: 'center', gap: 6, width: '33.33%' },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryNum: { fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600', textAlign: 'center' },

  calendarCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.09, shadowRadius: 14 },
      android: { elevation: 4 },
    }),
  },

  trendCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  trendTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800', marginBottom: 10 },

  clCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    marginBottom: 14,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  clHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800', flex: 1 },
  clBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  clBadgeOk: { backgroundColor: Colors.badgeGreenBg },
  clBadgeNo: { backgroundColor: Colors.badgeRedBg },
  clBadgeText: { fontSize: 10, fontWeight: '800' },
  clBadgeTextOk: { color: Colors.badgeGreenText },
  clBadgeTextNo: { color: Colors.badgeRedText },
  clReason: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16 },
  clStatsRow: { flexDirection: 'row', marginTop: 4 },
  clStat: { flex: 1, alignItems: 'center', gap: 2 },
  clStatNum: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900' },
  clStatLabel: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '600', textAlign: 'center' },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
});
