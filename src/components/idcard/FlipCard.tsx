import React, { useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import { View, Pressable, StyleSheet, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { IdCardData, IdCardTemplate } from '../../hooks/useIdCard';
import { idCardHeight } from '../../lib/idCard';
import { ProductionBack, ProductionFront, StaffBack, StaffFront, faceDescription } from './IdCardFaces';

export interface FlipCardHandle {
  flip: () => void;
}

interface Props {
  data: IdCardData;
  template: IdCardTemplate;
  qrValue: string;
  isProduction: boolean;
  width: number;
  inactiveLabel: string | null;
  reduceMotion: boolean;
  onSideChange?: (side: 'front' | 'back') => void;
}

/**
 * The ID card with a real 3D turn: perspective, a slight lift at the half-way point, a shadow
 * that narrows as the card turns edge-on, and a light sheen that sweeps across once it lands.
 * With "Reduce motion" on, the sides simply swap.
 *
 * For screen readers the card is ONE button that reads out the side being shown; the hidden
 * side is not in the accessibility tree.
 */
export const FlipCard = forwardRef<FlipCardHandle, Props>(function FlipCard(
  { data, template, qrValue, isProduction, width, inactiveLabel, reduceMotion, onSideChange },
  ref,
) {
  const height = idCardHeight(width, isProduction);
  const rot = useSharedValue(0); // 0 = front, 180 = back
  const sheen = useSharedValue(0);
  const [side, setSide] = useState<'front' | 'back'>('front');

  const playSheen = (delay: number) => {
    if (reduceMotion) return;
    sheen.value = 0;
    sheen.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }));
  };

  // A first sheen when the card appears, so it reads as a "live" credential rather than a picture.
  useEffect(() => {
    playSheen(450);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flip = () => {
    const next = side === 'front' ? 'back' : 'front';
    const to = next === 'back' ? 180 : 0;
    if (reduceMotion) {
      rot.value = to;
    } else {
      rot.value = withSpring(to, { damping: 16, stiffness: 110, mass: 1 });
      playSheen(520);
    }
    setSide(next);
    onSideChange?.(next);
    AccessibilityInfo.announceForAccessibility(next === 'back' ? 'Showing the back of the card' : 'Showing the front of the card');
  };

  useImperativeHandle(ref, () => ({ flip }));

  const frontStyle = useAnimatedStyle(() => ({
    opacity: rot.value < 90 ? 1 : 0,
    transform: [
      { perspective: 1200 },
      { rotateY: `${rot.value}deg` },
      { scale: interpolate(rot.value, [0, 90, 180], [1, 0.93, 1]) },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: rot.value >= 90 ? 1 : 0,
    transform: [
      { perspective: 1200 },
      { rotateY: `${rot.value - 180}deg` },
      { scale: interpolate(rot.value, [0, 90, 180], [1, 0.93, 1]) },
    ],
  }));
  const shadowStyle = useAnimatedStyle(() => {
    const edge = Math.abs(Math.sin((rot.value * Math.PI) / 180));
    return {
      opacity: 0.22 - edge * 0.1,
      transform: [{ scaleX: 1 - edge * 0.45 }],
    };
  });
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheen.value, [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
    transform: [{ translateX: interpolate(sheen.value, [0, 1], [-width, width]) }, { rotate: '18deg' }],
  }));

  const Front = isProduction ? ProductionFront : StaffFront;
  const Back = isProduction ? ProductionBack : StaffBack;
  const faceProps = { data, template, qrValue, width, inactiveLabel };

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onPress={flip}
        accessibilityRole="button"
        accessibilityLabel={faceDescription(side, data, inactiveLabel)}
        accessibilityHint={side === 'front' ? 'Double tap to turn the card over and see the back' : 'Double tap to turn the card back to the front'}
        style={({ pressed }) => [{ width, height }, pressed && { transform: [{ scale: 0.985 }] }]}
      >
        <Animated.View
          style={[styles.face, frontStyle]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          pointerEvents="none"
        >
          <Front {...faceProps} />
        </Animated.View>
        <Animated.View
          style={[styles.face, backStyle]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          pointerEvents="none"
        >
          <Back {...faceProps} />
        </Animated.View>

        {/* Sheen: clipped to the card's rounded corners, drawn over whichever side is showing. */}
        <View style={[styles.sheenClip, { width, height }]} pointerEvents="none">
          <Animated.View style={[styles.sheenBand, { height: height * 1.6, top: -height * 0.3 }, sheenStyle]}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </Pressable>

      <Animated.View style={[styles.shadow, { width: width * 0.82 }, shadowStyle]} pointerEvents="none" />
    </View>
  );
});

const styles = StyleSheet.create({
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    backfaceVisibility: 'hidden',
    borderRadius: 18,
    // A soft lift for the card itself (the floor shadow below does the rest).
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  sheenClip: { position: 'absolute', top: 0, left: 0, borderRadius: 18, overflow: 'hidden' },
  sheenBand: { position: 'absolute', left: 0, width: 70 },
  shadow: {
    height: 14,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    marginTop: 14,
  },
});
