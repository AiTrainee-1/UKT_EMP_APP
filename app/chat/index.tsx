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
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';

import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';
import { useAuth } from '../../src/hooks/useAuth';
import { useChatChannels, useChatThread, type ChatMessage, type OutgoingMedia } from '../../src/hooks/useChat';
import {
  ensureLocalMedia,
  MediaExpiredError,
  pruneLocalMedia,
  pruneStaleLocalMedia,
  saveGifToPhone,
  shareVoiceMessage,
} from '../../src/hooks/useChatMedia';
import type { Recording } from '../../src/hooks/useVoiceRecorder';
import { deleteRecording } from '../../src/hooks/useVoiceRecorder';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { MessageBubble, DayDivider, PendingBubble } from '../../src/components/chat/MessageBubble';
import { MessageActionsSheet } from '../../src/components/chat/MessageActionsSheet';
import { ReactionsSheet } from '../../src/components/chat/ReactionsSheet';
import { GifViewer } from '../../src/components/chat/GifViewer';
import { GifSendSheet, type PickedGif } from '../../src/components/chat/GifSendSheet';
import { VoicePlaybackProvider } from '../../src/components/chat/VoicePlayback';
import { ChannelSwitcher, type ChannelOption } from '../../src/components/chat/ChannelSwitcher';
import { Composer } from '../../src/components/chat/Composer';
import { chatColors } from '../../src/components/chat/chatVisuals';
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
import { gifPickProblem, messageKind, uploadErrorMessage, waveformForUpload } from '../../src/lib/chatMedia';

type Row = ChatRow<ChatMessage>;
type ChannelKey = 'company' | 'department';
type ToastState = { message: string; type: 'success' | 'error' | 'info'; visible: boolean };

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
          <Skeleton width={s.w} height={s.h} borderRadius={14} />
        </View>
      ))}
    </View>
  );
}

/** "Now", refreshed every 30 s: what expiry ("Expires in 3 days", "GIF expired") is measured against. */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** The pulsing "live" dot in the header. */
function StatusDot({ color, pulse }: { color: string; pulse: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = pulse ? withRepeat(withTiming(0.35, { duration: 900 }), -1, true) : withTiming(1, { duration: 0 });
  }, [pulse, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.statusDot, { backgroundColor: color }, style]} />;
}

/**
 * Team Chat (owner 2026-11-25: a modern WhatsApp-style messaging screen). Company and department channels, text with
 * replies and reactions, GIFs from the phone's gallery and voice messages — both expire after the days HR sets (7 by
 * default) and can be saved on the phone while they last. New messages arrive by polling every 4 s (no realtime
 * typing indicator).
 */
export default function ChatScreen() {
  const { C, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const colors = chatColors(C, isDark);
  const { user } = useAuth();
  const myId = user?.employeeId ?? null;
  const me = useMemo(() => ({ id: myId, name: user?.name || 'You' }), [myId, user?.name]);
  const reduceMotion = useReduceMotion();
  const now = useNow();

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
  const expiryDays = activeChannel?.mediaExpiryDays ?? companyChannel?.mediaExpiryDays ?? null;

  const thread = useChatThread(channelId, { poll });
  const { messages } = thread;

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<OutgoingMedia | null>(null);
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [reactionsFor, setReactionsFor] = useState<{ id: number; emoji: string | null } | null>(null);
  const [viewer, setViewer] = useState<{ message: ChatMessage; uri: string } | null>(null);
  const [pickedGif, setPickedGif] = useState<PickedGif | null>(null);
  const [saving, setSaving] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [olderFailed, setOlderFailed] = useState(false);
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'error', visible: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<Row>>(null);
  const inputRef = useRef<TextInputInstance>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3400);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

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
    setHighlightId(null);
  }, [channelId]);

  // The phone's copies of expired GIFs / voice messages go as soon as the chat knows they expired.
  useEffect(() => {
    pruneLocalMedia(messages, now);
  }, [messages, now]);
  useEffect(() => {
    pruneStaleLocalMedia(new Date());
  }, []);

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

  // ── Text ──
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

  // ── GIFs and voice messages ──
  const sendMedia = useCallback(
    async (item: OutgoingMedia) => {
      if (channelId == null) return;
      const reply = replyTo;
      setReplyTo(null);
      setPendingMedia(item);
      jumpToLatest();
      try {
        // on success the recording / picked GIF becomes the message's own copy (useChat), so no download follows
        const msg = await thread.sendMedia.mutateAsync({ ...item, replyToId: reply?.id });
        if (!(msg && typeof msg.id === 'number') && item.kind === 'voice') deleteRecording(item.uri);
      } catch (err) {
        setReplyTo(reply);
        if (item.kind === 'voice') deleteRecording(item.uri);
        showToast(uploadErrorMessage(err, item.kind), 'error');
      } finally {
        setPendingMedia(null);
      }
    },
    [channelId, replyTo, jumpToLatest, thread.sendMedia, showToast],
  );

  const onVoiceRecorded = useCallback(
    (rec: Recording) => {
      const bars = waveformForUpload(rec.levels);
      void sendMedia({
        kind: 'voice',
        uri: rec.uri,
        mimeType: 'audio/mp4',
        fileName: 'voice-message.m4a',
        durationMs: rec.durationMs,
        // a phone that gave no loudness readings sends none, and every phone draws a steady pattern instead
        waveform: bars.some((v) => v > 0) ? bars : [],
      });
    },
    [sendMedia],
  );

  const pickGif = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        // Android keeps a GIF animated only with editing off and quality exactly 1 (expo-image-picker docs)
        allowsEditing: false,
        quality: 1,
        allowsMultipleSelection: false,
        exif: false,
        // iOS: hand over the file as it is, not converted to JPEG
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      let size = typeof a.fileSize === 'number' ? a.fileSize : null;
      if (size == null) {
        try {
          size = new File(a.uri).size ?? null;
        } catch {
          size = null;
        }
      }
      const problem = gifPickProblem({ uri: a.uri, mimeType: a.mimeType, fileName: a.fileName, fileSize: size });
      if (problem) {
        showToast(problem, 'error');
        return;
      }
      setPickedGif({
        uri: a.uri,
        mimeType: 'image/gif',
        fileName: a.fileName && /\.gif$/i.test(a.fileName) ? a.fileName : 'chat.gif',
        fileSize: size,
        width: a.width || 0,
        height: a.height || 0,
      });
    } catch {
      showToast('Couldn’t open your photos. Please try again.', 'error');
    }
  }, [showToast]);

  const sendPickedGif = useCallback(() => {
    const g = pickedGif;
    setPickedGif(null);
    if (g) void sendMedia({ kind: 'gif', uri: g.uri, mimeType: g.mimeType, fileName: g.fileName });
  }, [pickedGif, sendMedia]);

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
        await react(latestVersion(m), emoji, me);
      } catch {
        showToast('Couldn’t save your reaction. Please try again.', 'error');
      }
    },
    [react, latestVersion, me, showToast],
  );

  const handleReply = useCallback((m: ChatMessage) => {
    setReplyTo(m);
    setActionsFor(null);
    setTimeout(() => inputRef.current?.focus(), 250);
  }, []);

  const handleCopy = useCallback(
    async (m: ChatMessage) => {
      setActionsFor(null);
      try {
        await Clipboard.setStringAsync(m.text);
        showToast('Message copied.', 'success');
      } catch {
        showToast('Couldn’t copy the message.', 'error');
      }
    },
    [showToast],
  );

  const handleSave = useCallback(
    async (m: ChatMessage, knownUri?: string) => {
      if (saving) return;
      setSaving(true);
      try {
        const uri = knownUri ?? (await ensureLocalMedia(m));
        const kind = messageKind(m);
        const outcome = kind === 'gif' ? await saveGifToPhone(uri) : await shareVoiceMessage(uri, m.media?.mime);
        if (outcome === 'saved') showToast('GIF saved to your photos.', 'success');
        else if (outcome === 'unavailable') showToast('Saving isn’t possible on this phone. Please update the UKTextiles app.', 'error');
        setActionsFor(null);
      } catch (err) {
        if (err instanceof MediaExpiredError) {
          showToast('This has expired and can no longer be saved.', 'info');
          void thread.refetch();
        } else {
          showToast('Couldn’t save it. Check your internet connection and try again.', 'error');
        }
      } finally {
        setSaving(false);
      }
    },
    [saving, showToast, thread],
  );

  const openReactions = useCallback((m: ChatMessage, emoji: string | null) => {
    setActionsFor(null);
    setReactionsFor({ id: m.id, emoji });
  }, []);

  const openGif = useCallback((m: ChatMessage, uri: string) => setViewer({ message: m, uri }), []);

  // Tapping a quote jumps to the message it quotes and makes it flash.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const jumpToMessage = useCallback(
    (id: number) => {
      const index = rowsRef.current.findIndex((r) => r.kind === 'message' && r.message.id === id);
      if (index < 0) {
        showToast(
          thread.hasOlder ? 'That message is further up. Load earlier messages to see it.' : 'That message is no longer in this chat.',
          'info',
        );
        return;
      }
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: !reduceMotion });
      setHighlightId(id);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 1800);
    },
    [reduceMotion, showToast, thread.hasOlder],
  );

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
        : channelType === 'company'
          ? 'Everyone in your unit · live'
          : `${deptName} team · live`;

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
          highlighted={highlightId === item.message.id}
          reduceMotion={reduceMotion}
          now={now}
          onReply={handleReply}
          onOpenActions={setActionsFor}
          onOpenReactions={openReactions}
          onOpenGif={openGif}
          onQuotePress={jumpToMessage}
        />
      );
    },
    [reduceMotion, animateAfter, highlightId, now, handleReply, openReactions, openGif, jumpToMessage],
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
      <Text style={styles.startTip}>
        Press and hold a message to react, reply, copy or save. Swipe a message right to reply. Hold the mic to send a
        voice message.
      </Text>
      {expiryDays ? (
        <View style={styles.expiryNote}>
          <MaterialCommunityIcons name="timer-sand" size={13} color={C.badgeYellowText} />
          <Text style={styles.expiryNoteText}>
            GIFs and voice messages disappear after {expiryDays} {expiryDays === 1 ? 'day' : 'days'}.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const hasPending = !!pending || !!pendingMedia;
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
  } else if (messages.length === 0 && !hasPending) {
    body = (
      <EmptyState
        icon="message-text-outline"
        title="No messages yet"
        subtitle={`Say hello to ${channelLabel} — type below, send a GIF, or hold the mic for a voice message.`}
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
        onScrollToIndexFailed={(info) => {
          // rows of different heights: get near it first, then try again
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: !reduceMotion });
          }, 120);
        }}
        ListHeaderComponent={
          hasPending ? (
            <View>
              {pendingMedia && <PendingBubble media={pendingMedia} reduceMotion={reduceMotion} />}
              {pending && <PendingBubble text={pending} reduceMotion={reduceMotion} />}
            </View>
          ) : undefined
        }
        ListFooterComponent={topOfThread}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        initialNumToRender={20}
        maxToRenderPerBatch={12}
        windowSize={11}
      />
    );
  }

  const reactionsMessage = reactionsFor ? messages.find((m) => m.id === reactionsFor.id) ?? null : null;
  // the last reaction was taken away while the sheet was open: nothing left to show
  const reactionsEmpty = !!reactionsMessage && reactionsMessage.reactions.length === 0;
  useEffect(() => {
    if (reactionsEmpty) setReactionsFor(null);
  }, [reactionsEmpty]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <VoicePlaybackProvider>
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.wallpaper }]} edges={['top', 'bottom']}>
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
              <MaterialCommunityIcons name={channelType === 'company' ? 'forum' : 'account-group'} size={20} color={C.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
                {channelType === 'company' ? 'Team Chat' : `${deptName} chat`}
              </Text>
              <View style={styles.statusRow} accessible accessibilityLabel={`Status: ${statusText}`}>
                <StatusDot
                  color={offline ? C.statusYellow : activeChannel ? C.statusGreen : C.statusGrey}
                  pulse={!reduceMotion && !offline && !!activeChannel}
                />
                <Text style={styles.statusText} numberOfLines={1}>{statusText}</Text>
              </View>
            </View>
          </View>

          {!channelsQ.isLoading && !channelsQ.isError && (
            <View style={styles.switcherWrap}>
              <ChannelSwitcher options={options} value={channelType} onChange={setChannelType} reduceMotion={reduceMotion} />
            </View>
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

              {!nearLatest && rows.length > 0 && (
                <Animated.View
                  key="jump"
                  entering={reduceMotion ? FadeIn.duration(0) : ZoomIn.duration(180)}
                  exiting={reduceMotion ? FadeOut.duration(0) : ZoomOut.duration(150)}
                  style={styles.jumpWrap}
                  pointerEvents="box-none"
                >
                  <Pressable
                    onPress={jumpToLatest}
                    accessibilityRole="button"
                    accessibilityLabel={unseen > 0 ? `${unseenLabel(unseen)}. Jump to latest` : 'Jump to latest messages'}
                    style={({ pressed }) => [styles.jumpBtn, pressed && { opacity: 0.85 }]}
                  >
                    <MaterialCommunityIcons name="chevron-double-down" size={22} color={C.primary} />
                    {unseen > 0 && (
                      <View style={styles.jumpBadge}>
                        <Text style={styles.jumpBadgeText}>{unseen > 99 ? '99+' : unseen}</Text>
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              )}
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
              reduceMotion={reduceMotion}
              expiryDays={expiryDays}
              mediaBusy={thread.sendMedia.isPending}
              onPickGif={pickGif}
              onVoiceRecorded={onVoiceRecorded}
              onNotice={showToast}
            />
          </KeyboardAvoider>

          <MessageActionsSheet
            message={actionsFor ? latestVersion(actionsFor) : null}
            now={now}
            reduceMotion={reduceMotion}
            saving={saving}
            onClose={() => setActionsFor(null)}
            onReply={handleReply}
            onReact={(m, emoji) => {
              setActionsFor(null);
              void handleToggleReaction(m, emoji);
            }}
            onCopy={handleCopy}
            onSave={(m) => void handleSave(m)}
            onSeeReactions={(m) => openReactions(m, null)}
          />

          <ReactionsSheet
            message={reactionsMessage}
            initialEmoji={reactionsFor?.emoji ?? null}
            reduceMotion={reduceMotion}
            onClose={() => setReactionsFor(null)}
            onRemoveMine={(m, emoji) => void handleToggleReaction(m, emoji)}
          />

          <GifViewer
            item={viewer}
            now={now}
            saving={saving}
            onClose={() => setViewer(null)}
            onSave={(m, uri) => void handleSave(m, uri)}
          />

          <GifSendSheet
            gif={pickedGif}
            channelLabel={channelLabel}
            replyingTo={replyTo?.senderName ?? null}
            expiryDays={expiryDays}
            reduceMotion={reduceMotion}
            onCancel={() => setPickedGif(null)}
            onPickAnother={() => {
              setPickedGif(null);
              setTimeout(() => void pickGif(), 250);
            }}
            onSend={sendPickedGif}
          />

          <Toast {...toast} />
        </SafeAreaView>
      </VoicePlaybackProvider>
    </GestureHandlerRootView>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1 },

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
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 17.5 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
    statusDot: { width: 7, height: 7, borderRadius: 3.5 },
    statusText: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11.5, flexShrink: 1 },

    switcherWrap: { backgroundColor: C.bgCard, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.outlineVariant },

    listContent: { paddingTop: 8, paddingBottom: 6 },

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
    olderText: { fontFamily: FontFamily.bodySemibold, fontSize: 13, color: C.onPrimaryContainer },

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
    expiryNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      backgroundColor: C.badgeYellowBg,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    expiryNoteText: { fontFamily: FontFamily.bodySemibold, fontSize: 11.5, color: C.badgeYellowText },

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

    jumpWrap: { position: 'absolute', bottom: 12, right: 14 },
    jumpBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.bgCard,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 6,
    },
    jumpBadge: {
      position: 'absolute',
      top: -6,
      right: -4,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    jumpBadgeText: { fontFamily: FontFamily.bodySemibold, fontSize: 10.5, color: C.onPrimary },
  });
