import React, { memo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { MotiView } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';
// Gesture Handler 3 (SDK 58) no longer exports the legacy `Swipeable`; ReanimatedSwipeable is its replacement.
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { ChatMessage } from '../../hooks/useChat';
import { reactionsSummary, timeLabel } from '../../lib/chatThread';
import { emojiName } from './emoji';

function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

/** A soft, stable colour per colleague so a busy channel is easier to scan. */
function tintFor(name: string, C: Palette): { bg: string; fg: string } {
  const options = [
    { bg: C.badgeBlueBg, fg: C.badgeBlueText },
    { bg: C.badgeGreenBg, fg: C.badgeGreenText },
    { bg: C.badgeLeaveBg, fg: C.badgeLeaveText },
    { bg: C.clayOrange, fg: C.statusOrange },
    { bg: C.clayBlue, fg: C.categoryTracking },
  ];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

interface Props {
  message: ChatMessage;
  isMine: boolean;
  isHr: boolean;
  startsGroup: boolean;
  endsGroup: boolean;
  /** Slide in (only for messages that arrived while the screen was open). */
  animateIn: boolean;
  onReply: (m: ChatMessage) => void;
  onOpenActions: (m: ChatMessage) => void;
  onToggleReaction: (m: ChatMessage, emoji: string) => void;
}

function MessageBubbleImpl({
  message,
  isMine,
  isHr,
  startsGroup,
  endsGroup,
  animateIn,
  onReply,
  onOpenActions,
  onToggleReaction,
}: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const time = timeLabel(message.createdAt);
  const showAvatar = !isMine;
  const tint = tintFor(message.senderName || '?', C);

  const a11yLabel = [
    isMine ? 'You' : `${message.senderName}${isHr ? ', HR' : ''}`,
    time ? `at ${time}` : '',
    message.replyTo ? `replying to ${message.replyTo.senderName}: ${message.replyTo.text}` : '',
    message.text,
    message.reactions.length ? `Reactions: ${reactionsSummary(message.reactions)}` : '',
  ]
    .filter(Boolean)
    .join('. ');

  const bubble = (
    <View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        endsGroup ? styles.rowGroupEnd : styles.rowGroupInner,
      ]}
    >
      {showAvatar && (
        <View style={styles.avatarSlot} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {endsGroup &&
            (isHr ? (
              <View style={[styles.avatar, styles.avatarHr]}>
                <MaterialCommunityIcons name="shield-account" size={15} color={C.onSecondaryContainer} />
              </View>
            ) : (
              <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
                <Text style={[styles.avatarText, { color: tint.fg }]}>{initials(message.senderName)}</Text>
              </View>
            ))}
        </View>
      )}

      <View style={[styles.column, isMine ? styles.columnMine : styles.columnTheirs]}>
        <Pressable
          onLongPress={() => onOpenActions(message)}
          delayLongPress={280}
          accessible
          accessibilityLabel={a11yLabel}
          accessibilityHint="Double tap for reply and reactions"
          accessibilityActions={[
            { name: 'activate', label: 'Message options' },
            { name: 'reply', label: 'Reply' },
            { name: 'react', label: 'React' },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'reply') onReply(message);
            else onOpenActions(message);
          }}
          style={({ pressed }) => [
            styles.bubble,
            isMine ? styles.bubbleMine : isHr ? styles.bubbleHr : styles.bubbleTheirs,
            isMine && endsGroup && styles.tailMine,
            !isMine && endsGroup && styles.tailTheirs,
            pressed && styles.bubblePressed,
          ]}
        >
          {!isMine && startsGroup && (
            <View style={styles.senderRow}>
              <Text style={[styles.senderName, isHr && styles.senderNameHr, !isHr && { color: tint.fg }]} numberOfLines={1}>
                {message.senderName}
              </Text>
              {isHr && (
                <View style={styles.hrBadge}>
                  <MaterialCommunityIcons name="check-decagram" size={10} color={C.onSecondaryContainer} />
                  <Text style={styles.hrBadgeText}>HR</Text>
                </View>
              )}
            </View>
          )}

          {message.replyTo && (
            <View style={[styles.quote, isMine && styles.quoteMine]}>
              <Text style={[styles.quoteSender, isMine && styles.onPrimaryStrong]} numberOfLines={1}>
                {message.replyTo.senderName}
              </Text>
              <Text style={[styles.quoteText, isMine && styles.onPrimarySoft]} numberOfLines={2}>
                {message.replyTo.text}
              </Text>
            </View>
          )}

          <Text style={[styles.text, isMine && styles.textMine]} selectable={false}>
            {message.text}
          </Text>

          <View style={styles.metaRow}>
            <Text style={[styles.time, TabularNums, isMine && styles.onPrimarySoft]}>{time}</Text>
            {isMine && <MaterialCommunityIcons name="check" size={12} color={C.onPrimary} style={{ opacity: 0.75 }} />}
          </View>
        </Pressable>

        {message.reactions.length > 0 && (
          <View style={[styles.reactions, isMine ? styles.reactionsMine : styles.reactionsTheirs]}>
            {message.reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() => onToggleReaction(message, r.emoji)}
                accessibilityRole="button"
                accessibilityState={{ selected: r.reactedByMe }}
                accessibilityLabel={`${emojiName(r.emoji)}, ${r.count}${r.reactedByMe ? ', including you' : ''}`}
                accessibilityHint={r.reactedByMe ? 'Double tap to remove your reaction' : 'Double tap to add the same reaction'}
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

  if (!animateIn) return swipeable;
  return (
    <MotiView
      from={{ opacity: 0, translateY: 10, scale: 0.98 }}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      transition={{ type: 'timing', duration: 220 }}
    >
      {swipeable}
    </MotiView>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);

/** The "Today" / "Yesterday" / date chip between days. */
export function DayDivider({ label }: { label: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.dayWrap} accessibilityRole="header">
      <View style={styles.dayLine} />
      <View style={styles.dayChip}>
        <Text style={styles.dayText}>{label}</Text>
      </View>
      <View style={styles.dayLine} />
    </View>
  );
}

/** My message while it is on its way to the server. */
export function PendingBubble({ text }: { text: string }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 200 }}
      style={[styles.row, styles.rowMine, styles.rowGroupEnd]}
      accessible
      accessibilityLabel={`Sending: ${text}`}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.column, styles.columnMine]}>
        <View style={[styles.bubble, styles.bubbleMine, styles.tailMine, styles.bubblePending]}>
          <Text style={[styles.text, styles.textMine]}>{text}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.time, styles.onPrimarySoft]}>Sending</Text>
            <MaterialCommunityIcons name="clock-outline" size={12} color={C.onPrimary} style={{ opacity: 0.75 }} />
          </View>
        </View>
      </View>
    </MotiView>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12 },
    rowMine: { justifyContent: 'flex-end' },
    rowTheirs: { justifyContent: 'flex-start' },
    rowGroupEnd: { marginBottom: 10 },
    rowGroupInner: { marginBottom: 3 },

    avatarSlot: { width: 30, marginRight: 6, alignItems: 'center' },
    avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    avatarHr: { backgroundColor: C.secondaryContainer },
    avatarText: { fontFamily: FontFamily.bodySemibold, fontSize: 10.5 },

    column: { maxWidth: '80%' },
    columnMine: { alignItems: 'flex-end' },
    columnTheirs: { alignItems: 'flex-start' },

    bubble: {
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 6,
      minWidth: 72,
    },
    bubbleMine: { backgroundColor: C.primary },
    bubbleTheirs: {
      backgroundColor: C.bgCard,
      borderWidth: 1,
      borderColor: C.border,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2 },
        android: { elevation: 1 },
      }),
    },
    bubbleHr: {
      backgroundColor: C.secondaryFixed,
      borderWidth: 1,
      borderColor: C.secondaryContainer,
      borderLeftWidth: 3,
      borderLeftColor: C.secondary,
    },
    bubblePressed: { opacity: 0.85 },
    bubblePending: { opacity: 0.72 },
    tailMine: { borderBottomRightRadius: 6 },
    tailTheirs: { borderBottomLeftRadius: 6 },

    senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    senderName: { fontFamily: FontFamily.bodySemibold, fontSize: 12, color: C.primary, flexShrink: 1 },
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
    quoteSender: { fontFamily: FontFamily.bodySemibold, fontSize: 11, color: C.primary },
    quoteText: { fontFamily: FontFamily.bodyRegular, fontSize: 12, color: C.textMuted, lineHeight: 16 },
    onPrimaryStrong: { color: C.onPrimary },
    onPrimarySoft: { color: C.onPrimary, opacity: 0.78 },

    text: { fontFamily: FontFamily.bodyRegular, fontSize: 15, lineHeight: 21, color: C.textPrimary },
    textMine: { color: C.onPrimary },

    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 },
    time: { fontFamily: FontFamily.bodyRegular, fontSize: 10.5, color: C.textMuted },

    reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4, paddingHorizontal: 6 },
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
    pillEmoji: { fontSize: 12 },
    pillCount: { fontFamily: FontFamily.bodySemibold, fontSize: 11, color: C.textMuted },
    pillCountMine: { color: C.primary },

    swipeAction: { width: 56, alignItems: 'center', justifyContent: 'center' },
    swipeIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },

    dayWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, marginVertical: 12 },
    dayLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.outlineVariant },
    dayChip: {
      backgroundColor: C.bgSurfaceHigh,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    dayText: { fontFamily: FontFamily.bodySemibold, fontSize: 11, color: C.textSecondary, letterSpacing: 0.2 },
  });
