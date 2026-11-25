import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';
import { useReduceMotion } from '../../lib/motionPrefs';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const SIZE = 26;
// The tick, drawn inside the 26 x 26 circle; its length rounded up (for the "drawing" stroke).
const TICK = 'M7.5 13.5 L11.3 17.2 L18.7 9.4';
const TICK_LENGTH = 17;
const SPARKS = 6;

/**
 * The round check of a notification row (owner 2026-11-25: "like ticking a to-do"). Tapping it marks the notification
 * read: the circle squeezes and springs back, fills, the tick draws itself and a few sparks fly out. It animates every
 * time it turns checked - from a tap, from "Mark all read" (`delay` makes those ripple down the list) or from opening the
 * notification. Under Reduce Motion it simply fills. A read notification cannot be unread again (the server has no such
 * call), so a checked one is not a button.
 */
export function TodoCheck({
  checked,
  onPress,
  delay = 0,
  label,
  testID,
}: {
  checked: boolean;
  onPress: () => void;
  /** Wait this long before animating (the "Mark all read" ripple). */
  delay?: number;
  /** What a screen reader hears, e.g. "Mark as read: Leave update". */
  label: string;
  testID?: string;
}) {
  const { C } = useTheme();
  const reduce = useReduceMotion();
  const fill = useSharedValue(checked ? 1 : 0);
  const pop = useSharedValue(1);
  const burst = useSharedValue(0);
  const was = useRef(checked);

  useEffect(() => {
    if (was.current === checked) return;
    was.current = checked;
    if (!checked) {
      // put back after a refused request
      fill.value = withTiming(0, { duration: 160 });
      return;
    }
    if (reduce) {
      fill.value = withTiming(1, { duration: 120 });
      return;
    }
    fill.value = withDelay(delay, withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }));
    pop.value = withDelay(
      delay,
      withSequence(withTiming(0.8, { duration: 90 }), withSpring(1, { damping: 7, stiffness: 260, mass: 0.6 })),
    );
    burst.value = 0;
    burst.value = withDelay(delay + 70, withTiming(1, { duration: 560, easing: Easing.out(Easing.quad) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of `checked` animates
  }, [checked]);

  const boxStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fillStyle = useAnimatedStyle(() => ({
    opacity: interpolate(fill.value, [0, 0.15], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(fill.value, [0, 0.55], [0.2, 1], Extrapolation.CLAMP) }],
  }));
  const tickProps = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(fill.value, [0.35, 1], [TICK_LENGTH, 0], Extrapolation.CLAMP),
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: burst.value > 0 && burst.value < 1 ? 0.45 * (1 - burst.value) : 0,
    transform: [{ scale: 1 + burst.value * 0.9 }],
  }));

  const sparkColors = [C.primary, C.statusGreen, C.secondary];

  return (
    <Pressable
      onPress={checked ? undefined : onPress}
      disabled={checked}
      hitSlop={8}
      style={styles.hit}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={checked ? 'Read' : label}
      testID={testID}
    >
      <Animated.View style={[styles.ripple, { borderColor: C.primary }, ringStyle]} pointerEvents="none" />
      {Array.from({ length: SPARKS }).map((_, i) => (
        <Spark key={i} index={i} burst={burst} color={sparkColors[i % sparkColors.length]} />
      ))}
      <Animated.View style={[styles.box, { borderColor: checked ? C.primary : C.outline }, boxStyle]}>
        <Animated.View style={[styles.fill, { backgroundColor: C.primary }, fillStyle]} />
        {/* inside the 2 px border: the 22 px inner box shows the 26 px drawing's middle */}
        <Svg width={SIZE - 4} height={SIZE - 4} viewBox="2 2 22 22" style={styles.tick} pointerEvents="none">
          <AnimatedPath
            d={TICK}
            stroke={C.onPrimary}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={`${TICK_LENGTH} ${TICK_LENGTH}`}
            animatedProps={tickProps}
          />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}

function Spark({ index, burst, color }: { index: number; burst: SharedValue<number>; color: string }) {
  const angle = (index / SPARKS) * Math.PI * 2 - Math.PI / 2;
  const style = useAnimatedStyle(() => {
    const r = 12 + burst.value * 12;
    const live = burst.value > 0 && burst.value < 1;
    return {
      opacity: live ? 1 - burst.value : 0,
      transform: [
        { translateX: Math.cos(angle) * r },
        { translateY: Math.sin(angle) * r },
        { scale: live ? 1 - burst.value * 0.6 : 0 },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.spark, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  hit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { ...StyleSheet.absoluteFill, borderRadius: SIZE / 2 },
  tick: { position: 'absolute', top: 0, left: 0 },
  ripple: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2 },
  spark: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5 },
});

/** The same circle, still, for the loading rows. */
export function TodoCheckPlaceholder() {
  const { C } = useTheme();
  return (
    <View style={styles.hit}>
      <View style={[styles.box, { borderColor: C.outlineVariant }]} />
    </View>
  );
}
