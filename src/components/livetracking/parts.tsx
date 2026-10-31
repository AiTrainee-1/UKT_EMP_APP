import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { useReduceMotion } from '../../lib/motionPrefs';
import type { Tone } from '../../lib/liveTrackingStatus';

export interface ToneColors {
  /** Text / icon on the tint. */
  fg: string;
  /** Soft tint block. */
  bg: string;
  /** Vivid dot / ring. */
  solid: string;
}

export function toneColors(tone: Tone, C: Palette): ToneColors {
  switch (tone) {
    case 'good':
      return { fg: C.badgeGreenText, bg: C.badgeGreenBg, solid: C.statusGreen };
    case 'warn':
      return { fg: C.badgeYellowText, bg: C.badgeYellowBg, solid: C.statusYellow };
    case 'bad':
      return { fg: C.badgeRedText, bg: C.badgeRedBg, solid: C.statusRed };
    default:
      return { fg: C.badgePendingText, bg: C.badgePendingBg, solid: C.textMuted };
  }
}

/**
 * The calm "live" indicator: a solid disc with an icon and, while `active`, two soft rings that slowly grow and fade.
 * With the phone's Reduce Motion setting on (or when not active) the rings are a still halo instead.
 */
export function LivePulse({ tone, active, icon, size = 60 }: { tone: Tone; active: boolean; icon: string; size?: number }) {
  const { C } = useTheme();
  const reduce = useReduceMotion();
  const t = toneColors(tone, C);
  const ring = { position: 'absolute' as const, width: size, height: size, borderRadius: size / 2, backgroundColor: t.solid };
  const animate = active && !reduce;
  return (
    <View
      style={{ width: size * 1.7, height: size * 1.7, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {animate ? (
        <>
          <MotiView
            from={{ opacity: 0.32, scale: 1 }}
            animate={{ opacity: 0, scale: 1.7 }}
            transition={{ type: 'timing', duration: 2400, loop: true, repeatReverse: false }}
            style={ring}
          />
          <MotiView
            from={{ opacity: 0.32, scale: 1 }}
            animate={{ opacity: 0, scale: 1.7 }}
            transition={{ type: 'timing', duration: 2400, delay: 1200, loop: true, repeatReverse: false }}
            style={ring}
          />
        </>
      ) : (
        <View style={[ring, { width: size * 1.35, height: size * 1.35, borderRadius: (size * 1.35) / 2, backgroundColor: t.bg }]} />
      )}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: active ? t.solid : t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name={icon as any} size={size * 0.45} color={active ? '#fff' : t.solid} />
      </View>
    </View>
  );
}

/** A small pill with a dot, e.g. "Yes, live" / "No". */
export function TonePill({ tone, text, pulse = false }: { tone: Tone; text: string; pulse?: boolean }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const t = toneColors(tone, C);
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <MotiView
        from={{ opacity: 1 }}
        animate={{ opacity: pulse && !reduce ? 0.35 : 1 }}
        transition={pulse && !reduce ? { type: 'timing', duration: 1400, loop: true } : { type: 'timing', duration: 0 }}
        style={[styles.pillDot, { backgroundColor: t.solid }]}
      />
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={styles.sectionLabel} accessibilityRole="header">
      {children}
    </Text>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 5 },
    pillDot: { width: 7, height: 7, borderRadius: 4 },
    pillText: { fontSize: 11.5, fontWeight: '800' },
    sectionLabel: { color: C.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 6, marginBottom: -4 },
  });
