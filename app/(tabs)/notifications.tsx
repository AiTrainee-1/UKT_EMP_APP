import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { formatDistanceToNow } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import {
  useAppNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, AppNotification,
} from '../../src/hooks/useAppNotifications';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';

function timeAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

// The backend Notification model has no "title" field at all (only
// type + free-text message) — every notification card previously rendered
// a blank headline because it read a `title` the API never sends. Titles
// are derived here from the real `type` values the backend actually
// creates (grep-confirmed against every Notification.objects.create() call
// site): leave, casual_leave, permission, on_duty, missing_punch,
// attendance, employee_request, resignation, general (default).
const makeNotifMeta = (Colors: Palette): Record<string, { icon: string; bg: string; color: string; title: string }> => ({
  leave: { icon: 'umbrella', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Leave Update' },
  casual_leave: { icon: 'calendar-heart', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Casual Leave Update' },
  permission: { icon: 'hand-wave', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Permission Update' },
  on_duty: { icon: 'briefcase-check-outline', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'On-Duty Update' },
  missing_punch: { icon: 'fingerprint', bg: Colors.badgeYellowBg, color: Colors.statusYellow, title: 'Missing Punch Update' },
  attendance: { icon: 'calendar-check-outline', bg: Colors.badgeGreenBg, color: Colors.statusGreen, title: 'Attendance Update' },
  employee_request: { icon: 'file-document-outline', bg: Colors.badgeBlueBg, color: Colors.primary, title: 'Request Update' },
  resignation: { icon: 'file-sign', bg: Colors.badgeRedBg, color: Colors.statusRed, title: 'Resignation Update' },
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

  const { user, logout } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useAppNotifications(user?.employeeId ?? null);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const unreadCount = data?.filter(n => !n.isRead).length ?? 0;

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#006496" />

      {/* Gradient header */}
      <LinearGradient
        colors={Colors.gradientPrimary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerDeco} />
        <View style={styles.headerContent}>
          <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color="#fff" size={20} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Text style={styles.headerSub}>
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </Text>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <MaterialCommunityIcons name="check-all" size={14} color="#fff" />
              <Text style={styles.markAllBtnText}>Mark all read</Text>
            </TouchableOpacity>
          )}
          <View style={styles.bellWrap}>
            <MaterialCommunityIcons name="bell" size={24} color="#fff" />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      <FlatList
        data={data ?? []}
        keyExtractor={n => String(n.id)}
        contentContainerStyle={[styles.list, !(data?.length) && styles.listCenter]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: 10, paddingHorizontal: 16 }}>
              {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
            </View>
          ) : (
            <EmptyState
              icon="bell-sleep-outline"
              title="No notifications"
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
              style={[styles.card, item.isRead && styles.cardRead]}
              onPress={() => { if (!item.isRead) markRead.mutate(item.id); }}
              activeOpacity={0.8}
            >
              <NotifIcon type={item.type} />
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, item.isRead && styles.cardTitleRead]}>
                  {notifMeta(Colors, item.type).title}
                </Text>
                <Text style={styles.cardMsg} numberOfLines={2}>{item.message}</Text>
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
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  bellWrap: { position: 'relative' },
  bellBadge: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 9, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: { color: Colors.secondary, fontSize: 9, fontWeight: '900' },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 6,
    marginRight: 10,
  },
  markAllBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  list: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32, gap: 8 },
  listCenter: { flex: 1 },

  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 5 }, shadowOpacity: 0.09, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  cardRead: { opacity: 0.7 },

  notifIcon: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  cardBody: { flex: 1, gap: 3 },
  cardTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
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
