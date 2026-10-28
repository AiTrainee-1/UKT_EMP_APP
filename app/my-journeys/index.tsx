import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { TrackingHeader } from '../../src/components/tracking/TrackingHeader';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import { endReasonLabel, formatDateTime, formatDistance, formatDuration } from '../../src/tracking/format';
import type { JourneyListItem } from '../../src/tracking/journeyModel';
import { useMyJourneys } from '../../src/tracking/useTracking';
import { trackingRoutes } from '../../src/tracking/routes';

const RANGES = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
] as const;

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function approvalBadge(status: string): { label: string; variant: 'pending' | 'approved' | 'rejected' } | null {
  const s = status.toLowerCase();
  if (s === 'rejected') return { label: 'Rejected', variant: 'rejected' };
  if (s === 'active' || s === 'completed' || s === 'approved') return { label: 'Approved', variant: 'approved' };
  if (s.startsWith('pending')) return { label: 'Awaiting approval', variant: 'pending' };
  return null;
}

export default function MyJourneysScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('30');

  const params = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    return { from: isoDay(from), to: isoDay(new Date()) };
  }, [range]);

  const { data, isLoading, isError, refetch, isRefetching } = useMyJourneys(params);
  const journeys = data?.results ?? [];

  const open = (j: JourneyListItem) => router.push(trackingRoutes.journey(j.id));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TrackingHeader title="My journey" subtitle="Where you went while On-Duty" />
      <View style={styles.filters}>
        {RANGES.map((r) => (
          <TouchableOpacity
            key={r.key}
            onPress={() => setRange(r.key)}
            style={[styles.pill, range === r.key && styles.pillActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: range === r.key }}
          >
            <Text style={[styles.pillText, range === r.key && { color: Colors.primary }]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}
      >
        {isLoading ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </>
        ) : isError ? (
          <EmptyState icon="cloud-off-outline" title="Could not load your journeys" subtitle="Check your connection and pull down to try again." />
        ) : journeys.length === 0 ? (
          <EmptyState
            icon="map-marker-path"
            title="No journeys yet"
            subtitle="When you submit an On-Duty request your route is recorded, and it appears here."
          />
        ) : (
          journeys.map((j) => {
            const badge = approvalBadge(j.approvalStatus);
            return (
              <TouchableOpacity key={j.id} style={styles.card} onPress={() => open(j)} activeOpacity={0.8} accessibilityRole="button">
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dest} numberOfLines={2}>{j.destination || `On-Duty #${j.sessionId ?? j.id}`}</Text>
                    <Text style={styles.when}>{formatDateTime(j.startedAt)}</Text>
                  </View>
                  {j.status === 'active' ? (
                    <View style={styles.livePill}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>Recording</Text>
                    </View>
                  ) : badge ? (
                    <Badge label={badge.label} variant={badge.variant} />
                  ) : null}
                </View>
                <View style={styles.stats}>
                  <Stat icon="clock-outline" value={formatDuration(j.durationS)} label="Time" styles={styles} color={Colors.textMuted} />
                  <Stat icon="map-marker-distance" value={formatDistance(j.distanceM)} label="Distance" styles={styles} color={Colors.textMuted} />
                  <Stat icon="pause-circle-outline" value={String(j.stopCount)} label="Stops" styles={styles} color={Colors.textMuted} />
                </View>
                {j.status === 'ended' && !!endReasonLabel(j.endReason) && <Text style={styles.reason}>{endReasonLabel(j.endReason)}</Text>}
                {j.hasMock && (
                  <View style={styles.warn}>
                    <MaterialCommunityIcons name="alert-outline" size={13} color={Colors.statusRed} />
                    <Text style={styles.warnText}>A fake location was detected on this journey</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, value, label, styles, color }: { icon: string; value: string; label: string; styles: ReturnType<typeof makeStyles>; color: string }) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon as any} size={16} color={color} />
      <View>
        <Text style={[styles.statValue, TabularNums]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bgLight },
    filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.bgCard,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    pillActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryFixed },
    pillText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
    content: { padding: 16, gap: 12, paddingBottom: 32, flexGrow: 1 },
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: Spacing.base,
      gap: 10,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    dest: { fontFamily: FontFamily.headlineSemibold, fontSize: 14, color: Colors.textPrimary },
    when: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
    stats: { flexDirection: 'row', gap: 8 },
    stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 8 },
    statValue: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
    statLabel: { fontSize: 10, color: Colors.textMuted },
    reason: { fontSize: 11.5, color: Colors.textMuted },
    livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.badgeGreenBg, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.statusGreen },
    liveText: { color: Colors.statusGreen, fontSize: 10.5, fontWeight: '800' },
    warn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    warnText: { color: Colors.statusRed, fontSize: 11 },
  });
