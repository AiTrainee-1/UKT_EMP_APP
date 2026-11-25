import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { FontFamily } from '../../constants/typography';
import { COMPOSER_EMOJIS } from './emoji';

export const EMOJI_PANEL_HEIGHT = 236;

/**
 * The composer's emoji panel (owner 2026-11-25): takes the keyboard's place, WhatsApp-style. A tap puts the emoji where
 * the cursor is; the backspace key takes the last character (or emoji) away.
 */
export function EmojiPanel({
  onPick,
  onBackspace,
  reduceMotion,
}: {
  onPick: (emoji: string) => void;
  onBackspace: () => void;
  reduceMotion: boolean;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(180)} style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.headText}>Emoji</Text>
        <Pressable
          onPress={onBackspace}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Delete the last character"
          style={({ pressed }) => [styles.backspace, pressed && { opacity: 0.6 }]}
        >
          <MaterialCommunityIcons name="backspace-outline" size={20} color={C.textSecondary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.grid} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        {COMPOSER_EMOJIS.map((e) => (
          <Pressable
            key={e}
            onPress={() => onPick(e)}
            accessibilityRole="button"
            accessibilityLabel={`Insert ${e}`}
            style={({ pressed }) => [styles.cell, pressed && { backgroundColor: C.bgSurfaceMid, transform: [{ scale: 0.9 }] }]}
          >
            <Text style={styles.emoji}>{e}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: { height: EMOJI_PANEL_HEIGHT, backgroundColor: C.bgCard, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.outlineVariant },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 },
    headText: { fontFamily: FontFamily.bodySemibold, fontSize: 11.5, letterSpacing: 0.6, color: C.textMuted, textTransform: 'uppercase' },
    backspace: { width: 40, height: 32, alignItems: 'center', justifyContent: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6, paddingBottom: 8 },
    cell: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    emoji: { fontSize: 26 },
  });
