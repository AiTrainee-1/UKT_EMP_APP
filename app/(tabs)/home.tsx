import React, { useEffect, useState } from 'react';
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
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { useDashboard } from '../../src/hooks/useDashboard';
import { useAppNotifications } from '../../src/hooks/useAppNotifications';
import { useLiveFeed } from '../../src/hooks/useHomeSummary';
import { useIdCard } from '../../src/hooks/useIdCard';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useAttendance } from '../../src/hooks/useAttendance';
import { SlideToPunch } from '../../src/components/SlideToPunch';
import { Reveal } from '../../src/components/Reveal';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { Avatar } from '../../src/components/ui/Avatar';
import { LiveFeedTicker } from '../../src/components/LiveFeedTicker';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { SkeletonCard } from '../../src/components/ui/Skeleton';

// The first six are exactly what shows before "Show all" (see visibleActions
// below) -deliberately the six approval/request flows an employee reaches
// for most, not the attendance-tracking screens (those are one tap away on
// their own tab already). Everything after is staged behind "Show all",
// pay/identity/reference/account screens in roughly that order of use, with
// Resignation deliberately last since it's rare and consequential.
const makeQuickActions = (Colors: Palette) => ([
  // ── Top six -requests & approvals ──
  { label: 'On-Duty', icon: 'briefcase-outline', route: '/on-duty' as const, color: '#815600' },
  { label: 'Missing Punch', icon: 'fingerprint', route: '/missing-punch' as const, color: '#5e35b1' },
  { label: 'Leave', icon: 'umbrella-outline', route: '/(tabs)/leave' as const, color: '#8e44ad' },
  { label: 'Permission', icon: 'hand-pointing-right', route: '/requests' as const, color: '#2980b9' },
  { label: 'Outpass', icon: 'door-open', route: '/outpass' as const, color: '#009688' },
  { label: 'Salary Slips', icon: 'cash-multiple', route: '/salary' as const, color: '#27ae60' },
  // ── Everything else, behind "Show all" ──
  { label: 'Attendance', icon: 'calendar-check-outline', route: '/(tabs)/attendance' as const, color: Colors.primary },
  { label: 'Attendance Request', icon: 'map-marker-radius-outline', route: '/geo-punch' as const, color: '#0891b2' },
  { label: 'My Shift', icon: 'clock-outline', route: '/shift' as const, color: '#e67e22' },
  { label: 'Live Tracking', icon: 'crosshairs-gps', route: '/geo-tracking' as const, color: '#0369a1' },
  { label: 'Advances', icon: 'bank-transfer', route: '/settlement' as const, color: '#7f8c8d' },
  { label: 'Digital ID Card', icon: 'card-account-details-outline', route: '/idcard' as const, color: '#2c3e50' },
  { label: 'My Documents', icon: 'folder-outline', route: '/documents' as const, color: '#00897b' },
  { label: 'Holidays', icon: 'flag-outline', route: '/holidays' as const, color: '#c0392b' },
  { label: 'Notifications', icon: 'bell-outline', route: '/(tabs)/notifications' as const, color: '#735c00' },
  { label: 'Chat', icon: 'chat-outline', route: '/chat' as const, color: '#0984e3' },
  { label: 'My Profile', icon: 'account-circle-outline', route: '/(tabs)/profile' as const, color: '#2c3e50' },
  { label: 'About Company', icon: 'office-building-outline', route: '/company' as const, color: Colors.primary },
  { label: 'Resignation', icon: 'file-sign', route: '/resignation/warning' as const, color: '#c62828' },
]);

// Working / Present / Absent / Leave for the current month. All four come
// from the same backend engine as the Attendance tab, so the two screens
// always agree. Note these are *days elapsed so far this month*, not the
// whole month — the month's remaining days aren't counted until they happen.
const SUMMARY_ITEMS = (Colors: Palette, data: any) => [
  { label: 'Working Days', value: data?.workingDays ?? 0, icon: 'calendar-month-outline', color: Colors.primary, bg: Colors.badgeBlueBg },
  { label: 'Present', value: data?.presentDays ?? 0, icon: 'check-circle', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
  { label: 'Absent', value: data?.absentDays ?? 0, icon: 'close-circle', color: Colors.statusRed, bg: Colors.badgeRedBg },
  { label: 'Leave', value: data?.leaveDays ?? 0, icon: 'umbrella', color: Colors.primary, bg: Colors.badgeYellowBg },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Section title with gradient accent bar */
function GradientSectionTitle({ title }: { title: string }) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const sectionTitleSt = useThemedStyles(makeSectionTitleSt);
  const QUICK_ACTIONS = makeQuickActions(Colors);

  return (
    <View style={sectionTitleSt.wrap}>
      <LinearGradient
        colors={['#006496', '#5dbbff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={sectionTitleSt.bar}
      />
      <Text style={sectionTitleSt.text}>{title}</Text>
    </View>
  );
}

const makeSectionTitleSt = (Colors: Palette) => StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { width: 4, height: 18, borderRadius: 2 },
  text: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: Colors.textPrimary,
  },
});

function AttendanceDot({ status }: { status: string }) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const sectionTitleSt = useThemedStyles(makeSectionTitleSt);
  const QUICK_ACTIONS = makeQuickActions(Colors);

  const color =
    status === 'Present' ? Colors.clayGreen
    : status === 'Absent' ? Colors.clayRed
    : status === 'Late' ? Colors.clayYellow
    : status === 'On Leave' ? Colors.clayBlue
    : Colors.bgSurfaceMid;
  const textColor =
    status === 'Present' ? Colors.statusGreen
    : status === 'Absent' ? Colors.statusRed
    : status === 'Late' ? Colors.statusYellow
    : Colors.statusBlue;
  return (
    <View style={[dot.wrap, { backgroundColor: color }]}>
      <MaterialCommunityIcons
        name={status === 'Present' ? 'check' : status === 'Absent' ? 'close' : status === 'Late' ? 'alert' : 'dots-horizontal'}
        size={12}
        color={textColor}
      />
    </View>
  );
}

const dot = StyleSheet.create({
  wrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});

export default function HomeScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const sectionTitleSt = useThemedStyles(makeSectionTitleSt);
  const QUICK_ACTIONS = makeQuickActions(Colors);

  const { user, logout } = useAuth();
  const now = new Date();
  const { data, isLoading, refetch, isRefetching } = useDashboard(user?.employeeId ?? null);
  const { data: notifs } = useAppNotifications(user?.employeeId ?? null);
  const { data: liveFeed } = useLiveFeed();
  const { data: idCard } = useIdCard(user?.employeeId ?? null);
  const { data: emp } = useEmployee(user?.employeeId ?? null);
  const { data: myAttendance } = useAttendance(user?.employeeId ?? null, now.getMonth() + 1, now.getFullYear());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);
  const [clock, setClock] = useState(new Date());
  // The top six requests/approvals lead QUICK_ACTIONS, so slicing it is a
  // sensible default without a second list to keep in sync.
  const visibleActions = showAllActions ? QUICK_ACTIONS : QUICK_ACTIONS.slice(0, 6);
  const today = format(new Date(), 'EEEE, d MMMM yyyy');
  const unreadCount = notifs?.filter(n => !n.isRead).length ?? 0;

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const myTodayPunches = myAttendance?.records.find(r => r.date === todayStr)?.punches ?? [];

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#006496" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ─── App header ─────────────────────────────────────────────────
            Single left-aligned text block between the two controls. The
            previous version centred the greeting and clock but left-aligned
            the date underneath, so nothing lined up; the greeting was also
            squeezed between the buttons and truncated on longer names. */}
        <View style={styles.header}>
          <View style={styles.menuBtn}>
            <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color={Colors.primary} size={20} />
          </View>

          <View style={styles.headerText}>
            <Text style={styles.greeting} numberOfLines={1}>
              {getGreeting()}, {user?.name?.split(' ')[0] || 'Employee'}
            </Text>
            {/* Date and time on one line — the seconds ticked away in the old
                header purely as decoration, drawing the eye every second. */}
            <Text style={styles.headerMeta} numberOfLines={1}>
              {today} · <Text style={styles.headerClock}>{format(clock, 'hh:mm a')}</Text>
            </Text>
          </View>

          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => router.push('/(tabs)/notifications')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
            }
          >
            <MaterialCommunityIcons name="bell-outline" size={22} color={Colors.primary} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ─── Summary banner ─── */}
        <LinearGradient
          colors={Colors.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <View style={styles.bannerDeco1} />
          <View style={styles.bannerDeco2} />
          <View style={styles.bannerInner}>
            <MaterialCommunityIcons name="office-building-outline" size={16} color="rgba(255,255,255,0.7)" />
            <Text style={styles.bannerLabel}>This Month's Overview</Text>
          </View>
          {isLoading ? (
            <View style={styles.bannerGrid}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={styles.bannerStat}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)' }} />
                  <View style={{ width: 28, height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, marginTop: 6 }} />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.bannerGrid}>
              {SUMMARY_ITEMS(Colors, data).map(({ label, value, icon, bg }) => (
                <View key={label} style={styles.bannerStat}>
                  <View style={[styles.bannerIcon, { backgroundColor: bg }]}>
                    <MaterialCommunityIcons name={icon as any} size={16} color={Colors.textPrimary} />
                  </View>
                  <Text style={styles.bannerNum}>{value}</Text>
                  <Text style={styles.bannerStatLabel}>{label}</Text>
                </View>
              ))}
            </View>
          )}
        </LinearGradient>

        {/* ─── Quick Actions ─── */}
        {/* Eighteen tiles at once was a wall of colour with no hierarchy, so
            the six highest-priority actions (the attendance group, per
            QUICK_ACTIONS' ordering) show by default and the rest expand on
            demand. Nothing is removed -just staged. */}
        <View style={styles.sectionRow}>
          <GradientSectionTitle title="Quick Actions" />
          <TouchableOpacity
            onPress={() => setShowAllActions(v => !v)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.sectionAction}
            accessibilityRole="button"
            accessibilityLabel={showAllActions ? 'Show fewer quick actions' : 'Show all quick actions'}
          >
            <Text style={styles.sectionActionText}>
              {showAllActions ? 'Show less' : `All ${QUICK_ACTIONS.length}`}
            </Text>
            <MaterialCommunityIcons
              name={showAllActions ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.primary}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.actionsGrid}>
          {visibleActions.map(({ label, icon, route, color }, i) => (
            <Reveal key={label} index={i} offsetY={8} style={styles.actionBtnWrap}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(route as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <LinearGradient
                colors={[`${color}22`, `${color}0a`]}
                style={styles.actionIconWrap}
              >
                <MaterialCommunityIcons name={icon as any} size={24} color={color} />
              </LinearGradient>
              <Text style={styles.actionLabel}>{label}</Text>
            </TouchableOpacity>
            </Reveal>
          ))}
        </View>

        {/* ─── My Punches Today ─── */}
        <View style={styles.sectionRow}>
          <GradientSectionTitle title="My Punches Today" />
        </View>
        <View style={styles.myPunchesCard}>
          {myTodayPunches.length === 0 ? (
            <Text style={styles.myPunchesEmpty}>No punches recorded yet today</Text>
          ) : (
            <View style={styles.myPunchesRow}>
              {myTodayPunches.map((p, i) => (
                <View key={i} style={styles.myPunchChip}>
                  <MaterialCommunityIcons
                    name={p.type === 'IN' ? 'login' : 'logout'}
                    size={14}
                    color={p.type === 'IN' ? Colors.statusGreen : Colors.statusRed}
                  />
                  <Text style={[styles.myPunchTime, { color: p.type === 'IN' ? Colors.statusGreen : Colors.statusRed }]}>
                    {p.time}
                  </Text>
                  <Text style={styles.myPunchType}>{p.type}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ─── Live Attendance Ticker (own punches only) ─── */}
        <View style={styles.sectionRow}>
          <GradientSectionTitle title="Live Attendance" />
        </View>
        <View style={{ marginBottom: 24 }}>
          <LiveFeedTicker items={liveFeed ?? []} />
        </View>

        {/* ─── Company Location ─── */}
        {emp?.branchLat != null && emp?.branchLng != null && (
          <>
            <View style={styles.sectionRow}>
              <GradientSectionTitle title="Company Location" />
            </View>
            <TouchableOpacity
              style={styles.locationCard}
              activeOpacity={0.85}
              onPress={() => {
                const label = encodeURIComponent(emp?.branchName ?? 'Company');
                const url = Platform.select({
                  ios: `maps:0,0?q=${label}@${emp.branchLat},${emp.branchLng}`,
                  default: `geo:${emp.branchLat},${emp.branchLng}?q=${emp.branchLat},${emp.branchLng}(${label})`,
                });
                if (url) Linking.openURL(url).catch(() => {});
              }}
            >
              <View style={styles.locationIconWrap}>
                <MaterialCommunityIcons name="map-marker" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.locationTitle}>{emp?.branchName ?? 'Your Branch'}</Text>
                {!!emp?.branchAddress && (
                  <Text style={styles.locationSubtitle} numberOfLines={2}>{emp.branchAddress}</Text>
                )}
              </View>
              <View style={styles.locationOpenBtn}>
                <MaterialCommunityIcons name="directions" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* ─── Digital ID Card (compact) ─── */}
        {(idCard || emp) && (
          <>
            <View style={styles.sectionRow}>
              <GradientSectionTitle title="Digital ID Card" />
            </View>
            <TouchableOpacity
              style={styles.idCardMini}
              onPress={() => router.push('/idcard')}
              activeOpacity={0.85}
            >
              <LinearGradient colors={Colors.gradientPrimary} style={styles.idCardMiniGradient}>
                <Avatar
                  uri={idCard?.photoUrl ?? emp?.photoUrl}
                  name={idCard?.name ?? emp?.name}
                  size={46}
                  borderColor="rgba(255,255,255,0.5)"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.idCardMiniName} numberOfLines={1}>{idCard?.name ?? emp?.name}</Text>
                  <Text style={styles.idCardMiniMeta} numberOfLines={1}>
                    #{idCard?.code ?? emp?.employeeCode} · {idCard?.designation ?? emp?.designationTitle}
                  </Text>
                </View>
                <MaterialCommunityIcons name="qrcode" size={22} color="rgba(255,255,255,0.85)" />
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {/* ─── Recent Attendance ─── */}
        {!isLoading && data?.recentAttendance && data.recentAttendance.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <GradientSectionTitle title="Recent Attendance" />
            </View>
            <View style={styles.attendanceCard}>
              <View style={styles.attendanceRow}>
                {data.recentAttendance.slice(0, 7).map((a: any, i: number) => (
                  <View key={i} style={styles.attendanceItem}>
                    <AttendanceDot status={a.status} />
                    <Text style={styles.attendanceDate}>{format(new Date(a.date), 'dd')}</Text>
                    <Text style={styles.attendanceDay}>{format(new Date(a.date), 'EEE')}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ─── Upcoming Holidays ─── */}
        {!isLoading && data?.upcomingHolidays && data.upcomingHolidays.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <GradientSectionTitle title="Upcoming Holidays" />
            </View>
            {data.upcomingHolidays.slice(0, 3).map((h: any, i: number) => (
              <View key={i} style={styles.holidayCard}>
                <LinearGradient colors={['#fed65b', '#ffec96']} style={styles.holidayDateBox}>
                  <Text style={styles.holidayDay}>{format(new Date(h.date), 'd')}</Text>
                  <Text style={styles.holidayMonth}>{format(new Date(h.date), 'MMM')}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.holidayName}>{h.name}</Text>
                  <Text style={styles.holidayWeekday}>{format(new Date(h.date), 'EEEE')}</Text>
                </View>
                <View style={styles.holidayTypeBadge}>
                  <MaterialCommunityIcons name="flag" size={14} color={Colors.secondary} />
                </View>
              </View>
            ))}
          </>
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
  // Bottom padding clears the pinned SwipeUpPunch bar, not just the tab bar.
  content: { paddingHorizontal: 16, paddingBottom: 132 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    marginBottom: 18,
  },
  menuBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  // flex:1 + minWidth:0 lets the greeting truncate cleanly instead of
  // pushing the bell off the row on long names.
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  greeting: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headerMeta: { color: Colors.textMuted, fontSize: 12 },
  headerClock: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  notifBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  notifBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: Colors.secondary, fontSize: 9, fontWeight: '900' },
  // My Punches Today
  myPunchesCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 14,
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  myPunchesEmpty: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 6 },
  myPunchesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  myPunchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  myPunchTime: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  myPunchType: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },

  // Company Location
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 14,
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  locationIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  locationTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  locationSubtitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  locationOpenBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Digital ID Card mini
  idCardMini: { borderRadius: BorderRadius.xl, overflow: 'hidden', marginBottom: 24 },
  idCardMiniGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  idCardMiniName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  idCardMiniMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },

  // Banner
  banner: {
    borderRadius: BorderRadius.xxl,
    padding: 20,
    marginBottom: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 6, height: 10 }, shadowOpacity: 0.25, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  bannerDeco1: {
    position: 'absolute', top: -20, right: -20,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bannerDeco2: {
    position: 'absolute', bottom: -30, left: 20,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bannerInner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  bannerLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  bannerGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  // flex:1 so all four stats get equal width -"Working Days" is a longer
  // label than the others and would otherwise squeeze its neighbours.
  bannerStat: { flex: 1, alignItems: 'center', gap: 6 },
  bannerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bannerNum: { color: '#fff', fontSize: 22, fontWeight: '900' },
  bannerStatLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '600', textAlign: 'center' },

  // Section headers
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { color: Colors.primary, fontSize: 12, fontWeight: '700' },

  // Actions grid
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  // Width lives on the Reveal wrapper so the animated container is what the
  // grid lays out; the button itself just fills it.
  actionBtnWrap: { width: '30.5%' },
  actionBtn: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 14,
    alignItems: 'center',
    width: '100%',
    // Keeps every tile the same height regardless of whether its label
    // wraps to two lines, so rows stay aligned.
    minHeight: 92,
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.09, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  actionIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { color: Colors.textSecondary, fontSize: 10, textAlign: 'center', fontWeight: '700' },

  // Attendance
  attendanceCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    marginBottom: 24,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.09, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  attendanceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  attendanceItem: { alignItems: 'center', gap: 4 },
  attendanceDate: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  attendanceDay: { color: Colors.textMuted, fontSize: 9, fontWeight: '600' },

  // Holidays
  holidayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 12,
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  holidayDateBox: {
    width: 48, height: 52, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  holidayDay: { color: Colors.secondary, fontSize: 20, fontWeight: '900' },
  holidayMonth: { color: Colors.secondary, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  holidayName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  holidayWeekday: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  holidayTypeBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.secondaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
});
