import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { askToTurnOnLocation, locationOffPrompt, readLocationServices } from '../../hooks/useLocationServices';
import { LOCATION_ON_TITLE, locationOffCopy } from '../../lib/locationOff';
import { openLocationSettings } from '../../tracking/platform/intents';
import { percent } from '../../lib/mangaShapes';
import { useReduceMotion } from '../../lib/motionPrefs';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import {
  MangaButton,
  MangaFrame,
  MangaLink,
  MangaPanel,
  Mascot,
  SpeechBubble,
  makeMangaStyles,
  mascotHeight,
  useMangaMotion,
} from '../manga';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** How often to look again while the popup is open (the quick-settings tile does not send the app to the background). */
const RECHECK_MS = 1500;
/** "Location is on" stays this long before the popup closes by itself. */
const ON_HOLD_MS = 950;
const SLASH = 'M12 10 L60 70';
const SLASH_LENGTH = 77;

/**
 * The one "Your location is off" popup (owner 2026-11-25), used by every place that needs the phone's location: the
 * punch slider, Geo-Punch, the On-Duty punch, route tracking. Opened with ensureLocationOn() / promptLocationOn()
 * (src/hooks/useLocationServices.ts); mounted once at the app root.
 *
 * An animated location pin (pulsing, crossed out while location is off), why it is needed, and:
 *   "Turn on location" - Android's own dialog (Location.enableNetworkProviderAsync), one tap to switch it on;
 *   "Open settings"    - the phone's Location settings;
 *   "Not now".
 * It looks again every 1.5 s and whenever the app comes back to the front; once location is on, the pin turns green,
 * the cross goes, and the popup closes by itself and the flow that asked carries on.
 *
 * The look (owner 2026-11-25): the app-update popup's manga card (src/components/manga) - the mascot asking "Where are
 * you?" beside the pin in a halftone panel that turns from red to green once location is on.
 */
export function LocationOffPopup() {
  const open = useSyncExternalStore(locationOffPrompt.subscribe, locationOffPrompt.get);
  if (!open) return null;
  return <Popup key={open.id} reason={open.request.reason} />;
}

const PANEL_H = 170;
const MASCOT_W = 96;
const MASCOT_LEFT = 16;
/** The celebration stars once location is on: clear of the bubble, the mascot and the pin. */
const SPARKLES = [
  { left: 148, top: 18, size: 14, phase: 0 },
  { left: 124, top: 70, size: 11, phase: 0.35 },
  { left: 140, top: 132, size: 12, phase: 0.7 },
];

function Popup({ reason }: { reason: Parameters<typeof locationOffCopy>[0] }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const manga = useThemedStyles(makeMangaStyles);
  const reduce = useReduceMotion();
  const motion = useMangaMotion({ reduce });
  const copy = locationOffCopy(reason);
  const [on, setOn] = useState(false);
  const [asking, setAsking] = useState(false);
  const [declined, setDeclined] = useState(false);
  const closing = useRef(false);

  const finish = (result: boolean) => {
    if (closing.current) return;
    closing.current = true;
    locationOffPrompt.answer(result);
  };

  // Look again now and then, and when the app is back from the settings.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const v = await readLocationServices();
      if (alive && v === true) setOn(true);
    };
    const timer = setInterval(() => { void check(); }, RECHECK_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  // On: show it for a moment, then carry on.
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => finish(true), ON_HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const turnOn = async () => {
    setAsking(true);
    setDeclined(false);
    try {
      const accepted = await askToTurnOnLocation();
      const now = await readLocationServices();
      if (now === true) setOn(true);
      else if (!accepted) setDeclined(true);
    } finally {
      setAsking(false);
    }
  };

  const openSettings = () => {
    if (Platform.OS === 'android') void openLocationSettings();
    else void Linking.openSettings().catch(() => {});
  };

  const android = Platform.OS === 'android';
  const tint = on ? C.statusGreen : C.statusRed;
  // The mascot's face (60, 58 in its 120 x 150 drawing): where the focus lines point.
  const face = { x: MASCOT_LEFT + MASCOT_W / 2, y: PANEL_H + 6 - mascotHeight(MASCOT_W) + (58 * MASCOT_W) / 120 };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => finish(false)}>
      <View style={styles.container}>
        <Animated.View style={[StyleSheet.absoluteFill, manga.backdrop, motion.backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => finish(false)} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[styles.cardWrap, motion.cardStyle]} accessibilityViewIsModal testID="location-off-popup">
          <MangaFrame shadowColor={C.primary}>
            <MangaPanel
              height={PANEL_H}
              paper={on ? C.badgeGreenBg : C.badgeRedBg}
              dots={tint}
              clear={{ cx: '22%', cy: percent(face.y, PANEL_H), r: '42%' }}
              focus={face}
              spin={motion.spin}
              sparkle={reduce || !on ? null : motion.sparkle}
              sparkleSpots={SPARKLES}
              sparkleColors={{ color: C.statusGreen, accent: C.secondary }}
            >
              <Animated.View style={[styles.mascot, motion.mascotStyle]}>
                <Mascot size={MASCOT_W} wave={motion.wave} blink={motion.blink} decorative />
              </Animated.View>

              <SpeechBubble style={styles.bubble} tailLeft={30} animatedStyle={motion.bubbleStyle}>
                <Text style={manga.bubbleText}>{on ? 'Found you!' : 'Where are you?'}</Text>
              </SpeechBubble>

              <View style={styles.pin}>
                <LocationPin on={on} reduce={reduce} />
              </View>
            </MangaPanel>

            <View style={styles.body}>
              <Text style={manga.title} accessibilityRole="header" accessibilityLiveRegion="polite">
                {on ? LOCATION_ON_TITLE : copy.title}
              </Text>
              <Text style={manga.sub}>{on ? 'Thanks! Carrying on…' : copy.body}</Text>

              {!on && (
                <>
                  {declined && (
                    <View style={[manga.note, styles.note]}>
                      <MaterialCommunityIcons name="information-outline" size={16} color={C.textSecondary} />
                      <Text style={[manga.noteText, styles.noteText]}>
                        Still off. You can also turn it on from your phone's quick settings, or with Open settings.
                      </Text>
                    </View>
                  )}
                  {android && (
                    <MangaButton
                      label={asking ? 'Asking…' : 'Turn on location'}
                      icon="crosshairs-gps"
                      onPress={() => { void turnOn(); }}
                      disabled={asking}
                      busy={asking}
                      style={styles.btnWrap}
                      testID="location-off-turn-on"
                    />
                  )}
                  <MangaButton
                    label="Open settings"
                    icon="cog-outline"
                    variant={android ? 'secondary' : 'primary'}
                    size={android ? 'sm' : 'md'}
                    onPress={openSettings}
                    style={android ? styles.btnWrapSecondary : styles.btnWrap}
                    testID="location-off-settings"
                  />
                  <MangaLink label="Not now" onPress={() => finish(false)} style={styles.later} />
                </>
              )}
            </View>
          </MangaFrame>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** A location pin that pulses; crossed out while location is off, green with a tick once it is on. */
function LocationPin({ on, reduce }: { on: boolean; reduce: boolean }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const pulse = useSharedValue(0);
  const sway = useSharedValue(0);
  const slash = useSharedValue(reduce ? 1 : 0);
  const pop = useSharedValue(1);
  const badge = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    slash.value = withDelay(250, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    pulse.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }), -1);
    sway.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    return () => [pulse, sway].forEach((v) => cancelAnimation(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  useEffect(() => {
    if (!on) return;
    if (reduce) {
      slash.value = 0;
      badge.value = 1;
      return;
    }
    cancelAnimation(sway);
    sway.value = withTiming(0, { duration: 200 });
    slash.value = withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) });
    pop.value = withSequence(withTiming(1.18, { duration: 160 }), withSpring(1, { damping: 6, stiffness: 220 }));
    badge.value = withDelay(180, withSpring(1, { damping: 8, stiffness: 200 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const color = on ? C.statusGreen : C.statusRed;
  const ink = C.textPrimary;
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.abs(sway.value) * 3 }, { rotate: `${sway.value * 6}deg` }, { scale: pop.value }],
  }));
  const slashProps = useAnimatedProps(() => ({ strokeDashoffset: SLASH_LENGTH * (1 - slash.value) }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badge.value, transform: [{ scale: badge.value }] }));

  return (
    <View style={styles.art} accessible accessibilityLabel={on ? 'Location is on' : 'Location is off'}>
      <Ring progress={pulse} delay={0} color={color} still={reduce} />
      <Ring progress={pulse} delay={0.5} color={color} still={reduce} />
      <View style={styles.artDisc} />
      <Animated.View style={pinStyle}>
        <Svg width={64} height={72} viewBox="0 0 72 80">
          <Path
            d="M36 6 C22 6 12 16 12 29 C12 46 36 70 36 70 C36 70 60 46 60 29 C60 16 50 6 36 6 Z"
            fill={color}
            stroke={ink}
            strokeWidth={3}
            strokeLinejoin="round"
          />
          <Circle cx={36} cy={29} r={9} fill={C.bgCard} stroke={ink} strokeWidth={2.5} />
          <AnimatedPath
            d={SLASH}
            stroke={ink}
            strokeWidth={11}
            strokeLinecap="round"
            strokeDasharray={`${SLASH_LENGTH} ${SLASH_LENGTH}`}
            animatedProps={slashProps}
          />
          <AnimatedPath
            d={SLASH}
            stroke={C.bgCard}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={`${SLASH_LENGTH} ${SLASH_LENGTH}`}
            animatedProps={slashProps}
          />
          <AnimatedPath
            d={SLASH}
            stroke={C.statusRed}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeDasharray={`${SLASH_LENGTH} ${SLASH_LENGTH}`}
            animatedProps={slashProps}
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.badge, { backgroundColor: C.statusGreen }, badgeStyle]}>
        <MaterialCommunityIcons name="check-bold" size={15} color={C.bgCard} />
      </Animated.View>
    </View>
  );
}

function Ring({ progress, delay, color, still }: { progress: SharedValue<number>; delay: number; color: string; still: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const style = useAnimatedStyle(() => {
    if (still) return { opacity: delay === 0 ? 0.3 : 0, transform: [{ scale: 1.25 }] };
    const t = (progress.value + delay) % 1;
    return { opacity: 0.55 * (1 - t), transform: [{ scale: 0.85 + t * 0.7 }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: color }, style]} />;
}

const makeStyles = (C: Palette) => {
  const ink = C.textPrimary;
  return StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
    cardWrap: { width: '100%', maxWidth: 360 },

    mascot: { position: 'absolute', left: MASCOT_LEFT, bottom: -6 },
    bubble: { position: 'absolute', top: 12, left: 12, maxWidth: 140 },
    pin: { position: 'absolute', right: 0, top: 26 },

    art: { width: 140, height: 124, alignItems: 'center', justifyContent: 'center' },
    artDisc: {
      position: 'absolute',
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: C.bgCard,
      borderWidth: 2.5,
      borderColor: ink,
    },
    ring: { position: 'absolute', width: 92, height: 92, borderRadius: 46, borderWidth: 2.5 },
    badge: {
      position: 'absolute',
      right: 30,
      bottom: 16,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2.5,
      borderColor: ink,
    },

    body: { padding: 18, paddingTop: 16 },
    note: { flexDirection: 'row', gap: 8, marginTop: 14 },
    noteText: { flex: 1 },
    btnWrap: { marginTop: 16, marginRight: 4, marginBottom: 4 },
    btnWrapSecondary: { marginTop: 10, marginRight: 3, marginBottom: 3 },
    later: { marginTop: 6 },
  });
};
