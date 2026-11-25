import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { useReduceMotion } from '../../lib/motionPrefs';
import { cardTop, spotlightRect, tourProgress, type TourTone } from '../../lib/appTour';
import { mixHex, percent, withAlpha } from '../../lib/mangaShapes';
import {
  IconBurst,
  MangaButton,
  MangaFrame,
  MangaPanel,
  Mascot,
  SpeechBubble,
  mascotHeight,
  useMangaMotion,
  type SparkleSpot,
} from '../manga';

/**
 * One step of the app tour (owner 2026-11-25: a detailed walkthrough after sign-in). A full-screen layer (a Modal, so it
 * also covers the tab bar and the phone's bars) dims everything except a rounded spotlight cut around the element the
 * step is about, and a card beside it says what it is: "Step 3 of 18" with a progress bar, title, text, optional
 * feature rows and where to find it, and Back / Next / Skip. A step with no `anchor` is an illustrated card in the
 * middle of the screen. The spotlight glides from one element to the next.
 *
 * The card (owner 2026-11-25) has the app-update popup's manga look (src/components/manga): a bordered panel on an
 * offset hard shadow, a halftone / focus-line strip in the step's colour where the little mascot peeks up (poking up at
 * the spotlight when the card sits under it, waving otherwise), and the words in a speech bubble pointing at the mascot.
 * Each step pops in with a small bounce from the spotlight's side. Under Reduce Motion everything simply appears.
 *
 * Generic: the sequencing, measuring and "seen" flag live in src/components/home/HomeTour.tsx; the steps and the
 * placement rules in src/lib/appTour.ts.
 */

export type CoachmarkAnchor = { x: number; y: number; width: number; height: number };

export interface CoachmarkFeature {
  icon: string;
  title: string;
  text: string;
}

interface CoachmarkProps {
  visible: boolean;
  title: string;
  body: string;
  /** A MaterialCommunityIcons name. */
  icon: string;
  tone?: TourTone;
  features?: CoachmarkFeature[];
  where?: string;
  /** 0-based. */
  index: number;
  total: number;
  /** The element to spotlight, in window coordinates. Absent/null: a centred card. */
  anchor?: CoachmarkAnchor | null;
  /** False while the screen is still scrolling the next element into view: only the dim layer shows. */
  ready?: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const SPOT_PAD = 8;
const SPOT_RADIUS = 16;
const MAX_CARD_W = 360;
/** The pointer on the card's edge, towards the spotlight. */
const CARET_W = 24;
const CARET_H = 15;
/** How far the pointer sticks out of the card's edge. */
const CARET_OUT = 11;
const CARD_RADIUS = 18;

export function toneColor(C: Palette, tone: TourTone | undefined, isDark: boolean): string {
  switch (tone) {
    case 'green':
      return C.statusGreen;
    case 'amber':
      return isDark ? C.secondary : '#B45309';
    case 'teal':
      return C.categoryOutpass;
    case 'violet':
      return isDark ? C.statusLeave : C.categoryPunch;
    case 'rose':
      return C.statusRed;
    case 'blue':
      return C.statusBlue;
    default:
      return C.primaryLight;
  }
}

export function Coachmark({
  visible,
  title,
  body,
  icon,
  tone,
  features,
  where,
  index,
  total,
  anchor,
  ready = true,
  onNext,
  onBack,
  onSkip,
}: CoachmarkProps) {
  const { C, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [screen, setScreen] = useState({ width: 0, height: 0 });
  // Anchors come from measureInWindow, which on Android is measured from below the status bar, while this Modal
  // (statusBarTranslucent) draws from the very top of the screen: without this the spotlight sat one status bar too
  // high (2026-11-25, seen on the phone).
  const shiftY = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const [cardH, setCardH] = useState(260);
  const accent = toneColor(C, tone, isDark);
  // The panel's tint: the step's colour mixed into the card colour (a solid colour, for the halftone's glow).
  const paper = mixHex(accent, C.bgCard, isDark ? 0.24 : 0.15);

  // The spotlight hole, animated between steps.
  const hx = useSharedValue(0);
  const hy = useSharedValue(0);
  const hw = useSharedValue(0);
  const hh = useSharedValue(0);
  const ring = useSharedValue(0);
  const fill = useSharedValue(0);

  const local = anchor ? { ...anchor, y: anchor.y + shiftY } : null;
  const hole = local && screen.width > 0 ? spotlightRect(local, SPOT_PAD, screen) : null;
  useEffect(() => {
    if (!screen.width) return;
    const target = hole ?? { x: screen.width / 2, y: screen.height / 2, width: 0, height: 0 };
    const t = (v: number) => (reduce ? v : withTiming(v, { duration: 320, easing: Easing.out(Easing.cubic) }));
    hx.value = t(target.x);
    hy.value = t(target.y);
    hw.value = t(target.width);
    hh.value = t(target.height);
    ring.value = hole && ready ? t(1) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole?.x, hole?.y, hole?.width, hole?.height, screen.width, screen.height, ready, reduce]);

  const ratio = tourProgress(index, total).ratio;
  useEffect(() => {
    fill.value = reduce ? ratio : withTiming(ratio, { duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio, reduce]);

  const W = screen.width;
  const H = screen.height;
  const dimProps = useAnimatedProps(() => {
    const x = hx.value;
    const y = hy.value;
    const w = hw.value;
    const h = hh.value;
    let d = `M0,0 H${W} V${H} H0 Z`;
    if (w > 1 && h > 1) {
      const r = Math.min(SPOT_RADIUS, w / 2, h / 2);
      d +=
        ` M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h}` +
        ` H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
    }
    return { d };
  }, [W, H]);
  const ringProps = useAnimatedProps(() => {
    const x = hx.value;
    const y = hy.value;
    const w = hw.value;
    const h = hh.value;
    if (w <= 1 || h <= 1) return { d: 'M0,0', opacity: 0 };
    const r = Math.min(SPOT_RADIUS, w / 2, h / 2);
    const d =
      `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h}` +
      ` H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
    return { d, opacity: ring.value };
  });
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  if (!visible) return null;

  const onLayoutRoot = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== screen.width || height !== screen.height) setScreen({ width, height });
  };
  const onLayoutCard = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (Math.abs(h - cardH) > 1) setCardH(h);
  };

  const cardW = Math.min(MAX_CARD_W, Math.max(0, W - 32));
  const safe = { top: insets.top + 8, bottom: H - insets.bottom - 8 };
  let top: number;
  let side: 'below' | 'above' | 'center' = 'center';
  let left = (W - cardW) / 2;
  if (hole) {
    const placed = cardTop(hole, cardH, safe);
    top = placed.top;
    side = placed.side;
    const cx = hole.x + hole.width / 2;
    left = Math.max(16, Math.min(W - cardW - 16, cx - cardW / 2));
  } else {
    top = Math.max(safe.top, (H - cardH) / 2);
  }
  // The pointer on the card's edge, under / over the spotlight's centre (clear of the rounded corners).
  const caretX = hole
    ? Math.max(CARD_RADIUS + 2, Math.min(cardW - CARD_RADIUS - 2 - CARET_W, hole.x + hole.width / 2 - left - CARET_W / 2))
    : 0;
  const caretTouchesHole = !!hole && (side === 'below' ? top >= hole.y + hole.height : top + cardH <= hole.y);

  const progress = tourProgress(index, total);
  const isFirst = index === 0;
  const isLast = index >= total - 1;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={isFirst ? onSkip : onBack}
    >
      <View style={StyleSheet.absoluteFill} onLayout={onLayoutRoot}>
        {W > 0 && (
          <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
            <AnimatedPath animatedProps={dimProps} fill={isDark ? 'rgba(0,0,0,0.78)' : 'rgba(2,6,23,0.72)'} fillRule="evenodd" />
            <AnimatedPath animatedProps={ringProps} fill="none" stroke={withAlpha(accent, 0.35)} strokeWidth={8} />
            <AnimatedPath animatedProps={ringProps} fill="none" stroke={accent} strokeWidth={2.5} />
          </Svg>
        )}
        {/* The dim layer swallows taps: only the card's buttons move the tour. */}
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => {}} />

        {W > 0 && ready && (
          <View
            key={`card-${index}`}
            style={[styles.cardWrap, { width: cardW, left, top }]}
            onLayout={onLayoutCard}
            accessibilityViewIsModal
          >
            <TourCard
              title={title}
              body={body}
              icon={icon}
              accent={accent}
              paper={paper}
              features={features}
              where={where}
              label={progress.label}
              isFirst={isFirst}
              isLast={isLast}
              anchored={!!hole}
              side={side}
              caret={hole && caretTouchesHole && side !== 'center' ? { x: caretX, side } : null}
              cardW={cardW}
              fillStyle={fillStyle}
              reduce={reduce}
              onNext={onNext}
              onBack={onBack}
              onSkip={onSkip}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── the card ────────────────────────────────────────────────────────────────

/** The panel strip and the peeking mascot: compact beside a spotlight, larger on an illustrated (centred) step. */
const BAND = {
  anchored: { height: 58, mascot: 54, bottom: -16 },
  centered: { height: 108, mascot: 80, bottom: -10 },
};
const MASCOT_LEFT = 12;
const BODY_PAD = 14;

function TourCard({
  title,
  body,
  icon,
  accent,
  paper,
  features,
  where,
  label,
  isFirst,
  isLast,
  anchored,
  side,
  caret,
  cardW,
  fillStyle,
  reduce,
  onNext,
  onBack,
  onSkip,
}: {
  title: string;
  body: string;
  icon: string;
  accent: string;
  paper: string;
  features?: CoachmarkFeature[];
  where?: string;
  label: string;
  isFirst: boolean;
  isLast: boolean;
  anchored: boolean;
  side: 'below' | 'above' | 'center';
  caret: { x: number; side: 'below' | 'above' } | null;
  cardW: number;
  fillStyle: React.ComponentProps<typeof Animated.View>['style'];
  reduce: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ink = C.textPrimary;
  // Each step pops in from the spotlight's side; the mascot pokes up at a spotlight above the card, else waves.
  const motion = useMangaMotion({
    reduce,
    arm: side === 'below' ? 'point' : 'wave',
    fromScale: 0.8,
    fromRotate: -3,
    fromY: side === 'below' ? -16 : side === 'above' ? 16 : 0,
    hopFrom: anchored ? 30 : 44,
    hopDelay: 120,
    bubbleDelay: 220,
  });

  const band = anchored ? BAND.anchored : BAND.centered;
  const mascotH = mascotHeight(band.mascot);
  const mascotTop = band.height - band.bottom - mascotH;
  // The mascot's face (60, 58 in its 120 x 150 drawing).
  const face = { x: MASCOT_LEFT + band.mascot / 2, y: mascotTop + (58 * band.mascot) / 120 };
  const innerW = Math.max(1, cardW - 6);
  // The bubble's tail points up at the face (its tip is 5 in from the tail's left edge; 2.5 is the bubble's border).
  const tailLeft = Math.max(8, face.x - BODY_PAD - 2.5 - 5);
  const sparkles: SparkleSpot[] = [
    { left: band.mascot + 34, top: 60, size: 14, phase: 0 },
    { left: Math.round(innerW * 0.52), top: 74, size: 10, phase: 0.4 },
    { left: Math.round(innerW - 96), top: 58, size: 12, phase: 0.7 },
  ];

  return (
    <Animated.View style={motion.cardStyle}>
      <MangaFrame shadowColor={accent} radius={CARD_RADIUS} offset={6}>
        <MangaPanel
          height={band.height}
          paper={paper}
          dots={accent}
          clear={{ cx: percent(face.x, innerW), cy: percent(face.y, band.height), r: anchored ? '30%' : '38%' }}
          focus={face}
          spin={motion.spin}
          sparkle={reduce || anchored ? null : motion.sparkle}
          sparkleSpots={sparkles}
          sparkleColors={{ color: accent, accent: C.secondary }}
        >
          <Animated.View style={[styles.mascot, { bottom: band.bottom }, motion.mascotStyle]}>
            <Mascot size={band.mascot} wave={motion.wave} blink={motion.blink} decorative />
          </Animated.View>

          <View style={[styles.bandInfo, { left: MASCOT_LEFT + band.mascot + 10 }]}>
            <View style={styles.bandRow}>
              {anchored && (
                <View style={styles.iconChip}>
                  <MaterialCommunityIcons name={icon as any} size={15} color={accent} />
                </View>
              )}
              <View style={styles.caption}>
                <Text style={styles.captionText}>{label}</Text>
              </View>
              <View style={{ flex: 1 }} />
              {!isLast && (
                <Pressable
                  onPress={onSkip}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Skip the tour"
                  style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}
                >
                  <Text style={styles.skipText}>Skip</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.track}>
              <Animated.View style={[styles.trackFill, { backgroundColor: accent }, fillStyle]} />
            </View>
          </View>

          {!anchored && (
            <IconBurst icon={icon} size={48} color={accent} face={C.bgCard} ink={ink} style={styles.burst} />
          )}
        </MangaPanel>

        <View style={styles.body}>
          <SpeechBubble tail="top-left" tailLeft={tailLeft} style={styles.bubble} animatedStyle={motion.bubbleStyle}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <Text style={styles.bodyText}>{body}</Text>
          </SpeechBubble>

          {!!features?.length && (
            <View style={styles.features}>
              {features.map((f) => (
                <View key={f.title} style={styles.featureRow}>
                  <View style={[styles.featureIcon, { backgroundColor: paper }]}>
                    <MaterialCommunityIcons name={f.icon as any} size={16} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureText}>{f.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {!!where && (
            <View style={styles.whereChip}>
              <MaterialCommunityIcons name="menu" size={13} color={C.textSecondary} />
              <Text style={styles.whereText}>{where}</Text>
            </View>
          )}

          <View style={styles.btnRow}>
            {!isFirst && (
              <MangaButton
                variant="secondary"
                size="sm"
                label="Back"
                icon="arrow-left"
                onPress={onBack}
                accessibilityLabel="Previous step"
                style={styles.btnWrap}
              />
            )}
            <MangaButton
              size="sm"
              label={isLast ? 'Finish' : isFirst ? 'Start tour' : 'Next'}
              icon={isLast ? 'check' : 'arrow-right'}
              iconRight
              onPress={onNext}
              accessibilityLabel={isLast ? 'Finish the tour' : isFirst ? 'Start the tour' : 'Next step'}
              style={[styles.btnWrap, styles.nextWrap]}
            />
          </View>
        </View>
      </MangaFrame>

      {caret && <Caret x={caret.x} up={caret.side === 'below'} fill={caret.side === 'below' ? paper : C.bgCard} ink={ink} />}
    </Animated.View>
  );
}

/** The manga pointer on the card's edge: it opens the card's border towards the spotlight. */
function Caret({ x, up, fill, ink }: { x: number; up: boolean; fill: string; ink: string }) {
  return (
    <View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: x, width: CARET_W, height: CARET_H },
        up ? { top: -CARET_OUT } : { bottom: -CARET_OUT, transform: [{ scaleY: -1 }] },
      ]}
    >
      <Svg width={CARET_W} height={CARET_H}>
        <Path d={`M1 ${CARET_H} L12 1.5 L23 ${CARET_H} Z`} fill={fill} />
        <Path d="M0.8 12.6 L12 1.5 L23.2 12.6" stroke={ink} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

const makeStyles = (C: Palette) => {
  const ink = C.textPrimary;
  return StyleSheet.create({
    cardWrap: { position: 'absolute' },

    mascot: { position: 'absolute', left: MASCOT_LEFT },
    bandInfo: { position: 'absolute', right: 10, top: 9 },
    bandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    iconChip: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: ink,
      backgroundColor: C.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // A manga "narration box".
    caption: {
      borderWidth: 2,
      borderColor: ink,
      backgroundColor: C.bgCard,
      borderRadius: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      transform: [{ skewX: '-6deg' }],
    },
    captionText: { color: ink, fontFamily: FontFamily.displayBold, fontSize: 11, letterSpacing: 0.3 },
    skip: {
      borderWidth: 2,
      borderColor: ink,
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    skipPressed: { opacity: 0.7 },
    skipText: { color: ink, fontFamily: FontFamily.bodySemibold, fontSize: 12 },
    track: {
      height: 10,
      marginTop: 7,
      borderRadius: BorderRadius.full,
      borderWidth: 2,
      borderColor: ink,
      backgroundColor: C.bgCard,
      overflow: 'hidden',
    },
    trackFill: { height: '100%' },
    burst: { position: 'absolute', right: 12, bottom: 6 },

    body: { padding: BODY_PAD, paddingTop: 16 },
    bubble: { borderRadius: 16, paddingVertical: 10 },
    title: {
      color: ink,
      fontFamily: FontFamily.displayBold,
      fontSize: 18,
      letterSpacing: -0.2,
      marginBottom: 4,
      transform: [{ skewX: '-5deg' }],
    },
    bodyText: { color: C.textSecondary, fontFamily: FontFamily.bodyRegular, fontSize: 13.5, lineHeight: 19 },
    features: { marginTop: 12, gap: 10 },
    featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    featureIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureTitle: { color: C.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
    featureText: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 12, lineHeight: 16, marginTop: 1 },
    whereChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: C.bgSurfaceLow,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: C.outline,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginTop: 12,
    },
    whereText: { color: C.textSecondary, fontSize: 11.5, fontFamily: FontFamily.bodySemibold },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    btnWrap: { marginRight: 3, marginBottom: 3 },
    nextWrap: { flex: 1 },
  });
};
