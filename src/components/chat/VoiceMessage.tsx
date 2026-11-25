import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, type LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureDetector, usePanGesture, useTapGesture, useExclusiveGestures } from 'react-native-gesture-handler';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { ChatMessage } from '../../hooks/useChat';
import { useLocalMedia } from '../../hooks/useChatMedia';
import { barsForMessage, formatDuration, seekPosition } from '../../lib/chatMedia';
import { useVoiceTrack } from './VoicePlayback';

interface Props {
  message: ChatMessage;
  now: Date;
  time: string;
  isMine: boolean;
  onLongPress: () => void;
}

/**
 * A voice message in a bubble (owner 2026-11-25): play / pause, the sender's waveform filling in as it plays, and the
 * length. Tap or drag along the waveform to jump. Plays the phone's own copy (useLocalMedia) through the chat's one
 * shared player (VoicePlayback), so starting one stops another.
 */
export function VoiceMessage({ message, now, time, isMine, onLongPress }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { uri, status, retry } = useLocalMedia(message, now);
  const { track, controls } = useVoiceTrack(message.id);
  const [width, setWidth] = useState(0);
  const [dragMs, setDragMs] = useState<number | null>(null);

  const bars = useMemo(() => barsForMessage(message.media?.waveform, message.id), [message.media?.waveform, message.id]);
  const durationMs = message.media?.durationMs || track.durationMs || 0;
  const active = track.playing || track.positionMs > 0 || track.loading;
  const positionMs = dragMs ?? (active ? track.positionMs : 0);
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const ready = status === 'ready' && !!uri;

  const toggle = () => {
    if (status === 'error') return retry();
    if (ready && controls) controls.toggle(message.id, uri);
  };

  const seekTo = (ms: number) => {
    if (!ready || !controls) return;
    if (!active) controls.toggle(message.id, uri); // jumping into a message that is not playing starts it there
    controls.seek(message.id, ms);
  };

  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-6, 6],
    failOffsetY: [-10, 10],
    enabled: ready,
    onUpdate: (e) => setDragMs(seekPosition(e.x, width, durationMs)),
    onDeactivate: (e) => {
      if (!e.canceled) seekTo(seekPosition(e.x, width, durationMs));
    },
    onFinalize: () => setDragMs(null),
  });
  const tap = useTapGesture({
    runOnJS: true,
    enabled: ready,
    onDeactivate: (e) => {
      if (!e.canceled) seekTo(seekPosition(e.x, width, durationMs));
    },
  });
  const gesture = useExclusiveGestures(pan, tap);

  const played = isMine ? C.onPrimary : C.primary;
  const unplayed = isMine ? C.onPrimary : C.outline;
  const shownMs = active || dragMs != null ? positionMs : durationMs;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={toggle}
        onLongPress={onLongPress}
        delayLongPress={280}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={
          status === 'error'
            ? 'Voice message could not be loaded. Double tap to try again'
            : track.playing
              ? 'Pause voice message'
              : `Play voice message, ${formatDuration(durationMs)} long`
        }
        accessibilityState={{ busy: status === 'loading' || track.loading }}
        style={({ pressed }) => [styles.playBtn, isMine ? styles.playBtnMine : styles.playBtnTheirs, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        {status === 'loading' || (track.loading && !track.playing) ? (
          <ActivityIndicator size="small" color={isMine ? C.primary : C.onPrimary} />
        ) : (
          <MaterialCommunityIcons
            name={status === 'error' ? 'refresh' : track.playing ? 'pause' : 'play'}
            size={22}
            color={isMine ? C.primary : C.onPrimary}
            style={!track.playing && status !== 'error' ? { marginLeft: 2 } : undefined}
          />
        )}
      </Pressable>

      <View style={styles.body}>
        <GestureDetector gesture={gesture}>
          <View
            style={styles.wave}
            onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Voice message position"
            accessibilityValue={{ text: `${formatDuration(positionMs)} of ${formatDuration(durationMs)}` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              const step = 5_000 * (e.nativeEvent.actionName === 'increment' ? 1 : -1);
              seekTo(Math.max(0, Math.min(durationMs, positionMs + step)));
            }}
          >
            {bars.map((b, i) => {
              const done = (i + 0.5) / bars.length <= progress;
              return (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    { height: 4 + b * 22, backgroundColor: done ? played : unplayed, opacity: done ? 1 : isMine ? 0.45 : 0.55 },
                  ]}
                />
              );
            })}
            {/* where the playhead is */}
            {width > 0 && (active || dragMs != null) && (
              <View
                pointerEvents="none"
                style={[styles.knob, { left: Math.max(0, Math.min(width - 10, progress * width - 5)), backgroundColor: played }]}
              />
            )}
          </View>
        </GestureDetector>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, TabularNums, isMine && styles.metaMine]}>{formatDuration(shownMs)}</Text>
          <View style={styles.metaRight}>
            <Text style={[styles.meta, TabularNums, isMine && styles.metaMine]}>{time}</Text>
            {isMine && <MaterialCommunityIcons name="check" size={12} color={C.onPrimary} style={{ opacity: 0.75 }} />}
          </View>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 236, paddingVertical: 2 },
    playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    playBtnMine: { backgroundColor: C.onPrimary },
    playBtnTheirs: { backgroundColor: C.primary },
    body: { flex: 1 },
    wave: { height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bar: { width: 3, borderRadius: 2 },
    knob: { position: 'absolute', width: 10, height: 10, borderRadius: 5, top: 10 },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 },
    metaRight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    meta: { fontFamily: FontFamily.bodyRegular, fontSize: 10.5, color: C.textMuted },
    metaMine: { color: C.onPrimary, opacity: 0.78 },
  });
