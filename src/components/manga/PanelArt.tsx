import React, { useId, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { burstPath } from '../../lib/mangaShapes';

/*
 * The manga panel's background art (owner 2026-11-25, first drawn for the app-update popup): halftone dots, "focus lines"
 * pointing at the subject, twinkling sparkles, and a spiky burst behind an icon.
 */

/** An id that is safe inside an SVG `url(#...)` (React's useId has colons / guillemets in it). */
function useSvgId(prefix: string): string {
  const raw = useId();
  return `${prefix}${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/** Where the glow that clears the dots sits (SVG percentages). The update card's default is around its mascot. */
export interface HalftoneClear {
  cx: string;
  cy: string;
  r: string;
}

const DEFAULT_CLEAR: HalftoneClear = { cx: '30%', cy: '62%', r: '45%' };

/** Halftone dots over the panel's tint, cleared around the subject by a soft glow. */
export function Halftone({ ink, paper, clear = DEFAULT_CLEAR }: { ink: string; paper: string; clear?: HalftoneClear }) {
  const dots = useSvgId('dots');
  const glow = useSvgId('clear');
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={dots} x={0} y={0} width={9} height={9} patternUnits="userSpaceOnUse">
          <Circle cx={4.5} cy={4.5} r={1.5} fill={ink} />
        </Pattern>
        <RadialGradient id={glow} cx={clear.cx} cy={clear.cy} r={clear.r}>
          <Stop offset="0" stopColor={paper} stopOpacity={1} />
          <Stop offset="0.7" stopColor={paper} stopOpacity={0.85} />
          <Stop offset="1" stopColor={paper} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={paper} />
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${dots})`} opacity={0.22} />
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${glow})`} />
    </Svg>
  );
}

export const FOCUS_LINES_SIZE = 560;

/** Manga "focus lines": thin wedges pointing at the middle. Drawn once (a fixed pseudo-random pattern). */
export function FocusLines({ color }: { color: string }) {
  const d = useMemo(() => {
    const size = FOCUS_LINES_SIZE;
    const c = size / 2;
    let seed = 7;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const parts: string[] = [];
    const count = 46;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.08;
      const inner = 78 + rand() * 40;
      const outer = c;
      const w = 0.012 + rand() * 0.02;
      const p = (r: number, ang: number) => `${(c + Math.cos(ang) * r).toFixed(1)} ${(c + Math.sin(ang) * r).toFixed(1)}`;
      parts.push(`M${p(inner, a)} L${p(outer, a - w)} L${p(outer, a + w)} Z`);
    }
    return parts.join(' ');
  }, []);
  return (
    <Svg width={FOCUS_LINES_SIZE} height={FOCUS_LINES_SIZE} pointerEvents="none">
      <Path d={d} fill={color} opacity={0.09} />
    </Svg>
  );
}

/** The focus lines centred on a point of the panel, turning slowly with `spin` (0-1 = one turn). */
export function SpinningFocusLines({ color, center, spin }: { color: string; center: { x: number; y: number }; spin: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const half = FOCUS_LINES_SIZE / 2;
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: FOCUS_LINES_SIZE, height: FOCUS_LINES_SIZE, left: center.x - half, top: center.y - half },
        style,
      ]}
      pointerEvents="none"
    >
      <FocusLines color={color} />
    </Animated.View>
  );
}

const SPARKLE = 'M8 0 L9.8 6.2 L16 8 L9.8 9.8 L8 16 L6.2 9.8 L0 8 L6.2 6.2 Z';

export interface SparkleSpot {
  left: number;
  top: number;
  size: number;
  /** 0-1: when in the loop this star lights up. */
  phase: number;
}

/** The update card's four stars. */
export const DEFAULT_SPARKLE_SPOTS: readonly SparkleSpot[] = [
  { left: 16, top: 22, size: 16, phase: 0 },
  { left: 150, top: 92, size: 12, phase: 0.3 },
  { left: 132, top: 30, size: 10, phase: 0.55 },
  { left: 262, top: 128, size: 14, phase: 0.75 },
];

/** Four-point stars that twinkle in turn (`progress` loops 0-1). */
export function Sparkles({
  progress,
  color,
  accent,
  spots = DEFAULT_SPARKLE_SPOTS,
}: {
  progress: SharedValue<number>;
  color: string;
  accent: string;
  spots?: readonly SparkleSpot[];
}) {
  return (
    <>
      {spots.map((s, i) => (
        <Sparkle key={i} spot={s} progress={progress} color={i % 2 ? accent : color} />
      ))}
    </>
  );
}

function Sparkle({ spot, progress, color }: { spot: SparkleSpot; progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => {
    // each star is lit for a third of the loop, starting at its own phase
    const t = (progress.value - spot.phase + 1) % 1;
    const lit = t < 0.33 ? Math.sin((t / 0.33) * Math.PI) : 0;
    return { opacity: lit, transform: [{ scale: 0.3 + lit * 0.7 }, { rotate: `${t * 180}deg` }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: spot.left, top: spot.top }, style]}>
      <Svg width={spot.size} height={spot.size} viewBox="0 0 16 16">
        <Path d={SPARKLE} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/**
 * An icon on a manga "burst" (the spiky shape behind a shout): a coloured star with an ink outline and a round face for
 * the icon. Used for the bell of the notification popup, the permission icons and the tour's illustrated steps.
 */
export function IconBurst({
  icon,
  size,
  color,
  face,
  ink,
  iconColor,
  points = 12,
  style,
  children,
}: {
  /** A MaterialCommunityIcons name (ignored when `children` draws the middle). */
  icon?: string;
  size: number;
  /** The burst's fill. */
  color: string;
  /** The round middle's fill. */
  face: string;
  ink: string;
  iconColor?: string;
  points?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const c = size / 2;
  const d = useMemo(() => burstPath(c, c, c - 2, c * 0.74, points), [c, points]);
  const faceSize = Math.round(size * 0.56);
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]} pointerEvents="none">
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Path d={d} fill={color} stroke={ink} strokeWidth={2.2} strokeLinejoin="round" />
      </Svg>
      <View
        style={{
          width: faceSize,
          height: faceSize,
          borderRadius: faceSize / 2,
          backgroundColor: face,
          borderWidth: 2.2,
          borderColor: ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children ?? <MaterialCommunityIcons name={icon as any} size={Math.round(faceSize * 0.58)} color={iconColor ?? color} />}
      </View>
    </View>
  );
}
