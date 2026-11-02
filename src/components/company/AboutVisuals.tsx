import React, { memo, useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { SKIN } from './aboutSkin';
import { WORDMARKS } from './wordmarkPaths';
import type { SegmentKey } from '../../lib/companyProfile';

/*
 * Static, decorative visuals for the About screen: drawn once, never re-rendered by the motion,
 * and hidden from screen readers. No images anywhere: type, shapes, gradients and SVG only.
 */

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** SVG ids must be plain (useId gives ":r1:"). */
function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** The fixed page canvas: midnight-indigo gradient with a very faint square grid. */
export const PageBackdrop = memo(function PageBackdrop({ width, height }: { width: number; height: number }) {
  const cell = 32;
  let d = '';
  for (let x = cell; x < width; x += cell) d += `M${x} 0V${height}`;
  for (let y = cell; y < height; y += cell) d += `M0 ${y}H${width}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" {...hidden}>
      <LinearGradient colors={[SKIN.ink0, SKIN.ink1, SKIN.ink2]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Path d={d} stroke="rgba(185,188,255,0.055)" strokeWidth={1} />
      </Svg>
    </View>
  );
});

/** A soft radial glow (royal blue or crimson), positioned by the caller. */
export const Glow = memo(function Glow({
  size,
  color,
  opacity = 0.5,
  style,
}: {
  size: number;
  color: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = useSvgId('glow');
  return (
    <View style={[{ position: 'absolute', width: size, height: size }, style]} pointerEvents="none" {...hidden}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
});

/**
 * A giant outlined wordmark (thin stroke, no fill) drawn from the display font's real letter
 * outlines, so it looks the same on every phone. `strokePx` is the on-screen stroke width.
 */
export const OutlinedWordmark = memo(function OutlinedWordmark({
  word,
  width,
  color,
  fadeTo,
  strokePx = 1.2,
  style,
}: {
  word: keyof typeof WORDMARKS;
  width: number;
  color: string;
  /** Optional second colour: the stroke fades from `color` (top) to this (bottom). */
  fadeTo?: string;
  strokePx?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = useSvgId('wm');
  const w = WORDMARKS[word];
  const vbW = Number(w.viewBox.split(' ')[2]);
  const height = Math.round(width / w.aspect);
  const stroke = (strokePx * vbW) / width;
  return (
    <View style={[{ width, height }, style]} pointerEvents="none" {...hidden}>
      <Svg width={width} height={height} viewBox={w.viewBox}>
        {fadeTo ? (
          <Defs>
            <SvgLinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={1} />
              <Stop offset="1" stopColor={fadeTo} stopOpacity={1} />
            </SvgLinearGradient>
          </Defs>
        ) : null}
        <Path d={w.d} fill="none" stroke={fadeTo ? `url(#${id})` : color} strokeWidth={stroke} strokeLinejoin="round" />
      </Svg>
    </View>
  );
});

/** A dashed "stitch" rule. */
export const StitchLine = memo(function StitchLine({ width, color, style }: { width: number; color: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width, height: 8 }, style]} pointerEvents="none" {...hidden}>
      <Svg width={width} height={8}>
        <Line x1={0} y1={4} x2={width} y2={4} stroke={color} strokeWidth={1.5} strokeDasharray="7 5" strokeLinecap="round" />
      </Svg>
    </View>
  );
});

// ─── Line icons (64 x 64) ────────────────────────────────────────────────────

const TEE =
  'M23 10L13 14L5 24L12 31L18 27L18 55L46 55L46 27L52 31L59 24L51 14L41 10C39 15 35.5 17 32 17C28.5 17 25 15 23 10Z';
const TEE_COLLAR = 'M23 10C25 15 28.5 17 32 17C35.5 17 39 15 41 10';
const DRESS =
  'M25 7L24 14C24 19 25 23 27 26L15 56L49 56L37 26C39 23 40 19 40 14L39 7C36 11 34 12 32 12C30 12 28 11 25 7Z';
const ROMPER =
  'M24 12L17 15L11 22L16 27L21 24L21 42C21 46 22 50 22 54L30 54L32 46L34 54L42 54C42 50 43 46 43 42L43 24L48 27L53 22L47 15L40 12C38.5 15.5 35.5 17 32 17C28.5 17 25.5 15.5 24 12Z';
const ROMPER_COLLAR = 'M24 12C25.5 15.5 28.5 17 32 17C35.5 17 38.5 15.5 40 12';

/** Simple line drawings for the three segments: a tee (men), a dress (women), a romper (children). */
export const SegmentIcon = memo(function SegmentIcon({
  kind,
  size,
  color,
  accent,
}: {
  kind: SegmentKey;
  size: number;
  color: string;
  accent: string;
}) {
  const sw = 2.2;
  return (
    <View {...hidden} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {kind === 'men' && (
          <>
            <Path d={TEE} fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
            <Path d={TEE_COLLAR} fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" />
            <Line x1={21} y1={49} x2={43} y2={49} stroke={accent} strokeWidth={1.6} strokeDasharray="3 3" strokeLinecap="round" />
          </>
        )}
        {kind === 'women' && (
          <>
            <Path d={DRESS} fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
            <Line x1={27} y1={26} x2={37} y2={26} stroke={accent} strokeWidth={sw} strokeLinecap="round" />
            <Line x1={19} y1={50} x2={45} y2={50} stroke={accent} strokeWidth={1.6} strokeDasharray="3 3" strokeLinecap="round" />
          </>
        )}
        {kind === 'children' && (
          <>
            <Path d={ROMPER} fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
            <Path d={ROMPER_COLLAR} fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" />
            <Circle cx={32} cy={25} r={1.8} fill={accent} />
            <Circle cx={32} cy={31} r={1.8} fill={accent} />
            <Circle cx={32} cy={37} r={1.8} fill={accent} />
          </>
        )}
      </Svg>
    </View>
  );
});

/** Quality chain icons: a yarn ball, a magnifier with a tick (checked at every stage), a garment. */
export const QualityIcon = memo(function QualityIcon({
  kind,
  size,
  color,
  accent,
}: {
  kind: 'yarn' | 'check' | 'garment';
  size: number;
  color: string;
  accent: string;
}) {
  const sw = 2.4;
  return (
    <View {...hidden} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {kind === 'yarn' && (
          <>
            <Circle cx={30} cy={30} r={18} fill="none" stroke={color} strokeWidth={sw} />
            <Path d="M15 22C23 18 37 20 46 28" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
            <Path d="M12.5 31C23 27 37 30 47 38" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
            <Path d="M17 42C25 37 35 39 42 44" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
            <Path d="M47 39C54 43 57 49 52 56" fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" />
          </>
        )}
        {kind === 'check' && (
          <>
            <Circle cx={28} cy={28} r={15} fill="none" stroke={color} strokeWidth={sw} />
            <Line x1={39} y1={39} x2={52} y2={52} stroke={color} strokeWidth={4.5} strokeLinecap="round" />
            <Path d="M21 28.5L26 33.5L35.5 23" fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {kind === 'garment' && (
          <>
            <Path d={TEE} fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
            <Path d={TEE_COLLAR} fill="none" stroke={accent} strokeWidth={sw} strokeLinecap="round" />
          </>
        )}
      </Svg>
    </View>
  );
});

/** A stitched seal with a tick, for the certificate chips. */
export const Seal = memo(function Seal({ size, color, accent }: { size: number; color: string; accent: string }) {
  return (
    <View {...hidden} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={10.5} fill="none" stroke={color} strokeWidth={1.3} strokeDasharray="2.2 2" />
        <Path d="M7.5 12.3L10.6 15.2L16.5 9" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
});

/** A dashed thread between two quality-chain nodes, with a small needle eye in the middle. */
export const ChainLink = memo(function ChainLink({ color }: { color: string }) {
  return (
    <View style={{ flex: 1, height: 12, justifyContent: 'center' }} {...hidden} pointerEvents="none">
      <Svg width="100%" height={12}>
        <Line x1="0" y1="6" x2="100%" y2="6" stroke={color} strokeWidth={1.5} strokeDasharray="4 4" />
      </Svg>
    </View>
  );
});

/**
 * The thread the process cards hang from: one sagging line across the whole row, a knot above
 * each card and a short drop into the card's tag hole.
 */
export const ProcessThread = memo(function ProcessThread({
  count,
  cardW,
  gap,
  padX,
  knotY,
  holeY,
}: {
  count: number;
  cardW: number;
  gap: number;
  padX: number;
  /** Where the thread runs. */
  knotY: number;
  /** Centre of each card's tag hole (in the same coordinates). */
  holeY: number;
}) {
  const width = padX * 2 + count * cardW + (count - 1) * gap;
  const height = holeY + 8;
  const knots = Array.from({ length: count }, (_, i) => padX + i * (cardW + gap) + cardW / 2);
  const sag = 12;
  let d = `M0 ${knotY}`;
  let prev = 0;
  for (const x of [...knots, width]) {
    d += `Q${(prev + x) / 2} ${knotY + sag} ${x} ${knotY}`;
    prev = x;
  }
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width, height, zIndex: 2 }} pointerEvents="none" {...hidden}>
      <Svg width={width} height={height}>
        <Path d={d} fill="none" stroke={SKIN.pink} strokeOpacity={0.75} strokeWidth={1.6} />
        {knots.map((x) => (
          <React.Fragment key={x}>
            <Line x1={x} y1={knotY} x2={x} y2={holeY} stroke={SKIN.pink} strokeOpacity={0.75} strokeWidth={1.4} strokeDasharray="3 3" />
            <Circle cx={x} cy={holeY} r={5} fill={SKIN.ink1} stroke="rgba(252,240,214,0.5)" strokeWidth={1.2} />
            <Circle cx={x} cy={knotY} r={4.5} fill={SKIN.butter} />
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
});

/** Big faint rings (a yarn cone seen from above) for the royal-indigo block. */
export const Rings = memo(function Rings({ size, color, style }: { size: number; color: string; style?: StyleProp<ViewStyle> }) {
  const c = size / 2;
  return (
    <View style={[{ position: 'absolute', width: size, height: size }, style]} pointerEvents="none" {...hidden}>
      <Svg width={size} height={size}>
        {[0.98, 0.78, 0.58, 0.38].map((k) => (
          <Circle key={k} cx={c} cy={c} r={(c - 1) * k} fill="none" stroke={color} strokeWidth={1.2} />
        ))}
      </Svg>
    </View>
  );
});
