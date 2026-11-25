import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { ChatMessage } from '../../hooks/useChat';
import { useLocalMedia } from '../../hooks/useChatMedia';

export const GIF_WIDTH = 224;

/** A GIF's box: its own shape, kept between tall-ish and wide-ish so a bubble never towers over the chat. */
export function gifSize(m: ChatMessage, width = GIF_WIDTH): { width: number; height: number } {
  const w = m.media?.width ?? 0;
  const h = m.media?.height ?? 0;
  const ratio = w > 0 && h > 0 ? Math.max(0.62, Math.min(1.8, w / h)) : 1.25;
  return { width, height: Math.round(width / ratio) };
}

interface Props {
  message: ChatMessage;
  now: Date;
  time: string;
  isMine: boolean;
  reduceMotion: boolean;
  onOpen: (m: ChatMessage, uri: string) => void;
  onLongPress: () => void;
}

/**
 * An animated GIF in a bubble (owner 2026-11-25): drawn from the phone's own copy (useLocalMedia), the time on a
 * small dark pill over its corner. Tap to see it full screen (where it can be saved). With "Reduce motion" on it does
 * not play by itself; it plays in the full-screen view.
 */
export function GifMessage({ message, now, time, isMine, reduceMotion, onOpen, onLongPress }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { uri, status, retry } = useLocalMedia(message, now);
  const [broken, setBroken] = useState(false);
  const size = gifSize(message);

  const label =
    status === 'ready' ? 'GIF. Double tap to open it full screen' : status === 'error' ? 'GIF could not be loaded. Double tap to try again' : 'GIF loading';

  return (
    <Pressable
      onPress={() => {
        if (status === 'ready' && uri && !broken) onOpen(message, uri);
        else if (status === 'error' || broken) {
          setBroken(false);
          retry();
        }
      }}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole="imagebutton"
      accessibilityLabel={`${label}. Sent at ${time}`}
      style={({ pressed }) => [styles.frame, size, pressed && { opacity: 0.9 }]}
    >
      {status === 'ready' && uri && !broken ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          autoplay={!reduceMotion}
          recyclingKey={`gif-${message.id}`}
          transition={reduceMotion ? 0 : 160}
          onError={() => setBroken(true)}
          accessible={false}
        />
      ) : (
        <View style={styles.placeholder}>
          {status === 'error' || broken ? (
            <>
              <MaterialCommunityIcons name="refresh" size={22} color={C.textMuted} />
              <Text style={styles.placeholderText}>Couldn’t load the GIF. Tap to try again.</Text>
            </>
          ) : (
            <ActivityIndicator color={C.textMuted} />
          )}
        </View>
      )}

      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>GIF</Text>
      </View>
      <View style={styles.timePill} pointerEvents="none">
        <Text style={[styles.timeText, TabularNums]}>{time}</Text>
        {isMine && <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" />}
      </View>
    </Pressable>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    frame: { borderRadius: BorderRadius.md, overflow: 'hidden', backgroundColor: C.bgSurfaceMid },
    placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14 },
    placeholderText: { fontFamily: FontFamily.bodyRegular, fontSize: 12, color: C.textMuted, textAlign: 'center' },
    // over a picture of any colour: a dark scrim with white text reads in light and dark mode alike
    badge: {
      position: 'absolute',
      top: 7,
      left: 7,
      backgroundColor: 'rgba(15,23,42,0.62)',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeText: { fontFamily: FontFamily.bodySemibold, fontSize: 10, color: '#FFFFFF', letterSpacing: 0.6 },
    timePill: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(15,23,42,0.55)',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    timeText: { fontFamily: FontFamily.bodyRegular, fontSize: 10.5, color: '#FFFFFF' },
  });
