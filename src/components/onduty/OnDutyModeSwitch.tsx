import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { useReduceMotion } from '../myrequests/useReduceMotion';

export type OnDutyMode = 'apply' | 'records';

/**
 * The On-Duty page's two primary options (owner, 2026-10-31): Apply On-Duty and View Records, as two big cards.
 * The chosen one fills with colour; each says in a few words what is behind it (a day in progress, what is waiting).
 */
export function OnDutyModeSwitch({
  value,
  onChange,
  applyNote,
  recordsNote,
  live,
}: {
  value: OnDutyMode;
  onChange: (mode: OnDutyMode) => void;
  /** e.g. "Day in progress · 2 of 4 punches" or "Start a new request". */
  applyNote: string;
  /** e.g. "1 waiting · 4 this month". */
  recordsNote: string;
  /** An On-Duty day is running now: the Apply card shows a live dot. */
  live: boolean;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  const options: { key: OnDutyMode; title: string; note: string; icon: string }[] = [
    { key: 'apply', title: live ? 'Today’s On-Duty' : 'Apply On-Duty', note: applyNote, icon: live ? 'briefcase-clock-outline' : 'briefcase-plus-outline' },
    { key: 'records', title: 'View Records', note: recordsNote, icon: 'history' },
  ];

  return (
    <View style={styles.row} accessibilityRole="tablist" testID="on-duty-mode">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{ flex: 1 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${o.title}. ${o.note}`}
            testID={`on-duty-mode-${o.key}`}
          >
            <MotiView
              animate={{
                backgroundColor: active ? Colors.primary : Colors.bgCard,
                borderColor: active ? Colors.primary : Colors.border,
                scale: active ? 1 : 0.98,
              }}
              transition={{ type: 'timing', duration: 220 }}
              style={styles.card}
            >
              <View style={styles.top}>
                <View style={[styles.iconWrap, { backgroundColor: active ? 'rgba(255,255,255,0.18)' : Colors.badgeYellowBg }]}>
                  <MaterialCommunityIcons name={o.icon as any} size={20} color={active ? '#fff' : Colors.categoryOnDuty} />
                </View>
                {o.key === 'apply' && live && (
                  <MotiView
                    from={{ opacity: 1 }}
                    animate={{ opacity: reduceMotion ? 1 : 0.3 }}
                    transition={reduceMotion ? { type: 'timing', duration: 0 } : { type: 'timing', duration: 900, loop: true }}
                    style={[styles.liveDot, { backgroundColor: active ? '#fff' : Colors.statusGreen }]}
                  />
                )}
              </View>
              <Text style={[styles.title, { color: active ? '#fff' : Colors.textPrimary }]} numberOfLines={1}>{o.title}</Text>
              <Text style={[styles.note, { color: active ? 'rgba(255,255,255,0.85)' : Colors.textMuted }]} numberOfLines={2}>
                {o.note}
              </Text>
            </MotiView>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    card: { borderRadius: BorderRadius.xl, borderWidth: 1.5, padding: 14, gap: 6, minHeight: 112 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconWrap: { width: 38, height: 38, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
    liveDot: { width: 10, height: 10, borderRadius: 5 },
    title: { fontFamily: FontFamily.displayBold, fontSize: 15 },
    note: { fontSize: 11.5, lineHeight: 16, color: Colors.textMuted },
  });
