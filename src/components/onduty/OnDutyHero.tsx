import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius, Spacing } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { Flow } from '../../lib/onDutyFlow';

interface Props {
  flow: Flow;
  /** The session's destination; null before there is a request. */
  destination: string | null;
  /** "Started 09:04 am" etc. */
  subtitle: string;
  outcome: 'running' | 'completed' | 'rejected';
}

const DONE_GRADIENT = ['#047857', '#10B981'] as const;
const REJECTED_GRADIENT = ['#9F1239', '#E11D48'] as const;

/**
 * The top of the On-Duty page: where you are going, which step of the seven you are on, and the seven steps as a thin progress
 * bar. Blue while it runs, green when it is done, red when the request was rejected.
 */
export function OnDutyHero({ flow, destination, subtitle, outcome }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const colors = outcome === 'completed' ? DONE_GRADIENT : outcome === 'rejected' ? REJECTED_GRADIENT : C.gradientPrimary;

  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.top}>
        <Text style={styles.eyebrow}>ON-DUTY</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{flow.headline}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={3}>{destination || 'Start your On-Duty'}</Text>
      {!!subtitle && <Text style={[styles.sub, TabularNums]}>{subtitle}</Text>}
      <View
        style={styles.bar}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${flow.headline}. ${flow.punchesDone} of 4 geo-punches recorded`}
        accessibilityValue={{ min: 0, max: flow.total, now: flow.steps.filter((s) => s.state === 'done').length }}
      >
        {flow.steps.map((s) => (
          <View
            key={s.key}
            style={[
              styles.seg,
              s.state === 'done' && styles.segDone,
              s.state === 'current' && styles.segCurrent,
              s.state === 'problem' && styles.segProblem,
            ]}
          />
        ))}
      </View>
    </LinearGradient>
  );
}

const makeStyles = (_C: Palette) =>
  StyleSheet.create({
    hero: { borderRadius: BorderRadius.xxl, padding: Spacing.base + 2, gap: 8 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    eyebrow: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    pill: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 },
    pillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    title: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 19, lineHeight: 25 },
    sub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5 },
    bar: { flexDirection: 'row', gap: 4, marginTop: 4 },
    seg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
    segDone: { backgroundColor: '#fff' },
    segCurrent: { backgroundColor: 'rgba(255,255,255,0.65)' },
    segProblem: { backgroundColor: 'rgba(255,255,255,0.9)' },
  });
