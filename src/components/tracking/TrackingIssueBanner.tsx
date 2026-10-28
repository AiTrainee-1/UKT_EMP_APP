import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useThemedStyles, useTheme } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import type { TrackingIssue } from '../../tracking/onboarding';
import { trackingRoutes } from '../../tracking/routes';

interface Props {
  issues: TrackingIssue[];
  /** Defaults to opening the Tracking health screen. */
  onPress?: () => void;
}

/**
 * The red "your route is not being recorded" strip. Only errors are passed in (see bannerIssues): a warning such as "battery
 * saver is on" lives on the Tracking health screen and never alarms the employee on the On-Duty page.
 */
export function TrackingIssueBanner({ issues, onPress }: Props) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (issues.length === 0) return null;
  const first = issues[0];
  const more = issues.length - 1;
  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={onPress ?? (() => router.push(trackingRoutes.health))}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Tracking needs attention: ${first.title}. Open tracking health.`}
    >
      <MaterialCommunityIcons name="alert-circle" size={22} color={Colors.statusRed} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{first.title}</Text>
        <Text style={styles.body} numberOfLines={2}>
          {first.message}
          {more > 0 ? `  (+${more} more)` : ''}
        </Text>
      </View>
      <View style={styles.fix}>
        <Text style={styles.fixText}>Fix</Text>
        <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.statusRed} />
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: Colors.badgeRedBg,
      borderWidth: 1,
      borderColor: Colors.statusRed,
      borderRadius: BorderRadius.lg,
      padding: 12,
    },
    title: { color: Colors.badgeRedText, fontSize: 13, fontWeight: '800' },
    body: { color: Colors.badgeRedText, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
    fix: { flexDirection: 'row', alignItems: 'center' },
    fixText: { color: Colors.statusRed, fontSize: 12, fontWeight: '800' },
  });
