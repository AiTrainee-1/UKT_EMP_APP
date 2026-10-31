import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, type TextInputInstance } from 'react-native';
import { MotiView } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { ChatMessage } from '../../hooks/useChat';
import { CHAT_MAX_LENGTH } from '../../lib/chatThread';

interface Props {
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  sending: boolean;
  /** When set, typing is off and this sentence explains why. */
  disabledReason: string | null;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  channelLabel: string;
  inputRef?: React.Ref<TextInputInstance>;
}

export function Composer({ value, onChange, onSend, sending, disabledReason, replyTo, onCancelReply, channelLabel, inputRef }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const canSend = !disabledReason && !sending && value.trim().length > 0;
  const remaining = CHAT_MAX_LENGTH - value.length;

  return (
    <View style={styles.wrap}>
      {replyTo && (
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 180 }}
          style={styles.replyBar}
          accessibilityLiveRegion="polite"
        >
          <MaterialCommunityIcons name="reply" size={16} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replySender} numberOfLines={1}>Replying to {replyTo.senderName}</Text>
            <Text style={styles.replyText} numberOfLines={1}>{replyTo.text}</Text>
          </View>
          <Pressable
            onPress={onCancelReply}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            style={styles.replyClose}
          >
            <MaterialCommunityIcons name="close" size={16} color={C.textMuted} />
          </Pressable>
        </MotiView>
      )}

      {disabledReason ? (
        <View style={styles.disabledRow} accessible accessibilityLabel={disabledReason}>
          <MaterialCommunityIcons name="lock-outline" size={15} color={C.textMuted} />
          <Text style={styles.disabledText}>{disabledReason}</Text>
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={`Message ${channelLabel}…`}
              placeholderTextColor={C.outline}
              selectionColor={C.primary}
              cursorColor={C.primary}
              value={value}
              onChangeText={onChange}
              maxLength={CHAT_MAX_LENGTH}
              multiline
              accessibilityLabel={`Message to ${channelLabel}`}
            />
            {remaining <= 200 && (
              <Text style={[styles.counter, TabularNums, remaining <= 20 && { color: C.statusRed }]} accessibilityLiveRegion="polite">
                {remaining}
              </Text>
            )}
          </View>
          <MotiView
            animate={{ scale: canSend ? 1 : 0.92, opacity: canSend || sending ? 1 : 0.45 }}
            transition={{ type: 'spring', damping: 16, stiffness: 260 }}
          >
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={sending ? 'Sending message' : 'Send message'}
              accessibilityState={{ disabled: !canSend, busy: sending }}
              style={({ pressed }) => [styles.send, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={C.onPrimary} />
              ) : (
                <MaterialCommunityIcons name="send" size={19} color={C.onPrimary} style={{ marginLeft: 2 }} />
              )}
            </Pressable>
          </MotiView>
        </View>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: C.bgCard,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.outlineVariant,
      paddingTop: 8,
      paddingBottom: 10,
      paddingHorizontal: 12,
      gap: 8,
    },
    replyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.bgSurfaceLow,
      borderRadius: BorderRadius.md,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderLeftWidth: 3,
      borderLeftColor: C.primaryLight,
    },
    replySender: { fontFamily: FontFamily.bodySemibold, fontSize: 12, color: C.primary },
    replyText: { fontFamily: FontFamily.bodyRegular, fontSize: 12.5, color: C.textMuted, marginTop: 1 },
    replyClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    inputWrap: {
      flex: 1,
      backgroundColor: C.bgSurfaceLow,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
    },
    input: {
      // Starts as one comfortable line and grows to ~5 lines before scrolling inside.
      minHeight: 44,
      maxHeight: 120,
      paddingVertical: 10,
      color: C.textPrimary,
      fontFamily: FontFamily.bodyRegular,
      fontSize: 15,
      lineHeight: 20,
      textAlignVertical: 'center',
    },
    counter: {
      position: 'absolute',
      right: 12,
      bottom: 3,
      fontFamily: FontFamily.bodySemibold,
      fontSize: 10,
      color: C.textMuted,
    },
    send: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabledRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: BorderRadius.md,
      backgroundColor: C.bgSurfaceLow,
    },
    disabledText: { fontFamily: FontFamily.bodyRegular, fontSize: 13, color: C.textMuted, flexShrink: 1, textAlign: 'center' },
  });
