// Sidebar toggle icon supplied by the user (styled-components + <input
// type="checkbox">/SVG snippet, web-only). Ported to React Native: no real
// checkbox exists here, so an `open: boolean` prop drives the same
// line-morphs-to-X animation via react-native-svg's AnimatedPath, matching
// this session's established "port web animation to native primitives, keep
// the motion identical" pattern (HamburgerToggle mirrors the reasoning in
// SpeederLoader.tsx / marble-switch.tsx on the HR portal side).
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function HamburgerToggle({
  open,
  onPress,
  color = '#fff',
  size = 26,
}: {
  open: boolean;
  onPress: () => void;
  color?: string;
  size?: number;
}) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 400,
      useNativeDriver: false, // strokeDasharray/Offset + non-transform SVG props can't use the native driver
    }).start();
  }, [open, progress]);

  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-45deg'] });
  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -32.42] });
  const dashArray = progress.interpolate({ inputRange: [0, 1], outputRange: ['12 63', '20 300'] });

  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.hitArea}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <AnimatedPath
            d="M27 10 13 10C10.8 10 9 8.2 9 6 9 3.5 10.8 2 13 2 15.2 2 17 3.8 17 6L17 26C17 28.2 18.8 30 21 30 23.2 30 25 28.2 25 26 25 23.8 23.2 22 21 22L7 22"
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray as any}
            strokeDashoffset={dashOffset as any}
          />
          <Path
            d="M7 16 27 16"
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
