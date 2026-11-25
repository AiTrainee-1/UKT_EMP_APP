import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { FontFamily } from '../../constants/typography';
import { BorderRadius } from '../../constants/theme';
import type { ChatMessage } from '../../hooks/useChat';
import { expiryLabel } from '../../lib/chatMedia';
import { timeLabel, dayLabel, parseTime } from '../../lib/chatThread';

interface Props {
  item: { message: ChatMessage; uri: string } | null;
  now: Date;
  saving: boolean;
  onClose: () => void;
  onSave: (m: ChatMessage, uri: string) => void;
}

/**
 * A GIF full screen (owner 2026-11-25), always playing, with Save (to the phone's photos) and how long it stays in the
 * chat. A photo viewer is dark in light and dark mode alike, so its colours are fixed rather than themed.
 */
export function GifViewer({ item, now, saving, onClose, onSave }: Props) {
  const m = item?.message;
  const when = m ? parseTime(m.createdAt) : null;
  const expiry = m ? expiryLabel(m.media?.expiresAt, now) : null;

  return (
    <Modal visible={!!item} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close GIF" hitSlop={8}>
            <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{m?.senderName ?? ''}</Text>
            {when && (
              <Text style={styles.sub} numberOfLines={1}>
                {dayLabel(when, now)}, {timeLabel(m?.createdAt)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.stage}>
          {item && (
            <Image
              source={{ uri: item.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              autoplay
              accessible
              accessibilityRole="image"
              accessibilityLabel={`GIF from ${m?.senderName ?? 'a colleague'}`}
            />
          )}
        </View>

        <View style={styles.bottom}>
          {expiry && (
            <View style={styles.note}>
              <MaterialCommunityIcons name="timer-sand" size={14} color="rgba(255,255,255,0.75)" />
              <Text style={styles.noteText}>{expiry}. Save it to keep a copy on your phone.</Text>
            </View>
          )}
          <Pressable
            onPress={() => item && onSave(item.message, item.uri)}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save GIF to your photos"
            accessibilityState={{ busy: saving }}
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
          >
            {saving ? (
              <ActivityIndicator color="#0F172A" size="small" />
            ) : (
              <MaterialCommunityIcons name="tray-arrow-down" size={19} color="#0F172A" />
            )}
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save to photos'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  title: { fontFamily: FontFamily.bodySemibold, fontSize: 15, color: '#FFFFFF' },
  sub: { fontFamily: FontFamily.bodyRegular, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  stage: { flex: 1 },
  bottom: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 10 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  noteText: { fontFamily: FontFamily.bodyRegular, fontSize: 12.5, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.full,
    minHeight: 48,
  },
  saveText: { fontFamily: FontFamily.bodySemibold, fontSize: 15, color: '#0F172A' },
});
