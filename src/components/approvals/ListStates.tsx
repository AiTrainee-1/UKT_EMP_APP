import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { SkeletonCard } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import type { EmptyCopy } from '../../lib/approvalsHistory';

export function ApprovalSkeletons({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Loading requests">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

export function ApprovalEmpty({ copy }: { copy: EmptyCopy }) {
  return <EmptyState icon={copy.icon} title={copy.title} subtitle={copy.subtitle} />;
}

/** The list could not be loaded: say so (never an empty "all caught up" that is not true) and offer Try again. */
export function ApprovalError({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying?: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.box} accessibilityRole="alert">
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="cloud-alert-outline" size={34} color={Colors.statusRed} />
      </View>
      <Text style={styles.title}>Couldn't load requests</Text>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity
        style={styles.retry}
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        testID="approvals-retry"
      >
        {retrying ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
        )}
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

/** The bottom of a list: a spinner while the next page loads, a quiet "That's all" once everything is shown. */
export function ListFooter({ loading, done, count }: { loading: boolean; done: boolean; count: number }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (loading) return <ActivityIndicator style={{ marginVertical: 16 }} color={Colors.primary} />;
  if (done && count > 5) return <Text style={styles.end}>That's all · {count} requests</Text>;
  return null;
}

/** A small banner over the list (an older server without history, a failed refresh while old rows stay shown). */
export function ApprovalNotice({ icon, text, tone = 'info' }: { icon: string; text: string; tone?: 'info' | 'warn' }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const fg = tone === 'warn' ? Colors.badgeYellowText : Colors.badgeBlueText;
  const bg = tone === 'warn' ? Colors.badgeYellowBg : Colors.badgeBlueBg;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <MaterialCommunityIcons name={icon as any} size={16} color={fg} />
      <Text style={[styles.noticeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    box: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: Colors.badgeRedBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    title: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 16 },
    message: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
    retry: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: BorderRadius.full,
    },
    retryText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
    end: { color: Colors.textMuted, fontSize: 11.5, textAlign: 'center', marginVertical: 14 },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: BorderRadius.md,
      marginBottom: 10,
    },
    noticeText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  });
