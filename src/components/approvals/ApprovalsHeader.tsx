import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { UKTLogo } from '../UKTLogo';

/** Brand bar, the page title and how many requests wait for this head across every category. */
export function ApprovalsHeader({ pendingTotal }: { pendingTotal: number | null }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View>
      <View style={styles.topBar}>
        <UKTLogo size={28} />
        <View style={styles.brandTextWrap}>
          <Text style={styles.brandName}>UKTEXTILES</Text>
          <Text style={styles.brandSub}>EMPLOYEE PORTAL</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.avatarBtn}
          onPress={() => router.push('/(tabs)/profile')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
        >
          <MaterialCommunityIcons name="account" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">Approvals</Text>
          <Text style={styles.subtitle}>Decide your team's requests and see past decisions</Text>
        </View>
        {pendingTotal != null && (
          <View
            style={[styles.totalPill, pendingTotal === 0 && styles.totalPillDone]}
            accessibilityLabel={pendingTotal === 0 ? 'Nothing waiting for you' : `${pendingTotal} waiting for you`}
          >
            <MaterialCommunityIcons
              name={pendingTotal === 0 ? 'check-all' : 'bell-ring-outline'}
              size={14}
              color={pendingTotal === 0 ? Colors.statusGreen : Colors.badgeYellowText}
            />
            <Text style={[styles.totalText, pendingTotal === 0 && { color: Colors.statusGreen }]}>
              {pendingTotal === 0 ? 'All clear' : `${pendingTotal} waiting`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
    brandTextWrap: { gap: 1 },
    brandName: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 13, letterSpacing: 0.2 },
    brandSub: { color: Colors.textMuted, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
    avatarBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: Colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 2 },
    title: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 24 },
    subtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
    totalPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.badgeYellowBg,
    },
    totalPillDone: { backgroundColor: Colors.badgeGreenBg },
    totalText: { color: Colors.badgeYellowText, fontFamily: FontFamily.bodySemibold, fontSize: 12 },
  });
