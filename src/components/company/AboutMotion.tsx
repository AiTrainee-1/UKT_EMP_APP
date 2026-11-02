import React, { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  bandVisible,
  countUpValue,
  formatIndian,
  makeThreads,
  marqueeOffset,
  revealReached,
  threadFrame,
  type Thread,
} from '../../lib/companyProfile';
import { SKIN } from './aboutSkin';

/*
 * Motion for the About screen, all of it on the UI thread:
 *  - Section + RevealItem: one-shot scroll reveal. Each section records where it sits in the
 *    scroll content; a reaction on the scroll position starts its fade-up the first time it
 *    rises into view. No React state changes while scrolling.
 *  - useSectionClock: a clock (seconds) that only ticks while the screen is focused, the app is
 *    in the foreground, Reduce Motion is off AND its section is on screen. The marquees and the
 *    falling threads are pure functions of their clock, so nothing re-renders while they move.
 *  - CountUp: the only JS-driven animation (a few dozen frames, once, in a leaf <Text>).
 */

export interface ScrollState {
  y: SharedValue<number>;
  /** Height of the scroll viewport. */
  vh: SharedValue<number>;
  /** Show everything at once (Reduce Motion or a screen reader is on). */
  still: boolean;
  /** Reduce Motion on: no movement at all, including press feedback. */
  reduce: boolean;
}

const ScrollContext = createContext<ScrollState | null>(null);
export const ScrollProvider = ScrollContext.Provider;

/** True while looping decoration may run: focused, foreground, motion allowed. */
const MotionContext = createContext(false);
export const MotionProvider = MotionContext.Provider;

interface SectionState {
  progress: SharedValue<number>;
  top: SharedValue<number>;
  height: SharedValue<number>;
}

const SectionContext = createContext<SectionState | null>(null);

export function useScroll(): ScrollState {
  const s = useContext(ScrollContext);
  if (!s) throw new Error('About sections must be inside <ScrollProvider>');
  return s;
}

/** True while a screen reader (TalkBack / VoiceOver) is running. */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => { if (alive) setOn(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return on;
}

const REVEAL_MS = 900;

/**
 * One block of the page. MUST be a direct child of the scroll content, so its layout y is its
 * position in the scroll content.
 */
export function Section({
  children,
  style,
  onReveal,
  onTop,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Called once, the first time the section comes into view (or at once when everything is still). */
  onReveal?: () => void;
  /** Where the section starts in the scroll content (for "scroll to"). */
  onTop?: (y: number) => void;
}) {
  const { y, vh, still } = useScroll();
  const top = useSharedValue(-1);
  const height = useSharedValue(0);
  const progress = useSharedValue(still ? 1 : 0);
  const fired = useSharedValue(still ? 1 : 0);

  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const fire = useCallback(() => onRevealRef.current?.(), []);

  // Reduce Motion / screen reader (which can be detected a moment after the first frame): show it all now.
  useEffect(() => {
    if (!still) return;
    progress.value = 1;
    fired.value = 1;
    fire();
  }, [still, fire, progress, fired]);

  useAnimatedReaction(
    () => revealReached(top.value, y.value, vh.value),
    (hit) => {
      if (!hit || fired.value === 1) return;
      fired.value = 1;
      progress.value = withTiming(1, { duration: REVEAL_MS, easing: Easing.linear });
      scheduleOnRN(fire);
    },
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      top.value = e.nativeEvent.layout.y;
      height.value = e.nativeEvent.layout.height;
      onTop?.(e.nativeEvent.layout.y);
    },
    [top, height, onTop],
  );

  const ctx = useMemo(() => ({ progress, top, height }), [progress, top, height]);
  return (
    <SectionContext.Provider value={ctx}>
      <View style={style} onLayout={onLayout}>
        {children}
      </View>
    </SectionContext.Provider>
  );
}

/** A piece of a section that fades up when the section is revealed; `index` staggers it (90 ms a step). */
export function RevealItem({
  index = 0,
  children,
  style,
  distance = 26,
}: {
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  distance?: number;
}) {
  const section = useContext(SectionContext);
  const shown = useSharedValue(1);
  const progress = section?.progress ?? shown;
  const step = Math.min(index, 4);
  const animated = useAnimatedStyle(() => {
    const local = Math.min(1, Math.max(0, (progress.value * REVEAL_MS - step * 90) / 520));
    const eased = 1 - Math.pow(1 - local, 3);
    return { opacity: eased, transform: [{ translateY: (1 - eased) * distance }] };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Seconds of on-screen motion for the current section (see the note at the top). */
export function useSectionClock(): SharedValue<number> {
  const motion = useContext(MotionContext);
  const { y, vh } = useScroll();
  const section = useContext(SectionContext);
  const everywhereTop = useSharedValue(0);
  const everywhereHeight = useSharedValue(1e7);
  const top = section?.top ?? everywhereTop;
  const height = section?.height ?? everywhereHeight;
  const clock = useSharedValue(0);

  const frames = useFrameCallback((frame) => {
    'worklet';
    if (!bandVisible(top.value, height.value, y.value, vh.value)) return;
    // Capped, so coming back from a long pause does not jump.
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 50);
    clock.value += dt / 1000;
  }, false);

  useEffect(() => {
    frames.setActive(motion);
    return () => frames.setActive(false);
    // `frames` is a stable handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion]);

  return clock;
}

/**
 * An endless strip: the children are drawn twice side by side and the pair slides by one copy's
 * width, then wraps. Decorative, so it is hidden from screen readers (say the same thing in text nearby).
 */
export const Marquee = memo(function Marquee({
  children,
  height,
  speed = 26,
  reverse = false,
  style,
}: {
  children: React.ReactNode;
  height: number;
  /** px per second. */
  speed?: number;
  reverse?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const clock = useSectionClock();
  const copyWidth = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: marqueeOffset(clock.value, speed, copyWidth.value, reverse) }],
  }));
  const onCopyLayout = useCallback(
    (e: LayoutChangeEvent) => {
      copyWidth.value = e.nativeEvent.layout.width;
    },
    [copyWidth],
  );
  return (
    <View
      style={[styles.marqueeWindow, { height }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Animated.View style={[styles.marqueeTrack, animated]}>
        <View style={styles.marqueeCopy} onLayout={onCopyLayout}>
          {children}
        </View>
        <View style={styles.marqueeCopy}>{children}</View>
      </Animated.View>
    </View>
  );
});

const TIP: Record<Thread['tint'], string> = { 0: SKIN.butter, 1: SKIN.peri, 2: SKIN.pink };

const ThreadView = memo(function ThreadView({
  thread,
  clock,
  areaH,
}: {
  thread: Thread;
  clock: SharedValue<number>;
  areaH: SharedValue<number>;
}) {
  const animated = useAnimatedStyle(() => {
    const f = threadFrame(thread, clock.value, areaH.value > 0 ? areaH.value : 600);
    return { opacity: f.opacity, transform: [{ translateX: f.x }, { translateY: f.y }] };
  });
  const tip = TIP[thread.tint];
  const upper = Math.round(thread.length * 0.55);
  return (
    <Animated.View style={[styles.thread, { left: `${(thread.x * 100).toFixed(2)}%` as `${number}%` }, animated]}>
      <View style={[styles.fibre, { height: upper, opacity: 0.35 }]} />
      <View style={[styles.fibre, { height: thread.length - upper }]} />
      <View style={[styles.halo, { backgroundColor: tip }]} />
      <View style={[styles.tip, { backgroundColor: tip }]} />
    </Animated.View>
  );
});

/**
 * Short fibres with a glowing tip drifting down through the section, like loose threads.
 * At most 24 (see makeThreads); they stand still when motion is off.
 */
export const ThreadParticles = memo(function ThreadParticles({ count = 16 }: { count?: number }) {
  const clock = useSectionClock();
  const section = useContext(SectionContext);
  const fallbackH = useSharedValue(600);
  const areaH = section?.height ?? fallbackH;
  const threads = useMemo(() => makeThreads(count), [count]);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {threads.map((t, i) => (
        <ThreadView key={i} thread={t} clock={clock} areaH={areaH} />
      ))}
    </View>
  );
});

/** A number that counts up once `started` turns true (instantly at its final value when everything is still). */
export const CountUp = memo(function CountUp({
  value,
  started,
  still,
  style,
  duration = 1500,
}: {
  value: number;
  started: boolean;
  still: boolean;
  style?: StyleProp<TextStyle>;
  duration?: number;
}) {
  const [shown, setShown] = useState(still ? value : 0);
  useEffect(() => {
    if (still) {
      setShown(value);
      return;
    }
    if (!started) return;
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const p = (Date.now() - t0) / duration;
      setShown(countUpValue(value, p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [started, still, value, duration]);
  return (
    <Text style={style} importantForAccessibility="no" accessibilityElementsHidden>
      {formatIndian(shown)}
    </Text>
  );
});

const SPRING = { damping: 18, stiffness: 260, mass: 0.6 };

/**
 * A card that answers a touch: it sinks a little while pressed and lifts on hover (web).
 * With Reduce Motion on it only dims. Read out as one element with `accessibilityLabel`.
 */
export function PressCard({
  children,
  style,
  outerStyle,
  accessibilityLabel,
  onPress,
  accessibilityRole,
  accessibilityHint,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Style of the touch area around the card (e.g. flex: 1 to fill a grid cell). */
  outerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  onPress?: () => void;
  accessibilityRole?: 'button' | 'link';
  accessibilityHint?: string;
}) {
  const { reduce } = useScroll();
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);
  const dim = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({
    opacity: dim.value,
    transform: [{ translateY: lift.value }, { scale: scale.value }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        if (reduce) dim.value = 0.82;
        else scale.value = withSpring(0.965, SPRING);
      }}
      onPressOut={() => {
        dim.value = 1;
        scale.value = reduce ? 1 : withSpring(1, SPRING);
      }}
      onHoverIn={() => {
        if (!reduce) lift.value = withTiming(-4, { duration: 180 });
      }}
      onHoverOut={() => {
        lift.value = reduce ? 0 : withTiming(0, { duration: 180 });
      }}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityHint={accessibilityHint}
      style={outerStyle}
    >
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  marqueeWindow: { overflow: 'hidden', justifyContent: 'center' },
  // Wide enough for two copies of the longest strip; each copy measures itself.
  marqueeTrack: { flexDirection: 'row', alignItems: 'center', width: 9000 },
  marqueeCopy: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  thread: { position: 'absolute', top: 0, width: 10, marginLeft: -5, alignItems: 'center' },
  fibre: { width: 1.5, borderRadius: 1, backgroundColor: 'rgba(252,240,214,0.55)' },
  halo: { width: 10, height: 10, borderRadius: 5, opacity: 0.22, marginTop: -6 },
  tip: { width: 4, height: 4, borderRadius: 2, marginTop: -7 },
});
