import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useThemedStyles, useTheme } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { FontFamily } from '../../constants/typography';

interface Props {
  title: string;
  subtitle?: string;
  /** Overrides the default router.back(). */
  onBack?: () => void;
  right?: React.ReactNode;
}

/** The back arrow + title row the standalone tracking screens share (same look as the Live Tracking screen's). */
export function TrackingHeader({ title, subtitle, onBack, right }: Props) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/on-duty')))}
        style={styles.backBtn}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: Colors.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.bgSurfaceLow,
    },
    title: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
    subtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },
  });
