import React, { useState, useSyncExternalStore } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MotiView } from 'moti';
import { formatDistanceToNow } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useConfirmSignOut } from '../../src/hooks/useSignOut';
import {
  useAppNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, AppNotification,
} from '../../src/hooks/useAppNotifications';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { Colors } from '../../src/constants/colors';
import { UKTLogo } from '../../src/components/UKTLogo';
import { notificationHint, notificationRoute } from '../../src/lib/compensation';
import { describePushSetup, getPushSetup, subscribePushSetup } from '../../src/lib/pushStatus';
import { registerPushToken } from '../../src/hooks/usePushToken';
import { useManagerProfile } from '../../src/hooks/useManager';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

function timeAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

// A notification made from a WhatsApp message carries its own `title` (shown first). The older one-liners have none, so
// their headline is derived here from the real `type` values the backend actually
// creates (grep-confirmed against every Notification.objects.create() call
// site): leave, casual_leave, permission, on_duty, missing_punch,
// attendance, employee_request, resignation, compensation, holiday_work, general (default).
const makeNotifMeta = (Colors: Palette): Record<string, { icon: string; bg: string; color: string; title: string }> => ({
  leave: { icon: 'umbrella', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Leave Update' },
  casual_leave: { icon: 'calendar-heart', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Casual Leave Update' },
  permission: { icon: 'hand-wave', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Permission Update' },
  on_duty: { icon: 'briefcase-check-outline', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'On-Duty Update' },
  missing_punch: { icon: 'fingerprint', bg: Colors.badgeYellowBg, color: Colors.statusYellow, title: 'Missing Punch Update' },
  attendance: { icon: 'calendar-check-outline', bg: Colors.badgeGreenBg, color: Colors.statusGreen, title: 'Attendance Update' },
  employee_request: { icon: 'file-document-outline', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Request Update' },
  resignation: { icon: 'file-sign', bg: Colors.badgeRedBg, color: Colors.statusRed, title: 'Resignation Update' },
  // Holiday / Sunday work compensation, to the employee: the Department Head decided the claim HR raised (type "compensation").
  compensation: { icon: 'briefcase-clock-outline', bg: Colors.badgeGreenBg, color: Colors.statusGreen, title: 'Compensation Update' },
  // ... and to the Department Head: a claim is waiting for their decision (type "holiday_work"); a tap opens Approvals.
  holiday_work: { icon: 'clipboard-clock-outline', bg: Colors.badgeYellowBg, color: Colors.statusYellow, title: 'Compensation Approval' },
  // The messages WhatsApp also sends (backend/api/push_messages.py): the headline comes from the notification itself.
  advance: { icon: 'cash-fast', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Advance Update' },
  approval: { icon: 'check-decagram-outline', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Request Update' },
  approval_reminder: { icon: 'bell-ring-outline', bg: Colors.badgeYellowBg, color: Colors.statusYellow, title: 'Reminder' },
  outpass: { icon: 'exit-run', bg: Colors.badgeYellowBg, color: Colors.statusYellow, title: 'Outpass' },
  visitors: { icon: 'account-group-outline', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Visitor' },
  salary_slip: { icon: 'cash-multiple', bg: Colors.badgeGreenBg, color: Colors.statusGreen, title: 'Salary Slip' },
  id_card: { icon: 'card-account-details-outline', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'ID Card' },
  offer_letter: { icon: 'file-document-outline', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Offer Letter' },
  experience_letter: { icon: 'file-document-outline', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Experience Letter' },
  resignation_letter: { icon: 'file-sign', bg: Colors.badgeRedBg, color: Colors.statusRed, title: 'Resignation Letter' },
  other: { icon: 'paperclip', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Document' },
  general: { icon: 'bell', bg: Colors.primaryFixed, color: Colors.primary, title: 'Notification' },
});
const makeDefaultNotifMeta = (Colors: Palette) => ({ icon: 'bell', bg: Colors.primaryFixed, color: Colors.primary, title: 'Notification' });

/** Takes the palette explicitly: it is a plain helper, not a component, so
 *  it cannot read the theme from a hook -and the maps it looks into are now
 *  built per-theme rather than frozen at import. */
function notifMeta(Colors: Palette, type?: string) {
  return makeNotifMeta(Colors)[type ?? ''] ?? makeDefaultNotifMeta(Colors);
}

function NotifIcon({ type }: { type?: string }) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const NOTIF_META = makeNotifMeta(Colors);
  const DEFAULT_NOTIF_META = makeDefaultNotifMeta(Colors);

  const cfg = notifMeta(Colors, type);
  return (
    <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
      <MaterialCommunityIcons name={cfg.icon as any} size={20} color={cfg.color} />
    </View>
  );
}

export default function NotificationsScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const NOTIF_META = makeNotifMeta(Colors);
  const DEFAULT_NOTIF_META = makeDefaultNotifMeta(Colors);

  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useAppNotifications(user?.employeeId ?? null);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  // Only to decide where a "holiday_work" notice opens (the Approvals tab exists for a Department Head only). The same
  // cached query the tab bar already holds: no extra request.
  const { data: manager } = useManagerProfile(!!user);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  // Whether this phone can get notifications outside the app, and what is missing when it cannot (src/lib/pushStatus.ts).
  const pushSetup = useSyncExternalStore(subscribePushSetup, getPushSetup);
  const pushBanner = describePushSetup(pushSetup);
  const [pushChecking, setPushChecking] = useState(false);
  const onPushAction = async () => {
    if (pushBanner?.action === 'settings') {
      void Linking.openSettings();
      return;
    }
    setPushChecking(true);
    try {
      await registerPushToken();
    } finally {
      setPushChecking(false);
    }
  };

  const unreadCount = data?.filter(n => !n.isRead).length ?? 0;
  const visible = (data ?? []).filter((n) => filter === 'all' || !n.isRead);

  // Refused while an On-Duty day is running (src/hooks/useSignOut.ts).
  const handleLogout = useConfirmSignOut();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color={Colors.textPrimary} size={20} />
        <UKTLogo size={28} />
        <View style={styles.brandTextWrap}>
          <Text style={styles.brandName}>UKTEXTILES</Text>
          <Text style={styles.brandSub}>EMPLOYEE PORTAL</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.avatarBtn}
          onPress={() => router.push('/(tabs)/profile')}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="account" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.subHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.subHeaderTitleRow}>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.newPill}>
                <Text style={styles.newPillText}>{unreadCount} New</Text>
              </View>
            )}
          </View>
          <Text style={styles.headerSub}>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllBtn}
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="check-all" size={14} color={Colors.primary} />
            <Text style={styles.markAllBtnText}>Read All</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {([
          { key: 'all' as const, label: 'All', count: data?.length ?? 0 },
          { key: 'unread' as const, label: 'Unread', count: unreadCount },
        ]).map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
              {f.label} {f.count}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {pushBanner && (
        <View style={styles.pushBanner} accessibilityRole="alert" testID="push-setup-banner">
          <MaterialCommunityIcons name="bell-off-outline" size={20} color={Colors.statusYellow} />
          <View style={styles.pushBannerBody}>
            <Text style={styles.pushBannerTitle}>{pushBanner.title}</Text>
            <Text style={styles.pushBannerText}>{pushBanner.body}</Text>
          </View>
          <TouchableOpacity
            style={styles.pushBannerBtn}
            onPress={() => { void onPushAction(); }}
            disabled={pushChecking}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={pushBanner.actionLabel}
          >
            <Text style={styles.pushBannerBtnText}>{pushChecking ? 'Checking…' : pushBanner.actionLabel}</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={visible}
        keyExtractor={n => String(n.id)}
        contentContainerStyle={[styles.list, !visible.length && styles.listCenter]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: 10, paddingHorizontal: 16 }}>
              {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
            </View>
          ) : (
            <EmptyState
              icon="bell-sleep-outline"
              title={filter === 'unread' ? 'No unread notifications' : 'No notifications'}
              subtitle="You'll see leave updates, approvals, and reminders here"
            />
          )
        }
        renderItem={({ item, index }: { item: AppNotification; index: number }) => (
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 260, delay: Math.min(index, 8) * 50 }}
          >
            <TouchableOpacity
              style={[styles.card, { borderLeftColor: notifMeta(Colors, item.type).color, borderLeftWidth: 3 }, item.isRead && styles.cardRead]}
              onPress={() => {
                if (!item.isRead) markRead.mutate(item.id);
                // A compensation notice opens the Compensation screen, a "waiting for your approval" one opens Approvals;
                // the others only mark themselves read.
                const target = notificationRoute(item.type, manager);
                if (target) router.push(target as any);
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${item.title || notifMeta(Colors, item.type).title}. ${item.message}`}
              accessibilityHint={notificationHint(item.type, manager)}
            >
              <NotifIcon type={item.type} />
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, item.isRead && styles.cardTitleRead]}>
                  {item.title || notifMeta(Colors, item.type).title}
                </Text>
                <Text style={styles.cardMsg} numberOfLines={item.title ? 6 : 2}>{item.message}</Text>
                <Text style={styles.cardTime}>{timeAgo(item.createdAt)}</Text>
              </View>
              {!item.isRead && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          </MotiView>
        )}
      />

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

  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  brandTextWrap: { gap: 1 },
  brandName: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 13, letterSpacing: 0.2 },
  brandSub: { color: Colors.textMuted, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  avatarBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },

  subHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  subHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 20 },
  headerSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  newPill: { backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  newPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  markAllBtnText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  filterChip: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 7 },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: '#fff' },

  pushBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10, padding: 12,
    backgroundColor: Colors.badgeYellowBg, borderRadius: BorderRadius.lg,
  },
  pushBannerBody: { flex: 1, gap: 2 },
  pushBannerTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  pushBannerText: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  pushBannerBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 8 },
  pushBannerBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, gap: 8 },
  listCenter: { flex: 1 },

  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  cardRead: { opacity: 0.7 },

  notifIcon: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  cardBody: { flex: 1, gap: 3 },
  cardTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  cardTitleRead: { fontWeight: '600', color: Colors.textSecondary },
  cardMsg: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  cardTime: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 4,
    flexShrink: 0,
  },
});
