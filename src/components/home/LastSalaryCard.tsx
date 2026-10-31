import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSalaryInsights } from '../../hooks/useSalarySlips';
import { lastSalary } from '../../lib/homeAttention';
import { Reveal } from '../Reveal';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';

const SHOW_KEY = 'uktextiles.homeSalaryShown.v1';

/**
 * "Last salary" on Home: what the newest slip paid and how much attendance cost, one tap from the Salary screen. The same
 * figures as the Salary screen (GET /my/salary-insights: payable = the slip's net, loss = allocated - earned + late +
 * permission). Amounts are HIDDEN by default (Home is opened at the gate and on the shop floor, in front of others); the
 * eye button shows them and the phone remembers the choice. Nothing renders until there is a slip, and a failed load
 * renders nothing.
 */
export function LastSalaryCard() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data } = useSalaryInsights(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SHOW_KEY)
      .then((v) => { if (alive && v === '1') setShown(true); })
      .catch(() => { /* stays hidden */ });
    return () => { alive = false; };
  }, []);

  const toggle = () => {
    const next = !shown;
    setShown(next);
    AsyncStorage.setItem(SHOW_KEY, next ? '1' : '0').catch(() => { /* only a preference */ });
  };

  const s = lastSalary(data, !shown);
  if (!s) return null;

  const lossColor = s.lossTone === 'loss' ? Colors.statusRed : s.lossTone === 'none' ? Colors.statusGreen : Colors.textMuted;
  const a11y = shown
    ? `Last salary, ${s.periodLabel}: ${s.netText} paid. ${s.lossText}`
    : `Last salary, ${s.periodLabel}. Amounts hidden.`;

  return (
    <Reveal offsetY={8}>
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push('/salary' as any)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint="Opens Salary"
      >
        <View style={styles.headerRow}>
          <View style={styles.icon}>
            <MaterialCommunityIcons name="cash-multiple" size={18} color={Colors.categorySalary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Last salary</Text>
            <Text style={styles.period} numberOfLines={1}>{s.periodLabel}</Text>
          </View>
          <TouchableOpacity
            onPress={toggle}
            hitSlop={10}
            style={styles.eyeBtn}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide salary amounts' : 'Show salary amounts'}
          >
            <MaterialCommunityIcons name={shown ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.amount} numberOfLines={1}>{s.netText}</Text>
          <Text style={styles.amountLabel}>paid</Text>
        </View>

        {s.paidRatio != null && (
          <View style={styles.track} accessible={false}>
            <View style={[styles.fill, { flex: s.paidRatio }]} />
            {s.paidRatio < 1 && <View style={[styles.gap, { flex: 1 - s.paidRatio }]} />}
          </View>
        )}

        <View style={styles.footRow}>
          {!!s.lossText && (
            <View style={styles.lossWrap}>
              <MaterialCommunityIcons
                name={s.lossTone === 'none' ? 'check-circle-outline' : 'arrow-down-circle-outline'}
                size={14}
                color={lossColor}
              />
              <Text style={[styles.lossText, { color: lossColor }]} numberOfLines={1}>{s.lossText}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={styles.link}>See slip</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.primary} />
        </View>
        {s.hrChanged && (
          <Text style={styles.note}>HR changed this pay after the slip: open Salary for the details.</Text>
        )}
      </TouchableOpacity>
    </Reveal>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 14,
      marginBottom: 20,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
        android: { elevation: 1 },
      }),
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    icon: {
      width: 36, height: 36, borderRadius: BorderRadius.md,
      backgroundColor: Colors.badgeGreenBg,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
    period: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
    eyeBtn: {
      width: 34, height: 34, borderRadius: BorderRadius.full,
      backgroundColor: Colors.bgSurfaceLow,
      alignItems: 'center', justifyContent: 'center',
    },
    amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 12 },
    amount: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 24, letterSpacing: -0.3, ...TabularNums },
    amountLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
    track: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 10, backgroundColor: Colors.bgSurfaceLow },
    fill: { backgroundColor: Colors.statusGreen },
    gap: { backgroundColor: Colors.badgeRedBg },
    footRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
    lossWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
    lossText: { fontSize: 12, fontWeight: '600', flexShrink: 1, ...TabularNums },
    link: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12 },
    note: { color: Colors.textMuted, fontSize: 11, marginTop: 8 },
  });
