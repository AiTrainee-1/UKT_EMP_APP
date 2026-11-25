import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

/**
 * The app's chibi mascot (owner 2026-11-25, first drawn for the app-update popup): a big round head with a blue fringe and
 * a thread-loop "ahoge", sitting on a little thread spool. Original art, drawn with react-native-svg.
 *
 * The right arm turns about the shoulder by `wave` (degrees: the update card waves it, the tour pokes it upwards) and the
 * eyes close by `blink` (1 open, ~0 shut). Art colours are fixed (it is an illustration); the outline is a soft ink that
 * reads on both themes' panel tints.
 */

export const MASCOT_ART = {
  ink: '#1B1B3A',
  skin: '#FFE4D2',
  hair: '#2B59D9',
  hairShine: '#FFFFFF',
  wood: '#E9B872',
  thread: '#2563EB',
  threadLight: '#93C5FD',
  blush: '#FF8FA3',
  mouth: '#E2556B',
  iris: '#3B82F6',
};

/** Drawing units: 120 wide, 150 tall. */
const VIEW_W = 120;
const VIEW_H = 150;
const EYES_BOX = { x: 36, y: 50, w: 48, h: 26 };

/** The mascot's height for a given width. */
export function mascotHeight(width: number): number {
  return (width * VIEW_H) / VIEW_W;
}

export function Mascot({
  size = 104,
  wave,
  blink,
  label = 'A cheerful mascot waving',
  decorative = false,
  style,
}: {
  /** Width in points (the update card's is 104). */
  size?: number;
  wave: SharedValue<number>;
  blink: SharedValue<number>;
  label?: string;
  /** Hidden from screen readers (a card whose words already say everything). */
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const W = size;
  const H = mascotHeight(size);
  const S = W / VIEW_W; // drawing units to screen points
  // The waving arm turns about the right shoulder; the eyes close about their middle line.
  const dx = 76 * S - W / 2;
  const dy = 108 * S - H / 2;
  const armStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx },
      { translateY: dy },
      { rotate: `${wave.value}deg` },
      { translateX: -dx },
      { translateY: -dy },
    ],
  }));
  const eyesStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const a11y = decorative
    ? ({ accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const)
    : ({ accessible: true, accessibilityLabel: label } as const);

  return (
    <View style={[{ width: W, height: H }, style]} {...a11y}>
      <Svg width={W} height={H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={StyleSheet.absoluteFill}>
        {/* the spool body */}
        <Rect x={43} y={100} width={34} height={31} fill={MASCOT_ART.thread} stroke={MASCOT_ART.ink} strokeWidth={2.4} />
        {[106, 111, 116, 121, 126].map((y) => (
          <Path key={y} d={`M45 ${y} L75 ${y}`} stroke={MASCOT_ART.threadLight} strokeWidth={1.6} strokeLinecap="round" />
        ))}
        <Rect x={37} y={93} width={46} height={9} rx={4.5} fill={MASCOT_ART.wood} stroke={MASCOT_ART.ink} strokeWidth={2.4} />
        <Rect x={37} y={129} width={46} height={9} rx={4.5} fill={MASCOT_ART.wood} stroke={MASCOT_ART.ink} strokeWidth={2.4} />
        {/* the resting arm */}
        <Path d="M45 108 Q36 112 32 119" stroke={MASCOT_ART.ink} strokeWidth={8.5} strokeLinecap="round" fill="none" />
        <Path d="M45 108 Q36 112 32 119" stroke={MASCOT_ART.skin} strokeWidth={5} strokeLinecap="round" fill="none" />
        <Circle cx={31} cy={121} r={5} fill={MASCOT_ART.skin} stroke={MASCOT_ART.ink} strokeWidth={2.2} />
        {/* the head */}
        <Path d="M21 60 C19 71 22 79 28 84 C26 75 26 68 28 62 Z" fill={MASCOT_ART.hair} stroke={MASCOT_ART.ink} strokeWidth={2.2} strokeLinejoin="round" />
        <Path d="M99 60 C101 71 98 79 92 84 C94 75 94 68 92 62 Z" fill={MASCOT_ART.hair} stroke={MASCOT_ART.ink} strokeWidth={2.2} strokeLinejoin="round" />
        <Circle cx={60} cy={58} r={40} fill={MASCOT_ART.skin} stroke={MASCOT_ART.ink} strokeWidth={2.6} />
        <Path
          d="M20 62 C16 30 36 14 60 14 C84 14 104 30 100 62 C96 53 92 47 88 45 L84 55 L77 43 L70 53 L62 41 L55 53 L48 43 L41 55 L35 46 C29 49 24 55 20 62 Z"
          fill={MASCOT_ART.hair}
          stroke={MASCOT_ART.ink}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
        <Path d="M36 28 Q48 19 64 20" stroke={MASCOT_ART.hairShine} strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" fill="none" />
        {/* the thread-loop ahoge */}
        <Path d="M60 15 C53 2 71 -2 69 8 C68 13 62 12 63 8" stroke={MASCOT_ART.hair} strokeWidth={3.2} strokeLinecap="round" fill="none" />
        {/* cheeks and smile */}
        <Ellipse cx={37} cy={74} rx={5.5} ry={2.8} fill={MASCOT_ART.blush} opacity={0.75} />
        <Ellipse cx={83} cy={74} rx={5.5} ry={2.8} fill={MASCOT_ART.blush} opacity={0.75} />
        <Path d="M54 75 Q60 83 66 75 Z" fill={MASCOT_ART.mouth} stroke={MASCOT_ART.ink} strokeWidth={1.8} strokeLinejoin="round" />
      </Svg>

      {/* the eyes, on their own layer so they can blink */}
      <Animated.View
        style={[
          { position: 'absolute', left: EYES_BOX.x * S, top: EYES_BOX.y * S, width: EYES_BOX.w * S, height: EYES_BOX.h * S },
          eyesStyle,
        ]}
      >
        <Svg width={EYES_BOX.w * S} height={EYES_BOX.h * S} viewBox={`${EYES_BOX.x} ${EYES_BOX.y} ${EYES_BOX.w} ${EYES_BOX.h}`}>
          {[47, 73].map((cx) => (
            <React.Fragment key={cx}>
              <Ellipse cx={cx} cy={63} rx={6.2} ry={9} fill={MASCOT_ART.ink} />
              <Ellipse cx={cx} cy={66.5} rx={4.6} ry={4.6} fill={MASCOT_ART.iris} />
              <Circle cx={cx - 2} cy={59.5} r={2.5} fill="#FFFFFF" />
              <Circle cx={cx + 2.3} cy={67.5} r={1.2} fill="#FFFFFF" />
            </React.Fragment>
          ))}
        </Svg>
      </Animated.View>

      {/* the waving arm, turning about the shoulder */}
      <Animated.View style={[StyleSheet.absoluteFill, armStyle]} pointerEvents="none">
        <Svg width={W} height={H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          <Path d="M75 108 Q88 104 93 91" stroke={MASCOT_ART.ink} strokeWidth={8.5} strokeLinecap="round" fill="none" />
          <Path d="M75 108 Q88 104 93 91" stroke={MASCOT_ART.skin} strokeWidth={5} strokeLinecap="round" fill="none" />
          <Circle cx={94} cy={87} r={5.6} fill={MASCOT_ART.skin} stroke={MASCOT_ART.ink} strokeWidth={2.2} />
        </Svg>
      </Animated.View>
    </View>
  );
}
