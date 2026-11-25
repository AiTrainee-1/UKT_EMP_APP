import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { UKTLogo } from '../../src/components/UKTLogo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, getDaysInMonth } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useCalendarNow } from '../../src/components/home/HomeClock';
import { AttentionStrip } from '../../src/components/home/AttentionStrip';
import { LastSalaryCard } from '../../src/components/home/LastSalaryCard';
import { TodayPanel } from '../../src/components/home/TodayPanel';
import { HeaderAvatarButton } from '../../src/components/home/HeaderAvatarButton';
import { InsightsSection } from '../../src/components/home/InsightsSection';
import { HomeTour } from '../../src/components/home/HomeTour';
import { MY_INSIGHTS_KEY } from '../../src/hooks/useMyInsights';
import { useManagerProfile } from '../../src/hooks/useManager';
import { calendarDaysUntil, greetingFor, inDaysText, parseLocalDate } from '../../src/lib/homeAttention';
import { useAuth } from '../../src/hooks/useAuth';
import { useConfirmSignOut } from '../../src/hooks/useSignOut';
import { useDashboard } from '../../src/hooks/useDashboard';
import { useAppNotifications } from '../../src/hooks/useAppNotifications';
import { useEmployee } from '../../src/hooks/useEmployee';
import { showsForEmployee, type EmploymentGate } from '../../src/lib/employmentType';
import { useAttendance } from '../../src/hooks/useAttendance';
import { useShift } from '../../src/hooks/useShift';
import { SlideToPunch } from '../../src/components/SlideToPunch';
import { Reveal } from '../../src/components/Reveal';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { Avatar } from '../../src/components/ui/Avatar';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { ThemedStatusBar } from '../../src/components/ThemedStatusBar';

// Matches the Stitch "Home Dashboard" mock exactly: 6 tiles visible by
// default (2 rows of 3), "Show all N" expands the rest. Colors here are
// per-tile pastel pairs lifted straight from the mock, not the app-wide
// category palette — this screen's tile set intentionally reads as its own
// small system (soft fill + saturated icon) rather than reusing badge tones.
const makeQuickActions = (Colors: Palette) => ([
  { label: 'On-Duty', icon: 'briefcase-outline', route: '/on-duty' as const, iconColor: '#B7791F', bg: '#FDF3E3' },
  { label: 'On-Duty Journey', icon: 'map-marker-path', route: '/my-journeys' as const, iconColor: '#0E7490', bg: '#E1F3F7' },
  { label: 'Missing Punch', icon: 'hand-pointing-right', route: '/missing-punch' as const, iconColor: '#6D4AFF', bg: '#EFEBFF' },
  { label: 'Apply Leave', icon: 'leaf', route: '/(tabs)/leave' as const, iconColor: '#D6408C', bg: '#FCE9F3' },
  { label: 'Permission', icon: 'hand-back-left-outline', route: '/requests' as const, iconColor: '#2980B9', bg: '#E7F3FB' },
  { label: 'Gate Outpass', icon: 'exit-run', route: '/outpass' as const, iconColor: '#009688', bg: '#E4F5F3' },
  { label: 'Salary Slips', icon: 'cash-multiple', route: '/salary' as const, iconColor: '#27AE60', bg: '#E7F7EE' },
  { label: 'Attendance', icon: 'calendar-check-outline', route: '/(tabs)/attendance' as const, iconColor: Colors.statusGreen, bg: Colors.badgeGreenBg },
  { label: 'Attendance Request', icon: 'map-marker-radius-outline', route: '/geo-punch' as const, iconColor: Colors.categoryTracking, bg: Colors.badgeBlueBg },
  { label: 'My Shift', icon: 'clock-outline', route: '/shift' as const, iconColor: Colors.categoryShift, bg: '#FDEEE3' },
  { label: 'Live Tracking', icon: 'crosshairs-gps', route: '/geo-tracking' as const, iconColor: Colors.categoryTracking, bg: Colors.badgeBlueBg },
  { label: 'Advances', icon: 'bank-transfer', route: '/settlement' as const, iconColor: '#7f8c8d', bg: Colors.bgSurfaceLow },
  { label: 'Digital ID Card', icon: 'card-account-details-outline', route: '/idcard' as const, iconColor: '#2c3e50', bg: Colors.bgSurfaceLow },
  { label: 'My Documents', icon: 'folder-outline', route: '/documents' as const, iconColor: Colors.categoryDocs, bg: '#E1F4F2' },
  { label: 'Holidays', icon: 'flag-outline', route: '/holidays' as const, iconColor: '#c0392b', bg: Colors.badgeRedBg },
  { label: 'Compensation', icon: 'briefcase-clock-outline', route: '/compensation' as const, iconColor: '#047857', bg: '#E1F5EC' },
  { label: 'HOD Assignment', icon: 'shield-account-outline', route: '/hod-assignment' as const, iconColor: '#6D28D9', bg: '#EFEBFF' },
  { label: 'Enquiries', icon: 'message-question-outline', route: '/enquiries' as any, iconColor: '#0F766E', bg: '#E0F2F1' },
  { label: 'Notifications', icon: 'bell-outline', route: '/(tabs)/notifications' as const, iconColor: Colors.secondary, bg: Colors.secondaryFixed },
  { label: 'Chat', icon: 'chat-outline', route: '/chat' as const, iconColor: Colors.categoryChat, bg: Colors.badgeBlueBg },
  { label: 'My Profile', icon: 'account-circle-outline', route: '/(tabs)/profile' as const, iconColor: '#2c3e50', bg: Colors.bgSurfaceLow },
  { label: 'About Company', icon: 'office-building-outline', route: '/company' as const, iconColor: Colors.primary, bg: Colors.primaryFixed },
  { label: 'Resignation', icon: 'file-sign', route: '/resignation/warning' as const, iconColor: Colors.categoryDestructive, bg: Colors.badgeRedBg },
]);

// Tiles only a staff employee gets (src/lib/employmentType.ts):
//  - Compensation is for staff only and is listed once the profile has said 'staff' (a production employee never sees it
//    flash up while the profile loads);
//  - Apply Leave and Permission are hidden from a production employee, the same `staffOnly` rule as the side drawer's
//    Leave / Permissions entries (shown while the profile is still loading).
const TILE_GATES: Readonly<Record<string, EmploymentGate>> = {
  '/compensation': { staffProfileOnly: true },
  '/(tabs)/leave': { staffOnly: true },
  '/requests': { staffOnly: true },
};

export default function HomeScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Changes only on a new day or a new greeting period: the live minute is TodayPanel's own state (useMinuteNow), so Home
  // does not re-render (tile grid, animations and all) every minute.
  const now = useCalendarNow();
  const { data, isLoading, refetch, isRefetching } = useDashboard(user?.employeeId ?? null);
  const { data: notifs } = useAppNotifications(user?.employeeId ?? null);
  const { data: emp } = useEmployee(user?.employeeId ?? null);
  const QUICK_ACTIONS = makeQuickActions(Colors).filter((a) => showsForEmployee(TILE_GATES[a.route] ?? {}, emp?.employmentType));
  const { data: myAttendance, isLoading: attendanceLoading, isError: attendanceFailed } = useAttendance(user?.employeeId ?? null, now.getMonth() + 1, now.getFullYear());
  const { data: shift, isLoading: shiftLoading } = useShift(user?.employeeId ?? null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);
  const visibleActions = showAllActions ? QUICK_ACTIONS : QUICK_ACTIONS.slice(0, 6);
  const unreadCount = notifs?.filter(n => !n.isRead).length ?? 0;

  // The app tour (src/components/home/HomeTour.tsx, owner 2026-11-25) points at these real elements of Home once
  // they have laid out; the punch slider and the tab bar are worked out from the screen area (rootRef).
  const { data: manager } = useManagerProfile(!!user);
  const rootRef = useRef<ViewInstance>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const menuRef = useRef<ViewInstance>(null);
  const bellRef = useRef<ViewInstance>(null);
  const avatarRef = useRef<ViewInstance>(null);
  const profileRef = useRef<ViewInstance>(null);
  const attendRef = useRef<ViewInstance>(null);
  const todayRef = useRef<ViewInstance>(null);
  const actionsRef = useRef<ViewInstance>(null);
  const insightsRef = useRef<ViewInstance>(null);

  // "My Insights" draws its charts the first time it scrolls into view (or at once when it already fits on screen).
  const [insightsSeen, setInsightsSeen] = useState(false);
  const insightsTop = useRef<number | null>(null);
  const viewportH = useRef(0);
  const scrollYNow = useRef(0);
  const checkInsights = () => {
    if (insightsSeen || insightsTop.current == null || viewportH.current <= 0) return;
    if (scrollYNow.current + viewportH.current > insightsTop.current + 80) setInsightsSeen(true);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYNow.current = e.nativeEvent.contentOffset.y;
    checkInsights();
  };
  const onInsightsLayout = (e: LayoutChangeEvent) => {
    insightsTop.current = e.nativeEvent.layout.y;
    checkInsights();
  };

  const todayStr = format(now, 'yyyy-MM-dd');
  const myTodayPunches = myAttendance?.records.find(r => r.date === todayStr)?.punches ?? [];
  const punchedInToday = myTodayPunches.length > 0;
  const dayOfMonth = now.getDate();
  const daysInMonth = getDaysInMonth(now);
  const nextHoliday = data?.upcomingHolidays?.[0] ?? null;
  // The holiday date is a plain "yyyy-MM-dd": read it as a LOCAL day (new Date() read it as UTC, so late in the evening
  // tomorrow's holiday showed "Today").
  const holidayDate = nextHoliday ? parseLocalDate(nextHoliday.date) : null;
  const daysUntilHoliday = nextHoliday ? calendarDaysUntil(nextHoliday.date, now) ?? 0 : 0;

  // Pull-to-refresh refreshes everything Home shows, not just the month card.
  const onRefresh = () => {
    void refetch();
    for (const key of [
      ['attendance', user?.employeeId ?? null],
      ['shift'],
      ['my-pending-requests'],
      ['outpass-requests'],
      ['geo-punch-status'],
      ['my-advances', 'eligibility'],
      ['casual-leave-eligibility'],
      ['salary-insights'],
      [MY_INSIGHTS_KEY],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
  // Refused while an On-Duty day is running (src/hooks/useSignOut.ts).
  const handleLogout = useConfirmSignOut();

  return (
    <SafeAreaView ref={rootRef} style={styles.safe} edges={['top']}>
      <ThemedStatusBar />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
        onLayout={(e) => {
          viewportH.current = e.nativeEvent.layout.height;
          checkInsights();
        }}
        onScroll={onScroll}
        scrollEventThrottle={64}
      >
        {/* ─── Top bar: hamburger · brand mark + wordmark · bell · avatar (the person's photo) ─── */}
        <View style={styles.topBar}>
          <View ref={menuRef} collapsable={false}>
            <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color={Colors.textPrimary} size={20} />
          </View>
          <UKTLogo size={28} />
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandName}>UKTEXTILES</Text>
            <Text style={styles.brandSub}>EMPLOYEE PORTAL</Text>
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            ref={bellRef}
            style={styles.iconBtn}
            onPress={() => router.push('/(tabs)/notifications')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color={Colors.textPrimary} />
            {unreadCount > 0 && <View style={styles.iconBtnDot} />}
          </TouchableOpacity>
          <HeaderAvatarButton ref={avatarRef} size={30} />
        </View>

        {/* ─── Date · Greeting + status dot (the live time and the shift live in the "Right now" panel below) ─── */}
        <Text style={styles.dateText}>{format(now, 'EEE, d MMM yyyy')}</Text>
        <View style={styles.greetingRow}>
          <Text style={styles.greeting} numberOfLines={1}>
            {greetingFor(now.getHours())}, {user?.name?.split(' ')[0] || 'Employee'}
          </Text>
          <View
            style={[styles.statusDot, punchedInToday && styles.statusDotOn]}
            accessible
            accessibilityLabel={punchedInToday ? 'Punched in today' : 'Not punched in yet today'}
          />
        </View>

        {/* ─── Profile card ─── */}
        <TouchableOpacity
          ref={profileRef}
          style={styles.profileCard}
          onPress={() => router.push('/(tabs)/profile')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${emp?.name ?? user?.name ?? 'My profile'}${emp?.employeeCode ? `, ${emp.employeeCode}` : ''}. Open profile`}
        >
          <View style={styles.profileDeco} />
          <Avatar uri={emp?.photoUrl} name={emp?.name ?? user?.name} size={44} borderColor={Colors.border} />
          <View style={{ flex: 1 }}>
            <View style={styles.profileNameRow}>
              <Text style={styles.profileName} numberOfLines={1}>{emp?.name ?? user?.name}</Text>
              {emp?.status === 'active' && (
                <MaterialCommunityIcons name="check-decagram" size={14} color={Colors.statusGreen} />
              )}
            </View>
            <Text style={styles.profileMeta} numberOfLines={1}>
              {emp?.employeeCode} • {emp?.designationTitle}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.profileQrBtn}
            onPress={() => router.push('/idcard')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Digital ID Card"
          >
            <MaterialCommunityIcons name="qrcode" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* ─── Attendance card (deep navy) ─── */}
        <View ref={attendRef} collapsable={false} style={styles.attendWrap}>
          <LinearGradient colors={Colors.gradientRoyal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.attendCard}>
            <View style={styles.attendHeader}>
              <View style={styles.attendHeaderLeft}>
                <MaterialCommunityIcons name="calendar-month" size={16} color="#fff" />
                <Text style={styles.attendTitle}>{format(now, 'MMMM')} Attendance</Text>
              </View>
              <View style={styles.attendDayPill}>
                <Text style={styles.attendDayPillText}>Day {dayOfMonth}/{daysInMonth}</Text>
              </View>
            </View>
            {isLoading ? (
              <View style={styles.attendGrid}>
                {[0, 1, 2, 3].map(i => <View key={i} style={[styles.attendTile, { opacity: 0.4 }]} />)}
              </View>
            ) : (
              <View style={styles.attendGrid}>
                <View style={styles.attendTile}>
                  <Text style={styles.attendNum}>{data?.workingDays ?? 0}</Text>
                  <Text style={styles.attendLabel}>Work Days</Text>
                </View>
                <View style={styles.attendTile}>
                  <Text style={[styles.attendNum, { color: '#5EEAD4' }]}>{data?.presentDays ?? 0}</Text>
                  <Text style={styles.attendLabel}>Present</Text>
                </View>
                <View style={[styles.attendTile, styles.attendTileAlert]}>
                  <Text style={[styles.attendNum, { color: '#FCA5A5' }]}>{data?.absentDays ?? 0}</Text>
                  <Text style={styles.attendLabel}>Absent</Text>
                </View>
                <View style={styles.attendTile}>
                  <Text style={styles.attendNum}>{data?.leaveDays ?? 0}</Text>
                  <Text style={styles.attendLabel}>Leaves</Text>
                </View>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* ─── Right now · Today's punches (clock, shift progress, the day as a bar, punches labelled by what they are) ─── */}
        <View ref={todayRef} collapsable={false}>
          <TodayPanel
            employeeId={user?.employeeId ?? null}
            records={myAttendance?.records}
            recordsLoading={attendanceLoading}
            recordsFailed={attendanceFailed && !myAttendance}
            shift={shift}
            shiftLoading={shiftLoading}
          />
        </View>

        {/* ─── Needs your attention (renders nothing when nothing is waiting) ─── */}
        <AttentionStrip employeeId={user?.employeeId ?? null} employmentType={emp?.employmentType} now={now} />

        {/* ─── Quick Actions ─── */}
        <View ref={actionsRef} collapsable={false}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <Text style={styles.sectionHint}>Essential Workflows</Text>
          </View>
          <View style={styles.actionsGrid}>
            {visibleActions.map(({ label, icon, route, iconColor, bg }, i) => (
              <Reveal key={label} index={i} offsetY={8} style={styles.actionBtnWrap}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push(route as any)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  <View style={[styles.actionIconWrap, { backgroundColor: bg }]}>
                    <MaterialCommunityIcons name={icon as any} size={22} color={iconColor} />
                  </View>
                  <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
                </TouchableOpacity>
              </Reveal>
            ))}
          </View>
          <TouchableOpacity
            style={styles.showAllBtn}
            onPress={() => setShowAllActions(v => !v)}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.showAllBtnText}>
              {showAllActions ? 'Show less' : `Show all ${QUICK_ACTIONS.length} actions`}
            </Text>
            <MaterialCommunityIcons
              name={showAllActions ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.primary}
            />
          </TouchableOpacity>
        </View>

        {/* ─── Next holiday ─── */}
        {nextHoliday && (
          <View style={styles.holidayCard}>
            <View style={styles.holidayIcon}>
              <MaterialCommunityIcons name="party-popper" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.holidayName} numberOfLines={1}>{nextHoliday.name}</Text>
              <Text style={styles.holidaySub} numberOfLines={1}>
                {holidayDate ? format(holidayDate, 'EEE, dd MMM yyyy') : nextHoliday.date} • {nextHoliday.type ?? 'Holiday'}
              </Text>
            </View>
            <View style={styles.holidayPill}>
              <Text style={styles.holidayPillText}>{inDaysText(daysUntilHoliday)}</Text>
            </View>
          </View>
        )}

        {/* ─── Last salary (amounts hidden until the eye is tapped; nothing before the first slip) ─── */}
        {!isLoading && <LastSalaryCard />}

        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {/* ─── My Insights: the attendance health report (a direct child of the scroll content: its y is its place in it) ─── */}
        <View onLayout={onInsightsLayout}>
          <InsightsSection
            employeeId={user?.employeeId ?? null}
            employmentType={emp?.employmentType}
            revealed={insightsSeen}
            anchorRef={insightsRef}
          />
        </View>
      </ScrollView>

      {/* Pinned above the tab bar, deliberately outside the ScrollView. Its
          travel is horizontal, so it never competes with the vertical scroll
          for the gesture, and it stays reachable without scrolling. */}
      <SlideToPunch />

      <HomeTour
        ready={!isLoading}
        anchors={{
          menu: menuRef,
          bell: bellRef,
          avatar: avatarRef,
          profileCard: profileRef,
          attendance: attendRef,
          today: todayRef,
          actions: actionsRef,
          insights: insightsRef,
        }}
        scrollRef={scrollRef}
        rootRef={rootRef}
        isManager={manager?.isManager ?? false}
        employmentType={emp?.employmentType}
      />

      {/* Side Drawer */}
      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        onLogout={handleLogout}
        notificationCount={unreadCount}
      />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  scroll: { flex: 1 },
  // Bottom padding clears the pinned SlideToPunch bar, not just the tab bar.
  content: { paddingHorizontal: 16, paddingBottom: 132, paddingTop: 8 },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  brandTextWrap: { gap: 1 },
  brandName: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 13, letterSpacing: 0.2 },
  brandSub: { color: Colors.textMuted, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  iconBtnDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: Colors.statusRed,
    borderWidth: 1, borderColor: Colors.bgLight,
  },

  // Date / greeting
  dateText: { color: Colors.textMuted, fontSize: 12, marginBottom: 4 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  greeting: { flexShrink: 1, color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 22, letterSpacing: -0.3 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.outlineVariant },
  statusDotOn: { backgroundColor: Colors.statusGreen },

  // Profile card
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    marginBottom: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  profileDeco: {
    position: 'absolute', top: -30, right: -30,
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.bgSurfaceLow,
  },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  profileName: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15, flexShrink: 1 },
  profileMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  profileQrBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgSurfaceLow,
    alignItems: 'center', justifyContent: 'center',
  },

  // Attendance card (the wrapper carries the gap below, so the tour's spotlight hugs the card itself)
  attendWrap: { marginBottom: 14 },
  attendCard: {
    borderRadius: BorderRadius.xxl,
    padding: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20 },
      android: { elevation: 8 },
    }),
  },
  attendHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  attendHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attendTitle: { color: '#fff', fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
  attendDayPill: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  attendDayPillText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', ...TabularNums },
  attendGrid: { flexDirection: 'row', gap: 8 },
  attendTile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
    minHeight: 62,
  },
  attendTileAlert: { backgroundColor: 'rgba(225,29,72,0.28)' },
  attendNum: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 20, ...TabularNums },
  attendLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600', textAlign: 'center' },

  // Section header
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 17 },
  sectionHint: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },

  // Quick actions (3-column pastel tiles)
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  actionBtnWrap: { width: '31.3%' },
  actionBtn: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 16,
    paddingHorizontal: 6,
    alignItems: 'center',
    width: '100%',
    minHeight: 96,
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  actionIconWrap: {
    width: 46, height: 46, borderRadius: BorderRadius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 11, textAlign: 'center' },

  showAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.full,
    paddingVertical: 12,
    marginBottom: 18,
  },
  showAllBtnText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },

  // Holiday
  holidayCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12,
    marginBottom: 20,
  },
  holidayIcon: {
    width: 40, height: 40, borderRadius: BorderRadius.md,
    backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
  },
  holidayName: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  holidaySub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  holidayPill: {
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  holidayPillText: { color: Colors.primary, fontSize: 10, fontWeight: '800' },
});
