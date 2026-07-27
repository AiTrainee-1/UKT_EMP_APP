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
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { useDashboard } from '../../src/hooks/useDashboard';
import { useAppNotifications } from '../../src/hooks/useAppNotifications';
import { useMobileHomeSummary, useLiveFeed } from '../../src/hooks/useHomeSummary';
import { useIdCard } from '../../src/hooks/useIdCard';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useGeoPunchStatus } from '../../src/hooks/useGeoAttendance';
import { SideDrawer } from '../../src/components/SideDrawer';
import { UKTLogo } from '../../src/components/UKTLogo';
import { Avatar } from '../../src/components/ui/Avatar';
import { LiveFeedTicker } from '../../src/components/LiveFeedTicker';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';
import { SkeletonCard } from '../../src/components/ui/Skeleton';

const QUICK_ACTIONS = [
  { label: 'Attendance', icon: 'calendar-check-outline', route: '/(tabs)/attendance' as const, color: Colors.primary },
  { label: 'Attendance Request', icon: 'map-marker-radius-outline', route: '/geo-punch' as const, color: '#0891b2' },
  { label: 'Salary Slips', icon: 'cash-multiple', route: '/salary' as const, color: '#27ae60' },
  { label: 'Apply Leave', icon: 'umbrella-outline', route: '/(tabs)/leave' as const, color: '#8e44ad' },
  { label: 'My Shift', icon: 'clock-outline', route: '/shift' as const, color: '#e67e22' },
  { label: 'Permission', icon: 'hand-pointing-right', route: '/requests' as const, color: '#2980b9' },
  { label: 'Holidays', icon: 'flag-outline', route: '/holidays' as const, color: '#c0392b' },
];

const SUMMARY_ITEMS = (data: any) => [
  { label: 'Present', value: data?.presentDays ?? 0, icon: 'check-circle', color: Colors.statusGreen, bg: Colors.badgeGreenBg },
  { label: 'Absent', value: data?.absentDays ?? 0, icon: 'close-circle', color: Colors.statusRed, bg: Colors.badgeRedBg },
  { label: 'Leave Bal.', value: data?.leaveBalance ?? 0, icon: 'umbrella', color: Colors.primary, bg: Colors.primaryFixed },
  { label: 'Pending', value: data?.pendingRequests ?? 0, icon: 'clock', color: Colors.statusYellow, bg: Colors.badgeYellowBg },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Section title with gradient accent bar */
function GradientSectionTitle({ title }: { title: string }) {
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

const sectionTitleSt = StyleSheet.create({
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
  const { user, logout } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useDashboard(user?.employeeId ?? null);
  const { data: notifs } = useAppNotifications(user?.employeeId ?? null);
  const { data: todaySummary } = useMobileHomeSummary();
  const { data: liveFeed } = useLiveFeed();
  const { data: idCard } = useIdCard(user?.employeeId ?? null);
  const { data: emp } = useEmployee(user?.employeeId ?? null);
  const { data: geoStatus } = useGeoPunchStatus();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const today = format(new Date(), 'EEEE, d MMMM yyyy');
  const unreadCount = notifs?.filter(n => !n.isRead).length ?? 0;

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
        {/* ─── App header ─── */}
        <View style={styles.header}>
          {/* Hamburger menu */}
          <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)} activeOpacity={0.75}>
            <MaterialCommunityIcons name="menu" size={22} color={Colors.primary} />
          </TouchableOpacity>

          {/* Logo + greeting */}
          <View style={styles.headerMid}>
            <UKTLogo size={34} />
            <View>
              <Text style={styles.greeting}>{getGreeting()},</Text>
              <Text style={styles.name} numberOfLines={1}>{user?.name?.split(' ')[0] || 'Employee'}</Text>
            </View>
          </View>

          {/* Notification bell */}
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => router.push('/(tabs)/notifications')}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons name="bell-outline" size={22} color={Colors.primary} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.dateLabel}>{today}</Text>

        {/* ─── Today at a Glance (company-wide) ─── */}
        {todaySummary && (
          <View style={styles.todayCard}>
            <View style={styles.todayHeader}>
              <MaterialCommunityIcons name="domain" size={14} color={Colors.primary} />
              <Text style={styles.todayHeaderText}>Today at a Glance · Company-wide</Text>
            </View>
            <View style={styles.todayGrid}>
              {[
                { label: 'Present', value: todaySummary.presentToday, color: Colors.statusGreen, bg: Colors.badgeGreenBg },
                { label: 'Absent', value: todaySummary.absentToday, color: Colors.statusRed, bg: Colors.badgeRedBg },
                { label: 'On Leave', value: todaySummary.onLeaveToday, color: Colors.primary, bg: Colors.badgeBlueBg },
                { label: 'Pending', value: todaySummary.pendingRequestsCount, color: Colors.statusYellow, bg: Colors.badgeYellowBg },
              ].map(({ label, value, color, bg }) => (
                <View key={label} style={styles.todayItem}>
                  <View style={[styles.todayDot, { backgroundColor: bg }]}>
                    <Text style={[styles.todayNum, { color }]}>{value}</Text>
                  </View>
                  <Text style={styles.todayLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ─── Location Punch widget ─── */}
        {(() => {
          const onDutySession = geoStatus?.onDutySession;
          const isOnDuty = onDutySession != null && (onDutySession.status === 'pending_hod' || onDutySession.status === 'pending_hr' || onDutySession.status === 'active');
          return (
            <TouchableOpacity style={styles.geoCard} onPress={() => router.push(isOnDuty ? '/on-duty' : '/geo-punch')} activeOpacity={0.85}>
              <View style={styles.geoIconWrap}>
                <MaterialCommunityIcons
                  name={isOnDuty ? 'briefcase-outline' : 'map-marker-radius-outline'}
                  size={20}
                  color={isOnDuty ? Colors.tertiary : Colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.geoTitle}>{isOnDuty ? 'On-Duty' : 'Attendance Request'}</Text>
                <Text style={styles.geoSubtitle}>
                  {onDutySession?.status === 'pending_hod'
                    ? 'Awaiting Department Head approval'
                    : onDutySession?.status === 'pending_hr'
                      ? 'Awaiting HR approval'
                      : onDutySession?.status === 'active'
                        ? geoStatus?.nextPunchNumber == null
                          ? 'Active — all 4 punches recorded'
                          : `Active — next: Punch ${geoStatus?.nextPunchNumber} · ${geoStatus?.nextPunchType === 'IN' ? 'Check-In' : 'Check-Out'}`
                        : geoStatus?.nextPunchNumber == null
                          ? 'All 4 punches recorded for today'
                          : `Next: Punch ${geoStatus?.nextPunchNumber} · ${geoStatus?.nextPunchType === 'IN' ? 'Check-In' : 'Check-Out'}`}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          );
        })()}

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
              {SUMMARY_ITEMS(data).map(({ label, value, icon, bg }) => (
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
        <View style={styles.sectionRow}>
          <GradientSectionTitle title="Quick Actions" />
        </View>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map(({ label, icon, route, color }) => (
            <TouchableOpacity
              key={label}
              style={styles.actionBtn}
              onPress={() => router.push(route as any)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[`${color}22`, `${color}0a`]}
                style={styles.actionIconWrap}
              >
                <MaterialCommunityIcons name={icon as any} size={24} color={color} />
              </LinearGradient>
              <Text style={styles.actionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Live Attendance Ticker ─── */}
        <View style={styles.sectionRow}>
          <GradientSectionTitle title="Live Attendance" />
        </View>
        <View style={{ marginBottom: 24 }}>
          <LiveFeedTicker items={liveFeed ?? []} />
        </View>

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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 4,
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
  headerMid: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  greeting: { color: Colors.textMuted, fontSize: 11 },
  name: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800', maxWidth: 150 },
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
  dateLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    marginBottom: 16,
  },

  // Today at a Glance
  todayCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 14,
    marginBottom: 16,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  todayHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayHeaderText: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  todayGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  todayItem: { alignItems: 'center', gap: 6 },
  todayDot: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  todayNum: { fontSize: 15, fontWeight: '900' },
  todayLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },

  // Location Punch widget
  geoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 14,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  geoIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.badgeBlueBg,
    alignItems: 'center', justifyContent: 'center',
  },
  geoTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  geoSubtitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },

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
  bannerStat: { alignItems: 'center', gap: 6 },
  bannerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bannerNum: { color: '#fff', fontSize: 22, fontWeight: '900' },
  bannerStatLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '600' },

  // Section headers
  sectionRow: { marginBottom: 12, marginTop: 4 },

  // Actions grid
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  actionBtn: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 14,
    alignItems: 'center',
    width: '30.5%',
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
