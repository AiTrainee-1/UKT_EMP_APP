import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from "expo-router/js-tabs";

import { useTheme } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';

/**
 * Floating glass tab bar -an inset, rounded, translucent pill rather than an
 * opaque strip welded to the bottom edge.
 *
 * Two ideas from Apple's material guidance drive the look:
 *   • translucency conveys hierarchy: the bar is a layer above the page, so
 *     the page must remain faintly visible through it;
 *   • a bright top edge reads as light catching the material, which is what
 *     stops a translucent panel looking like flat grey paint.
 *
 * True backdrop blur needs `expo-blur`, which is a native module this app
 * doesn't currently include. Adding one can't be verified without a device
 * rebuild, so this uses layered translucency + a light edge + a deep soft
 * shadow instead -the same visual language, no new native dependency. To
 * upgrade later: `npx expo install expo-blur`, then wrap `bar` in a
 * <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} />.
 */

const ICON = 22;

/** Springs, not timings: the pill is grabbed by a tap and should settle the
 *  way a physical object does. Critically damped by default -bounce is for
 *  motion the user's own gesture threw, which a tab change is not. */
const SPRING = { useNativeDriver: true, speed: 18, bounciness: 3 };

function TabItem({
  focused, color, iconName, label, badge, onPress, onLongPress, C,
}: {
  focused: boolean;
  color: string;
  iconName: string;
  label: string;
  badge?: number;
  onPress: () => void;
  onLongPress: () => void;
  C: Palette;
}) {
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(lift, { toValue: focused ? 1 : 0, ...SPRING }).start();
  }, [focused, lift]);

  return (
    <Pressable
      style={styles.item}
      // Feedback on press-down, not on release -waiting for touch-up to
      // acknowledge a tap is what makes an interface feel dead.
      onPressIn={() => Animated.spring(press, { toValue: 1, ...SPRING }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 0, ...SPRING }).start()}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={badge ? `${label}, ${badge} pending` : label}
    >
      <Animated.View
        style={{
          alignItems: 'center',
          transform: [
            { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }) },
            { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
          ],
        }}
      >
        <View>
          <Animated.View
            style={[
              styles.iconPill,
              {
                backgroundColor: C.primary,
                opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14] }),
                transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
              },
            ]}
          />
          <MaterialCommunityIcons name={iconName as any} size={ICON} color={color} />
          {!!badge && badge > 0 && (
            <View style={[styles.badge, { backgroundColor: C.statusRed, borderColor: C.bgCard }]}>
              <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          )}
        </View>
        <Text
          numberOfLines={1}
          style={[styles.label, { color, fontWeight: focused ? '800' : '600' }]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { C, isDark } = useTheme();

  // Routes hidden with href:null are absent from state.routes already, so
  // nothing here needs to know which tabs are conditional.
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: C.bgLight }]}>
      <View
        style={[
          styles.bar,
          {
            // Translucent, so the page reads faintly through the bar. Dark
            // mode needs the higher alpha -a light-alpha panel over a dark
            // ground turns into indistinct haze rather than a surface.
            backgroundColor: isDark ? 'rgba(22,31,37,0.88)' : 'rgba(255,255,255,0.82)',
            borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.75)',
            shadowColor: isDark ? '#000' : C.primary,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label =
            typeof options.title === 'string' ? options.title : route.name;
          const iconName =
            (options as any).glassIcon?.[focused ? 'active' : 'inactive'] ?? 'circle-outline';
          const badge = typeof options.tabBarBadge === 'number' ? options.tabBarBadge : undefined;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
          };
          const onLongPress = () =>
            navigation.emit({ type: 'tabLongPress', target: route.key });

          return (
            <TabItem
              key={route.key}
              focused={focused}
              color={focused ? C.primary : C.textMuted}
              iconName={iconName}
              label={label}
              badge={badge}
              onPress={onPress}
              onLongPress={onLongPress}
              C={C}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Deliberately in normal flow, not absolute. A custom tabBar that positions
  // itself absolutely has zero layout height, so react-navigation reserves no
  // space for it and every screen's last row -and the home screen's own
  // pinned Slide-to-Punch bar -ends up underneath it. Keeping it in flow lets
  // the navigator reserve the strip; the inset margins and radius still read
  // as a floating pill.
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 22 },
      android: { elevation: 16 },
    }),
  },
  item: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  iconPill: {
    position: 'absolute',
    top: -5, left: -12, right: -12, bottom: -5,
    borderRadius: 14,
  },
  label: { fontSize: 10, letterSpacing: 0.2, marginTop: 3 },
  badge: {
    position: 'absolute',
    top: -5, right: -9,
    minWidth: 16, height: 16, borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
});
