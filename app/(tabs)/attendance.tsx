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
import { SafeAreaView } from 'react-native-safe-area-context';

import { router } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useAttendance } from '../../src/hooks/useAttendance';
import { useLatePolicy } from '../../src/hooks/useShiftStats';
import { useShift } from '../../src/hooks/useShift';
import { useAttendanceSyncStatus } from '../../src/hooks/useGeoAttendance';
import { useCLEligibility } from '../../src/hooks/useCasualLeave';
import { casualLeaveAvailable } from '../../src/lib/requestWindowForm';
import { useGeoPunchStatus } from '../../src/hooks/useGeoAttendance';
import { AttendanceCalendar } from '../../src/components/AttendanceCalendar';
import { AttendanceTrendChart } from '../../src/components/AttendanceTrendChart';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { UKTLogo } from '../../src/components/UKTLogo';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Working Days leads because it's the denominator the other five are read
// against. Each entry drives its own standalone stat card (3×2 grid), so the
// `badge` text/tone is the card's headline detail, not a caption.
const SUMMARY = (Colors: Palette, data: any, lateInEnabled: boolean) => {
  const present = data?.present ?? 0;
  const workingDays = data?.workingDays ?? 0;
  const presentPct = workingDays > 0 ? Math.round((present / workingDays) * 100) : 0;
  return [
    { label: 'Working', value: workingDays, unit: 'days', dot: Colors.textMuted, badge: null, badgeBg: null, badgeText: null },
    { label: 'Present', value: present, unit: null, dot: Colors.statusGreen, badge: `${presentPct}%`, badgeBg: Colors.badgeGreenBg, badgeText: Colors.statusGreen },
    { label: 'Absent', value: data?.absent ?? 0, unit: null, dot: Colors.statusRed, badge: (data?.absent ?? 0) > 0 ? `${data?.absent} day${data?.absent === 1 ? '' : 's'}` : null, badgeBg: Colors.badgeRedBg, badgeText: Colors.statusRed },
    { label: 'Late-In', value: data?.late ?? 0, unit: null, dot: Colors.statusYellow, badge: (data?.late ?? 0) > 0 ? 'Alert' : null, badgeBg: Colors.badgeYellowBg, badgeText: Colors.statusYellow },
    { label: 'Half Day', value: data?.halfShift ?? 0, unit: null, dot: Colors.statusOrange, badge: null, badgeBg: null, badgeText: null },
    { label: 'Leave', value: data?.onLeave ?? 0, unit: null, dot: Colors.categoryTracking, badge: (data?.onLeave ?? 0) > 0 ? 'Approved' : null, badgeBg: Colors.badgeBlueBg, badgeText: Colors.categoryTracking },
  // The Late-In card goes when HR has switched Morning Late-In detection off.
  ].filter((c) => lateInEnabled || c.label !== 'Late-In');
};

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
  // On the grace days (1st / 2nd) the top-level `eligible` is about the new month only while last month may still be open:
  // eligible when any month the server lists is (the same test as the Leave tab's card; `eligible` alone without a list).
  const clEligible = casualLeaveAvailable(clEligibility?.eligible, clEligibility?.months);
  const { data: geoStatus } = useGeoPunchStatus();
  // Which Late Detection checks are on (company policy; unknown = both on).
  const detect = useLatePolicy();

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

  const punchCount = geoStatus?.punches?.length ?? 0;
  const nextType = geoStatus?.nextPunchType;
  const onDutyActive = geoStatus?.onDutySession?.status === 'active';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Top bar: hamburger · brand mark + wordmark · bell · avatar ─── */}
        <View style={styles.topBar}>
          <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color={Colors.textPrimary} size={20} />
          <UKTLogo size={28} />
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandName}>UKTEXTILES</Text>
            <Text style={styles.brandSub}>EMPLOYEE PORTAL</Text>
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/(tabs)/notifications')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="account" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ─── Month nav + sync status ─── */}
        <View style={styles.monthCard}>
          <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.monthLabelWrap}>
            <MaterialCommunityIcons name="calendar-month-outline" size={15} color={Colors.textMuted} />
            <Text style={styles.monthLabel}>{MONTHS[month - 1]} {year}</Text>
          </View>
          <TouchableOpacity
            onPress={nextMonth}
            style={styles.monthNavBtn}
            activeOpacity={0.7}
            disabled={atCurrent}
          >
            <MaterialCommunityIcons name="chevron-right" size={20} color={atCurrent ? Colors.outline : Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={[styles.syncPill, syncStatus?.pendingSync ? styles.syncPillWarn : styles.syncPillOk]}>
            <View style={[styles.syncDot, { backgroundColor: syncStatus?.pendingSync ? Colors.statusYellow : Colors.statusGreen }]} />
            <Text style={[styles.syncText, { color: syncStatus?.pendingSync ? Colors.statusYellow : Colors.statusGreen }]}>
              {syncStatus?.pendingSync ? 'Pending Sync' : 'Synced'}
            </Text>
          </View>
        </View>

        {/* ─── Office Geo-Punch ─── */}
        <TouchableOpacity
          style={styles.geoCard}
          onPress={() => router.push(onDutyActive ? '/on-duty' : '/geo-punch')}
          activeOpacity={0.85}
        >
          <View style={styles.geoIconWrap}>
            <MaterialCommunityIcons name={onDutyActive ? 'briefcase-outline' : 'navigation-variant-outline'} size={18} color={Colors.categoryTracking} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.geoTitleRow}>
              <Text style={styles.geoTitle}>{onDutyActive ? 'On-Duty' : 'Office Geo-Punch'}</Text>
              <View style={[styles.geoBadge, punchCount > 0 ? styles.geoBadgeOn : styles.geoBadgeOff]}>
                <Text style={[styles.geoBadgeText, { color: punchCount > 0 ? Colors.statusGreen : Colors.textMuted }]}>
                  {punchCount > 0 ? 'Active' : 'No Punch'}
                </Text>
              </View>
            </View>
            <Text style={styles.geoSubtitle} numberOfLines={1}>
              {punchCount === 0
                ? 'No punches recorded yet today'
                : `${punchCount} punch${punchCount === 1 ? '' : 'es'} today · next is ${nextType === 'IN' ? 'Check-In' : 'Check-Out'}`}
            </Text>
          </View>
          <View style={styles.geoViewBtn}>
            <Text style={styles.geoViewBtnText}>View Details</Text>
          </View>
        </TouchableOpacity>

        {/* ─── Assigned shift ─── */}
        {shift && (
          <TouchableOpacity style={styles.shiftBanner} onPress={() => router.push('/shift')} activeOpacity={0.85}>
            <View style={styles.shiftBannerIcon}>
              <MaterialCommunityIcons name="clock-outline" size={16} color={Colors.primary} />
            </View>
            <Text style={styles.shiftBannerText} numberOfLines={1}>
              <Text style={styles.shiftBannerBold}>Shift: {shift.shiftName}</Text>
              {'  '}{shift.startTime} – {shift.endTime} · Grace Period: {shift.gracePeriod} mins
            </Text>
          </TouchableOpacity>
        )}

        {/* ─── Summary grid: 6 individual stat cards ─── */}
        {isLoading ? (
          <SkeletonCard lines={2} />
        ) : (
          <View style={styles.statsGrid}>
            {SUMMARY(Colors, data, detect.lateIn).map(({ label, value, unit, dot, badge, badgeBg, badgeText }) => (
              <View key={label} style={styles.statCard}>
                <View style={styles.statTopRow}>
                  <View style={[styles.statDot, { backgroundColor: dot }]} />
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
                <Text style={styles.statValue} numberOfLines={1}>
                  {value}{unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
                </Text>
                {badge ? (
                  <View style={[styles.statBadge, { backgroundColor: badgeBg }]}>
                    <Text style={[styles.statBadgeText, { color: badgeText }]}>{badge}</Text>
                  </View>
                ) : (
                  <Text style={styles.statBadgeDash}>—</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ─── Casual Leave Status ─── */}
        {clEligibility && (
          <TouchableOpacity style={styles.clCard} onPress={() => router.push('/(tabs)/leave')} activeOpacity={0.85}>
            <View style={styles.clIconWrap}>
              <MaterialCommunityIcons name="shield-check-outline" size={18} color={Colors.statusGreen} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.clTitleRow}>
                <Text style={styles.clTitle}>Casual Leave Status</Text>
                <View style={[styles.clBadge, clEligible ? styles.clBadgeOk : styles.clBadgeNo]}>
                  <Text style={[styles.clBadgeText, { color: clEligible ? Colors.statusGreen : Colors.statusRed }]}>
                    {clEligible ? 'Eligible' : 'Not Eligible'}
                  </Text>
                </View>
              </View>
              <Text style={styles.clSubtitle} numberOfLines={1}>
                {clEligible && clEligibility.yearlyEntitlement != null
                  ? `${clEligibility.remainingThisYear} Remaining of ${clEligibility.yearlyEntitlement} yearly entitlement`
                  : clEligibility.reason ?? 'Not eligible this period'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* ─── Monthly trend ─── */}
        {!isLoading && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Monthly Trend</Text>
              <Text style={styles.cardHint}>Daily breakdown</Text>
            </View>
            <AttendanceTrendChart records={data?.records ?? []} />
          </View>
        )}

        {/* ─── Attendance calendar ─── */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Attendance Calendar</Text>
            <Text style={styles.cardHintBlue}>{MONTHS[month - 1]} {year}</Text>
          </View>
          {isLoading ? (
            <SkeletonCard lines={5} />
          ) : (
            <AttendanceCalendar records={data?.records ?? []} month={month} year={year} detect={detect} />
          )}
        </View>

        {/* ─── Legend ─── same hues as the calendar cells above. The small
            dot is the corner mark on a day that is also Late-In, Early-Out or
            carries an Excess permission (all three count toward late deductions). */}
        <View style={styles.legend}>
          {[
            { label: 'Present', color: Colors.statusGreen },
            // Late-In / Early-Out entries only while HR has that check switched on.
            ...(detect.lateIn ? [{ label: 'Late-In', color: Colors.statusYellow }] : []),
            ...(detect.earlyOut ? [{ label: 'Early-Out', color: Colors.statusLeave }] : []),
            { label: 'Half Day', color: Colors.statusOrange },
            { label: 'Permission', color: Colors.statusBlue },
            { label: 'Absent', color: Colors.statusRed },
            { label: 'On Leave', color: Colors.categoryTracking },
          ].map(({ label, color }) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{label}</Text>
            </View>
          ))}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.legendMark, { backgroundColor: Colors.statusYellow }]} />
            <Text style={styles.legendText}>
              {[detect.lateIn && 'Late', detect.earlyOut && 'Early', 'Excess'].filter(Boolean).join(' / ')} mark
            </Text>
          </View>
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

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
}) as object;

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  content: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },

  // Top bar (matches Home)
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  brandTextWrap: { gap: 1 },
  brandName: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 13, letterSpacing: 0.2 },
  brandSub: { color: Colors.textMuted, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  avatarBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Month nav card
  monthCard: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 8, paddingHorizontal: 10,
    marginBottom: 14,
    ...cardShadow,
  },
  monthNavBtn: { padding: 4 },
  monthLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthLabel: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 5 },
  syncPillOk: { backgroundColor: Colors.badgeGreenBg },
  syncPillWarn: { backgroundColor: Colors.badgeYellowBg },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  syncText: { fontSize: 10.5, fontWeight: '700' },

  // Office Geo-Punch card
  geoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    marginBottom: 14,
    ...cardShadow,
  },
  geoIconWrap: {
    width: 38, height: 38, borderRadius: BorderRadius.md,
    backgroundColor: Colors.badgeBlueBg,
    alignItems: 'center', justifyContent: 'center',
  },
  geoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  geoTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  geoBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  geoBadgeOn: { backgroundColor: Colors.badgeGreenBg },
  geoBadgeOff: { backgroundColor: Colors.bgSurfaceLow },
  geoBadgeText: { fontSize: 9.5, fontWeight: '800' },
  geoSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 3 },
  geoViewBtn: { paddingHorizontal: 4 },
  geoViewBtnText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12 },

  // Shift banner
  shiftBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.lg,
    padding: 12,
    marginBottom: 14,
  },
  shiftBannerIcon: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center',
  },
  shiftBannerText: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  shiftBannerBold: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },

  // Stats grid (3×2, individual cards)
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  statCard: {
    width: '31.6%',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 10,
    gap: 6,
    ...cardShadow,
  },
  statTopRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '600', flexShrink: 1 },
  statValue: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 20, ...TabularNums },
  statUnit: { color: Colors.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 10, fontWeight: '600' },
  statBadge: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
  statBadgeText: { fontSize: 9.5, fontWeight: '800' },
  statBadgeDash: { color: Colors.outline, fontSize: 11, fontWeight: '700' },

  // Casual Leave card
  clCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    marginBottom: 14,
    ...cardShadow,
  },
  clIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.badgeGreenBg,
    alignItems: 'center', justifyContent: 'center',
  },
  clTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  clBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  clBadgeOk: { backgroundColor: Colors.badgeGreenBg },
  clBadgeNo: { backgroundColor: Colors.badgeRedBg },
  clBadgeText: { fontSize: 9.5, fontWeight: '800' },
  clSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 3 },

  // Shared white card
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16,
    marginBottom: 14,
    ...cardShadow,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
  cardHint: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  cardHintBlue: { color: Colors.primary, fontSize: 12, fontWeight: '700' },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  // Matches the corner dot on a calendar cell: a small mark, not a status swatch.
  legendMark: { width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: '#fff' },
  legendText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
});
