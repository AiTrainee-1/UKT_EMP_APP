import React from 'react';
import { Modal, Pressable, View, Text, StyleSheet, Platform } from 'react-native';
import { MotiView } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import type { ChatMessage } from '../../hooks/useChat';
import { isMyReaction } from '../../lib/chatThread';
import { CHAT_EMOJIS } from './emoji';

interface Props {
  message: ChatMessage | null;
  onClose: () => void;
  onReply: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
}

/**
 * Opened by pressing and holding a message (or "Message options" for a screen reader): react
 * with one of six emojis, or reply. Replaces the old emoji-only pop-up that had no labels.
 */
export function MessageActionsSheet({ message, onClose, onReply, onReact }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

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
          <MotiView
            from={{ translateY: 40, opacity: 0 }}
            animate={{ translateY: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 220 }}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
          >
            <View>
              <View style={styles.handle} />
              <View style={styles.preview} accessible accessibilityLabel={`Message from ${message.senderName}: ${message.text}`}>
                <Text style={styles.previewSender} numberOfLines={1}>{message.senderName}</Text>
                <Text style={styles.previewText} numberOfLines={3}>{message.text}</Text>
              </View>

              <Text style={styles.sectionLabel}>React</Text>
              <View style={styles.emojiRow}>
                {CHAT_EMOJIS.map(({ emoji, name }, i) => {
                  const mine = isMyReaction(message, emoji);
                  return (
                    <MotiView
                      key={emoji}
                      from={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', damping: 14, stiffness: 260, delay: 40 + i * 25 }}
                    >
                      <Pressable
                        onPress={() => onReact(message, emoji)}
                        accessibilityRole="button"
                        accessibilityLabel={mine ? `Remove your ${name} reaction` : `React with ${name}`}
                        accessibilityState={{ selected: mine }}
                        style={({ pressed }) => [styles.emojiBtn, mine && styles.emojiBtnMine, pressed && styles.emojiPressed]}
                      >
                        <Text style={styles.emojiText}>{emoji}</Text>
                      </Pressable>
                    </MotiView>
                  );
                })}
              </View>

              <Pressable
                onPress={() => onReply(message)}
                accessibilityRole="button"
                accessibilityLabel={`Reply to ${message.senderName}`}
                style={({ pressed }) => [styles.action, pressed && { backgroundColor: C.bgSurfaceMid }]}
              >
                <View style={styles.actionIcon}>
                  <MaterialCommunityIcons name="reply" size={18} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>Reply</Text>
                  <Text style={styles.actionSub}>Tip: you can also swipe a message to the right</Text>
                </View>
              </Pressable>
            </View>
          </MotiView>
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
    sectionLabel: {
      fontFamily: FontFamily.bodySemibold,
      fontSize: 11,
      letterSpacing: 0.6,
      color: C.textMuted,
      textTransform: 'uppercase',
      marginTop: 16,
      marginBottom: 8,
    },
    emojiRow: { flexDirection: 'row', justifyContent: 'space-between' },
    emojiBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.bgSurfaceLow,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    emojiBtnMine: { backgroundColor: C.primaryFixed, borderColor: C.primaryLight },
    emojiPressed: { transform: [{ scale: 0.9 }] },
    emojiText: { fontSize: 24 },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 16,
      padding: 12,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: C.border,
    },
    actionIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionTitle: { fontFamily: FontFamily.bodySemibold, fontSize: 14.5, color: C.textPrimary },
    actionSub: { fontFamily: FontFamily.bodyRegular, fontSize: 12, color: C.textMuted, marginTop: 1 },
  });
