import React from 'react';
import { Modal, Pressable, View, Text, StyleSheet, Platform } from 'react-native';
import Animated, { SlideInDown, ZoomIn } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import type { ChatMessage } from '../../hooks/useChat';
import { isMyReaction, reactionTotal } from '../../lib/chatThread';
import { expiryLabel, isMediaExpired, messageKind, previewText } from '../../lib/chatMedia';
import { CHAT_EMOJIS } from './emoji';

interface Props {
  message: ChatMessage | null;
  now: Date;
  reduceMotion: boolean;
  /** "Saving…" on the Save row while a save is running. */
  saving: boolean;
  onClose: () => void;
  onReply: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onCopy: (m: ChatMessage) => void;
  onSave: (m: ChatMessage) => void;
  onSeeReactions: (m: ChatMessage) => void;
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Opened by pressing and holding a message (or "Message options" for a screen reader), WhatsApp-style (owner
 * 2026-11-25): react with one of six emojis, Reply, Copy (text), Save (a GIF to your photos / a voice message through
 * the share sheet, while it has not expired) and, when there are any, who reacted.
 */
export function MessageActionsSheet({
  message,
  now,
  reduceMotion,
  saving,
  onClose,
  onReply,
  onReact,
  onCopy,
  onSave,
  onSeeReactions,
}: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const kind = messageKind(message);
  const expired = !!message && kind !== 'text' && isMediaExpired(message, now);
  const expiry = message && kind !== 'text' && !expired ? expiryLabel(message.media?.expiresAt, now) : null;
  const total = message ? reactionTotal(message.reactions) : 0;

  const actions: { key: string; icon: IconName; title: string; sub?: string; onPress: () => void; busy?: boolean }[] = [];
  if (message) {
    actions.push({ key: 'reply', icon: 'reply', title: 'Reply', sub: 'You can also swipe a message to the right', onPress: () => onReply(message) });
    if (kind === 'text' && message.text.trim()) {
      actions.push({ key: 'copy', icon: 'content-copy', title: 'Copy', onPress: () => onCopy(message) });
    }
    if (kind !== 'text' && !expired) {
      actions.push({
        key: 'save',
        icon: kind === 'gif' ? 'tray-arrow-down' : 'share-variant-outline',
        title: saving ? 'Saving…' : kind === 'gif' ? 'Save GIF to your photos' : 'Save voice message',
        sub: `${expiry ? `${expiry}. ` : ''}Keep a copy on your phone — it disappears from the chat after that.`,
        onPress: () => onSave(message),
        busy: saving,
      });
    }
    if (total > 0) {
      actions.push({
        key: 'reactions',
        icon: 'emoticon-happy-outline',
        title: 'See who reacted',
        sub: total === 1 ? '1 reaction' : `${total} reactions`,
        onPress: () => onSeeReactions(message),
      });
    }
  }

  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        {/* The dimmed area behind the sheet closes it; a sibling (not a parent) so the
            sheet's own buttons stay separate for screen readers. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close message options"
          accessibilityRole="button"
        />
        {message && (
          <Animated.View
            entering={reduceMotion ? undefined : SlideInDown.springify().damping(20).stiffness(230)}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
            accessibilityViewIsModal
          >
            <View style={styles.handle} />
            <View
              style={styles.preview}
              accessible
              accessibilityLabel={`Message from ${message.senderName}: ${expired ? `${previewText(message)}, expired` : previewText(message)}`}
            >
              <Text style={styles.previewSender} numberOfLines={1}>{message.senderName}</Text>
              <Text style={styles.previewText} numberOfLines={3}>
                {expired ? `${kind === 'voice' ? 'Voice message' : 'GIF'} expired` : previewText(message)}
              </Text>
            </View>

            <View style={styles.emojiRow} accessibilityLabel="React">
              {CHAT_EMOJIS.map(({ emoji, name }, i) => {
                const mine = isMyReaction(message, emoji);
                return (
                  <Animated.View key={emoji} entering={reduceMotion ? undefined : ZoomIn.delay(40 + i * 25).springify().damping(14)}>
                    <Pressable
                      onPress={() => onReact(message, emoji)}
                      accessibilityRole="button"
                      accessibilityLabel={mine ? `Remove your ${name} reaction` : `React with ${name}`}
                      accessibilityState={{ selected: mine }}
                      style={({ pressed }) => [styles.emojiBtn, mine && styles.emojiBtnMine, pressed && styles.emojiPressed]}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>

            <View style={styles.actions}>
              {actions.map((a, i) => (
                <Pressable
                  key={a.key}
                  onPress={a.onPress}
                  disabled={a.busy}
                  accessibilityRole="button"
                  accessibilityLabel={a.sub ? `${a.title}. ${a.sub}` : a.title}
                  accessibilityState={{ busy: !!a.busy }}
                  style={({ pressed }) => [styles.action, i > 0 && styles.actionDivider, pressed && { backgroundColor: C.bgSurfaceMid }]}
                >
                  <View style={styles.actionIcon}>
                    <MaterialCommunityIcons name={a.icon} size={18} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionTitle}>{a.title}</Text>
                    {a.sub ? <Text style={styles.actionSub}>{a.sub}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.bgCard,
      borderTopLeftRadius: BorderRadius.xxl,
      borderTopRightRadius: BorderRadius.xxl,
      paddingHorizontal: 16,
      paddingTop: 8,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.1, shadowRadius: 16 },
        android: { elevation: 16 },
      }),
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.outlineVariant, marginBottom: 12 },
    preview: {
      backgroundColor: C.bgSurfaceLow,
      borderRadius: BorderRadius.md,
      padding: 12,
      borderLeftWidth: 3,
      borderLeftColor: C.primaryLight,
    },
    previewSender: { fontFamily: FontFamily.bodySemibold, fontSize: 12, color: C.primary, marginBottom: 2 },
    previewText: { fontFamily: FontFamily.bodyRegular, fontSize: 13.5, lineHeight: 19, color: C.textSecondary },
    emojiRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 14,
      padding: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: C.bgSurfaceLow,
    },
    emojiBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    emojiBtnMine: { backgroundColor: C.primaryFixed, borderColor: C.primaryLight },
    emojiPressed: { transform: [{ scale: 0.88 }] },
    emojiText: { fontSize: 25 },
    actions: { marginTop: 14, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
    action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, minHeight: 52 },
    actionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.outlineVariant },
    actionIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: C.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionTitle: { fontFamily: FontFamily.bodySemibold, fontSize: 14.5, color: C.textPrimary },
    actionSub: { fontFamily: FontFamily.bodyRegular, fontSize: 12, color: C.textMuted, marginTop: 1 },
  });
