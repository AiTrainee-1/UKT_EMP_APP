import React, { useEffect, useRef, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ScrollViewInstance,
  type StyleProp,
  type ViewInstance,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { useReduceMotion } from '../../lib/motionPrefs';
import { FOCUS_MISSING_TEXT, FOCUS_STATIC_MS, FOCUS_TOP_GAP } from '../../lib/focusItem';

/** "#2563EB" + "1F" -> "#2563EB1F"; any other colour format gets no tint (the ring alone still shows). */
function tint(hex: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : 'transparent';
}

/**
 * Wraps one item of a list so a link can point at it (see src/hooks/useFocusItem.ts): while `active` it draws a ring
 * over the item that pulses once (fade in, dip, back, fade out) - a still ring, no animation, under Reduce Motion - and,
 * on a ScrollView screen (`scrollRef`), scrolls the item into view first. FlatList screens scroll from the hook.
 *
 * `bottomInset`: the item's own bottom margin (most cards keep 10 below themselves), so the ring sits on the card, not
 * around the gap under it. `radius`: the card's corner radius.
 */
export function FocusFrame({
  active,
  pulseKey,
  scrollRef,
  children,
  style,
  radius = BorderRadius.xl,
  bottomInset = 0,
  testID,
}: {
  active: boolean;
  pulseKey: number;
  scrollRef?: RefObject<ScrollViewInstance | null>;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  bottomInset?: number;
  testID?: string;
}) {
  const { C: Colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const ref = useRef<ViewInstance>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!active) return;
    setOn(true);
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (scrollRef) {
      let firstY: number | null = null;
      const measure = (then: (y: number) => void) => {
        const sv = scrollRef.current;
        const inner = sv?.getInnerViewRef?.();
        const node = ref.current;
        if (!sv || !inner || !node) return;
        try {
          node.measureLayout(inner, (_x: number, y: number) => then(y), () => {});
        } catch {
          // not laid out (any more)
        }
      };
      const scrollTo = (y: number, animated: boolean) =>
        scrollRef.current?.scrollTo({ y: Math.max(0, y - FOCUS_TOP_GAP), animated });
      timers.push(
        setTimeout(() => measure((y) => {
          firstY = y;
          scrollTo(y, !reduceMotion);
        }), 120),
      );
      // Something above the item can still be settling (a card that loaded late): correct once if it moved.
      timers.push(
        setTimeout(() => measure((y) => {
          if (firstY != null && Math.abs(y - firstY) > 24) scrollTo(y, false);
        }), 700),
      );
    }

    if (reduceMotion) {
      opacity.setValue(1);
      timers.push(setTimeout(() => setOn(false), FOCUS_STATIC_MS));
      return () => timers.forEach(clearTimeout);
    }

    opacity.setValue(0);
    const pulse = Animated.sequence([
      Animated.delay(180),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.35, duration: 380, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]);
    pulse.start(({ finished }) => {
      if (finished) setOn(false);
    });
    return () => {
      pulse.stop();
      timers.forEach(clearTimeout);
    };
    // a new highlight of the same item comes with a new pulseKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pulseKey]);

  return (
    <View ref={ref} collapsable={false} style={style} testID={testID}>
      {children}
      {on && (
        <Animated.View
          pointerEvents="none"
          style={[
            frameStyles.ring,
            {
              bottom: bottomInset,
              borderRadius: radius,
              borderColor: Colors.primary,
              backgroundColor: tint(Colors.primary, '14'),
              opacity,
            },
          ]}
        />
      )}
    </View>
  );
}

const frameStyles = StyleSheet.create({
  ring: { position: 'absolute', top: 0, left: 0, right: 0, borderWidth: 2.5 },
});

/**
 * The small note a screen shows when the request a link pointed at is not in its list any more (deleted, too old): the
 * page itself is shown as usual. Read out once by a screen reader; the close button is a full 44 dp target.
 */
export function FocusMissingNote({
  text = FOCUS_MISSING_TEXT,
  onDismiss,
  style,
}: {
  text?: string;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(text);
  }, [text]);

  return (
    <View style={[styles.note, style]} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="focus-missing-note">
      <MaterialCommunityIcons name="information-outline" size={16} color={Colors.textSecondary} />
      <Text style={styles.text}>{text}</Text>
      <TouchableOpacity
        onPress={onDismiss}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Dismiss this note"
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="close" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    note: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.bgSurfaceLow,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingLeft: 12,
      marginBottom: 10,
    },
    text: { flex: 1, color: Colors.textSecondary, fontSize: 12.5, lineHeight: 17, paddingVertical: 10 },
    close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  });
