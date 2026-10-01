import React, { useEffect, useRef, useState } from 'react';
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
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { UKTLogo } from '../../src/components/UKTLogo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, getDaysInMonth } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/hooks/useAuth';
import { useDashboard } from '../../src/hooks/useDashboard';
import { useAppNotifications } from '../../src/hooks/useAppNotifications';
import { useLiveFeed } from '../../src/hooks/useHomeSummary';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useAttendance } from '../../src/hooks/useAttendance';
import { useShift } from '../../src/hooks/useShift';
import { SlideToPunch } from '../../src/components/SlideToPunch';
import { Reveal } from '../../src/components/Reveal';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { Avatar } from '../../src/components/ui/Avatar';
import { Coachmark, type CoachmarkAnchor } from '../../src/components/ui/Coachmark';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import { SkeletonCard } from '../../src/components/ui/Skeleton';

const TOUR_SEEN_KEY = 'uktextiles.homeTourSeen.v1';

const TOUR_STEPS = [
  { key: 'profile', title: 'Your Profile & ID', body: 'Tap here anytime to view your full profile or open your Digital ID Card for gate scanning.' },
  { key: 'attend', title: 'Monthly Attendance', body: "This card tracks your working days, present, absent and leave counts for the current month, updated live." },
  { key: 'actions', title: 'Quick Actions', body: 'Jump straight to leave, outpass, salary slips and more — tap "Show all" to see everything available to you.' },
] as const;

// Matches the Stitch "Home Dashboard" mock exactly: 6 tiles visible by
// default (2 rows of 3), "Show all 19" expands the rest. Colors here are
// per-tile pastel pairs lifted straight from the mock, not the app-wide
// category palette — this screen's tile set intentionally reads as its own
// small system (soft fill + saturated icon) rather than reusing badge tones.
const makeQuickActions = (Colors: Palette) => ([
  { label: 'On-Duty', icon: 'briefcase-outline', route: '/on-duty' as const, iconColor: '#B7791F', bg: '#FDF3E3' },
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
  { label: 'Notifications', icon: 'bell-outline', route: '/(tabs)/notifications' as const, iconColor: Colors.secondary, bg: Colors.secondaryFixed },
  { label: 'Chat', icon: 'chat-outline', route: '/chat' as const, iconColor: Colors.categoryChat, bg: Colors.badgeBlueBg },
  { label: 'My Profile', icon: 'account-circle-outline', route: '/(tabs)/profile' as const, iconColor: '#2c3e50', bg: Colors.bgSurfaceLow },
  { label: 'About Company', icon: 'office-building-outline', route: '/company' as const, iconColor: Colors.primary, bg: Colors.primaryFixed },
  { label: 'Resignation', icon: 'file-sign', route: '/resignation/warning' as const, iconColor: Colors.categoryDestructive, bg: Colors.badgeRedBg },
]);

const PUNCH_SLOTS = [
  { key: 'in', label: 'In (GPS)' },
  { key: 'lunchOut', label: 'Lunch Out' },
  { key: 'lunchIn', label: 'Lunch In' },
  { key: 'eveningOut', label: 'Evening Out' },
] as const;

export default function HomeScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const QUICK_ACTIONS = makeQuickActions(Colors);

  const { user, logout } = useAuth();
  const now = new Date();
  const { data, isLoading, refetch, isRefetching } = useDashboard(user?.employeeId ?? null);
  const { data: notifs } = useAppNotifications(user?.employeeId ?? null);
  const { data: liveFeed } = useLiveFeed();
  const { data: emp } = useEmployee(user?.employeeId ?? null);
  const { data: myAttendance } = useAttendance(user?.employeeId ?? null, now.getMonth() + 1, now.getFullYear());
  const { data: shift } = useShift(user?.employeeId ?? null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);
  const [clock, setClock] = useState(new Date());
  const visibleActions = showAllActions ? QUICK_ACTIONS : QUICK_ACTIONS.slice(0, 6);
  const unreadCount = notifs?.filter(n => !n.isRead).length ?? 0;

  // First-run guided tour — points at the real profile card, attendance
  // card and quick-actions section once they've actually laid out, not a
  // fixed screen position. `tourStep` is 0 while hidden/not-yet-decided;
  // 1..3 while a Coachmark is showing.
  const [tourStep, setTourStep] = useState(0);
  const profileRef = useRef<any>(null);
  const attendRef = useRef<any>(null);
  const actionsRef = useRef<any>(null);
  const refFor = (key: typeof TOUR_STEPS[number]['key']) =>
    key === 'profile' ? profileRef : key === 'attend' ? attendRef : actionsRef;

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    AsyncStorage.getItem(TOUR_SEEN_KEY).then((seen) => {
      if (!seen) setTimeout(() => setTourStep(1), 500);
    });
  }, [isLoading]);

  const [anchor, setAnchor] = useState<CoachmarkAnchor | undefined>(undefined);
  useEffect(() => {
    if (tourStep < 1 || tourStep > TOUR_STEPS.length) return;
    const ref = refFor(TOUR_STEPS[tourStep - 1].key);
    const id = setTimeout(() => {
      if (typeof ref.current?.measureInWindow === 'function') {
        ref.current.measureInWindow((x: number, y: number, width: number, height: number) => setAnchor({ x, y, width, height }));
      }
    }, 50);
    return () => clearTimeout(id);
  }, [tourStep]);

  const endTour = () => {
    setTourStep(0);
    AsyncStorage.setItem(TOUR_SEEN_KEY, '1');
  };
  const advanceTour = () => {
    if (tourStep >= TOUR_STEPS.length) endTour();
    else setTourStep((s) => s + 1);
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const myTodayPunches = myAttendance?.records.find(r => r.date === todayStr)?.punches ?? [];
  const punchedInToday = myTodayPunches.length > 0;
  const dayOfMonth = now.getDate();
  const daysInMonth = getDaysInMonth(now);
  const nextHoliday = data?.upcomingHolidays?.[0] ?? null;
  const daysUntilHoliday = nextHoliday
    ? Math.max(0, Math.round((new Date(nextHoliday.date).getTime() - Date.now()) / 86400000))
    : 0;
  const floorLiveText = liveFeed && liveFeed.length > 0
    ? `${liveFeed[0].event === 'in' ? 'Checked in' : 'Checked out'} at ${liveFeed[0].time}`
    : null;

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgLight} />

      <ScrollView
        style={styles.scroll}
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
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <MaterialCommunityIcons name="bell-outline" size={20} color={Colors.textPrimary} />
            {unreadCount > 0 && <View style={styles.iconBtnDot} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="account" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ─── Date · Greeting + status dot · Shift pill ─── */}
        <Text style={styles.dateText}>{format(now, 'EEE, d MMM yyyy')}</Text>
        <View style={styles.greetingRow}>
          <Text style={styles.greeting} numberOfLines={1}>
            {getGreeting()}, {user?.name?.split(' ')[0] || 'Employee'}
          </Text>
          <View style={[styles.statusDot, punchedInToday && styles.statusDotOn]} />
        </View>
        <View style={styles.shiftPill}>
          <MaterialCommunityIcons name="clock-outline" size={13} color={Colors.categoryOnDuty} />
          <Text style={styles.shiftPillTime}>{format(clock, 'hh:mm a')}</Text>
          <Text style={styles.shiftPillDot}>·</Text>
          <Text style={styles.shiftPillText} numberOfLines={1}>
            {shift ? `Shift ${shift.shiftName} (${shift.startTime}–${shift.endTime})` : 'No shift assigned'}
          </Text>
        </View>

        {/* ─── Profile card ─── */}
        <TouchableOpacity ref={profileRef} style={styles.profileCard} onPress={() => router.push('/(tabs)/profile')} activeOpacity={0.85}>
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
          <TouchableOpacity style={styles.profileQrBtn} onPress={() => router.push('/idcard')} activeOpacity={0.8}>
            <MaterialCommunityIcons name="qrcode" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* ─── Attendance card (deep navy) ─── */}
        <LinearGradient ref={attendRef} colors={Colors.gradientRoyal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.attendCard}>
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

        {/* ─── Today's Punches (fixed 4-slot tracker) ─── */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <MaterialCommunityIcons name="fingerprint" size={18} color={Colors.categoryPunch} />
            <Text style={styles.cardTitle}>Today's Punches</Text>
            <View style={{ flex: 1 }} />
            <View style={[styles.statusPill, punchedInToday ? styles.statusPillOn : styles.statusPillOff]}>
              <View style={[styles.statusPillDot, { backgroundColor: punchedInToday ? Colors.statusGreen : Colors.textMuted }]} />
              <Text style={[styles.statusPillText, { color: punchedInToday ? Colors.statusGreen : Colors.textMuted }]}>
                {punchedInToday ? 'Punched In' : 'Not Punched'}
              </Text>
            </View>
          </View>
          <View style={styles.punchGrid}>
            {PUNCH_SLOTS.map((slot, i) => {
              const p = myTodayPunches[i];
              return (
                <View key={slot.key} style={[styles.punchTile, !!p && styles.punchTileFilled]}>
                  <MaterialCommunityIcons
                    name={p ? 'check-circle' : 'circle-outline'}
                    size={16}
                    color={p ? Colors.statusGreen : Colors.outlineVariant}
                  />
                  <Text style={[styles.punchTime, TabularNums, !p && styles.punchTimeEmpty]}>
                    {p ? p.time : '--:--'}
                  </Text>
                  <Text style={styles.punchSlotLabel}>{slot.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ─── Quick Actions ─── */}
        <View ref={actionsRef} style={styles.sectionRow}>
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

        {/* ─── Floor Live ticker ─── */}
        {floorLiveText && (
          <View style={styles.floorLiveRow}>
            <MaterialCommunityIcons name="access-point" size={14} color={Colors.primary} />
            <Text style={styles.floorLiveLabel}>Floor Live:</Text>
            <Text style={styles.floorLiveText} numberOfLines={1}>{floorLiveText}</Text>
          </View>
        )}

        {/* ─── Next holiday ─── */}
        {nextHoliday && (
          <View style={styles.holidayCard}>
            <View style={styles.holidayIcon}>
              <MaterialCommunityIcons name="party-popper" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.holidayName} numberOfLines={1}>{nextHoliday.name}</Text>
              <Text style={styles.holidaySub} numberOfLines={1}>
                {format(new Date(nextHoliday.date), 'EEE, dd MMM yyyy')} • {nextHoliday.type ?? 'Holiday'}
              </Text>
            </View>
            <View style={styles.holidayPill}>
              <Text style={styles.holidayPillText}>
                {daysUntilHoliday === 0 ? 'Today' : `In ${daysUntilHoliday} day${daysUntilHoliday === 1 ? '' : 's'}`}
              </Text>
            </View>
          </View>
        )}

        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
      </ScrollView>

      {/* Pinned above the tab bar, deliberately outside the ScrollView. Its
          travel is horizontal, so it never competes with the vertical scroll
          for the gesture, and it stays reachable without scrolling. */}
      <SlideToPunch />

      {tourStep >= 1 && tourStep <= TOUR_STEPS.length && (
        <Coachmark
          visible
          title={TOUR_STEPS[tourStep - 1].title}
          body={TOUR_STEPS[tourStep - 1].body}
          step={tourStep}
          total={TOUR_STEPS.length}
          anchor={anchor}
          onNext={advanceTour}
          onSkip={endTour}
        />
      )}

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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
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
  avatarBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Date / greeting / shift
  dateText: { color: Colors.textMuted, fontSize: 12, marginBottom: 4 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  greeting: { flexShrink: 1, color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 22, letterSpacing: -0.3 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.outlineVariant },
  statusDotOn: { backgroundColor: Colors.statusGreen },
  shiftPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12, paddingVertical: 6,
    marginBottom: 16,
    maxWidth: '100%',
  },
  shiftPillTime: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 12, ...TabularNums },
  shiftPillDot: { color: Colors.textMuted, fontSize: 12 },
  shiftPillText: { color: Colors.textSecondary, fontSize: 12, flexShrink: 1 },

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

  // Attendance card
  attendCard: {
    borderRadius: BorderRadius.xxl,
    padding: 18,
    marginBottom: 14,
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

  // Shared white card
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  statusPillOn: { backgroundColor: Colors.badgeGreenBg },
  statusPillOff: { backgroundColor: Colors.bgSurfaceLow },
  statusPillDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  // Punch grid (4 fixed slots)
  punchGrid: { flexDirection: 'row', gap: 8 },
  punchTile: {
    flex: 1,
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 3,
  },
  punchTileFilled: { backgroundColor: Colors.primaryFixed },
  punchTime: { color: Colors.textPrimary, fontSize: 11, fontWeight: '800' },
  punchTimeEmpty: { color: Colors.textMuted, fontWeight: '600' },
  punchSlotLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: '600', textAlign: 'center' },

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

  // Floor live
  floorLiveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 14,
  },
  floorLiveLabel: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12 },
  floorLiveText: { flex: 1, color: Colors.textSecondary, fontSize: 12 },

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
