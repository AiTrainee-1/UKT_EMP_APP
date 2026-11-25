import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  WELCOME_REVEAL,
  authTransitions,
  farewellBeats,
  nameStaggerMs,
  signInTimeline,
  signOutTimeline,
  totalMs,
  welcomeRevealEndMs,
  welcomeWords,
  type AuthTransitionRequest,
  type Point,
} from '../../lib/authTransition';
import { GREETING_SPEAK_AT_MS } from '../../lib/voiceGreeting';
import { UKTLogo } from '../UKTLogo';
import { AuthColors } from '../auth/authTheme';
import { useTheme } from '../../theme/ThemeProvider';
import { FontFamily } from '../../constants/typography';
import { speakGreeting, stopGreeting } from './voiceGreetingSpeaker';

/**
 * The full-screen moments around signing in and out (owner 2026-11-25; the timing and the rules are in
 * src/lib/authTransition.ts). Mounted once at the app root, above the screens, so it outlives the screen that started it.
 * Every movement is a Reanimated animation started when it mounts (it runs on the UI thread, so it stays smooth while
 * the app signs in or out and changes screens behind it).
 */
export function AuthTransitionOverlay() {
  const open = useSyncExternalStore(authTransitions.subscribe, authTransitions.get);
  if (!open) return null;
  const req = open.request;
  return req.kind === 'sign-in' ? (
    <SignInPortal key={open.id} request={req} />
  ) : (
    <SignOutFarewell key={open.id} request={req} />
  );
}

// ── Reduce Motion ───────────────────────────────────────────────────────────

// The phone's Reduce Motion setting, already known when a transition starts. useReduceMotion (src/lib/motionPrefs)
// answers a moment after mounting, too late for an animation that is laid out when it mounts, so the same setting is
// kept here from app start and kept up to date.
let reduceMotionNow: boolean | null = null;
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduceMotionNow = v;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
  reduceMotionNow = v;
});

/** Reduce Motion as it was when the transition started (it never switches half-way). */
function useReduceMotionAtStart(): boolean {
  const atAppStart = useReducedMotion();
  const [reduce] = useState(() => reduceMotionNow ?? atAppStart);
  return reduce;
}

/** Reanimated skips animations under Reduce Motion; the calm fades that replace the movement should still fade. */
const CALM = ReduceMotion.Never;

// ── shared bits ─────────────────────────────────────────────────────────────

const BRAND = { mint: '#5EEAD4', sky: '#4FB8F0', amber: '#FBBF24', teal: '#14B8A6', blue: '#2563EB' };

let gradientSeq = 0;
function useGradientId(prefix: string): string {
  const [id] = useState(() => `${prefix}${++gradientSeq}`);
  return id;
}

/** A fixed pseudo-random sequence (the same pattern every time). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** A square of `size` centred on (cx, cy). */
function centredAt(cx: number, cy: number, size: number): ViewStyle {
  return { position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size };
}

/** A soft round glow: `color` in the middle fading to nothing at the edge. */
function SoftGlow({ size, color, strength = 0.6 }: { size: number; color: string; strength?: number }) {
  const id = useGradientId('glow');
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={strength} />
          <Stop offset="0.45" stopColor={color} stopOpacity={strength * 0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

function clamp01(v: number): number {
  'worklet';
  return Math.min(1, Math.max(0, v));
}

function easeOutCubic(p: number): number {
  'worklet';
  return 1 - (1 - p) * (1 - p) * (1 - p);
}

/** Eases out past the end and settles back (a soft overshoot). */
function easeOutBack(p: number): number {
  'worklet';
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

// ── sign-in: the portal ─────────────────────────────────────────────────────

/** The parallax glows, far to near: each drifts and grows at its own pace as the camera moves in. */
const GLOWS = [
  { color: BRAND.teal, size: 470, dx: -0.3, dy: -0.22, drift: [-16, -24], grow: 0.1, strength: 0.55 },
  { color: BRAND.sky, size: 380, dx: 0, dy: 0, drift: [0, -8], grow: 0.22, strength: 0.5 },
  { color: BRAND.amber, size: 300, dx: 0.32, dy: 0.3, drift: [28, 42], grow: 0.45, strength: 0.32 },
] as const;

/** Light ribbons orbiting the logo on tilted rings; `turn` is how far each one travels over the whole transition. */
const RIBBONS = [
  { d: 250, tilt: -22, squash: 0.36, turn: 420, from: 10, sweep: 130, color: BRAND.mint, width: 3 },
  { d: 320, tilt: 16, squash: 0.42, turn: -330, from: 150, sweep: 110, color: BRAND.sky, width: 2.6 },
  { d: 400, tilt: -6, squash: 0.27, turn: 260, from: 250, sweep: 95, color: BRAND.amber, width: 2.2 },
] as const;
const RIBBON_STAGE = 420;

/** The particle burst when the logo lands: rings of specks thrown outwards at different speeds. */
const BURST = [
  { r: 92, n: 9, size: 5, colors: [BRAND.sky, '#FFFFFF'], grow: 2.1, spin: -30, seed: 3 },
  { r: 118, n: 12, size: 3.6, colors: ['#FFFFFF'], grow: 1.7, spin: 24, seed: 7 },
  { r: 150, n: 8, size: 4.2, colors: [BRAND.mint, BRAND.amber], grow: 1.35, spin: 14, seed: 13 },
] as const;

const SPECKS = 14;
const STREAKS = 28;
const STREAK_STAGE = 560;

/**
 * A portal opens from the sign-in button and covers the screen (the app signs in and goes to Home behind it); the
 * emerald of the Login screen turns into the app's blue while brand-coloured glows drift at different depths, light
 * ribbons orbit the logo and specks burst out of it as it lands; "Welcome back, <name>" rises in letter by letter (and
 * is spoken, if the employee keeps the voice greeting on); then everything flies at the camera and Home is there.
 * Reduce Motion: a plain fade over the same steps, with the words shown whole.
 */
function SignInPortal({ request }: { request: Extract<AuthTransitionRequest, { kind: 'sign-in' }> }) {
  const { C } = useTheme();
  const reduce = useReduceMotionAtStart();
  const { width, height } = useWindowDimensions();
  const t = signInTimeline(reduce);
  const words = welcomeWords(request.name);
  const revealEnd = welcomeRevealEndMs(words.title, words.name);

  const origin: Point = request.origin ?? { x: width / 2, y: height * 0.78 };
  // big enough to cover the farthest corner from where it opens
  const radius = Math.max(
    Math.hypot(origin.x, origin.y),
    Math.hypot(width - origin.x, origin.y),
    Math.hypot(origin.x, height - origin.y),
    Math.hypot(width - origin.x, height - origin.y),
  );
  // the logo sits a little above the middle, the words under it
  const cx = width / 2;
  const cy = height * 0.4;

  const open = useSharedValue(reduce ? 1 : 0); // portal scale 0..1
  const cover = useSharedValue(reduce ? 0 : 1); // the whole overlay's opacity (Reduce Motion fades it in)
  const blue = useSharedValue(0); // emerald -> the app's blue
  const glow = useSharedValue(reduce ? 1 : 0); // the glows and ribbons coming up
  const depth = useSharedValue(0); // 0..1 over the whole transition: the camera moving in
  const spin = useSharedValue(0); // 0..1 over the whole transition: the ribbons' orbits
  const logo = useSharedValue(0); // the logo arriving
  const burst = useSharedValue(0); // the specks thrown out as it lands
  const shock = useSharedValue(0); // the ring of light it sends out
  const reveal = useSharedValue(0); // ms into the letter-by-letter reveal
  const underline = useSharedValue(0);
  const out = useSharedValue(0); // 0..1: flying through and fading away
  const covered = useRef(false);

  useEffect(() => {
    // Nothing here takes focus; and in case anything still held the keyboard, it goes (owner 2026-11-25).
    Keyboard.dismiss();
    const E = t.enterMs;
    const exitAt = t.enterMs + t.holdMs;
    if (reduce) {
      cover.value = withTiming(1, { duration: E, reduceMotion: CALM });
      logo.value = withTiming(1, { duration: E, reduceMotion: CALM });
      blue.value = withDelay(E, withTiming(1, { duration: t.holdMs * 0.8, reduceMotion: CALM }));
      out.value = withDelay(exitAt, withTiming(1, { duration: t.exitMs, reduceMotion: CALM }));
    } else {
      open.value = withTiming(1, { duration: E, easing: Easing.bezier(0.7, 0, 0.25, 1) });
      glow.value = withDelay(E * 0.3, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }));
      blue.value = withDelay(E * 0.55, withTiming(1, { duration: t.holdMs * 0.8, easing: Easing.inOut(Easing.quad) }));
      depth.value = withDelay(E * 0.4, withTiming(1, { duration: totalMs(t) - E * 0.4, easing: Easing.out(Easing.quad) }));
      spin.value = withTiming(1, { duration: totalMs(t), easing: Easing.linear });
      logo.value = withDelay(E * 0.55, withSpring(1, { damping: 13, stiffness: 110 }));
      shock.value = withDelay(E * 0.9, withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) }));
      burst.value = withDelay(E * 0.9, withTiming(1, { duration: 1150, easing: Easing.out(Easing.cubic) }));
      const revealMs = revealEnd - WELCOME_REVEAL.startMs;
      reveal.value = withDelay(WELCOME_REVEAL.startMs, withTiming(revealMs, { duration: revealMs, easing: Easing.linear }));
      underline.value = withDelay(revealEnd - 160, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
      out.value = withDelay(exitAt, withTiming(1, { duration: t.exitMs, easing: Easing.inOut(Easing.quad) }));
    }
    // "Welcome back, Surya" out loud, if the switch is on; never waited for.
    speakGreeting(words.sentence, GREETING_SPEAK_AT_MS);
    const timers = [
      // Covered: sign in and go to Home behind the cover.
      setTimeout(() => {
        if (covered.current) return;
        covered.current = true;
        request.onCovered();
      }, E),
      setTimeout(() => authTransitions.answer(), totalMs(t) + 40),
    ];
    return () => {
      timers.forEach(clearTimeout);
      [open, cover, blue, glow, depth, spin, logo, burst, shock, reveal, underline, out].forEach((v) => cancelAnimation(v));
      // never leave a sign-in half done
      if (!covered.current) {
        covered.current = true;
        request.onCovered();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: cover.value * (1 - out.value) }));
  const portalStyle = useAnimatedStyle(() => ({ transform: [{ scale: Math.max(0.001, open.value) }] }));
  const blueStyle = useAnimatedStyle(() => ({ opacity: blue.value }));
  const farStyle = useAnimatedStyle(() => ({
    opacity: interpolate(depth.value, [0, 0.2, 1], [0, 0.9, 0.5]),
    transform: [{ scale: 0.55 + depth.value * 0.7 + out.value * 0.6 }],
  }));
  const nearStyle = useAnimatedStyle(() => ({
    opacity: interpolate(depth.value, [0, 0.25, 1], [0, 0.8, 0.3]),
    transform: [{ scale: 0.9 + depth.value * 1.6 + out.value * 2.4 }],
  }));
  const ribbonsStyle = useAnimatedStyle(() => ({
    opacity: glow.value * (1 - out.value),
    transform: [{ scale: 0.7 + glow.value * 0.3 + depth.value * 0.12 + out.value * 1.8 }],
  }));
  const streakStyle = useAnimatedStyle(() => ({
    opacity: interpolate(out.value, [0, 0.25, 1], [0, 0.6, 0]),
    transform: [{ scale: 0.6 + out.value * 2.4 }],
  }));
  const shockStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shock.value, [0, 0.08, 1], [0, 0.7, 0]),
    transform: [{ scale: 0.45 + shock.value * 2 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: clamp01(logo.value) * 0.9,
    transform: [{ scale: 0.6 + clamp01(logo.value) * 0.4 + depth.value * 0.15 + out.value * 1.6 }],
  }));
  const logoStyle = useAnimatedStyle(() =>
    reduce
      ? { opacity: logo.value }
      : {
          opacity: interpolate(logo.value, [0, 0.4], [0, 1], Extrapolation.CLAMP),
          transform: [
            { translateY: (1 - logo.value) * 24 - depth.value * 6 },
            { scale: (0.55 + logo.value * 0.45) * (1 + out.value * 2.6) },
          ],
        },
  );
  const wordsStyle = useAnimatedStyle(() =>
    reduce
      ? { opacity: logo.value }
      : {
          opacity: 1 - clamp01(out.value * 2.2),
          transform: [{ translateY: -depth.value * 4 - out.value * 26 }, { scale: 1 + out.value * 0.14 }],
        },
  );
  const underlineStyle = useAnimatedStyle(() => ({
    opacity: underline.value,
    transform: [{ scaleX: Math.max(0.001, underline.value) }],
  }));

  const nameSize = !words.name ? 0 : words.name.length <= 8 ? 34 : words.name.length <= 12 ? 30 : 26;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]} pointerEvents="auto" accessibilityViewIsModal>
      <StatusBar barStyle="light-content" />
      {/* the portal: a circle as wide as the screen's diagonal, opening from the button */}
      <Animated.View
        style={[
          styles.portal,
          { width: radius * 2, height: radius * 2, borderRadius: radius, left: origin.x - radius, top: origin.y - radius },
          portalStyle,
        ]}
      >
        <View style={{ position: 'absolute', left: radius - origin.x, top: radius - origin.y, width, height }}>
          <LinearGradient colors={AuthColors.gradient} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <Animated.View style={[StyleSheet.absoluteFill, blueStyle]}>
            <LinearGradient colors={C.gradientRoyal} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          </Animated.View>
        </View>
      </Animated.View>

      {/* parallax glows in the brand colours, far to near */}
      {GLOWS.map((g, i) => (
        <ParallaxGlow
          key={i}
          glow={g}
          x={cx + g.dx * width}
          y={cy + g.dy * height}
          shown={glow}
          depth={depth}
          out={out}
          still={reduce}
        />
      ))}

      {!reduce && (
        <>
          {/* far layer: slow rings */}
          <Animated.View style={[centredAt(cx, cy, 360), styles.centerItems, farStyle]} pointerEvents="none">
            {[180, 260, 360].map((s) => (
              <View key={s} style={[styles.ring, { width: s, height: s, borderRadius: s / 2 }]} />
            ))}
          </Animated.View>

          {/* light ribbons orbiting the logo */}
          <Animated.View style={[centredAt(cx, cy, RIBBON_STAGE), ribbonsStyle]} pointerEvents="none">
            {RIBBONS.map((r, i) => (
              <Ribbon key={i} ribbon={r} spin={spin} />
            ))}
          </Animated.View>

          {/* near layer: specks and two fast rings */}
          <Animated.View style={[centredAt(cx, cy, 240), styles.centerItems, nearStyle]} pointerEvents="none">
            <View style={[styles.ring, styles.ringNear, { width: 120, height: 120, borderRadius: 60 }]} />
            <View style={[styles.ring, styles.ringNear, { width: 210, height: 210, borderRadius: 105 }]} />
            <Specks />
          </Animated.View>

          {/* light streaks as it flies through */}
          <Animated.View style={[centredAt(cx, cy, STREAK_STAGE), streakStyle]} pointerEvents="none">
            <Streaks />
          </Animated.View>

          {/* the burst and the ring of light when the logo lands */}
          {BURST.map((b, i) => (
            <BurstRing key={i} ring={b} x={cx} y={cy} burst={burst} out={out} />
          ))}
          <Animated.View style={[centredAt(cx, cy, 140), styles.shock, shockStyle]} pointerEvents="none" />
        </>
      )}

      <Animated.View style={[centredAt(cx, cy, 230), haloStyle]} pointerEvents="none">
        <SoftGlow size={230} color="#FFFFFF" strength={0.32} />
      </Animated.View>
      <Animated.View style={[centredAt(cx, cy, 100), styles.centerItems, logoStyle]} pointerEvents="none">
        <UKTLogo size={66} />
      </Animated.View>

      {/* "Welcome back, Surya" */}
      <Animated.View
        style={[styles.words, { top: cy + 62 }, wordsStyle]}
        pointerEvents="none"
        accessible
        accessibilityRole="header"
        accessibilityLabel={words.sentence}
        accessibilityLiveRegion="polite"
      >
        {reduce ? (
          <>
            <Text style={styles.welcomeTitle} maxFontSizeMultiplier={1.3}>{words.title}</Text>
            {!!words.name && (
              <Text style={[styles.welcomeName, { fontSize: nameSize }]} maxFontSizeMultiplier={1.3}>{words.name}</Text>
            )}
          </>
        ) : (
          <>
            <Letters
              text={words.title}
              style={styles.welcomeTitle}
              reveal={reveal}
              delayAt={(i) => i * WELCOME_REVEAL.letterStaggerMs}
              durMs={WELCOME_REVEAL.letterMs}
            />
            {!!words.name && (
              <Letters
                text={words.name}
                style={[styles.welcomeName, { fontSize: nameSize }]}
                reveal={reveal}
                delayAt={(i) => WELCOME_REVEAL.nameDelayMs + i * nameStaggerMs(words.name!.length)}
                durMs={WELCOME_REVEAL.nameLetterMs}
                bounce
              />
            )}
            <Animated.View style={[styles.underline, underlineStyle]}>
              <LinearGradient
                colors={[BRAND.mint, BRAND.sky, BRAND.amber]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </>
        )}
      </Animated.View>
    </Animated.View>
  );
}

function ParallaxGlow({
  glow,
  x,
  y,
  shown,
  depth,
  out,
  still,
}: {
  glow: (typeof GLOWS)[number];
  x: number;
  y: number;
  shown: SharedValue<number>;
  depth: SharedValue<number>;
  out: SharedValue<number>;
  still: boolean;
}) {
  const style = useAnimatedStyle(() =>
    still
      ? { opacity: shown.value }
      : {
          opacity: shown.value,
          transform: [
            { translateX: glow.drift[0] * (depth.value + out.value * 2) },
            { translateY: glow.drift[1] * (depth.value + out.value * 2) },
            { scale: 0.85 + depth.value * glow.grow + out.value * glow.grow * 3 },
          ],
        },
  );
  return (
    <Animated.View style={[centredAt(x, y, glow.size), style]} pointerEvents="none">
      <SoftGlow size={glow.size} color={glow.color} strength={glow.strength} />
    </Animated.View>
  );
}

function arcPoint(c: number, r: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
}

/** One light ribbon: an arc with a bright head and a fading tail, travelling round a tilted ring. */
function Ribbon({ ribbon, spin }: { ribbon: (typeof RIBBONS)[number]; spin: SharedValue<number> }) {
  const id = useGradientId('ribbon');
  const { d, width: w, sweep, turn, from, tilt, squash, color } = ribbon;
  const c = d / 2;
  const r = d / 2 - w * 3;
  const p0 = arcPoint(c, r, -90 - sweep / 2);
  const p1 = arcPoint(c, r, -90 + sweep / 2);
  // clockwise ribbons lead with the end of the arc, the others with its start
  const head = turn >= 0 ? p1 : p0;
  const tail = turn >= 0 ? p0 : p1;
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${from + spin.value * turn}deg` }] }));
  const inset = (RIBBON_STAGE - d) / 2;
  return (
    <View
      style={{
        position: 'absolute',
        left: inset,
        top: inset,
        width: d,
        height: d,
        transform: [{ rotate: `${tilt}deg` }, { scaleY: squash }],
      }}
    >
      <Animated.View style={[{ width: d, height: d }, spinStyle]}>
        <Svg width={d} height={d}>
          <Defs>
            <SvgGradient id={id} gradientUnits="userSpaceOnUse" x1={tail.x} y1={tail.y} x2={head.x} y2={head.y}>
              <Stop offset="0" stopColor={color} stopOpacity={0} />
              <Stop offset="0.65" stopColor={color} stopOpacity={0.6} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.95} />
            </SvgGradient>
          </Defs>
          <Path
            d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`}
            stroke={`url(#${id})`}
            strokeWidth={w}
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx={head.x} cy={head.y} r={w * 2.6} fill={color} opacity={0.35} />
          <Circle cx={head.x} cy={head.y} r={w * 1.1} fill="#FFFFFF" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** One ring of the burst: specks on a circle, thrown outwards (the ring grows) and fading. */
function BurstRing({
  ring,
  x,
  y,
  burst,
  out,
}: {
  ring: (typeof BURST)[number];
  x: number;
  y: number;
  burst: SharedValue<number>;
  out: SharedValue<number>;
}) {
  const dots = useMemo(() => {
    const rand = seeded(ring.seed);
    return Array.from({ length: ring.n }, (_, i) => {
      const a = ((i + rand() * 0.6) / ring.n) * Math.PI * 2;
      const r = ring.r * (0.78 + rand() * 0.3);
      const s = ring.size * (0.7 + rand() * 0.6);
      return { x: ring.r + Math.cos(a) * r - s / 2, y: ring.r + Math.sin(a) * r - s / 2, s, color: ring.colors[i % ring.colors.length] };
    });
  }, [ring]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(burst.value, [0, 0.06, 0.55, 1], [0, 1, 0.75, 0]),
    transform: [{ rotate: `${burst.value * ring.spin}deg` }, { scale: 0.2 + burst.value * ring.grow + out.value * 1.5 }],
  }));
  return (
    <Animated.View style={[centredAt(x, y, ring.r * 2), style]} pointerEvents="none">
      {dots.map((d, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: d.x, top: d.y, width: d.s, height: d.s, borderRadius: d.s / 2, backgroundColor: d.color }}
        />
      ))}
    </Animated.View>
  );
}

/** Specks scattered around the centre (a fixed pattern), drifting out with the near layer. */
function Specks() {
  const dots = useMemo(() => {
    const rand = seeded(11);
    return Array.from({ length: SPECKS }, (_, i) => {
      const a = rand() * Math.PI * 2;
      const r = 50 + rand() * 120;
      const s = 2 + rand() * 3.5;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, s, o: 0.35 + rand() * 0.5, c: i % 4 === 0 ? BRAND.mint : '#FFFFFF' };
    });
  }, []);
  return (
    <>
      {dots.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: d.s,
            height: d.s,
            borderRadius: d.s / 2,
            backgroundColor: d.c,
            opacity: d.o,
            transform: [{ translateX: d.x }, { translateY: d.y }],
          }}
        />
      ))}
    </>
  );
}

/** Thin lines radiating from the centre: stretched past the camera as it flies through. */
function Streaks() {
  const lines = useMemo(() => {
    const rand = seeded(29);
    const c = STREAK_STAGE / 2;
    return Array.from({ length: STREAKS }, (_, i) => {
      const a = ((i + rand() * 0.8) / STREAKS) * Math.PI * 2;
      const r0 = 70 + rand() * 50;
      const r1 = r0 + 40 + rand() * 90;
      return {
        x1: c + Math.cos(a) * r0,
        y1: c + Math.sin(a) * r0,
        x2: c + Math.cos(a) * r1,
        y2: c + Math.sin(a) * r1,
        w: 1.2 + rand() * 1.4,
        color: i % 3 === 0 ? BRAND.sky : i % 5 === 0 ? BRAND.mint : '#FFFFFF',
        o: 0.4 + rand() * 0.5,
      };
    });
  }, []);
  return (
    <Svg width={STREAK_STAGE} height={STREAK_STAGE}>
      {lines.map((l, i) => (
        <Line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeOpacity={l.o} strokeWidth={l.w} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** Words that rise in letter by letter; `reveal` counts milliseconds into the reveal. */
function Letters({
  text,
  style,
  reveal,
  delayAt,
  durMs,
  bounce = false,
}: {
  text: string;
  style: TextStyle | (TextStyle | false | undefined)[];
  reveal: SharedValue<number>;
  delayAt: (index: number) => number;
  durMs: number;
  bounce?: boolean;
}) {
  return (
    <View style={styles.letterRow} importantForAccessibility="no-hide-descendants">
      {Array.from(text).map((ch, i) =>
        ch === ' ' ? (
          <Text key={i} style={style}>
            {' '}
          </Text>
        ) : (
          <Letter key={i} ch={ch} style={style} reveal={reveal} delayMs={delayAt(i)} durMs={durMs} bounce={bounce} />
        ),
      )}
    </View>
  );
}

function Letter({
  ch,
  style,
  reveal,
  delayMs,
  durMs,
  bounce,
}: {
  ch: string;
  style: TextStyle | (TextStyle | false | undefined)[];
  reveal: SharedValue<number>;
  delayMs: number;
  durMs: number;
  bounce: boolean;
}) {
  const st = useAnimatedStyle(() => {
    const p = clamp01((reveal.value - delayMs) / durMs);
    const e = bounce ? easeOutBack(p) : easeOutCubic(p);
    return {
      opacity: clamp01(p * 1.8),
      transform: [{ translateY: (1 - e) * 16 }, { scale: 0.72 + 0.28 * e }],
    };
  });
  return (
    <Animated.Text style={[style, st]} maxFontSizeMultiplier={1.3}>
      {ch}
    </Animated.Text>
  );
}

// ── sign-out: leaving home ──────────────────────────────────────────────────

/** The scene is drawn on a 320 x 240 grid, scaled to the screen. */
const SCENE_W = 320;
const SCENE_H = 240;
const INK = '#1B1B3A';
/** The doorway, the window and the porch lamp on that grid. */
const DOOR = { x: 78, y: 136, w: 34, h: 64 };
const WINDOW = { x: 140, y: 122, w: 32, h: 28 };
const LAMP = { x: 124, y: 141 };
/** How far the door stands open (degrees, swung into the house). */
const DOOR_OPEN_DEG = 78;
/** The light falling out of the doorway onto the path. */
const SPILL = { x: 64, y: 200, w: 70, h: 26 };
/** The person: a 32 x 56 figure whose feet are at the bottom middle; where they start (in the doorway) and finish. */
const PERSON = { w: 32, h: 56 };
const WALK_FROM = 95;
const WALK_TO = 292;
const STEP_DOWN = 10;
/** Steps (left + right) over the walk. */
const WALK_CYCLES = 3.5;

interface SceneColors {
  sky: readonly [string, string];
  island: string;
  islandRim: string;
  walkway: string;
  wall: string;
  wallShade: string;
  roof: string;
  roofEdge: string;
  chimney: string;
  door: string;
  doorPanel: string;
  windowOff: string;
  bush: string;
  bushDark: string;
  night: boolean;
}

function sceneColors(C: ReturnType<typeof useTheme>['C'], isDark: boolean): SceneColors {
  return isDark
    ? {
        sky: [C.bgLight, C.primaryFixed],
        island: '#134E4A',
        islandRim: '#0F3B38',
        walkway: '#475569',
        wall: '#CBD5E1',
        wallShade: '#94A3B8',
        roof: '#1E40AF',
        roofEdge: '#172554',
        chimney: '#64748B',
        door: '#0B6E63',
        doorPanel: '#095A51',
        windowOff: '#334155',
        bush: '#166534',
        bushDark: '#14532D',
        night: true,
      }
    : {
        sky: [C.primaryFixed, C.secondaryFixed],
        island: '#A7F3D0',
        islandRim: '#6EE7B7',
        walkway: '#E2E8F0',
        wall: '#FFF7ED',
        wallShade: '#FDE7CF',
        roof: '#2563EB',
        roofEdge: '#1E3A8A',
        chimney: '#94A3B8',
        door: '#0E9F8E',
        doorPanel: '#0B7A6B',
        windowOff: '#64748B',
        bush: '#34D399',
        bushDark: '#059669',
        night: false,
      };
}

/**
 * Only after the employee's own, confirmed logout (never a forced one): a little person walks out of the front door of
 * a small house, down the step and off along the path; the door swings shut behind them (the light from inside
 * narrowing to nothing, a little bump as it clicks shut), then the porch light flickers out and the window goes dark.
 * The usual sign-out runs behind it; then the Login screen. No words: the picture says it.
 * Reduce Motion: a still scene (the person already outside); the closed door fades in over the open one, then the
 * lights fade.
 */
function SignOutFarewell({ request }: { request: Extract<AuthTransitionRequest, { kind: 'sign-out' }> }) {
  const { C, isDark } = useTheme();
  const reduce = useReduceMotionAtStart();
  const { width, height } = useWindowDimensions();
  const t = signOutTimeline(reduce);
  const beats = farewellBeats(reduce);
  const colors = sceneColors(C, isDark);
  const covered = useRef(false);
  const signOut = () => {
    if (covered.current) return;
    covered.current = true;
    request.onCovered();
  };

  // the scene: as wide as the phone allows, a little above the middle
  const S = Math.min(width - 24, 420);
  const k = S / SCENE_W;
  const sceneH = SCENE_H * k;
  const sceneTop = height * 0.45 - sceneH / 2;

  const shown = useSharedValue(0);
  const walk = useSharedValue(reduce ? 0.3 : 0); // 0..1 along the path (Reduce Motion: standing outside)
  const steps = useSharedValue(0); // walk cycles so far
  const door = useSharedValue(1); // 1 open .. 0 shut (a touch below 0 never happens; the bounce re-opens it a little)
  const shut = useSharedValue(0); // Reduce Motion: the closed door fading in
  const click = useSharedValue(0);
  const bump = useSharedValue(0);
  const porch = useSharedValue(1); // the porch light: 1 on .. 0 off
  const windowOff = useSharedValue(0);
  const out = useSharedValue(0);

  useEffect(() => {
    // A greeting still being spoken from this session's sign-in stops here.
    stopGreeting();
    const exitAt = t.enterMs + t.holdMs;
    if (reduce) {
      shown.value = withTiming(1, { duration: t.enterMs, reduceMotion: CALM });
      shut.value = withDelay(beats.doorCloseStartMs, withTiming(1, { duration: beats.doorCloseMs, reduceMotion: CALM }));
      porch.value = withDelay(beats.lightsOffMs, withTiming(0.08, { duration: 400, reduceMotion: CALM }));
      windowOff.value = withDelay(beats.lightsOffMs, withTiming(1, { duration: 400, reduceMotion: CALM }));
      out.value = withDelay(exitAt, withTiming(1, { duration: t.exitMs, reduceMotion: CALM }));
    } else {
      shown.value = withTiming(1, { duration: t.enterMs, easing: Easing.out(Easing.cubic) });
      walk.value = withDelay(beats.walkStartMs, withTiming(1, { duration: beats.walkMs, easing: Easing.bezier(0.35, 0, 0.75, 1) }));
      steps.value = withDelay(beats.walkStartMs, withTiming(WALK_CYCLES, { duration: beats.walkMs, easing: Easing.linear }));
      const clickAt = beats.doorCloseStartMs + beats.doorCloseMs;
      door.value = withDelay(
        beats.doorCloseStartMs,
        withSequence(
          withTiming(0, { duration: beats.doorCloseMs, easing: Easing.in(Easing.cubic) }), // gathers speed as it swings
          withTiming(0.07, { duration: 90, easing: Easing.out(Easing.quad) }), // bounces off the frame...
          withTiming(0, { duration: 150, easing: Easing.inOut(Easing.quad) }), // ...and settles shut
        ),
      );
      click.value = withDelay(clickAt, withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }));
      bump.value = withDelay(clickAt, withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 230 })));
      porch.value = withDelay(
        beats.lightsOffMs,
        withSequence(
          withTiming(0.35, { duration: 70 }),
          withTiming(0.85, { duration: 90 }),
          withTiming(0.08, { duration: 380, easing: Easing.in(Easing.quad) }),
        ),
      );
      windowOff.value = withDelay(beats.lightsOffMs + 140, withTiming(1, { duration: 320 }));
      out.value = withDelay(exitAt, withTiming(1, { duration: t.exitMs, easing: Easing.inOut(Easing.quad) }));
    }
    const timers = [
      // Covered: the usual sign-out runs behind the scene (it goes to the Login screen and clears up).
      setTimeout(signOut, t.enterMs),
      setTimeout(() => authTransitions.answer(), totalMs(t) + 40),
    ];
    return () => {
      timers.forEach(clearTimeout);
      [shown, walk, steps, door, shut, click, bump, porch, windowOff, out].forEach((v) => cancelAnimation(v));
      // never leave a sign-out undone
      signOut();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: shown.value * (1 - out.value) }));
  const sceneStyle = useAnimatedStyle(() =>
    reduce
      ? {}
      : {
          transform: [
            { translateY: (1 - shown.value) * 12 + bump.value * 1.5 * k + out.value * 8 },
            { scale: (0.96 + shown.value * 0.04) * (1 + bump.value * 0.008) },
          ],
        },
  );

  // the door swings on its left hinge, into the house
  const doorW = DOOR.w * k;
  const doorStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 420 },
      { translateX: -doorW / 2 },
      { rotateY: `${door.value * DOOR_OPEN_DEG}deg` },
      { translateX: doorW / 2 },
    ],
  }));
  // turned away from the light while it is open
  const doorShadeStyle = useAnimatedStyle(() => ({ opacity: clamp01(door.value) * 0.4 }));
  const shutStyle = useAnimatedStyle(() => ({ opacity: shut.value }));
  // how much light gets out: the gap between the door's edge and the frame, closing towards the latch side
  const light = (): number => {
    'worklet';
    if (reduce) return 1 - shut.value;
    const open = clamp01(door.value) * DOOR_OPEN_DEG * (Math.PI / 180);
    return (1 - Math.cos(open)) / (1 - Math.cos(DOOR_OPEN_DEG * (Math.PI / 180)));
  };
  const spillW = SPILL.w * k;
  // it narrows towards the latch side of the doorway (the last of the gap), not towards its own middle
  const latchFromCentre = (DOOR.x + DOOR.w - SPILL.x) * k - spillW / 2;
  const spillStyle = useAnimatedStyle(() => {
    const s = Math.max(0.001, light());
    return {
      opacity: Math.pow(s, 0.6),
      transform: reduce ? [] : [{ translateX: latchFromCentre * (1 - s) }, { scaleX: s }],
    };
  });
  const doorGlowStyle = useAnimatedStyle(() => ({ opacity: Math.pow(light(), 0.7) * 0.85 }));
  const porchGlowStyle = useAnimatedStyle(() => ({ opacity: porch.value }));
  const bulbOffStyle = useAnimatedStyle(() => ({ opacity: 1 - porch.value }));
  const windowOffStyle = useAnimatedStyle(() => ({ opacity: windowOff.value }));
  const clickStyle = useAnimatedStyle(() => ({
    opacity: interpolate(click.value, [0, 0.15, 1], [0, 1, 0]),
    transform: [{ translateX: click.value * 3 * k }, { scale: 0.6 + click.value * 0.6 }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, rootStyle]}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessible
      accessibilityLabel="Signing you out"
      accessibilityLiveRegion="polite"
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <LinearGradient colors={colors.sky} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />

      <Animated.View
        style={[{ position: 'absolute', left: (width - S) / 2, top: sceneTop, width: S, height: sceneH }, sceneStyle]}
        pointerEvents="none"
      >
        <HouseScene size={S} colors={colors} />

        {/* the warm light around the doorway, and on the path */}
        <Animated.View style={[centredAt((DOOR.x + DOOR.w / 2) * k, (DOOR.y + DOOR.h * 0.55) * k, 120 * k), doorGlowStyle]}>
          <SoftGlow size={120 * k} color="#FFD27A" strength={0.55} />
        </Animated.View>
        <Animated.View
          style={[{ position: 'absolute', left: SPILL.x * k, top: SPILL.y * k, width: spillW, height: SPILL.h * k }, spillStyle]}
        >
          <LightSpill width={spillW} height={SPILL.h * k} />
        </Animated.View>

        {/* the door */}
        <View style={{ position: 'absolute', left: DOOR.x * k, top: DOOR.y * k, width: doorW, height: DOOR.h * k }}>
          <Animated.View style={[StyleSheet.absoluteFill, doorStyle]}>
            <DoorPanel width={doorW} height={DOOR.h * k} colors={colors} />
            <Animated.View style={[StyleSheet.absoluteFill, styles.doorShade, doorShadeStyle]} />
          </Animated.View>
          {reduce && (
            <Animated.View style={[StyleSheet.absoluteFill, shutStyle]}>
              <DoorPanel width={doorW} height={DOOR.h * k} colors={colors} />
            </Animated.View>
          )}
        </View>

        {/* the window going dark */}
        <Animated.View
          style={[
            { position: 'absolute', left: WINDOW.x * k, top: WINDOW.y * k, width: WINDOW.w * k, height: WINDOW.h * k },
            windowOffStyle,
          ]}
        >
          <WindowPanes width={WINDOW.w * k} height={WINDOW.h * k} glass={colors.windowOff} />
        </Animated.View>

        {/* the porch lamp, flickering out */}
        <Animated.View style={[centredAt(LAMP.x * k, LAMP.y * k, 76 * k), porchGlowStyle]}>
          <SoftGlow size={76 * k} color="#FFE08A" strength={0.75} />
        </Animated.View>
        <Animated.View style={[centredAt(LAMP.x * k, (LAMP.y + 1) * k, 7 * k), styles.bulbOff, bulbOffStyle]} />

        <Walker k={k} walk={walk} steps={steps} still={reduce} />

        {/* the "click" */}
        {!reduce && (
          <Animated.View
            style={[{ position: 'absolute', left: (DOOR.x + DOOR.w + 1) * k, top: (DOOR.y + 20) * k }, clickStyle]}
          >
            <Svg width={14 * k} height={26 * k} viewBox="0 0 14 26">
              <Path d="M2 7 L9 2" stroke={INK} strokeWidth={2} strokeLinecap="round" />
              <Path d="M3 13 L12 13" stroke={INK} strokeWidth={2} strokeLinecap="round" />
              <Path d="M2 19 L9 24" stroke={INK} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

/** Everything that stays still: the sky's sun or moon, the little island, the path, the house with its lights on. */
function HouseScene({ size, colors }: { size: number; colors: SceneColors }) {
  const doorwayId = useGradientId('doorway');
  const d = DOOR;
  const w = WINDOW;
  return (
    <Svg width={size} height={(size * SCENE_H) / SCENE_W} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
      <Defs>
        <RadialGradient id={doorwayId} cx="50%" cy="60%" r="65%">
          <Stop offset="0" stopColor="#FFF4CC" />
          <Stop offset="1" stopColor="#F9C860" />
        </RadialGradient>
      </Defs>

      {/* sky: the moon and a few stars at night, a low sun and clouds by day */}
      {colors.night ? (
        <>
          <Circle cx={266} cy={42} r={13} fill="#FDE68A" opacity={0.95} />
          <Circle cx={261} cy={39} r={2.6} fill="#FCD34D" />
          <Circle cx={270} cy={47} r={1.8} fill="#FCD34D" />
          {[
            [40, 30],
            [92, 18],
            [212, 24],
            [300, 72],
            [24, 84],
            [176, 50],
          ].map(([x, y], i) => (
            <Path
              key={i}
              d={`M${x} ${y - 3.2} L${x + 0.9} ${y - 0.9} L${x + 3.2} ${y} L${x + 0.9} ${y + 0.9} L${x} ${y + 3.2} L${x - 0.9} ${y + 0.9} L${x - 3.2} ${y} L${x - 0.9} ${y - 0.9} Z`}
              fill="#FFFFFF"
              opacity={0.75}
            />
          ))}
        </>
      ) : (
        <>
          <Circle cx={262} cy={58} r={16} fill="#FCD34D" opacity={0.85} />
          <Path d="M34 50 a9 9 0 0 1 16 -5 a11 11 0 0 1 20 4 a7 7 0 0 1 2 13 h-36 a6 6 0 0 1 -2 -12 z" fill="#FFFFFF" opacity={0.9} />
          <Path d="M196 32 a7 7 0 0 1 12 -4 a9 9 0 0 1 16 3 a6 6 0 0 1 1 11 h-28 a5 5 0 0 1 -1 -10 z" fill="#FFFFFF" opacity={0.8} />
        </>
      )}

      {/* the island the house sits on, and the path off to the right */}
      <Ellipse cx={168} cy={214} rx={150} ry={22} fill={colors.islandRim} />
      <Ellipse cx={168} cy={210} rx={148} ry={19} fill={colors.island} />
      <Path d="M70 205 C 140 205 220 208 312 210 L 312 218 C 220 218 140 216 66 214 Z" fill={colors.walkway} />

      {/* a bush by the wall */}
      <Circle cx={196} cy={194} r={10} fill={colors.bush} stroke={INK} strokeWidth={2} />
      <Circle cx={208} cy={197} r={7.5} fill={colors.bushDark} stroke={INK} strokeWidth={2} />

      {/* chimney, walls, roof */}
      <Rect x={150} y={58} width={16} height={30} fill={colors.chimney} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x={147} y={54} width={22} height={7} rx={2} fill={colors.chimney} stroke={INK} strokeWidth={2.5} />
      <Rect x={52} y={102} width={136} height={98} fill={colors.wall} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x={53.5} y={103.5} width={133} height={10} fill={colors.wallShade} />
      <Path d="M38 108 L120 44 L202 108 Z" fill={colors.roof} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M44 103 L120 50 L196 103" fill="none" stroke={colors.roofEdge} strokeWidth={3} strokeLinejoin="round" opacity={0.55} />
      <Circle cx={120} cy={82} r={6} fill="#FFE7A3" stroke={INK} strokeWidth={2} />

      {/* the window, lit */}
      <Rect x={w.x} y={w.y} width={w.w} height={w.h} rx={3} fill="#FFD66B" stroke={INK} strokeWidth={2.5} />
      <Path d={`M${w.x + w.w / 2} ${w.y} V${w.y + w.h} M${w.x} ${w.y + w.h / 2} H${w.x + w.w}`} stroke={INK} strokeWidth={2} />
      <Rect x={w.x - 3} y={w.y + w.h} width={w.w + 6} height={4} rx={1.5} fill={colors.wallShade} stroke={INK} strokeWidth={2} />

      {/* the doorway, warm light inside, with its frame */}
      <Rect x={d.x - 3} y={d.y - 3} width={d.w + 6} height={d.h + 3} rx={3} fill="#FFFFFF" stroke={INK} strokeWidth={2.5} />
      <Rect x={d.x} y={d.y} width={d.w} height={d.h} fill={`url(#${doorwayId})`} />
      <Rect x={d.x} y={d.y + d.h - 9} width={d.w} height={9} fill="#F4B740" opacity={0.6} />

      {/* the step */}
      <Rect x={d.x - 7} y={d.y + d.h} width={d.w + 14} height={6} rx={2} fill="#CBD5E1" stroke={INK} strokeWidth={2.2} />

      {/* the porch lamp */}
      <Path d={`M${d.x + d.w + 3} ${LAMP.y + 2} H${LAMP.x - 2}`} stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <Rect x={LAMP.x - 4.5} y={LAMP.y - 6} width={9} height={13} rx={3} fill="#FFE08A" stroke={INK} strokeWidth={2} />
      <Path d={`M${LAMP.x - 6} ${LAMP.y - 6} H${LAMP.x + 6}`} stroke={INK} strokeWidth={2.4} strokeLinecap="round" />

      {/* a few tufts of grass */}
      {[
        [40, 214],
        [258, 222],
        [292, 207],
      ].map(([x, y], i) => (
        <Path key={i} d={`M${x} ${y} l-3 -6 M${x} ${y} l0 -7 M${x} ${y} l3 -6`} stroke={colors.bushDark} strokeWidth={1.8} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** The front door (a flat panel; it swings in 3D on its hinge). */
function DoorPanel({ width, height, colors }: { width: number; height: number; colors: SceneColors }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${DOOR.w} ${DOOR.h}`}>
      <Rect x={1.25} y={1.25} width={DOOR.w - 2.5} height={DOOR.h - 2.5} rx={2} fill={colors.door} stroke={INK} strokeWidth={2.5} />
      <Rect x={6} y={7} width={DOOR.w - 12} height={20} rx={2} fill="none" stroke={colors.doorPanel} strokeWidth={2} />
      <Rect x={6} y={33} width={DOOR.w - 12} height={23} rx={2} fill="none" stroke={colors.doorPanel} strokeWidth={2} />
      <Circle cx={DOOR.w - 6} cy={DOOR.h * 0.5} r={2.4} fill="#FBBF24" stroke={INK} strokeWidth={1.2} />
    </Svg>
  );
}

/** The window with the lights off (faded in over the lit one). */
function WindowPanes({ width, height, glass }: { width: number; height: number; glass: string }) {
  const w = WINDOW;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${w.w} ${w.h}`}>
      <Rect x={1.25} y={1.25} width={w.w - 2.5} height={w.h - 2.5} rx={2.5} fill={glass} stroke={INK} strokeWidth={2.5} />
      <Path d={`M${w.w / 2} 0 V${w.h} M0 ${w.h / 2} H${w.w}`} stroke={INK} strokeWidth={2} />
      <Path d="M5 6 L10 3" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Light falling out of the doorway onto the path: widest near the step, fading as it spreads. */
function LightSpill({ width, height }: { width: number; height: number }) {
  const id = useGradientId('spill');
  // the top edge matches the doorway; the far edge spreads a little
  const top0 = (DOOR.x - SPILL.x) / SPILL.w;
  const top1 = (DOOR.x + DOOR.w - SPILL.x) / SPILL.w;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${SPILL.w} ${SPILL.h}`} preserveAspectRatio="none">
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFD27A" stopOpacity={0.75} />
          <Stop offset="1" stopColor="#FFD27A" stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <Path
        d={`M${top0 * SPILL.w} 0 L${top1 * SPILL.w} 0 L${SPILL.w} ${SPILL.h} L0 ${SPILL.h} Z`}
        fill={`url(#${id})`}
      />
    </Svg>
  );
}

/**
 * The person leaving: an original, friendly flat figure (round head, blue shirt, a little amber backpack) walking to the
 * right. Arms and legs swing from the shoulder and the hip; the body bobs with each step and steps down off the doorstep.
 */
function Walker({
  k,
  walk,
  steps,
  still,
}: {
  k: number;
  walk: SharedValue<number>;
  steps: SharedValue<number>;
  still: boolean;
}) {
  const W = PERSON.w * k;
  const H = PERSON.h * k;
  const bodyStyle = useAnimatedStyle(() => {
    const swing = Math.sin(steps.value * Math.PI * 2);
    const down = interpolate(walk.value, [0.04, 0.16], [0, STEP_DOWN], Extrapolation.CLAMP);
    return {
      opacity: interpolate(walk.value, [0.78, 0.97], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: walk.value * (WALK_TO - WALK_FROM) * k },
        { translateY: (down + swing * swing * 1.6) * k },
      ],
    };
  });
  // limbs hang from the hip (16, 34) and the shoulder (16, 20) of the 32 x 56 figure; the arms swing against the legs
  const legBox = (dx: number): ViewStyle => ({ position: 'absolute', left: (16 - 5 + dx) * k, top: 34 * k, width: 10 * k, height: 22 * k });
  const armBox = (dx: number): ViewStyle => ({ position: 'absolute', left: (16 - 4 + dx) * k, top: 20 * k, width: 8 * k, height: 16 * k });
  const swingOf = { steps, still };

  return (
    <Animated.View
      style={[{ position: 'absolute', left: (WALK_FROM - PERSON.w / 2) * k, top: (DOOR.y + DOOR.h - PERSON.h) * k, width: W, height: H }, bodyStyle]}
    >
      {/* a soft shadow at the feet, under everything */}
      <View style={{ position: 'absolute', left: 8 * k, top: 53.6 * k, width: 16 * k, height: 3.2 * k, borderRadius: 2 * k, backgroundColor: 'rgba(0,0,0,0.12)' }} />
      <Limb box={armBox(-2)} degrees={-30} {...swingOf}>
        <Arm k={k} sleeve="#1D4ED8" skin="#A86F45" />
      </Limb>
      <Limb box={legBox(-1)} degrees={28} {...swingOf}>
        <Leg k={k} trousers="#0F172A" />
      </Limb>
      <Limb box={legBox(1)} degrees={-28} {...swingOf}>
        <Leg k={k} trousers="#1E293B" />
      </Limb>
      <Svg width={W} height={H} viewBox={`0 0 ${PERSON.w} ${PERSON.h}`} style={StyleSheet.absoluteFill}>
        {/* backpack */}
        <Rect x={3.5} y={20} width={7.5} height={14} rx={2.8} fill="#F59E0B" stroke={INK} strokeWidth={1.8} />
        {/* body */}
        <Rect x={9} y={18} width={14} height={18.5} rx={5} fill="#2563EB" stroke={INK} strokeWidth={1.8} />
        <Path d="M12 19 L16.5 30" stroke="#B45309" strokeWidth={1.6} strokeLinecap="round" />
        {/* head */}
        <Circle cx={17} cy={10} r={8.2} fill="#C98B5E" stroke={INK} strokeWidth={1.8} />
        <Path
          d="M9.2 11.5 C8.4 4.5 13.5 1.2 18.2 1.8 C22.6 2.3 25.6 5.2 25.2 8.4 C22.2 7.2 19 7 16.4 7.8 C14.2 8.5 12.6 10.2 12.3 13 Z"
          fill="#1F2937"
        />
        <Circle cx={13.6} cy={11.6} r={1.7} fill="#B0764B" />
        <Circle cx={21.2} cy={10.4} r={1.1} fill={INK} />
        <Path d="M20 14 Q22.2 15.6 24.2 13.6" stroke={INK} strokeWidth={1.2} strokeLinecap="round" fill="none" />
      </Svg>
      <Limb box={armBox(2)} degrees={30} {...swingOf}>
        <Arm k={k} sleeve="#2563EB" skin="#C98B5E" />
      </Limb>
    </Animated.View>
  );
}

/** An arm or a leg, swinging `degrees` either way about its top end (the shoulder or the hip) with each step. */
function Limb({
  box,
  degrees,
  steps,
  still,
  children,
}: {
  box: ViewStyle;
  degrees: number;
  steps: SharedValue<number>;
  still: boolean;
  children: React.ReactNode;
}) {
  const len = typeof box.height === 'number' ? box.height : 0;
  const style = useAnimatedStyle(() => {
    const a = still ? 0 : Math.sin(steps.value * Math.PI * 2) * degrees;
    return { transform: [{ translateY: -len / 2 }, { rotate: `${a}deg` }, { translateY: len / 2 }] };
  });
  return <Animated.View style={[box, style]}>{children}</Animated.View>;
}

function Leg({ k, trousers }: { k: number; trousers: string }) {
  return (
    <Svg width={10 * k} height={22 * k} viewBox="0 0 10 22">
      <Rect x={2} y={0} width={6} height={18} rx={3} fill={trousers} stroke={INK} strokeWidth={1.4} />
      <Path d="M1.6 17 H8.4 A2.4 2.4 0 0 1 8.4 21.8 H1.6 Z" fill="#111827" />
    </Svg>
  );
}

function Arm({ k, sleeve, skin }: { k: number; sleeve: string; skin: string }) {
  return (
    <Svg width={8 * k} height={16 * k} viewBox="0 0 8 16">
      <Rect x={1.6} y={0} width={4.8} height={9} rx={2.4} fill={sleeve} stroke={INK} strokeWidth={1.3} />
      <Rect x={2.2} y={7.5} width={3.6} height={5.5} rx={1.8} fill={skin} />
      <Circle cx={4} cy={13.4} r={2.2} fill={skin} stroke={INK} strokeWidth={1} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // above the update popup and everything else while it plays
  root: { zIndex: 2000, elevation: 2000 },
  portal: { position: 'absolute', overflow: 'hidden' },
  centerItems: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.16)' },
  ringNear: { borderColor: 'rgba(255,255,255,0.26)', borderWidth: 2 },
  shock: { borderRadius: 70, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  words: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  letterRow: { flexDirection: 'row', justifyContent: 'center' },
  welcomeTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: FontFamily.displayBold,
    fontSize: 20,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  welcomeName: {
    color: '#FFFFFF',
    fontFamily: FontFamily.displayBold,
    letterSpacing: -0.3,
    marginTop: 2,
    textAlign: 'center',
  },
  underline: { width: 120, height: 3, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  doorShade: { backgroundColor: '#0F172A' },
  bulbOff: { borderRadius: 4, backgroundColor: '#94A3B8' },
});
