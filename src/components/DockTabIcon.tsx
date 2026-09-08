import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, ColorValue } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeProvider';

/**
 * macOS Dock-style tab icon: the focused icon magnifies and lifts out of the
 * bar, over a soft tinted well, with a dot beneath it.
 *
 * Deliberately implemented as a `tabBarIcon` rather than a whole custom
 * `tabBar`. A custom bar renders everything in `state.routes`, and expo
 * router's `href: null` does NOT remove a route from that array -it only
 * suppresses the button the built-in bar would draw. Replacing the bar
 * therefore means re-implementing that filtering, and getting it wrong shows
 * every hidden route (Leave, Alerts, and Approvals for non-managers) as an
 * extra unlabelled tab. Swapping only the icon keeps the built-in bar doing
 * the filtering it already does correctly.
 *
 * Motion follows the dock: a spring, not a timing curve, so an icon caught
 * mid-magnify can be re-targeted without a visible jump, and settles the way
 * a physical thing does. Critically damped-ish -a tab change is not a
 * gesture the user threw, so it should not overshoot much.
 */

const SPRING = { useNativeDriver: true, speed: 20, bounciness: 6 };

export function DockTabIcon({
  name,
  color,
  focused,
}: {
  name: string;
  color: ColorValue;
  focused: boolean;
}) {
  const { C } = useTheme();
  const t = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(t, { toValue: focused ? 1 : 0, ...SPRING }).start();
  }, [focused, t]);

  return (
    <View style={styles.slot}>
      {/* The well behind the magnified icon -grows in from nothing rather
          than fading a fixed-size shape in, so it reads as the icon pushing
          the surface outward. */}
      <Animated.View
        style={[
          styles.well,
          {
            backgroundColor: C.primaryFixed,
            opacity: t,
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          },
        ]}
      />
      <Animated.View
        style={{
          transform: [
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
          ],
        }}
      >
        <MaterialCommunityIcons name={name as any} size={22} color={color} />
      </Animated.View>

      {/* The dock's running-app dot. */}
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: color,
            opacity: t,
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { width: 44, height: 30, alignItems: 'center', justifyContent: 'center' },
  well: {
    position: 'absolute',
    top: 0, left: 2, right: 2, bottom: 2,
    borderRadius: 14,
  },
  dot: {
    position: 'absolute',
    bottom: -1,
    width: 3.5, height: 3.5, borderRadius: 2,
  },
});
