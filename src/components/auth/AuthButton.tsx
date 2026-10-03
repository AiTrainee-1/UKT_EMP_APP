import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { AuthColors, AuthFont } from './authTheme';

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** A small icon before the label (e.g. WhatsApp). */
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const NATIVE = Platform.OS !== 'web';
const CIRCLE = 46;

/**
 * The sign-in screens' button: the supplied "Btn-Container" pill (label on the left, a round icon on the right holding a
 * dotted arrow that keeps sliding forward) combined with the supplied "btn-shine" effect, here as a soft band of light that
 * sweeps across the pill every few seconds. Same props as the shared `Button`; that one is untouched.
 */
export function AuthButton({ title, onPress, loading = false, disabled = false, icon, style }: Props) {
  const inactive = disabled || loading;
  const [width, setWidth] = useState(0);

  const scale = useRef(new Animated.Value(1)).current;
  const arrow = useRef(new Animated.Value(0)).current; // 0 -> 1: the arrow slides 10 px and fades in, then repeats
  const shine = useRef(new Animated.Value(0)).current; // 0 -> 1: the band crosses the pill

  // The arrow and the shine only run while the button can be pressed, so a disabled one is calm.
  useEffect(() => {
    if (inactive) {
      arrow.setValue(0);
      shine.setValue(0);
      return;
    }
    const arrowLoop = Animated.loop(
      Animated.timing(arrow, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: NATIVE }),
    );
    const shineLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(shine, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: NATIVE }),
      ]),
    );
    arrowLoop.start();
    shineLoop.start();
    return () => {
      arrowLoop.stop();
      shineLoop.stop();
    };
  }, [inactive, arrow, shine]);

  const press = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: NATIVE, speed: 40, bounciness: 0 }).start();
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-120, Math.max(width, 200) + 40] });
  const arrowX = arrow.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });
  // The supplied animation fades the arrow in from nothing; here it never quite vanishes, so the circle is not empty at any moment.
  const arrowOpacity = arrow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => press(0.97)}
        onPressOut={() => press(1)}
        disabled={inactive}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: inactive, busy: loading }}
        onLayout={onLayout}
        style={[styles.pill, disabled && !loading && styles.pillDisabled]}
      >
        <View style={styles.textArea}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              {icon ? <View style={styles.icon}>{icon}</View> : null}
              <Text style={styles.text} numberOfLines={1}>
                {title}
              </Text>
            </>
          )}
        </View>

        <View style={styles.circle}>
          <Animated.View style={{ opacity: arrowOpacity, transform: [{ translateX: arrowX }] }}>
            {/* The ten dots of the supplied arrow, in the same stair-step. */}
            <Svg width={16} height={19} viewBox="0 0 16 19">
              {[
                [1.61321, 1.61321], [5.73583, 1.61321], [5.73583, 5.5566], [9.85851, 5.5566], [9.85851, 9.5],
                [13.9811, 9.5], [5.73583, 13.4434], [9.85851, 13.4434], [1.61321, 17.3868], [5.73583, 17.3868],
              ].map(([cx, cy]) => (
                <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.5} fill={AuthColors.pill} />
              ))}
            </Svg>
          </Animated.View>
        </View>

        {!inactive && (
          <Animated.View pointerEvents="none" style={[styles.shine, { transform: [{ translateX: shineX }, { skewX: '-20deg' }] }]}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AuthColors.pill,
    borderRadius: 40,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: AuthColors.pill, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 14 },
      android: { elevation: 6 },
    }),
  },
  pillDisabled: { opacity: 0.5 },
  textArea: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingLeft: 18, minHeight: CIRCLE + 6 },
  icon: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontFamily: AuthFont.displaySemi, fontSize: 15, letterSpacing: 0.6 },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: AuthColors.pillCircle,
    borderWidth: 3,
    borderColor: AuthColors.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    margin: 3,
  },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 80 },
});
