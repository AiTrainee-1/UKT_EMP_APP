import React, { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
// Gesture Handler 3 (SDK 58) no longer exports the legacy `Swipeable`; ReanimatedSwipeable is its replacement.
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { ChatMessage, OutgoingMedia } from '../../hooks/useChat';
import { reactionsSummary, timeLabel } from '../../lib/chatThread';
import { formatDuration, isMediaExpired, messageKind } from '../../lib/chatMedia';
import { emojiName } from './emoji';
import { BubbleTail, ChatAvatar, chatColors, tintFor } from './chatVisuals';
import { GifMessage, gifSize } from './GifMessage';
import { VoiceMessage } from './VoiceMessage';

interface Props {
  message: ChatMessage;
  isMine: boolean;
  isHr: boolean;
  startsGroup: boolean;
  endsGroup: boolean;
  /** Slide in (only for messages that arrived while the screen was open). */
  animateIn: boolean;
  /** Flash once: the employee tapped a quote of this message. */
  highlighted: boolean;
  reduceMotion: boolean;
  /** "Now", refreshed each minute, for expiry. */
  now: Date;
  onReply: (m: ChatMessage) => void;
  onOpenActions: (m: ChatMessage) => void;
  onOpenReactions: (m: ChatMessage, emoji: string | null) => void;
  onOpenGif: (m: ChatMessage, uri: string) => void;
  onQuotePress: (id: number) => void;
}

/**
 * One message, WhatsApp-style (owner 2026-11-25): my messages on the right in the brand colour, everyone else's on the
 * left with their name and avatar at the start of a run; a tail on the first bubble of a run; the time inside the
 * bubble; a quote of the message replied to (tap it to jump there); GIFs and voice messages (or "expired" in their
 * place); reaction chips under the bubble — tap one to see who reacted with what. Press and hold for the menu, swipe
 * right to reply.
 */
function MessageBubbleImpl({
  message,
  isMine,
  isHr,
  startsGroup,
  endsGroup,
  animateIn,
  highlighted,
  reduceMotion,
  now,
  onReply,
  onOpenActions,
  onOpenReactions,
  onOpenGif,
  onQuotePress,
}: Props) {
  const { C, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const colors = chatColors(C, isDark);
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const time = timeLabel(message.createdAt);
  const tint = tintFor(message.senderName || '?', C);
  const kind = messageKind(message);
  const expired = kind !== 'text' && isMediaExpired(message, now);
  const bubbleColor = isMine ? colors.mine : isHr ? colors.hr : colors.theirs;
  const showName = !isMine && startsGroup;

  // the quote-jump flash
  const flash = useSharedValue(0);
  useEffect(() => {
    if (!highlighted) return;
    flash.value = reduceMotion
      ? withSequence(withTiming(1, { duration: 0 }), withDelay(900, withTiming(0, { duration: 0 })))
      : withSequence(withTiming(1, { duration: 180 }), withDelay(700, withTiming(0, { duration: 500 })));
  }, [highlighted, reduceMotion, flash]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.55 }));

  const what =
    kind === 'voice'
      ? expired
        ? 'Voice message, expired'
        : `Voice message, ${formatDuration(message.media?.durationMs)}`
      : kind === 'gif'
        ? expired
          ? 'GIF, expired'
          : 'GIF'
        : message.text;
  const a11yLabel = [
    isMine ? 'You' : `${message.senderName}${isHr ? ', HR' : ''}`,
    time ? `at ${time}` : '',
    message.replyTo ? `replying to ${message.replyTo.senderName}: ${message.replyTo.text}` : '',
    what,
    message.reactions.length ? `Reactions: ${reactionsSummary(message.reactions)}` : '',
  ]
    .filter(Boolean)
    .join('. ');

  const openActions = () => onOpenActions(message);
  const textColor = isMine ? styles.textMine : null;

  const sender = showName ? (
    <View style={styles.senderRow}>
      <Text style={[styles.senderName, isHr ? styles.senderNameHr : { color: tint.fg }]} numberOfLines={1}>
        {message.senderName}
      </Text>
      {isHr && (
        <View style={styles.hrBadge}>
          <MaterialCommunityIcons name="check-decagram" size={10} color={C.onSecondaryContainer} />
          <Text style={styles.hrBadgeText}>HR</Text>
        </View>
      )}
    </View>
  ) : null;

  const quote = message.replyTo ? (
    <Pressable
      onPress={() => onQuotePress(message.replyTo!.id)}
      onLongPress={openActions}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel={`Quoted message from ${message.replyTo.senderName}. Double tap to go to it`}
      style={[styles.quote, isMine && styles.quoteMine]}
    >
      <Text style={[styles.quoteSender, isMine && styles.onMineStrong]} numberOfLines={1}>
        {message.replyTo.senderName}
      </Text>
      <View style={styles.quoteRow}>
        {message.replyTo.kind === 'voice' && (
          <MaterialCommunityIcons name="microphone" size={13} color={isMine ? C.onPrimary : C.textMuted} />
        )}
        {message.replyTo.kind === 'gif' && (
          <MaterialCommunityIcons name="file-gif-box" size={14} color={isMine ? C.onPrimary : C.textMuted} />
        )}
        <Text style={[styles.quoteText, isMine && styles.onMineSoft]} numberOfLines={2}>
          {message.replyTo.kind === 'voice' ? 'Voice message' : message.replyTo.kind === 'gif' ? 'GIF' : message.replyTo.text}
        </Text>
      </View>
    </Pressable>
  ) : null;

  const meta = (
    <View style={styles.metaAbs} pointerEvents="none">
      <Text style={[styles.time, TabularNums, isMine && styles.onMineSoft]}>{time}</Text>
      {isMine && <MaterialCommunityIcons name="check" size={12} color={C.onPrimary} style={{ opacity: 0.75 }} />}
    </View>
  );
  // invisible text the same width as the time, so the last line of the message leaves room for it (WhatsApp's trick)
  // Painted in the bubble's own colour: Android ignores color 'transparent' on nested text, so the time showed twice
  // (2026-11-25, seen on the phone).
  const metaSpacer = <Text style={[styles.metaSpacer, { color: bubbleColor }]}>{`  ${time}${isMine ? '    ' : ''}`}</Text>;

  let content: React.ReactNode;
  if (expired) {
    content = (
      <View style={styles.expiredRow}>
        <MaterialCommunityIcons
          name={kind === 'voice' ? 'microphone-off' : 'image-off-outline'}
          size={17}
          color={isMine ? C.onPrimary : C.textMuted}
          style={isMine ? { opacity: 0.8 } : undefined}
        />
        <Text style={[styles.expiredText, isMine && styles.onMineSoft]}>
          {kind === 'voice' ? 'Voice message expired' : 'GIF expired'}
          {metaSpacer}
        </Text>
        {meta}
      </View>
    );
  } else if (kind === 'gif') {
    content = (
      <GifMessage
        message={message}
        now={now}
        time={time}
        isMine={isMine}
        reduceMotion={reduceMotion}
        onOpen={onOpenGif}
        onLongPress={openActions}
      />
    );
  } else if (kind === 'voice') {
    content = <VoiceMessage message={message} now={now} time={time} isMine={isMine} onLongPress={openActions} />;
  } else {
    content = (
      <View>
        <Text style={[styles.text, textColor]} selectable={false}>
          {message.text}
          {metaSpacer}
        </Text>
        {meta}
      </View>
    );
  }

  const isGif = kind === 'gif' && !expired;
  const bubble = (
    <View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        endsGroup ? styles.rowGroupEnd : styles.rowGroupInner,
        startsGroup && styles.rowGroupStart,
      ]}
    >
      {!isMine && (
        <View style={styles.avatarSlot} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {startsGroup && <ChatAvatar name={message.senderName} isHr={isHr} />}
        </View>
      )}

      <View style={[styles.column, isMine ? styles.columnMine : styles.columnTheirs]}>
        <Pressable
          onLongPress={openActions}
          delayLongPress={280}
          accessible
          accessibilityLabel={a11yLabel}
          accessibilityHint="Double tap and hold for reply, reactions and more"
          accessibilityActions={[
            { name: 'activate', label: 'Message options' },
            { name: 'longpress', label: 'Message options' },
            { name: 'reply', label: 'Reply' },
            ...(message.reactions.length ? [{ name: 'reactions', label: 'See who reacted' }] : []),
          ]}
          onAccessibilityAction={(e) => {
            const name = e.nativeEvent.actionName;
            if (name === 'reply') onReply(message);
            else if (name === 'reactions') onOpenReactions(message, null);
            else openActions();
          }}
          style={({ pressed }) => [
            styles.bubble,
            isGif && styles.bubbleGif,
            isGif && { width: gifSize(message).width + 8 },
            { backgroundColor: bubbleColor },
            !isMine && !isDark && styles.bubbleLift,
            startsGroup && (isMine ? styles.cornerMine : styles.cornerTheirs),
            pressed && styles.bubblePressed,
          ]}
        >
          {startsGroup && <BubbleTail side={isMine ? 'right' : 'left'} color={bubbleColor} />}
          {highlighted && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />
          )}
          {isGif ? (
            <>
              {(sender || quote) && (
                <View style={styles.gifHead}>
                  {sender}
                  {quote}
                </View>
              )}
              {content}
            </>
          ) : (
            <>
              {sender}
              {quote}
              {content}
            </>
          )}
        </Pressable>

        {message.reactions.length > 0 && (
          <View style={[styles.reactions, isMine ? styles.reactionsMine : styles.reactionsTheirs]}>
            {message.reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() => onOpenReactions(message, r.emoji)}
                accessibilityRole="button"
                accessibilityState={{ selected: r.reactedByMe }}
                accessibilityLabel={`${emojiName(r.emoji)}, ${r.count}${r.reactedByMe ? ', including you' : ''}`}
                accessibilityHint="Double tap to see who reacted"
                hitSlop={6}
                style={({ pressed }) => [styles.pill, r.reactedByMe && styles.pillMine, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.pillEmoji}>{r.emoji}</Text>
                <Text style={[styles.pillCount, TabularNums, r.reactedByMe && styles.pillCountMine]}>{r.count}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  const swipeable = (
    <Swipeable
      ref={swipeRef}
      friction={1.6}
      leftThreshold={56}
      overshootLeft={false}
      renderLeftActions={() => (
        <View style={styles.swipeAction}>
          <View style={styles.swipeIcon}>
            <MaterialCommunityIcons name="reply" size={18} color={C.primary} />
          </View>
        </View>
      )}
      onSwipeableWillOpen={() => {
        onReply(message);
        swipeRef.current?.close();
      }}
    >
      {bubble}
    </Swipeable>
  );

  if (!animateIn || reduceMotion) return swipeable;
  // The list is drawn upside down, so "in from above" in the row's own terms is "up from below" on screen.
  return <Animated.View entering={FadeInDown.duration(220)}>{swipeable}</Animated.View>;
}

export const MessageBubble = memo(MessageBubbleImpl);

/** The "Today" / "Yesterday" / date chip between days. */
export function DayDivider({ label }: { label: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.dayWrap} accessibilityRole="header">
      <View style={styles.dayChip}>
        <Text style={styles.dayText}>{label}</Text>
      </View>
    </View>
  );
}

/** My message (text, GIF or voice) while it is on its way to the server. */
export function PendingBubble({
  text,
  media,
  reduceMotion,
}: {
  text?: string | null;
  media?: OutgoingMedia | null;
  reduceMotion: boolean;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const label = media
    ? media.kind === 'voice'
      ? `Sending voice message, ${formatDuration(media.durationMs)}`
      : 'Sending GIF'
    : `Sending: ${text ?? ''}`;
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(200)}
      style={[styles.row, styles.rowMine, styles.rowGroupEnd]}
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.column, styles.columnMine]}>
        <View style={[styles.bubble, { backgroundColor: C.primary }, styles.bubblePending]}>
          {media?.kind === 'voice' ? (
            <View style={styles.pendingMedia}>
              <MaterialCommunityIcons name="microphone" size={18} color={C.onPrimary} />
              <Text style={[styles.text, styles.textMine]}>Voice message · {formatDuration(media.durationMs)}</Text>
            </View>
          ) : media?.kind === 'gif' ? (
            <View style={styles.pendingMedia}>
              <MaterialCommunityIcons name="file-gif-box" size={20} color={C.onPrimary} />
              <Text style={[styles.text, styles.textMine]}>GIF</Text>
            </View>
          ) : (
            <Text style={[styles.text, styles.textMine]}>{text}</Text>
          )}
          <View style={styles.metaInline}>
            <Text style={[styles.time, styles.onMineSoft]}>Sending</Text>
            <MaterialCommunityIcons name="clock-outline" size={12} color={C.onPrimary} style={{ opacity: 0.75 }} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14 },
    rowMine: { justifyContent: 'flex-end' },
    rowTheirs: { justifyContent: 'flex-start' },
    rowGroupStart: { marginTop: 6 },
    rowGroupEnd: { marginBottom: 6 },
    rowGroupInner: { marginBottom: 2 },

    avatarSlot: { width: 30, marginRight: 8, alignItems: 'center' },

    column: { maxWidth: '80%' },
    columnMine: { alignItems: 'flex-end' },
    columnTheirs: { alignItems: 'flex-start' },

    bubble: {
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingTop: 6,
      paddingBottom: 7,
      minWidth: 64,
    },
    bubbleGif: { padding: 4, paddingTop: 4, paddingBottom: 4 },
    bubbleLift: Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 1.5 },
      android: { elevation: 1 },
      default: {},
    }) as object,
    cornerMine: { borderTopRightRadius: 3 },
    cornerTheirs: { borderTopLeftRadius: 3 },
    bubblePressed: { opacity: 0.86 },
    bubblePending: { opacity: 0.72 },
    flash: { backgroundColor: C.primaryLight, borderRadius: 14 },

    gifHead: { paddingHorizontal: 6, paddingTop: 2, paddingBottom: 4 },

    senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    senderName: { fontFamily: FontFamily.bodySemibold, fontSize: 12.5, flexShrink: 1 },
    senderNameHr: { color: C.onSecondaryContainer },
    hrBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: C.secondaryContainer,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    hrBadgeText: { fontFamily: FontFamily.bodySemibold, fontSize: 9.5, color: C.onSecondaryContainer, letterSpacing: 0.4 },

    quote: {
      backgroundColor: C.bgSurfaceLow,
      borderLeftWidth: 3,
      borderLeftColor: C.primaryLight,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
      marginBottom: 5,
      marginTop: 2,
    },
    quoteMine: { backgroundColor: 'rgba(255,255,255,0.16)', borderLeftColor: C.onPrimary },
    quoteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    quoteSender: { fontFamily: FontFamily.bodySemibold, fontSize: 11.5, color: C.primary },
    quoteText: { fontFamily: FontFamily.bodyRegular, fontSize: 12.5, color: C.textMuted, lineHeight: 17, flexShrink: 1 },
    onMineStrong: { color: C.onPrimary },
    onMineSoft: { color: C.onPrimary, opacity: 0.8 },

    text: { fontFamily: FontFamily.bodyRegular, fontSize: 15, lineHeight: 21, color: C.textPrimary },
    textMine: { color: C.onPrimary },

    // the time sits in the bubble's bottom-right corner; the spacer below keeps the text off it
    metaAbs: { position: 'absolute', right: 0, bottom: -2, flexDirection: 'row', alignItems: 'center', gap: 3 },
    metaSpacer: { fontFamily: FontFamily.bodyRegular, fontSize: 10.5, color: 'transparent' },
    metaInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 },
    time: { fontFamily: FontFamily.bodyRegular, fontSize: 10.5, color: C.textMuted },

    expiredRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
    expiredText: { fontFamily: FontFamily.bodyRegular, fontStyle: 'italic', fontSize: 14, color: C.textMuted },

    pendingMedia: { flexDirection: 'row', alignItems: 'center', gap: 6 },

    reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -3, paddingHorizontal: 8 },
    reactionsMine: { justifyContent: 'flex-end' },
    reactionsTheirs: { justifyContent: 'flex-start' },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: C.outlineVariant,
      minHeight: 24,
    },
    pillMine: { borderColor: C.primaryLight, backgroundColor: C.primaryFixed },
    pillEmoji: { fontSize: 12.5 },
    pillCount: { fontFamily: FontFamily.bodySemibold, fontSize: 11, color: C.textMuted },
    pillCountMine: { color: C.onPrimaryContainer },

    swipeAction: { width: 56, alignItems: 'center', justifyContent: 'center' },
    swipeIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },

    dayWrap: { alignItems: 'center', marginVertical: 10 },
    dayChip: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.outlineVariant,
    },
    dayText: { fontFamily: FontFamily.bodySemibold, fontSize: 11.5, color: C.textSecondary, letterSpacing: 0.2 },
  });
