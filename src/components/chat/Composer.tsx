import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  type TextInputInstance,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  ZoomIn,
  ZoomOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  Extrapolation,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { ChatMessage } from '../../hooks/useChat';
import { CHAT_MAX_LENGTH } from '../../lib/chatThread';
import { formatDuration, previewText, resampleBars, VOICE_MAX_MS, VOICE_MIN_MS } from '../../lib/chatMedia';
import { deleteRecording, useVoiceRecorder, type Recording, type StartOutcome } from '../../hooks/useVoiceRecorder';
import { useVoiceControls } from './VoicePlayback';
import { EmojiPanel } from './EmojiPanel';

/** Slide this far left while holding the mic to throw the recording away. */
const CANCEL_X = 110;
/** Slide this far up while holding the mic to keep recording hands-free. */
const LOCK_Y = 80;

type Mode = 'idle' | 'holding' | 'locked';
type Notice = (message: string, type?: 'success' | 'error' | 'info') => void;

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
  inputRef?: React.RefObject<TextInputInstance | null>;
  reduceMotion: boolean;
  /** How many days GIFs and voice messages stay (the server's setting), when known. */
  expiryDays: number | null;
  /** A GIF / voice message is uploading: no second one until it is done. */
  mediaBusy: boolean;
  onPickGif: () => void;
  onVoiceRecorded: (rec: Recording) => void;
  onNotice: Notice;
}

/**
 * The WhatsApp-style message box (owner 2026-11-25): emoji, the text, attach (a GIF from your photos) and, while the
 * box is empty, the mic.
 *
 * Voice messages: press and HOLD the mic to record, let go to send; slide left to throw it away; slide up to lock and
 * record hands-free (then the bin or Send). It stops by itself at two minutes. A screen reader's double tap starts a
 * locked recording straight away. A plain tap only explains how it works.
 */
export function Composer({
  value,
  onChange,
  onSend,
  sending,
  disabledReason,
  replyTo,
  onCancelReply,
  channelLabel,
  inputRef,
  reduceMotion,
  expiryDays,
  mediaBusy,
  onPickGif,
  onVoiceRecorded,
  onNotice,
}: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const playback = useVoiceControls();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const selection = useRef<{ start: number; end: number } | null>(null);

  const hasText = value.trim().length > 0;
  const canSend = !disabledReason && !sending && hasText;
  const remaining = CHAT_MAX_LENGTH - value.length;

  // ── voice recording ────────────────────────────────────────────────────────
  const hold = useRef({ down: false, started: false, cancelled: false, locked: false });
  const finishRef = useRef<(send: boolean, reason?: 'limit') => void>(() => undefined);
  const voice = useVoiceRecorder({ onLimit: () => finishRef.current(true, 'limit') });

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const pressed = useSharedValue(0);
  const cancelSent = useSharedValue(0);
  const lockSent = useSharedValue(0);
  const blink = useSharedValue(1);

  const finish = useCallback(
    async (send: boolean, reason?: 'limit') => {
      hold.current = { down: false, started: false, cancelled: !send, locked: false };
      pressed.value = withTiming(0, { duration: 120 });
      setMode('idle');
      const rec = await voice.stop();
      if (!rec) return;
      if (!send) {
        deleteRecording(rec.uri);
        return;
      }
      if (rec.durationMs < VOICE_MIN_MS) {
        deleteRecording(rec.uri);
        onNotice('Hold the mic a little longer to record a voice message.', 'info');
        return;
      }
      void Haptics.selectionAsync().catch(() => undefined);
      if (reason === 'limit') onNotice('Voice messages can be up to 2 minutes, so it was sent.', 'info');
      onVoiceRecorded(rec);
    },
    [voice, onNotice, onVoiceRecorded, pressed],
  );
  finishRef.current = finish;

  const explainStart = (outcome: StartOutcome) => {
    if (outcome === 'permission-asked') onNotice('Microphone allowed. Now press and hold the mic to record.', 'success');
    else if (outcome === 'denied') onNotice('Voice messages need the microphone. Allow it when the phone asks.', 'info');
    else if (outcome === 'blocked') onNotice('The microphone is turned off for UKTextiles. Turn it on in your phone’s Settings to send voice messages.', 'error');
    else if (outcome === 'failed') onNotice('Couldn’t start recording. Please try again.', 'error');
  };

  const begin = useCallback(
    async (locked: boolean) => {
      if (disabledReason || mediaBusy || mode !== 'idle') return;
      hold.current = { down: !locked, started: false, cancelled: false, locked };
      setEmojiOpen(false);
      setAttachOpen(false);
      playback?.stop();
      setMode(locked ? 'locked' : 'holding');
      const outcome = await voice.start();
      if (outcome !== 'started') {
        setMode('idle');
        hold.current.down = false;
        explainStart(outcome);
        return;
      }
      hold.current.started = true;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      const h = hold.current;
      if (h.cancelled) {
        void finish(false);
      } else if (!h.down && !h.locked) {
        // let go before the recording had even started: a tap, not a hold
        void finish(false);
        onNotice('Press and hold the mic to record. Let go to send.', 'info');
      }
    },
    [disabledReason, mediaBusy, mode, playback, voice, finish, onNotice], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onHoldStart = useCallback(() => void begin(false), [begin]);
  const onHoldEnd = useCallback(() => {
    const h = hold.current;
    if (!h.down) return;
    h.down = false;
    if (h.locked || h.cancelled || !h.started) return; // not started yet: begin() sees the early release
    void finish(true);
  }, [finish]);
  const onSlideCancel = useCallback(() => {
    const h = hold.current;
    if (h.locked) return;
    h.cancelled = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    if (h.started) void finish(false);
    else setMode('idle');
  }, [finish]);
  const onSlideLock = useCallback(() => {
    const h = hold.current;
    if (h.cancelled || !h.down) return;
    h.locked = true;
    h.down = false;
    // the mic button gives way to Send: it must not come back still "pressed"
    pressed.value = withTiming(0, { duration: 120 });
    setMode('locked');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, [pressed]);

  // The gesture calls these through stable wrappers, so its worklets never hold a stale closure mid-press.
  const latest = useRef({ onHoldStart, onHoldEnd, onSlideCancel, onSlideLock });
  latest.current = { onHoldStart, onHoldEnd, onSlideCancel, onSlideLock };
  const callStart = useCallback(() => latest.current.onHoldStart(), []);
  const callEnd = useCallback(() => latest.current.onHoldEnd(), []);
  const callCancel = useCallback(() => latest.current.onSlideCancel(), []);
  const callLock = useCallback(() => latest.current.onSlideLock(), []);

  const micGesture = usePanGesture({
    minDistance: 0,
    shouldCancelWhenOutside: false,
    enabled: !disabledReason && !mediaBusy,
    onBegin: () => {
      'worklet';
      cancelSent.value = 0;
      lockSent.value = 0;
      pressed.value = withSpring(1, { damping: 14, stiffness: 260 });
      scheduleOnRN(callStart);
    },
    onUpdate: (e) => {
      'worklet';
      if (cancelSent.value || lockSent.value) return;
      dragX.value = Math.min(0, e.translationX);
      dragY.value = Math.min(0, e.translationY);
      if (e.translationX < -CANCEL_X) {
        cancelSent.value = 1;
        dragX.value = withTiming(0, { duration: 160 });
        dragY.value = withTiming(0, { duration: 160 });
        scheduleOnRN(callCancel);
      } else if (e.translationY < -LOCK_Y && e.translationX > -CANCEL_X / 2) {
        lockSent.value = 1;
        dragX.value = withTiming(0, { duration: 160 });
        dragY.value = withTiming(0, { duration: 160 });
        scheduleOnRN(callLock);
      }
    },
    onFinalize: () => {
      'worklet';
      pressed.value = withSpring(0, { damping: 16, stiffness: 240 });
      dragX.value = withSpring(0, { damping: 18, stiffness: 220 });
      dragY.value = withSpring(0, { damping: 18, stiffness: 220 });
      scheduleOnRN(callEnd);
    },
  });

  useEffect(() => {
    if (mode !== 'idle' && !reduceMotion) {
      blink.value = withRepeat(withTiming(0.25, { duration: 520 }), -1, true);
    } else {
      blink.value = 1;
    }
  }, [mode, reduceMotion, blink]);

  // leaving the channel / the box being switched off ends a recording without sending it
  useEffect(() => {
    if (disabledReason && mode !== 'idle') void finish(false);
  }, [disabledReason]); // eslint-disable-line react-hooks/exhaustive-deps

  const micStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value * 0.35 },
      { translateY: dragY.value * 0.5 },
      { scale: reduceMotion ? 1 : interpolate(pressed.value, [0, 1], [1, 1.32]) },
    ],
  }));
  const slideHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [-CANCEL_X, 0], [0.15, 1], Extrapolation.CLAMP),
    transform: [{ translateX: dragX.value * 0.45 }],
  }));
  const lockHintStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(dragY.value, [-LOCK_Y, 0], [-18, 0], Extrapolation.CLAMP) }],
    opacity: interpolate(dragY.value, [-LOCK_Y, 0], [1, 0.85], Extrapolation.CLAMP),
  }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  // ── text and emoji ─────────────────────────────────────────────────────────
  const insertEmoji = (emoji: string) => {
    const sel = selection.current;
    const at = sel ? Math.min(sel.start, value.length) : value.length;
    const end = sel ? Math.min(sel.end, value.length) : value.length;
    const next = (value.slice(0, at) + emoji + value.slice(end)).slice(0, CHAT_MAX_LENGTH);
    selection.current = { start: at + emoji.length, end: at + emoji.length };
    onChange(next);
  };
  const backspace = () => {
    const chars = Array.from(value);
    let last = chars.pop();
    // a heart is "❤" + a variation selector; a joined emoji ends in a joiner sequence: take the whole thing
    while (last && /[️‍]/.test(last) && chars.length) last = chars.pop();
    if (chars.length && chars[chars.length - 1] === '‍') chars.pop();
    selection.current = null;
    onChange(chars.join(''));
  };

  const toggleEmoji = () => {
    setAttachOpen(false);
    if (emojiOpen) {
      setEmojiOpen(false);
      setTimeout(() => inputRef?.current?.focus(), 30);
    } else {
      Keyboard.dismiss();
      setEmojiOpen(true);
    }
  };

  const live = resampleBars(voice.liveLevels, 28);
  const recordingStrip = (
    <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(140)} style={styles.recStrip} accessibilityLiveRegion="polite">
      {mode === 'locked' ? (
        <Pressable
          onPress={() => void finish(false)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Delete this recording"
          style={({ pressed: p }) => [styles.recBin, p && { opacity: 0.7 }]}
        >
          <MaterialCommunityIcons name="delete-outline" size={22} color={C.statusRed} />
        </Pressable>
      ) : null}
      <Animated.View style={[styles.recDot, dotStyle]} />
      <Text style={[styles.recTime, TabularNums]} accessibilityLabel={`Recording, ${formatDuration(voice.elapsedMs)}`}>
        {formatDuration(voice.elapsedMs)}
      </Text>
      {mode === 'locked' ? (
        <View style={styles.recBars} importantForAccessibility="no-hide-descendants">
          {live.map((v, i) => (
            <View key={i} style={[styles.recBar, { height: 3 + v * 20 }]} />
          ))}
        </View>
      ) : (
        <Animated.View style={[styles.slideHint, slideHintStyle]}>
          <MaterialCommunityIcons name="chevron-left" size={18} color={C.textMuted} />
          <Text style={styles.slideText}>Slide to cancel</Text>
        </Animated.View>
      )}
      {voice.elapsedMs > VOICE_MAX_MS - 15_000 && (
        <Text style={[styles.recLimit, TabularNums]}>{formatDuration(VOICE_MAX_MS - voice.elapsedMs)} left</Text>
      )}
    </Animated.View>
  );

  const micButton = (
    <View>
      {mode === 'holding' && (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(160)}
          style={[styles.lockHint, lockHintStyle]}
          pointerEvents="none"
        >
          <MaterialCommunityIcons name="lock-outline" size={16} color={C.textSecondary} />
          <MaterialCommunityIcons name="chevron-up" size={16} color={C.textMuted} />
        </Animated.View>
      )}
      <GestureDetector gesture={micGesture}>
        <Animated.View
          style={[styles.send, mode === 'holding' && styles.micActive, micStyle]}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Record a voice message"
          accessibilityHint="Press and hold to record, let go to send. Slide left to cancel, slide up to keep recording without holding."
          accessibilityActions={[{ name: 'activate', label: 'Start recording' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'activate') void begin(true);
          }}
        >
          {mediaBusy ? (
            <ActivityIndicator size="small" color={C.onPrimary} />
          ) : (
            <MaterialCommunityIcons name="microphone" size={22} color={C.onPrimary} />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );

  let rightButton: React.ReactNode;
  if (mode === 'locked') {
    rightButton = (
      <Animated.View key="send-voice" entering={reduceMotion ? undefined : ZoomIn.duration(160)}>
        <Pressable
          onPress={() => void finish(true)}
          accessibilityRole="button"
          accessibilityLabel="Send voice message"
          style={({ pressed: p }) => [styles.send, p && { transform: [{ scale: 0.94 }] }]}
        >
          <MaterialCommunityIcons name="send" size={19} color={C.onPrimary} style={{ marginLeft: 2 }} />
        </Pressable>
      </Animated.View>
    );
  } else if (hasText || sending) {
    rightButton = (
      <Animated.View
        key="send"
        entering={reduceMotion ? undefined : ZoomIn.duration(150)}
        exiting={reduceMotion ? undefined : ZoomOut.duration(120)}
      >
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={sending ? 'Sending message' : 'Send message'}
          accessibilityState={{ disabled: !canSend, busy: sending }}
          style={({ pressed: p }) => [styles.send, !canSend && !sending && { opacity: 0.5 }, p && { transform: [{ scale: 0.94 }] }]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={C.onPrimary} />
          ) : (
            <MaterialCommunityIcons name="send" size={19} color={C.onPrimary} style={{ marginLeft: 2 }} />
          )}
        </Pressable>
      </Animated.View>
    );
  } else {
    rightButton = (
      <Animated.View key="mic" entering={reduceMotion ? undefined : ZoomIn.duration(150)}>
        {micButton}
      </Animated.View>
    );
  }

  return (
    <View style={styles.wrap}>
      {replyTo && (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(180)}
          style={styles.replyBar}
          accessibilityLiveRegion="polite"
        >
          <MaterialCommunityIcons name="reply" size={16} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replySender} numberOfLines={1}>Replying to {replyTo.senderName}</Text>
            <Text style={styles.replyText} numberOfLines={1}>{previewText(replyTo)}</Text>
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
        </Animated.View>
      )}

      {attachOpen && !disabledReason && (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(170)}
          exiting={reduceMotion ? undefined : FadeOut.duration(120)}
          style={styles.attachTray}
        >
          <Pressable
            onPress={() => {
              setAttachOpen(false);
              onPickGif();
            }}
            disabled={mediaBusy}
            accessibilityRole="button"
            accessibilityLabel="Send a GIF from your photos, up to 8 MB"
            style={({ pressed: p }) => [styles.attachTile, p && { backgroundColor: C.bgSurfaceMid }]}
          >
            <View style={styles.attachIcon}>
              <MaterialCommunityIcons name="file-gif-box" size={24} color={C.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.attachTitle}>GIF</Text>
              <Text style={styles.attachSub}>From your photos · up to 8 MB</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={C.textMuted} />
          </Pressable>
          <View style={styles.attachNote}>
            <MaterialCommunityIcons name="timer-sand" size={13} color={C.textMuted} />
            <Text style={styles.attachNoteText}>
              GIFs and voice messages stay in the chat for {expiryDays ? `${expiryDays} ${expiryDays === 1 ? 'day' : 'days'}` : 'a few days'}.
              Save any you want to keep (press and hold it).
            </Text>
          </View>
        </Animated.View>
      )}

      {disabledReason ? (
        <View style={styles.disabledRow} accessible accessibilityLabel={disabledReason}>
          <MaterialCommunityIcons name="lock-outline" size={15} color={C.textMuted} />
          <Text style={styles.disabledText}>{disabledReason}</Text>
        </View>
      ) : (
        <View style={styles.row}>
          {/* The text box stays mounted under the recording strip, so a recording never closes the keyboard and
              moves the mic from under the finger. */}
          <View style={styles.inputSlot}>
            <View
              style={styles.inputWrap}
              pointerEvents={mode === 'idle' ? 'auto' : 'none'}
              importantForAccessibility={mode === 'idle' ? 'auto' : 'no-hide-descendants'}
              accessibilityElementsHidden={mode !== 'idle'}
            >
              <Pressable
                onPress={toggleEmoji}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={emojiOpen ? 'Show the keyboard' : 'Show emoji'}
                style={styles.inlineBtn}
              >
                <MaterialCommunityIcons
                  name={emojiOpen ? 'keyboard-outline' : 'emoticon-happy-outline'}
                  size={23}
                  color={emojiOpen ? C.primary : C.textMuted}
                />
              </Pressable>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Message"
                placeholderTextColor={C.outline}
                selectionColor={C.primary}
                cursorColor={C.primary}
                value={value}
                onChangeText={onChange}
                onSelectionChange={(e) => {
                  selection.current = e.nativeEvent.selection;
                }}
                onFocus={() => {
                  setEmojiOpen(false);
                  setAttachOpen(false);
                }}
                maxLength={CHAT_MAX_LENGTH}
                multiline
                accessibilityLabel={`Message to ${channelLabel}`}
              />
              <Pressable
                onPress={() => {
                  setEmojiOpen(false);
                  setAttachOpen((o) => !o);
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={attachOpen ? 'Close attach' : 'Attach a GIF'}
                accessibilityState={{ expanded: attachOpen }}
                style={styles.inlineBtn}
              >
                <MaterialCommunityIcons
                  name="paperclip"
                  size={22}
                  color={attachOpen ? C.primary : C.textMuted}
                  style={{ transform: [{ rotate: '-45deg' }] }}
                />
              </Pressable>
              {remaining <= 200 && (
                <Text style={[styles.counter, TabularNums, remaining <= 20 && { color: C.statusRed }]} accessibilityLiveRegion="polite">
                  {remaining}
                </Text>
              )}
            </View>
            {mode !== 'idle' && <View style={styles.recOverlay}>{recordingStrip}</View>}
          </View>
          {rightButton}
        </View>
      )}

      {emojiOpen && !disabledReason && mode === 'idle' && (
        <EmojiPanel onPick={insertEmoji} onBackspace={backspace} reduceMotion={reduceMotion} />
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
      paddingBottom: 8,
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
      marginHorizontal: 10,
      borderLeftWidth: 3,
      borderLeftColor: C.primaryLight,
    },
    replySender: { fontFamily: FontFamily.bodySemibold, fontSize: 12, color: C.primary },
    replyText: { fontFamily: FontFamily.bodyRegular, fontSize: 12.5, color: C.textMuted, marginTop: 1 },
    replyClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

    attachTray: {
      marginHorizontal: 10,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.bgSurfaceLow,
      padding: 8,
      gap: 6,
    },
    attachTile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: BorderRadius.md, minHeight: 52 },
    attachIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: C.categoryChat,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachTitle: { fontFamily: FontFamily.bodySemibold, fontSize: 14.5, color: C.textPrimary },
    attachSub: { fontFamily: FontFamily.bodyRegular, fontSize: 12, color: C.textMuted, marginTop: 1 },
    attachNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 8, paddingBottom: 4 },
    attachNoteText: { fontFamily: FontFamily.bodyRegular, fontSize: 11.5, lineHeight: 16, color: C.textMuted, flex: 1 },

    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10 },
    inputSlot: { flex: 1 },
    recOverlay: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
    inputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: C.bgSurfaceLow,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 4,
      minHeight: 48,
    },
    inlineBtn: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' },
    input: {
      flex: 1,
      // Starts as one comfortable line and grows to ~5 lines before scrolling inside.
      minHeight: 46,
      maxHeight: 120,
      paddingVertical: 12,
      paddingHorizontal: 2,
      color: C.textPrimary,
      fontFamily: FontFamily.bodyRegular,
      fontSize: 15.5,
      lineHeight: 20,
      textAlignVertical: 'center',
    },
    counter: {
      position: 'absolute',
      right: 46,
      bottom: 2,
      fontFamily: FontFamily.bodySemibold,
      fontSize: 10,
      color: C.textMuted,
    },
    send: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micActive: { backgroundColor: C.primaryLight },
    lockHint: {
      position: 'absolute',
      bottom: 62,
      alignSelf: 'center',
      left: 6,
      width: 36,
      paddingVertical: 8,
      borderRadius: 18,
      alignItems: 'center',
      backgroundColor: C.bgCard,
      borderWidth: 1,
      borderColor: C.border,
    },

    recStrip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 48,
      borderRadius: 24,
      paddingHorizontal: 14,
      backgroundColor: C.bgSurfaceLow,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    recBin: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
    recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.statusRed },
    recTime: { fontFamily: FontFamily.bodySemibold, fontSize: 15, color: C.textPrimary, minWidth: 40 },
    recBars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 26, overflow: 'hidden' },
    recBar: { width: 3, borderRadius: 2, backgroundColor: C.primary },
    recLimit: { fontFamily: FontFamily.bodySemibold, fontSize: 11, color: C.statusRed },
    slideHint: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    slideText: { fontFamily: FontFamily.bodyRegular, fontSize: 14, color: C.textMuted },

    disabledRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginHorizontal: 10,
      borderRadius: BorderRadius.md,
      backgroundColor: C.bgSurfaceLow,
    },
    disabledText: { fontFamily: FontFamily.bodyRegular, fontSize: 13, color: C.textMuted, flexShrink: 1, textAlign: 'center' },
  });
