import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { Halftone, Sparkles, SpinningFocusLines, type HalftoneClear, type SparkleSpot } from './PanelArt';

/*
 * The manga card kit (owner 2026-11-25): the pieces of the app-update popup's 2D anime / manga look, shared by the app
 * tour, the "turn on notifications", "location is off" and "permission needed" popups.
 *
 *   useMangaMotion  - the entrance (pop with a bounce, mascot hop, bubble pop) and the idle loops (wave, blink, focus
 *                     lines, sparkles); under Reduce Motion everything just fades in and stays still.
 *   MangaFrame      - the bordered card on its offset "hard shadow".
 *   MangaPanel      - the top panel: tint, halftone dots, focus lines, sparkles.
 *   SpeechBubble    - a bubble with a tail.
 *   MangaButton     - a pill on a hard shadow that presses into it.
 *   MangaLink       - the underlined "Later" / "Not now".
 *   makeMangaStyles - shared text styles (the slanted title, the bubble text).
 *
 * Ink (the outlines) is the theme's text colour, so the cards work in light and dark mode.
 */

// ── motion ──────────────────────────────────────────────────────────────────

export type MangaArm = 'wave' | 'point' | 'still';

export interface MangaMotionOptions {
  reduce: boolean;
  /** 'wave' the update card's hello, 'point' little pokes upwards ("look here"), 'still' arm at rest. */
  arm?: MangaArm;
  /** The card starts at this scale (0.55 on the update card), this rotation (degrees) and this vertical offset. */
  fromScale?: number;
  fromRotate?: number;
  fromY?: number;
  /** How far below its place the mascot starts its hop. */
  hopFrom?: number;
  hopDelay?: number;
  bubbleDelay?: number;
}

/** The entrance and idle loops of a manga card. Starts when the component mounts (key it to restart). */
export function useMangaMotion({
  reduce,
  arm = 'wave',
  fromScale = 0.55,
  fromRotate = -7,
  fromY = 0,
  hopFrom = 70,
  hopDelay = 220,
  bubbleDelay = 480,
}: MangaMotionOptions) {
  const enter = useSharedValue(0);
  const shown = useSharedValue(0);
  const hop = useSharedValue(0);
  const bubble = useSharedValue(0);
  const bob = useSharedValue(0);
  const wave = useSharedValue(0);
  const blink = useSharedValue(1);
  const spin = useSharedValue(0);
  const glow = useSharedValue(0);
  const sparkle = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      shown.value = withTiming(1, { duration: 220 });
      enter.value = 1;
      hop.value = 1;
      bubble.value = 1;
      return;
    }
    shown.value = withTiming(1, { duration: 160 });
    enter.value = withSpring(1, { damping: 9, stiffness: 170, mass: 0.8 });
    hop.value = withDelay(hopDelay, withSpring(1, { damping: 8, stiffness: 150 }));
    bubble.value = withDelay(bubbleDelay, withSpring(1, { damping: 7, stiffness: 190 }));
    bob.value = withDelay(900, withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true));
    if (arm === 'wave') {
      wave.value = withDelay(
        600,
        withRepeat(
          withSequence(
            withTiming(-24, { duration: 200 }),
            withTiming(10, { duration: 200 }),
            withTiming(-24, { duration: 200 }),
            withTiming(10, { duration: 200 }),
            withTiming(0, { duration: 200 }),
            withTiming(0, { duration: 1500 }),
          ),
          -1,
        ),
      );
    } else if (arm === 'point') {
      // two quick pokes up towards what the card is about, then a rest
      wave.value = withDelay(
        500,
        withRepeat(
          withSequence(
            withTiming(-16, { duration: 140 }),
            withTiming(-2, { duration: 160 }),
            withTiming(-16, { duration: 140 }),
            withTiming(0, { duration: 200 }),
            withTiming(0, { duration: 1300 }),
          ),
          -1,
        ),
      );
    }
    blink.value = withRepeat(
      withSequence(withDelay(2400, withTiming(0.08, { duration: 80 })), withTiming(1, { duration: 120 })),
      -1,
    );
    spin.value = withRepeat(withTiming(1, { duration: 30000, easing: Easing.linear }), -1);
    glow.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    sparkle.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1);
    return () => {
      [enter, hop, bubble, bob, wave, blink, spin, glow, sparkle].forEach((v) => cancelAnimation(v));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateY: (1 - enter.value) * fromY },
      { scale: fromScale + (1 - fromScale) * enter.value },
      { rotate: `${(1 - enter.value) * fromRotate}deg` },
    ],
  }));
  const mascotStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - hop.value) * hopFrom - bob.value * 4 }, { scale: 0.7 + 0.3 * hop.value }],
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, bubble.value * 1.4),
    transform: [{ scale: bubble.value }, { rotate: `${(1 - bubble.value) * 12}deg` }],
  }));

  return { shown, enter, hop, bubble, bob, wave, blink, spin, glow, sparkle, backdropStyle, cardStyle, mascotStyle, bubbleStyle };
}

export type MangaMotion = ReturnType<typeof useMangaMotion>;

type AnimatedViewStyle = React.ComponentProps<typeof Animated.View>['style'];

// ── the card ────────────────────────────────────────────────────────────────

/**
 * The bordered card on its offset "hard shadow". Put it inside the (animated) view that sizes and places the card: the
 * shadow is drawn behind the card, `offset` points down and to the right.
 */
export function MangaFrame({
  shadowColor,
  radius = 20,
  offset = 7,
  style,
  children,
}: {
  shadowColor: string;
  radius?: number;
  offset?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { C } = useTheme();
  const ink = C.textPrimary;
  return (
    <>
      {/* the comic "hard shadow" */}
      <View
        style={{
          ...StyleSheet.absoluteFill,
          top: offset,
          left: offset,
          right: -offset,
          bottom: -offset,
          borderRadius: radius,
          backgroundColor: shadowColor,
          borderWidth: 3,
          borderColor: ink,
        }}
      />
      <View style={[{ backgroundColor: C.bgCard, borderRadius: radius, borderWidth: 3, borderColor: ink, overflow: 'hidden' }, style]}>
        {children}
      </View>
    </>
  );
}

/** The card's top panel: the tint, halftone dots, focus lines turning around `focus`, and (optionally) sparkles. */
export function MangaPanel({
  height,
  paper,
  dots,
  clear,
  focus,
  spin,
  sparkle,
  sparkleSpots,
  sparkleColors,
  style,
  children,
}: {
  height: number;
  /** The panel's tint. */
  paper: string;
  /** The halftone dots' colour. */
  dots: string;
  clear?: HalftoneClear;
  /** Where the focus lines point (the mascot's face, usually), in panel points. */
  focus: { x: number; y: number };
  spin: SharedValue<number>;
  /** Pass the loop to show sparkles (leave it out under Reduce Motion). */
  sparkle?: SharedValue<number> | null;
  sparkleSpots?: readonly SparkleSpot[];
  sparkleColors?: { color: string; accent: string };
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const { C } = useTheme();
  const ink = C.textPrimary;
  return (
    <View style={[{ height, overflow: 'hidden', borderBottomWidth: 3, borderBottomColor: ink, backgroundColor: paper }, style]}>
      <Halftone ink={dots} paper={paper} clear={clear} />
      <SpinningFocusLines color={ink} center={focus} spin={spin} />
      {sparkle && (
        <Sparkles
          progress={sparkle}
          color={sparkleColors?.color ?? C.secondary}
          accent={sparkleColors?.accent ?? C.primary}
          spots={sparkleSpots}
        />
      )}
      {children}
    </View>
  );
}

// ── the speech bubble ───────────────────────────────────────────────────────

export type BubbleTail = 'bottom-left' | 'top-left' | 'none';

/**
 * A speech bubble. The tail sits `tailLeft` points in from the left edge, under the bubble pointing down-left (the
 * update card's) or above it pointing up-left (towards a mascot above the bubble).
 */
export function SpeechBubble({
  tail = 'bottom-left',
  tailLeft = 14,
  style,
  animatedStyle,
  children,
  ...rest
}: {
  tail?: BubbleTail;
  tailLeft?: number;
  style?: StyleProp<ViewStyle>;
  animatedStyle?: AnimatedViewStyle;
  children: React.ReactNode;
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeMangaStyles);
  const ink = C.textPrimary;
  return (
    <Animated.View style={[styles.bubble, style, animatedStyle]} {...rest}>
      {children}
      {tail !== 'none' && (
        <Svg
          width={24}
          height={16}
          style={[
            { position: 'absolute', left: tailLeft },
            tail === 'bottom-left' ? { bottom: -14.5 } : { top: -14.5, transform: [{ scaleY: -1 }] },
          ]}
          pointerEvents="none"
        >
          <Path d="M3 0 L23 0 L5 15 Z" fill={C.bgCard} />
          <Path d="M3 1 L5 15 L23 1" stroke={ink} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
        </Svg>
      )}
    </Animated.View>
  );
}

// ── buttons ─────────────────────────────────────────────────────────────────

/**
 * A pill on a hard ink shadow that presses down into it. `primary` is filled with the brand colour (text onPrimary);
 * `secondary` is a card-coloured pill with ink text. `md` is the update card's size, `sm` a compact one.
 */
export function MangaButton({
  label,
  icon,
  iconRight = false,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  busy = false,
  style,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  /** A MaterialCommunityIcons name. */
  icon?: string;
  iconRight?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'sm';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeMangaStyles);
  const primary = variant === 'primary';
  const sm = size === 'sm';
  const textColor = primary ? C.onPrimary : C.textPrimary;
  const iconColor = primary ? C.onPrimary : C.primary;
  const iconEl = icon ? <MaterialCommunityIcons name={icon as any} size={sm ? 17 : 19} color={iconColor} /> : null;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy }}
      style={style}
      testID={testID}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.btnShadow, sm && styles.btnShadowSm, pressed && styles.btnShadowPressed]} />
          <View
            style={[
              styles.btn,
              sm && styles.btnSm,
              !primary && styles.btnSecondary,
              pressed && (sm ? styles.btnPressedSm : styles.btnPressed),
              busy && styles.btnBusy,
            ]}
          >
            {!iconRight && iconEl}
            <Text style={[styles.btnText, sm && styles.btnTextSm, { color: textColor }]} numberOfLines={1}>
              {label}
            </Text>
            {iconRight && iconEl}
          </View>
        </>
      )}
    </Pressable>
  );
}

/** The quiet underlined choice under the buttons ("Later", "Not now"). */
export function MangaLink({
  label,
  onPress,
  testID,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(makeMangaStyles);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[styles.link, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

// ── shared styles ───────────────────────────────────────────────────────────

export const makeMangaStyles = (C: Palette) => {
  const ink = C.textPrimary;
  return StyleSheet.create({
    /** The dimmed screen behind a popup. */
    backdrop: { backgroundColor: 'rgba(15,23,42,0.66)' },
    bubble: {
      backgroundColor: C.bgCard,
      borderWidth: 2.5,
      borderColor: ink,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    bubbleText: { color: ink, fontFamily: FontFamily.displayBold, fontSize: 14, lineHeight: 19 },
    /** The big slanted manga title. */
    title: {
      color: ink,
      fontFamily: FontFamily.displayBold,
      fontSize: 25,
      letterSpacing: -0.3,
      transform: [{ skewX: '-6deg' }],
    },
    sub: { color: C.textSecondary, fontFamily: FontFamily.bodyRegular, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
    /** A note in a dashed box (release notes, "still off"). */
    note: {
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: C.outline,
      borderRadius: BorderRadius.md,
      padding: 10,
      backgroundColor: C.bgSurfaceLow,
    },
    noteText: { color: C.textSecondary, fontFamily: FontFamily.bodyRegular, fontSize: 12.5, lineHeight: 17 },

    btnShadow: {
      ...StyleSheet.absoluteFill,
      top: 4,
      left: 4,
      right: -4,
      bottom: -4,
      borderRadius: BorderRadius.full,
      backgroundColor: ink,
    },
    btnShadowSm: { top: 3, left: 3, right: -3, bottom: -3 },
    btnShadowPressed: { top: 1, left: 1, right: -1, bottom: -1 },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 50,
      borderRadius: BorderRadius.full,
      borderWidth: 2.5,
      borderColor: ink,
      backgroundColor: C.primary,
    },
    btnSm: { minHeight: 44, gap: 6, paddingHorizontal: 14 },
    btnSecondary: { backgroundColor: C.bgCard },
    btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }] },
    btnPressedSm: { transform: [{ translateX: 2 }, { translateY: 2 }] },
    btnBusy: { opacity: 0.75 },
    btnText: { color: C.onPrimary, fontFamily: FontFamily.displayBold, fontSize: 15.5, letterSpacing: 0.2 },
    btnTextSm: { fontSize: 14 },
    link: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, marginTop: 2 },
    linkText: { color: C.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 13.5, textDecorationLine: 'underline', textAlign: 'center' },
  });
};
