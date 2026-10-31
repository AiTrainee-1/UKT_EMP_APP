import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  StatusBar,
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputInstance,
} from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MotiView, AnimatePresence } from 'moti';

import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';
import { useAuth } from '../../src/hooks/useAuth';
import { useChatChannels, useChatThread, type ChatMessage } from '../../src/hooks/useChat';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { MessageBubble, DayDivider, PendingBubble } from '../../src/components/chat/MessageBubble';
import { MessageActionsSheet } from '../../src/components/chat/MessageActionsSheet';
import { ChannelSwitcher, type ChannelOption } from '../../src/components/chat/ChannelSwitcher';
import { Composer } from '../../src/components/chat/Composer';
import { RetryPanel } from '../../src/components/documents/RetryPanel';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';
import { useAppActive, useReduceMotion } from '../../src/lib/motionPrefs';
import {
  buildChatRows,
  countUnseen,
  isNearLatest,
  newestId,
  prepareOutgoing,
  unseenLabel,
  NEAR_LATEST_PX,
  type ChatRow,
} from '../../src/lib/chatThread';

type Row = ChatRow<ChatMessage>;
type ChannelKey = 'company' | 'department';

/** Grey bubble outlines while the conversation loads. */
function ChatSkeleton() {
  const styles = useThemedStyles(makeStyles);
  const shapes: { mine: boolean; w: `${number}%`; h: number }[] = [
    { mine: false, w: '62%', h: 54 },
    { mine: false, w: '44%', h: 38 },
    { mine: true, w: '56%', h: 46 },
    { mine: false, w: '70%', h: 62 },
    { mine: true, w: '38%', h: 38 },
    { mine: false, w: '50%', h: 46 },
  ];
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading messages" accessible>
      {shapes.map((s, i) => (
        <View key={i} style={[styles.skeletonRow, s.mine ? { justifyContent: 'flex-end' } : null]}>
          {!s.mine && <Skeleton width={28} height={28} borderRadius={14} style={{ marginRight: 6 }} />}
          <Skeleton width={s.w} height={s.h} borderRadius={18} />
        </View>
      ))}
    </View>
  );
}

export default function ChatScreen() {
  const { C, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const myId = user?.employeeId ?? null;
  const reduceMotion = useReduceMotion();

  // Poll only while this screen is on top AND the app is in front of the employee.
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const poll = isFocused && appActive;

  const channelsQ = useChatChannels();
  const [channelType, setChannelType] = useState<ChannelKey>('company');
  const companyChannel = channelsQ.data?.find((c) => c.type === 'company');
  const deptChannel = channelsQ.data?.find((c) => c.type === 'department');
  const activeChannel = channelType === 'company' ? companyChannel : deptChannel;
  const channelId = activeChannel?.id ?? null;
  const deptName = deptChannel?.departmentName || 'Department';
  const channelLabel = channelType === 'company' ? 'the whole company' : deptName;

  const thread = useChatThread(channelId, { poll });
  const { messages } = thread;

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [olderFailed, setOlderFailed] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
    message: '',
    type: 'error',
    visible: false,
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<Row>>(null);
  const inputRef = useRef<TextInputInstance>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Back in front of the employee after a while: fetch at once rather than waiting for the next tick.
  const wasActive = useRef(appActive);
  useEffect(() => {
    if (appActive && !wasActive.current) {
      void thread.refetch();
      if (channelsQ.isError) void channelsQ.refetch();
    }
    wasActive.current = appActive;
  }, [appActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // A reply belongs to one channel; switching channel drops it.
  useEffect(() => {
    setReplyTo(null);
    setOlderFailed(false);
  }, [channelId]);

  // ── Which messages get the "slide in" (only ones that arrive while the screen is open) ──
  const firstNewest = useRef<Record<number, number>>({});
  if (channelId != null && !(channelId in firstNewest.current) && !thread.isLoading && !thread.isError) {
    firstNewest.current[channelId] = newestId(messages) ?? 0;
  }
  const animateAfter = channelId != null ? firstNewest.current[channelId] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;

  // Newest first, because the list is drawn upside down (newest at the bottom, like WhatsApp).
  const rows = useMemo(() => buildChatRows(messages, myId, new Date()).reverse(), [messages, myId]);

  // ── Scrolling: never yank someone who is reading older messages ──
  const [nearLatest, setNearLatest] = useState(true);
  const nearRef = useRef(true);
  const [lastSeenId, setLastSeenId] = useState<number | null>(null);
  const newest = newestId(messages);
  useEffect(() => {
    if (nearLatest && newest != null) setLastSeenId(newest);
  }, [nearLatest, newest]);
  useEffect(() => {
    setLastSeenId(null);
    nearRef.current = true;
    setNearLatest(true);
  }, [channelId]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const near = isNearLatest(e.nativeEvent.contentOffset.y);
    if (near !== nearRef.current) {
      nearRef.current = near;
      setNearLatest(near);
    }
  }, []);
  const unseen = nearLatest ? 0 : countUnseen(messages, lastSeenId, myId);
  const jumpToLatest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
  }, [reduceMotion]);

  // ── Actions ──
  const handleSend = async () => {
    const out = prepareOutgoing(text);
    if (!out || channelId == null || thread.send.isPending) return;
    const reply = replyTo;
    setText('');
    setReplyTo(null);
    setPending(out);
    jumpToLatest();
    try {
      await thread.send.mutateAsync({ text: out, replyToId: reply?.id });
    } catch {
      // Put the words back so nothing typed is lost.
      setText((cur) => (cur.trim() ? cur : out));
      setReplyTo(reply);
      showToast('Your message wasn’t sent. It’s back in the box — tap send to try again.', 'error');
    } finally {
      setPending(null);
    }
  };

  // Read through a ref so the row callbacks stay the same between polls (rows don't all re-render every 4 s).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const latestVersion = useCallback(
    (m: ChatMessage) => messagesRef.current.find((x) => x.id === m.id) ?? m,
    [],
  );

  const { react, loadOlder: loadOlderPage } = thread;
  const handleToggleReaction = useCallback(
    async (m: ChatMessage, emoji: string) => {
      try {
        await react(latestVersion(m), emoji);
      } catch {
        showToast('Couldn’t save your reaction. Please try again.', 'error');
      }
    },
    [react, latestVersion, showToast],
  );

  const handleReply = useCallback((m: ChatMessage) => {
    setReplyTo(m);
    setActionsFor(null);
    setTimeout(() => inputRef.current?.focus(), 250);
  }, []);

  const loadOlder = useCallback(async () => {
    try {
      setOlderFailed(false);
      await loadOlderPage();
    } catch {
      setOlderFailed(true);
      showToast('Couldn’t load earlier messages. Please try again.', 'error');
    }
  }, [loadOlderPage, showToast]);

  // ── Header status: honest about whether we are actually getting updates ──
  const offline = thread.isError || channelsQ.isError;
  const statusText = channelsQ.isLoading
    ? 'Connecting…'
    : offline
      ? 'Can’t reach chat — retrying'
      : !activeChannel
        ? 'Not available'
        : 'Live · new messages appear automatically';

  let disabledReason: string | null = null;
  if (channelsQ.isLoading) disabledReason = 'Connecting to chat…';
  else if (channelsQ.isError) disabledReason = 'Chat could not be reached. Try again above.';
  else if (!activeChannel)
    disabledReason =
      channelType === 'department'
        ? 'You are not in a department chat, so there is nowhere to post here.'
        : 'Company chat is not available right now.';

  const options: ChannelOption[] = [
    { key: 'company', label: 'Company', icon: 'domain', note: companyChannel ? undefined : 'not available' },
    { key: 'department', label: deptName, icon: 'account-group', note: deptChannel ? undefined : 'not available' },
  ];

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'day') return <DayDivider label={item.label} />;
      return (
        <MessageBubble
          message={item.message}
          isMine={item.isMine}
          isHr={item.isHr}
          startsGroup={item.startsGroup}
          endsGroup={item.endsGroup}
          animateIn={!reduceMotion && item.message.id > animateAfter}
          onReply={handleReply}
          onOpenActions={setActionsFor}
          onToggleReaction={handleToggleReaction}
        />
      );
    },
    [reduceMotion, animateAfter, handleReply, handleToggleReaction],
  );

  // In the upside-down list the "footer" is drawn at the TOP: load-earlier or start-of-chat.
  const topOfThread = thread.hasOlder ? (
    <View style={styles.olderWrap}>
      <Pressable
        onPress={loadOlder}
        disabled={thread.loadingOlder}
        accessibilityRole="button"
        accessibilityLabel="Load earlier messages"
        accessibilityState={{ busy: thread.loadingOlder }}
        style={({ pressed }) => [styles.olderBtn, pressed && { opacity: 0.8 }]}
      >
        {thread.loadingOlder ? (
          <ActivityIndicator size="small" color={C.primary} />
        ) : (
          <MaterialCommunityIcons name="history" size={16} color={C.primary} />
        )}
        <Text style={styles.olderText}>{thread.loadingOlder ? 'Loading…' : 'Load earlier messages'}</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.startWrap}>
      <View style={styles.startIcon}>
        <MaterialCommunityIcons name={channelType === 'company' ? 'domain' : 'account-group'} size={20} color={C.primary} />
      </View>
      <Text style={styles.startTitle}>Start of the {channelType === 'company' ? 'company' : deptName} chat</Text>
      <Text style={styles.startTip}>Press and hold a message to react or reply. Swipe a message right to reply.</Text>
    </View>
  );

  let body: React.ReactNode;
  if (channelsQ.isLoading) {
    body = <ChatSkeleton />;
  } else if (channelsQ.isError) {
    body = (
      <RetryPanel
        title="Couldn’t open Team Chat"
        message="Check your internet connection, then try again."
        onRetry={() => void channelsQ.refetch()}
        retrying={channelsQ.isFetching}
      />
    );
  } else if (!activeChannel) {
    body =
      channelType === 'department' ? (
        <EmptyState
          icon="account-group-outline"
          title="No department chat for you yet"
          subtitle="You are not assigned to a department, so there is no department chat to show. If this looks wrong, please ask HR."
        />
      ) : (
        <EmptyState
          icon="chat-remove-outline"
          title="Company chat isn’t available"
          subtitle="It hasn’t been set up for your unit yet. Please check back later."
        />
      );
  } else if (thread.isLoading) {
    body = <ChatSkeleton />;
  } else if (thread.isError && messages.length === 0) {
    body = (
      <RetryPanel
        title="Couldn’t load messages"
        message="Check your internet connection, then try again."
        onRetry={() => void thread.refetch()}
      />
    );
  } else if (messages.length === 0 && !pending) {
    body = (
      <EmptyState
        icon="message-text-outline"
        title="No messages yet"
        subtitle={`Say hello to ${channelLabel} — type below to start the conversation.`}
      />
    );
  } else {
    body = (
      <FlatList
        ref={listRef}
        data={rows}
        inverted
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onScroll={onScroll}
        scrollEventThrottle={64}
        // Keep what the reader is looking at still when new messages arrive or older ones load;
        // only follow along when they are already at the newest messages.
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: NEAR_LATEST_PX }}
        onEndReached={() => {
          if (thread.hasOlder && !thread.loadingOlder && !olderFailed) void loadOlder();
        }}
        onEndReachedThreshold={0.15}
        ListHeaderComponent={pending ? <PendingBubble text={pending} /> : undefined}
        ListFooterComponent={topOfThread}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        initialNumToRender={20}
        windowSize={11}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons name="forum" size={20} color={C.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} accessibilityRole="header">Team Chat</Text>
            <View style={styles.statusRow} accessible accessibilityLabel={`Status: ${statusText}`}>
              <MotiView
                from={{ opacity: 0.35 }}
                animate={{ opacity: 1 }}
                transition={
                  reduceMotion || offline || !activeChannel
                    ? { type: 'timing', duration: 0 }
                    : { type: 'timing', duration: 900, loop: true }
                }
                style={[
                  styles.statusDot,
                  { backgroundColor: offline ? C.statusYellow : activeChannel ? C.statusGreen : C.statusGrey },
                ]}
              />
              <Text style={styles.statusText} numberOfLines={1}>{statusText}</Text>
            </View>
          </View>
        </View>

        {!channelsQ.isLoading && !channelsQ.isError && (
          <ChannelSwitcher options={options} value={channelType} onChange={setChannelType} reduceMotion={reduceMotion} />
        )}

        <KeyboardAvoider style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {body}

            {thread.isStale && (
              <View style={styles.staleBanner} accessibilityLiveRegion="polite">
                <MaterialCommunityIcons name="wifi-off" size={14} color={C.badgeYellowText} />
                <Text style={styles.staleText}>Showing saved messages — reconnecting…</Text>
              </View>
            )}

            <AnimatePresence>
              {!nearLatest && rows.length > 0 && (
                <MotiView
                  key="jump"
                  from={{ opacity: 0, translateY: 12, scale: 0.9 }}
                  animate={{ opacity: 1, translateY: 0, scale: 1 }}
                  exit={{ opacity: 0, translateY: 12, scale: 0.9 }}
                  transition={{ type: 'timing', duration: 180 }}
                  style={styles.jumpWrap}
                  pointerEvents="box-none"
                >
                  <Pressable
                    onPress={jumpToLatest}
                    accessibilityRole="button"
                    accessibilityLabel={unseen > 0 ? `${unseenLabel(unseen)}. Jump to latest` : 'Jump to latest messages'}
                    style={({ pressed }) => [styles.jumpPill, unseen > 0 && styles.jumpPillNew, pressed && { opacity: 0.85 }]}
                  >
                    <MaterialCommunityIcons name="arrow-down" size={16} color={unseen > 0 ? C.onPrimary : C.primary} />
                    <Text style={[styles.jumpText, unseen > 0 && styles.jumpTextNew]}>{unseenLabel(unseen)}</Text>
                  </Pressable>
                </MotiView>
              )}
            </AnimatePresence>
          </View>

          {/* Bottom safe-area clearance comes from the SafeAreaView edges above. */}
          <Composer
            inputRef={inputRef}
            value={text}
            onChange={setText}
            onSend={handleSend}
            sending={thread.send.isPending}
            disabledReason={disabledReason}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            channelLabel={channelLabel}
          />
        </KeyboardAvoider>

        <MessageActionsSheet
          message={actionsFor ? latestVersion(actionsFor) : null}
          onClose={() => setActionsFor(null)}
          onReply={handleReply}
          onReact={(m, emoji) => {
            setActionsFor(null);
            void handleToggleReaction(m, emoji);
          }}
        />

        <Toast {...toast} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgLight },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.bgSurfaceLow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
    statusDot: { width: 7, height: 7, borderRadius: 3.5 },
    statusText: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11.5, flexShrink: 1 },

    listContent: { paddingTop: 10, paddingBottom: 6 },

    skeleton: { flex: 1, padding: 12, gap: 12, justifyContent: 'flex-end' },
    skeletonRow: { flexDirection: 'row', alignItems: 'flex-end' },

    olderWrap: { alignItems: 'center', paddingVertical: 12 },
    olderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: BorderRadius.full,
      backgroundColor: C.primaryFixed,
      minHeight: 40,
    },
    olderText: { fontFamily: FontFamily.bodySemibold, fontSize: 13, color: C.primary },

    startWrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 18, paddingBottom: 8, gap: 6 },
    startIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    startTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 14, color: C.textSecondary, textAlign: 'center' },
    startTip: { fontFamily: FontFamily.bodyRegular, fontSize: 12, lineHeight: 17, color: C.textMuted, textAlign: 'center' },

    staleBanner: {
      position: 'absolute',
      top: 8,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.badgeYellowBg,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    staleText: { fontFamily: FontFamily.bodySemibold, fontSize: 11.5, color: C.badgeYellowText },

    jumpWrap: { position: 'absolute', bottom: 12, left: 0, right: 0, alignItems: 'center' },
    jumpPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      paddingVertical: 9,
      minHeight: 40,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 6,
    },
    jumpPillNew: { backgroundColor: C.primary, borderColor: C.primary },
    jumpText: { fontFamily: FontFamily.bodySemibold, fontSize: 12.5, color: C.primary },
    jumpTextNew: { color: C.onPrimary },
  });
