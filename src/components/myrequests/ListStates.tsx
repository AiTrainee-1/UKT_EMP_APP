import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { SkeletonCard } from '../ui/Skeleton';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/**
 * The shared list states of the Missing Punch / Outpass / Permission / On-Duty screens: a skeleton while loading, a
 * failed load that says so (with Try again) instead of looking like "nothing here", and the month headings of long lists.
 */
export function ListSkeleton({ count = 3 }: { count?: number }) {
  return <View>{Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}</View>;
}

export function LoadError({
  what,
  onRetry,
  retrying,
}: {
  /** "your missing punch requests" */
  what: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.errorBox} testID="list-load-error">
      <EmptyState icon="cloud-off-outline" title={`Could not load ${what}`} subtitle="Check your internet connection, then try again." />
      <Button title="Try again" variant="outline" onPress={onRetry} loading={retrying} style={styles.retry} />
    </View>
  );
}

/** A thin "showing what we have, but the last refresh failed" line above a list that did load before. */
export function StaleNote({ onRetry }: { onRetry: () => void }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={styles.stale} onPress={onRetry} accessibilityRole="button">
      <MaterialCommunityIcons name="wifi-off" size={12} color={Colors.badgeYellowText} />
      {'  '}Could not refresh. Showing the last list. Tap to try again.
    </Text>
  );
}

export function MonthHeading({ title, count }: { title: string; count: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.monthRow} accessibilityRole="header">
      <Text style={styles.monthTitle}>{title}</Text>
      <View style={styles.monthLine} />
      <Text style={styles.monthCount}>{count}</Text>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    errorBox: { paddingVertical: 8, alignItems: 'stretch' },
    retry: { alignSelf: 'center', minWidth: 180 },
    stale: {
      backgroundColor: Colors.badgeYellowBg,
      color: Colors.badgeYellowText,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 11.5,
      fontWeight: '600',
      marginBottom: 10,
      overflow: 'hidden',
    },
    monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 8 },
    monthTitle: { color: Colors.textSecondary, fontFamily: FontFamily.headlineSemibold, fontSize: 12.5 },
    monthLine: { flex: 1, height: 1, backgroundColor: Colors.border },
    monthCount: { color: Colors.textMuted, fontSize: 11, fontWeight: '700' },
  });
