import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import type { RuleSection } from '../../lib/liveTrackingStatus';
import { toneColors } from './parts';
import type { Tone } from '../../lib/liveTrackingStatus';

const TONE: Record<RuleSection['id'], Tone> = { active: 'good', not_active: 'neutral', offline: 'warn', hr_sees: 'neutral' };

/** WHEN location tracking is active and when it is not, what happens offline, and what HR sees. Plain text, no controls. */
export function RulesCards({ sections }: { sections: RuleSection[] }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={{ gap: 10 }}>
      {sections.map((s) => {
        const t = toneColors(TONE[s.id], C);
        return (
          <View key={s.id} style={styles.card}>
            <View style={styles.head}>
              <View style={[styles.icon, { backgroundColor: t.bg }]}>
                <MaterialCommunityIcons name={s.icon as any} size={17} color={s.id === 'hr_sees' || s.id === 'not_active' ? C.primary : t.solid} />
              </View>
              <Text style={styles.title} accessibilityRole="header">{s.title}</Text>
            </View>
            {s.items.map((item, idx) => (
              <View key={idx} style={styles.item}>
                <View style={[styles.bullet, { backgroundColor: t.solid }]} />
                <Text style={styles.itemText}>{item}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: C.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: C.border, padding: 14, gap: 9 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
    icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingLeft: 4 },
    bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
    itemText: { flex: 1, color: C.textSecondary, fontSize: 12.5, lineHeight: 18.5 },
  });
