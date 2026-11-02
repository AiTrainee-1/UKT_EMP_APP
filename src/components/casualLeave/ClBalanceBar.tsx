import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { TabularNums } from '../../constants/typography';
import { useReduceMotion } from '../../lib/motionPrefs';
import {
  balanceCells,
  balanceDetail,
  balanceSentence,
  type BalanceHalf,
  type CLBalance,
} from '../../lib/casualLeave';

/**
 * The yearly Casual Leave balance (owner 2026-11-02) as twelve boxes, one per day: approved days first (solid), then days
 * waiting for approval (yellow), then what is left (empty). A half-day fills half a box. Under it the sentence "11 of 12 CL
 * left in 2026 · resets on 1 Jan" and what is taken / waiting. One element for a screen reader (a progress bar).
 */
export function ClBalanceBar({ balance, compact = false }: { balance: CLBalance; compact?: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const cells = balanceCells(balance);
  const detail = balanceDetail(balance);
  const color = (h: BalanceHalf) => (h === 'used' ? Colors.primary : h === 'pending' ? Colors.statusYellow : 'transparent');

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Casual Leave balance. ${balanceSentence(balance)}.${detail ? ` ${detail}.` : ''}`}
      accessibilityValue={{ min: 0, max: balance.total, now: balance.remaining }}
      testID="cl-balance"
    >
      <View style={[styles.bar, compact && { height: 10 }]}>
        {cells.map((cell, i) => (
          <MotiView
            key={i}
            from={reduce ? undefined : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: reduce ? 0 : 220, delay: reduce ? 0 : i * 22 }}
            style={styles.cell}
          >
            <View style={[styles.half, { backgroundColor: color(cell[0]) }]} />
            <View style={[styles.half, { backgroundColor: color(cell[1]) }]} />
          </MotiView>
        ))}
      </View>
      <Text style={[styles.sentence, compact && { fontSize: 12 }, TabularNums]}>{balanceSentence(balance)}</Text>
      {detail ? <Text style={[styles.detail, TabularNums]}>{detail}</Text> : null}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    bar: { flexDirection: 'row', gap: 3, height: 14 },
    cell: {
      flex: 1,
      flexDirection: 'row',
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: Colors.bgSurfaceLow,
      borderWidth: 1,
      borderColor: Colors.outlineVariant,
    },
    half: { flex: 1 },
    sentence: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700', marginTop: 8 },
    detail: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  });
