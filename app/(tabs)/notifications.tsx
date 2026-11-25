import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import Animated, { LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useAuth } from '../../src/hooks/useAuth';
import { useConfirmSignOut } from '../../src/hooks/useSignOut';
import {
  useAppNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, type AppNotification,
} from '../../src/hooks/useAppNotifications';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SideDrawer } from '../../src/components/SideDrawer';
import { HamburgerToggle } from '../../src/components/HamburgerToggle';
import { UKTLogo } from '../../src/components/UKTLogo';
import { viewActionFor, type TargetViewer } from '../../src/lib/notificationTarget';
import {
  fullTime,
  groupNotifications,
  notificationHeadline,
  notificationKind,
  previewLine,
  rowIndexOf,
  shortTime,
  unreadCount as countUnread,
  visibleNotifications,
  type NotificationFilter,
  type NotificationListRow,
} from '../../src/lib/notificationList';
import { readFocusId } from '../../src/lib/focusItem';
import { useFocusItem, useRouteRequest } from '../../src/hooks/useFocusItem';
import { useEmployee } from '../../src/hooks/useEmployee';
import { FocusMissingNote } from '../../src/components/focus/FocusFrame';
import {
  NotificationGroupHeader,
  NotificationRow,
  NotificationRowSkeleton,
} from '../../src/components/notifications/NotificationRow';
import { NotificationDetailSheet } from '../../src/components/notifications/NotificationDetailSheet';
import { describePushSetup, getPushSetup, subscribePushSetup } from '../../src/lib/pushStatus';
import { registerPushToken } from '../../src/hooks/usePushToken';
import { useManagerProfile } from '../../src/hooks/useManager';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';
import { ThemedStatusBar } from '../../src/components/ThemedStatusBar';
import { useReduceMotion } from '../../src/lib/motionPrefs';
import { HeaderAvatarButton } from '../../src/components/home/HeaderAvatarButton';
import { askNotificationAccess, readNotificationAccess } from '../../src/hooks/useNotificationPermission';
import { notificationButtonAction } from '../../src/lib/notificationNudge';

type Row = NotificationListRow<AppNotification>;

/** Rows drawn at first; more are added as the list is scrolled to its end ("infinite" list over what the server sent). */
const PAGE = 40;
/** How long a just-ticked notification stays on the Unread list, so its tick can be seen before it leaves. */
const LINGER_MS = 900;
/** "Mark all read": the ticks ripple down this many rows, this far apart. */
const RIPPLE_ROWS = 14;
const RIPPLE_STEP_MS = 45;

/** The time now, refreshed every minute (the rows' "5 min ago"). */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Notifications as a to-do list (owner 2026-11-25: the old cards "looked very poor"). Grouped Today / Yesterday /
 * Earlier; each row is compact - the round check (tick = mark read), the type icon, the headline, one line of the
 * message, the time and an unread dot. Tapping a row opens the whole notification in a sheet, with one small link to the
 * page it is about. All / Unread filters with counts, "Mark all read", pull to refresh, the list grows as it is scrolled.
 * A tapped push opens this screen with `?highlight=<id>`: the list scrolls to it, pulses it and opens it.
 */
export default function NotificationsScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();

  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  const { data, isLoading, isError, refetch, isFetching } = useAppNotifications(employeeId);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  // Who is reading decides some links (src/lib/notificationTarget.ts): an approver's one opens the Approvals tab,
  // which only a Department Head has; Compensation is for staff. The same cached queries the tab bar and Home already
  // hold: no extra request.
  const { data: manager } = useManagerProfile(!!user);
  const { data: employee } = useEmployee(employeeId);
  const viewer: TargetViewer = {
    isManager: manager?.isManager ?? null,
    isStaff: employee?.employmentType ? employee.employmentType === 'staff' : null,
  };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [lingering, setLingering] = useState<ReadonlySet<number>>(() => new Set());
  const [rippleUntil, setRippleUntil] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<number | null>(null);
  const [pulling, setPulling] = useState(false);
  const shownRef = useRef<AppNotification | null>(null);
  const listRef = useRef<FlatList<Row>>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const now = useMinuteClock();

  // Whether this phone can get notifications outside the app, and what is missing when it cannot (src/lib/pushStatus.ts).
  const pushSetup = useSyncExternalStore(subscribePushSetup, getPushSetup);
  const pushBanner = describePushSetup(pushSetup);
  const [pushChecking, setPushChecking] = useState(false);
  const onPushAction = async () => {
    if (pushBanner?.action === 'settings') {
      // Ask in the app when Android still can (never asked yet, or asked once); only a refusal Android remembers
      // needs the phone's settings (2026-11-25: sign-in no longer asks by itself, so "never asked" is common).
      const access = await readNotificationAccess();
      if (access && notificationButtonAction(access) === 'ask') {
        setPushChecking(true);
        try {
          await askNotificationAccess();
          await registerPushToken();
        } finally {
          setPushChecking(false);
        }
        return;
      }
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

  const all = data ?? [];
  const unread = countUnread(data);
  const total = all.length;
  const visible = useMemo(() => visibleNotifications(data, filter, lingering), [data, filter, lingering]);
  const rows = useMemo(() => groupNotifications(visible.slice(0, limit), now), [visible, limit, now]);
  const hasMore = visible.length > limit;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // A new filter starts at the top with one page.
  const changeFilter = (f: NotificationFilter) => {
    setFilter(f);
    setLimit(PAGE);
  };

  // A tapped push opens this list with `?highlight=<id>` (app/_layout.tsx): ask the server again (the push may be newer
  // than the list), show it under "All" if "Unread" hides it, scroll to it, pulse it once - and open it.
  const highlight = useRouteRequest('highlight', readFocusId);
  const focus = useFocusItem<AppNotification, NotificationFilter>({
    request: highlight,
    rows: data,
    idOf: (n) => n.id,
    views: {
      order: ['all', 'unread'],
      current: filter,
      set: changeFilter,
      has: (n, f) => f === 'all' || !n.isRead,
    },
    refresh: () => (employeeId ? refetch() : undefined),
    ready: !!employeeId,
    fetching: isFetching,
    list: {
      ref: listRef,
      indexOf: (id) => {
        const index = rowIndexOf(rowsRef.current, id);
        if (index < 0) {
          // further down than the rows drawn so far: draw down to it (the hook looks again shortly)
          const at = visibleRef.current.findIndex((n) => n.id === id);
          if (at >= 0) setLimit((l) => Math.max(l, at + PAGE));
        }
        return index;
      },
    },
  });

  const tick = useCallback(
    (item: AppNotification) => {
      if (item.isRead) return;
      markRead.mutate(item.id);
      if (filter === 'unread') {
        setLingering((s) => new Set(s).add(item.id));
        later(() => setLingering((s) => {
          const next = new Set(s);
          next.delete(item.id);
          return next;
        }), LINGER_MS);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, markRead.mutate],
  );

  const onMarkAll = () => {
    if (!unread || markAllRead.isPending) return;
    const ids = all.filter((n) => !n.isRead).map((n) => n.id);
    setRippleUntil(Date.now() + 1200);
    if (filter === 'unread') {
      setLingering(new Set(ids));
      later(() => setLingering(new Set()), LINGER_MS + RIPPLE_ROWS * RIPPLE_STEP_MS);
    }
    markAllRead.mutate();
  };

  const openDetail = useCallback(
    (item: AppNotification) => {
      shownRef.current = item;
      setOpenId(item.id);
      // Opening it is reading it: the row's check ticks behind the sheet.
      if (!item.isRead) markRead.mutate(item.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markRead.mutate],
  );

  // A push brought this screen here: once the list has found and scrolled to it, open it.
  useEffect(() => {
    if (focus.activeId == null) return;
    const id = focus.activeId;
    const t = setTimeout(() => {
      const item = (data ?? []).find((n) => n.id === id);
      if (item) openDetail(item);
    }, 550);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.activeId]);

  const openItem = (openId != null ? all.find((n) => n.id === openId) : null) ?? shownRef.current;
  const openView = openItem ? viewActionFor(openItem, viewer) : null;
  const closeDetail = () => setOpenId(null);
  const openTarget = () => {
    if (!openView) return;
    const href = openView.href;
    setOpenId(null);
    // let the sheet start closing first, so it never sits over the next screen
    later(() => router.push(href as Href), 140);
  };

  const onRefresh = async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  };

  // Refused while an On-Duty day is running (src/hooks/useSignOut.ts).
  const handleLogout = useConfirmSignOut();

  // The read share, for the progress line under the title.
  const progress = total ? (total - unread) / total : 0;
  const shownProgress = useSharedValue(progress);
  useEffect(() => {
    shownProgress.value = reduceMotion ? progress : withTiming(progress, { duration: 450 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, reduceMotion]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${shownProgress.value * 100}%` }));

  const rippling = rippleUntil > Date.now();

  const renderItem = ({ item: row, index: position }: { item: Row; index: number }) => {
    if (row.kind === 'header') {
      return <NotificationGroupHeader label={row.label} count={row.count} unread={row.unread} />;
    }
    const n = row.item;
    return (
      <NotificationRow
        item={n}
        kind={notificationKind(n.type)}
        headline={notificationHeadline(n)}
        preview={previewLine(n.message)}
        time={shortTime(n.createdAt, now)}
        index={position}
        first={row.first}
        last={row.last}
        tickDelay={rippling ? Math.min(position, RIPPLE_ROWS) * RIPPLE_STEP_MS : 0}
        onOpen={() => openDetail(n)}
        onTick={() => tick(n)}
        focus={focus.frame(n.id)}
      />
    );
  };

  const caughtUp = filter === 'unread' && !visible.length && total > 0;
  const empty = isLoading ? (
    <View style={styles.skeleton}>
      {[0, 1, 2, 3].map((i) => <NotificationRowSkeleton key={i} first={i === 0} last={i === 3} />)}
    </View>
  ) : isError && !data ? (
    <View style={styles.stateBox} testID="notifications-error">
      <View style={[styles.stateIcon, { backgroundColor: Colors.badgeRedBg }]}>
        <MaterialCommunityIcons name="cloud-off-outline" size={34} color={Colors.statusRed} />
      </View>
      <Text style={styles.stateTitle}>Couldn't load your notifications</Text>
      <Text style={styles.stateText}>Check your internet connection and try again.</Text>
      <TouchableOpacity style={styles.stateBtn} onPress={() => { void refetch(); }} activeOpacity={0.85}>
        {isFetching ? <ActivityIndicator size="small" color={Colors.onPrimary} /> : <Text style={styles.stateBtnText}>Try again</Text>}
      </TouchableOpacity>
    </View>
  ) : caughtUp ? (
    <View style={styles.stateBox} testID="notifications-caught-up">
      <View style={[styles.stateIcon, { backgroundColor: Colors.badgeGreenBg }]}>
        <MaterialCommunityIcons name="check-all" size={36} color={Colors.statusGreen} />
      </View>
      <Text style={styles.stateTitle}>All caught up</Text>
      <Text style={styles.stateText}>You've read every notification.</Text>
      <Pressable onPress={() => changeFilter('all')} hitSlop={8} style={styles.stateLink}>
        <Text style={styles.stateLinkText}>Show all</Text>
      </Pressable>
    </View>
  ) : (
    <EmptyState
      icon="bell-sleep-outline"
      title="No notifications yet"
      subtitle="Leave updates, approvals and reminders will show up here."
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ThemedStatusBar />

      <View style={styles.topBar}>
        <HamburgerToggle open={drawerOpen} onPress={() => setDrawerOpen(v => !v)} color={Colors.textPrimary} size={20} />
        <UKTLogo size={28} />
        <View style={styles.brandTextWrap}>
          <Text style={styles.brandName}>UKTEXTILES</Text>
          <Text style={styles.brandSub}>EMPLOYEE PORTAL</Text>
        </View>
        <View style={{ flex: 1 }} />
        {/* The person's photo, like Home's header (owner 2026-11-25). */}
        <HeaderAvatarButton size={30} />
      </View>

      <View style={styles.head}>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Text style={styles.headerSub}>
              {total === 0 ? 'Nothing here yet' : unread > 0 ? `${unread} to read · ${total - unread} done` : 'All caught up'}
            </Text>
          </View>
          {unread > 0 && (
            <Pressable
              style={({ pressed }) => [styles.markAll, pressed && styles.markAllPressed]}
              onPress={onMarkAll}
              disabled={markAllRead.isPending}
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications as read"
              hitSlop={8}
              testID="notifications-mark-all"
            >
              <MaterialCommunityIcons name="check-all" size={16} color={Colors.primary} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          )}
        </View>
        {total > 0 && (
          <View style={styles.progressTrack} accessible accessibilityLabel={`${total - unread} of ${total} read`}>
            <Animated.View style={[styles.progressFill, progressStyle]} />
          </View>
        )}

        <View style={styles.segment} accessibilityRole="tablist">
          {([
            { key: 'all' as const, label: 'All', count: total },
            { key: 'unread' as const, label: 'Unread', count: unread },
          ]).map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.segmentItem, on && styles.segmentItemOn]}
                onPress={() => changeFilter(f.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${f.label}, ${f.count}`}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{f.label}</Text>
                <View style={[styles.countPill, on && styles.countPillOn]}>
                  <Text style={[styles.countText, on && styles.countTextOn]}>{f.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
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

      {isError && !!data && (
        <View style={styles.staleNote} accessibilityRole="alert">
          <MaterialCommunityIcons name="cloud-alert" size={14} color={Colors.textMuted} />
          <Text style={styles.staleText}>Couldn't refresh. Showing the last list saved on this phone.</Text>
        </View>
      )}

      {focus.missing && (
        <FocusMissingNote
          text="That notification is no longer in your list"
          onDismiss={focus.dismissMissing}
          style={styles.missingNote}
        />
      )}

      <Animated.FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r: Row) => r.key}
        renderItem={renderItem}
        itemLayoutAnimation={reduceMotion ? undefined : LinearTransition.duration(220)}
        onScrollToIndexFailed={focus.onScrollToIndexFailed}
        extraData={[focus.activeId, viewer.isManager, viewer.isStaff, rippling, now]}
        contentContainerStyle={[styles.list, !rows.length && styles.listCenter]}
        initialNumToRender={14}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore) setLimit((l) => l + PAGE);
        }}
        ListFooterComponent={
          hasMore ? (
            <ActivityIndicator style={styles.footer} color={Colors.primary} />
          ) : rows.length > 0 ? (
            <Text style={styles.endText}>{filter === 'unread' ? 'That is everything to read' : "You've reached the end"}</Text>
          ) : undefined
        }
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={() => { void onRefresh(); }} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        ListEmptyComponent={empty}
      />

      {openItem && (
        <NotificationDetailSheet
          item={openItem}
          visible={openId != null}
          kind={notificationKind(openItem.type)}
          headline={notificationHeadline(openItem)}
          time={fullTime(openItem.createdAt, now)}
          view={openView}
          onClose={closeDetail}
          onOpenTarget={openTarget}
        />
      )}

      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        onLogout={handleLogout}
        notificationCount={unread}
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

  head: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 24, letterSpacing: -0.3 },
  headerSub: { color: Colors.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 13, marginTop: 2 },
  markAll: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    minHeight: 36, paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryFixed,
  },
  markAllPressed: { opacity: 0.75 },
  markAllText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },

  progressTrack: { height: 4, borderRadius: 2, backgroundColor: Colors.bgSurfaceHigh, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: Colors.primary },

  segment: {
    flexDirection: 'row', gap: 4, padding: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgSurfaceLow,
    borderWidth: 1, borderColor: Colors.border,
  },
  segmentItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 36, borderRadius: BorderRadius.full,
  },
  segmentItemOn: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  segmentText: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  segmentTextOn: { color: Colors.textPrimary },
  countPill: { minWidth: 22, paddingHorizontal: 6, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceHigh },
  countPillOn: { backgroundColor: Colors.primary },
  countText: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 11 },
  countTextOn: { color: Colors.onPrimary },

  pushBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 6, marginBottom: 4, padding: 12,
    backgroundColor: Colors.badgeYellowBg, borderRadius: BorderRadius.lg,
  },
  pushBannerBody: { flex: 1, gap: 2 },
  pushBannerTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  pushBannerText: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  pushBannerBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 8 },
  pushBannerBtnText: { color: Colors.onPrimary, fontSize: 11, fontWeight: '800' },

  staleNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 20, marginTop: 6 },
  staleText: { flex: 1, color: Colors.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11.5 },

  missingNote: { marginHorizontal: 16, marginTop: 6 },

  list: { paddingHorizontal: 16, paddingBottom: 40 },
  listCenter: { flexGrow: 1 },
  skeleton: { paddingTop: 16 },
  footer: { paddingVertical: 18 },
  endText: { textAlign: 'center', color: Colors.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12, paddingVertical: 20 },

  stateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  stateIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  stateTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 17, textAlign: 'center' },
  stateText: { color: Colors.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  stateBtn: {
    marginTop: 10, minHeight: 44, minWidth: 140, paddingHorizontal: 22,
    borderRadius: BorderRadius.full, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  stateBtnText: { color: Colors.onPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  stateLink: { marginTop: 6, minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  stateLinkText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
});
