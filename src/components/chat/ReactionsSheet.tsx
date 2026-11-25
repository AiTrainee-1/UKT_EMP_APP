import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, View, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { ChatMessage } from '../../hooks/useChat';
import { reactionTotal, reactorRows } from '../../lib/chatThread';
import { emojiName } from './emoji';
import { tintFor, initials } from './chatVisuals';

interface Props {
  message: ChatMessage | null;
  /** The emoji tab to open on (null = All). */
  initialEmoji: string | null;
  reduceMotion: boolean;
  onClose: () => void;
  /** Removes my reaction with this emoji (my own row: "Tap to remove"). */
  onRemoveMine: (m: ChatMessage, emoji: string) => void;
}

/**
 * Who reacted with what (owner 2026-11-25: "viewing and checking reactions added to messages by other users"). Opened
 * by tapping a reaction chip under a message: an "All" tab and one per emoji with its count, then the people — you
 * first. Your own row removes your reaction when tapped.
 */
export function ReactionsSheet({ message, initialEmoji, reduceMotion, onClose, onRemoveMine }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<string | null>(initialEmoji);

  useEffect(() => {
    setTab(initialEmoji);
  }, [message?.id, initialEmoji]);

  const reactions = message?.reactions ?? [];
  const activeTab = tab != null && reactions.some((r) => r.emoji === tab) ? tab : null;
  const rows = useMemo(() => reactorRows(reactions, activeTab), [reactions, activeTab]);
  const hasNames = reactions.some((r) => (r.people?.length ?? 0) > 0);
  const total = reactionTotal(reactions);

  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close reactions" />
        {message && (
          <Animated.View
            entering={reduceMotion ? undefined : SlideInDown.springify().damping(20).stiffness(220)}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}
            accessibilityViewIsModal
          >
            <View style={styles.handle} />
            <Text style={styles.title} accessibilityRole="header">
              {total === 1 ? '1 reaction' : `${total} reactions`}
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
              <Tab label="All" count={total} active={activeTab == null} onPress={() => setTab(null)} styles={styles} />
              {reactions.map((r) => (
                <Tab
                  key={r.emoji}
                  label={r.emoji}
                  a11y={emojiName(r.emoji)}
                  count={r.count}
                  active={activeTab === r.emoji}
                  onPress={() => setTab(r.emoji)}
                  styles={styles}
                />
              ))}
            </ScrollView>

            {hasNames ? (
              <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 4 }}>
                {rows.map((row, i) => {
                  const tint = tintFor(row.name, C);
                  return (
                    <Animated.View key={row.key} entering={reduceMotion ? undefined : FadeIn.delay(Math.min(i, 8) * 25).duration(160)}>
                      <Pressable
                        onPress={row.isMe ? () => onRemoveMine(message, row.emoji) : undefined}
                        disabled={!row.isMe}
                        accessibilityRole={row.isMe ? 'button' : 'text'}
                        accessibilityLabel={
                          row.isMe
                            ? `You reacted ${emojiName(row.emoji)}. Double tap to remove`
                            : `${row.name} reacted ${emojiName(row.emoji)}`
                        }
                        style={({ pressed }) => [styles.person, pressed && { backgroundColor: C.bgSurfaceMid }]}
                      >
                        <View style={[styles.avatar, { backgroundColor: row.isMe ? C.primaryFixed : tint.bg }]}>
                          <Text style={[styles.avatarText, { color: row.isMe ? C.onPrimaryContainer : tint.fg }]}>
                            {row.isMe ? 'You' : initials(row.name)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name} numberOfLines={1}>{row.name}</Text>
                          {row.isMe && <Text style={styles.sub}>Tap to remove</Text>}
                        </View>
                        <Text style={styles.rowEmoji}>{row.emoji}</Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.noNames}>
                <MaterialCommunityIcons name="account-multiple-outline" size={20} color={C.textMuted} />
                <Text style={styles.noNamesText}>Names will show here once the chat server is updated.</Text>
              </View>
            )}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

function Tab({
  label,
  a11y,
  count,
  active,
  onPress,
  styles,
}: {
  label: string;
  a11y?: string;
  count: number;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${a11y ?? label}, ${count}`}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      <Text style={[styles.tabCount, TabularNums, active && styles.tabLabelActive]}>{count}</Text>
    </Pressable>
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
      maxHeight: '75%',
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.1, shadowRadius: 16 },
        android: { elevation: 16 },
      }),
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.outlineVariant, marginBottom: 10 },
    title: { fontFamily: FontFamily.headlineSemibold, fontSize: 16, color: C.textPrimary, marginBottom: 10 },
    tabs: { gap: 8, paddingBottom: 10 },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: BorderRadius.full,
      backgroundColor: C.bgSurfaceLow,
      borderWidth: 1,
      borderColor: C.border,
      minHeight: 36,
    },
    tabActive: { backgroundColor: C.primary, borderColor: C.primary },
    tabLabel: { fontFamily: FontFamily.bodySemibold, fontSize: 14, color: C.textSecondary },
    tabCount: { fontFamily: FontFamily.bodySemibold, fontSize: 12.5, color: C.textMuted },
    tabLabelActive: { color: C.onPrimary },
    list: { flexGrow: 0 },
    person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 6, borderRadius: BorderRadius.md },
    avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: FontFamily.bodySemibold, fontSize: 12 },
    name: { fontFamily: FontFamily.bodySemibold, fontSize: 14.5, color: C.textPrimary },
    sub: { fontFamily: FontFamily.bodyRegular, fontSize: 12, color: C.textMuted, marginTop: 1 },
    rowEmoji: { fontSize: 22 },
    noNames: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 },
    noNamesText: { fontFamily: FontFamily.bodyRegular, fontSize: 13, color: C.textMuted, flex: 1 },
  });
