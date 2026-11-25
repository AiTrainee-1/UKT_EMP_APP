import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

export interface PickedGif {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number | null;
  width: number;
  height: number;
}

interface Props {
  gif: PickedGif | null;
  channelLabel: string;
  replyingTo: string | null;
  expiryDays: number | null;
  reduceMotion: boolean;
  onCancel: () => void;
  onPickAnother: () => void;
  onSend: () => void;
}

/** A last look at the GIF picked from the gallery before it goes to the whole channel (owner 2026-11-25). */
export function GifSendSheet({ gif, channelLabel, replyingTo, expiryDays, reduceMotion, onCancel, onPickAnother, onSend }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const ratio = gif && gif.width > 0 && gif.height > 0 ? Math.max(0.62, Math.min(1.8, gif.width / gif.height)) : 1.25;
  const sizeMb = gif?.fileSize ? gif.fileSize / (1024 * 1024) : null;

  return (
    <Modal visible={!!gif} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel sending the GIF" />
        {gif && (
          <Animated.View
            entering={reduceMotion ? undefined : SlideInDown.springify().damping(20).stiffness(230)}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
            accessibilityViewIsModal
          >
            <View style={styles.handle} />
            <Text style={styles.title} accessibilityRole="header">Send this GIF?</Text>
            <Text style={styles.sub} numberOfLines={2}>
              To {channelLabel}
              {replyingTo ? ` · replying to ${replyingTo}` : ''}
            </Text>

            <View style={[styles.previewWrap, { aspectRatio: ratio }]}>
              <Image
                source={{ uri: gif.uri }}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                autoplay={!reduceMotion}
                accessible
                accessibilityRole="image"
                accessibilityLabel="The GIF you picked"
              />
            </View>

            <View style={styles.note}>
              <MaterialCommunityIcons name="timer-sand" size={14} color={C.textMuted} />
              <Text style={styles.noteText}>
                {sizeMb != null ? `${sizeMb < 1 ? '<1' : sizeMb.toFixed(1)} MB. ` : ''}
                {expiryDays ? `It stays in the chat for ${expiryDays} ${expiryDays === 1 ? 'day' : 'days'}.` : 'GIFs stay in the chat for a few days.'}
              </Text>
            </View>

            <View style={styles.buttons}>
              <Pressable
                onPress={onPickAnother}
                accessibilityRole="button"
                accessibilityLabel="Choose another GIF"
                style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]}
              >
                <MaterialCommunityIcons name="image-multiple-outline" size={18} color={C.primary} />
                <Text style={styles.secondaryText}>Choose another</Text>
              </Pressable>
              <Pressable
                onPress={onSend}
                accessibilityRole="button"
                accessibilityLabel="Send GIF"
                style={({ pressed }) => [styles.primary, pressed && { opacity: 0.88 }]}
              >
                <MaterialCommunityIcons name="send" size={18} color={C.onPrimary} />
                <Text style={styles.primaryText}>Send</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
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
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.outlineVariant, marginBottom: 10 },
    title: { fontFamily: FontFamily.headlineSemibold, fontSize: 17, color: C.textPrimary },
    sub: { fontFamily: FontFamily.bodyRegular, fontSize: 13, color: C.textMuted, marginTop: 2, marginBottom: 12 },
    previewWrap: {
      width: '100%',
      maxHeight: 340,
      alignSelf: 'center',
      borderRadius: BorderRadius.lg,
      overflow: 'hidden',
      backgroundColor: C.bgSurfaceMid,
    },
    note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    noteText: { fontFamily: FontFamily.bodyRegular, fontSize: 12.5, color: C.textMuted, flex: 1 },
    buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
    secondary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 48,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.bgSurfaceLow,
    },
    secondaryText: { fontFamily: FontFamily.bodySemibold, fontSize: 14.5, color: C.primary },
    primary: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 48,
      borderRadius: BorderRadius.full,
      backgroundColor: C.primary,
    },
    primaryText: { fontFamily: FontFamily.bodySemibold, fontSize: 14.5, color: C.onPrimary },
  });
