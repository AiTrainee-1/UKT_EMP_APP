import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { formatDistanceToNow } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useAppNotifications, useMarkNotificationRead, AppNotification } from '../../src/hooks/useAppNotifications';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

function timeAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

function NotifIcon({ type }: { type?: string }) {
  const map: Record<string, { icon: string; bg: string; color: string }> = {
    leave: { icon: 'umbrella', bg: Colors.badgeBlueBg, color: Colors.primary },
    permission: { icon: 'hand-wave', bg: Colors.badgeBlueBg, color: Colors.primary },
    approval: { icon: 'check-circle', bg: Colors.badgeGreenBg, color: Colors.statusGreen },
    rejection: { icon: 'close-circle', bg: Colors.badgeRedBg, color: Colors.statusRed },
    resignation: { icon: 'file-sign', bg: Colors.badgeRedBg, color: Colors.statusRed },
    salary: { icon: 'cash', bg: Colors.secondaryFixed, color: Colors.secondary },
    reminder: { icon: 'bell-ring', bg: Colors.badgeYellowBg, color: Colors.statusYellow },
    announcement: { icon: 'bullhorn-outline', bg: Colors.secondaryFixed, color: Colors.secondary },
    geo_punch: { icon: 'map-marker-radius', bg: Colors.badgeBlueBg, color: Colors.primary },
  };
  const cfg = map[type ?? ''] ?? { icon: 'bell', bg: Colors.primaryFixed, color: Colors.primary };
  return (
    <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
      <MaterialCommunityIcons name={cfg.icon as any} size={20} color={cfg.color} />
    </View>
  );
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useAppNotifications(user?.employeeId ?? null);
  const markRead = useMarkNotificationRead();

  const unreadCount = data?.filter(n => !n.isRead).length ?? 0;

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
          <View>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Text style={styles.headerSub}>
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </Text>
          </View>
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
                  {item.title}
                </Text>
                <Text style={styles.cardMsg} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.cardTime}>{timeAgo(item.createdAt)}</Text>
              </View>
              {!item.isRead && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          </MotiView>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
