import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius, Spacing } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/**
 * A single spotlight/coachmark card for a guided feature tour (Stitch:
 * "Interactive Tooltips & Feature Walkthrough") — step counter, title, body
 * copy, Next/Skip, and a final "Got it!" dismiss on the last step.
 *
 * Generic and unwired: this only renders the card + its pointer caret at a
 * given anchor. The actual multi-step tour over the Home Dashboard's real
 * elements (measuring each target via onLayout/ref, sequencing steps,
 * persisting "seen" to AsyncStorage like the theme-mode flag) belongs to
 * that screen's own redesign pass — building it here, before Home Dashboard
 * exists in its new form, would mean pointing at elements that don't exist
 * yet under their final layout.
 */

export type CoachmarkAnchor = { x: number; y: number; width: number; height: number };

interface CoachmarkProps {
  visible: boolean;
  title: string;
  body: string;
  step: number;
  total: number;
  /** Measured position (e.g. from onLayout) of the element being pointed at. */
  anchor?: CoachmarkAnchor;
  /** Which side of the anchor the card sits on. Defaults to below. */
  placement?: 'top' | 'bottom';
  onNext: () => void;
  onSkip: () => void;
}

const CARD_WIDTH = 280;
const SCREEN_MARGIN = 16;

export function Coachmark({ visible, title, body, step, total, anchor, placement = 'bottom', onNext, onSkip }: CoachmarkProps) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(placement === 'bottom' ? -6 : 6)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, tension: 90, friction: 12, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  const screenWidth = Dimensions.get('window').width;
  const left = anchor
    ? Math.min(Math.max(anchor.x + anchor.width / 2 - CARD_WIDTH / 2, SCREEN_MARGIN), screenWidth - CARD_WIDTH - SCREEN_MARGIN)
    : (screenWidth - CARD_WIDTH) / 2;
  const top = anchor
    ? placement === 'bottom'
      ? anchor.y + anchor.height + 12
      : anchor.y - 12
    : undefined;

  const isLast = step >= total;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { width: CARD_WIDTH, left, opacity, transform: [{ translateY }] },
        placement === 'top' ? { bottom: top !== undefined ? Dimensions.get('window').height - top : undefined } : { top },
      ]}
    >
      {placement === 'bottom' && <View style={[styles.caret, styles.caretUp]} />}

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.step}>{`Step ${step} of ${total}`}</Text>
          <TouchableOpacity onPress={onSkip} hitSlop={8}>
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>

        <View style={styles.dotsRow}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[styles.dot, i + 1 === step && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={onNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>{isLast ? 'Got it!' : 'Next'}</Text>
          {!isLast && <MaterialCommunityIcons name="arrow-right" size={16} color={C.onPrimary} />}
        </TouchableOpacity>
      </View>

      {placement === 'top' && <View style={[styles.caret, styles.caretDown]} />}
    </Animated.View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 1000,
    alignItems: 'center',
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 15 },
      android: { elevation: 8 },
    }),
  },
  caret: {
    width: 14,
    height: 14,
    backgroundColor: Colors.bgCard,
    borderColor: Colors.border,
    transform: [{ rotate: '45deg' }],
  },
  caretUp: { marginBottom: -7, borderLeftWidth: 1, borderTopWidth: 1 },
  caretDown: { marginTop: -7, borderRightWidth: 1, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  step: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 11, letterSpacing: 0.2 },
  skip: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 12 },
  title: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15, marginBottom: 4 },
  body: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  dotsRow: { flexDirection: 'row', gap: 5, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.primary, width: 14 },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 9,
  },
  nextBtnText: { color: Colors.onPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
});
