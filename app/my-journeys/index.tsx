import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { TrackingHeader } from '../../src/components/tracking/TrackingHeader';
import { CurrentJourneyCard, JourneyCard } from '../../src/components/journey/JourneyCard';
import { useNow } from '../../src/components/journey/useNow';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';
import { splitJourneys } from '../../src/tracking/journeyList';
import type { JourneyListItem } from '../../src/tracking/journeyModel';
import { useMyJourneys } from '../../src/tracking/useTracking';
import { trackingRoutes } from '../../src/tracking/routes';

const PAGE_SIZE = 200; // the server's maximum per page

const RANGES = [
  { key: 'all', label: 'All', days: 0 },
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
] as const;

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "On-Duty Journey": the journey in progress as a highlighted card, then every earlier one grouped by day. */
export default function OnDutyJourneyListScreen() {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('all');
  const now = useNow();

  const params = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 0;
    if (!days) return { pageSize: PAGE_SIZE };
    const from = new Date();
    from.setDate(from.getDate() - days);
    return { from: isoDay(from), to: isoDay(new Date()), pageSize: PAGE_SIZE };
  }, [range]);

  const { data, isLoading, isError, refetch, isRefetching } = useMyJourneys(params);
  const journeys = data?.results ?? [];
  const { current, days } = useMemo(() => splitJourneys(journeys, now), [journeys, now]);

  const open = (j: JourneyListItem) => router.push(trackingRoutes.journey(j.id));
  const onRefresh = () => {
    void refetch();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TrackingHeader
        title="On-Duty Journey"
        subtitle="Where you went, your breaks and your geo-punches"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filters}>
          {RANGES.map((r) => (
            <TouchableOpacity
              key={r.key}
              onPress={() => setRange(r.key)}
              style={[styles.pill, range === r.key && styles.pillActive]}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityState={{ selected: range === r.key }}
            >
              <Text style={[styles.pillText, range === r.key && { color: C.onPrimaryContainer }]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isLoading ? (
          <View style={{ gap: Spacing.base }}>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </View>
        ) : isError ? (
          <View style={styles.stateBox}>
            <View style={styles.stateArt}>
              <EmptyState icon="cloud-off-outline" title="Could not load your journeys" subtitle="Check your connection, then try again." />
            </View>
            <Button title="Try again" variant="outline" onPress={onRefresh} loading={isRefetching} style={styles.retry} />
          </View>
        ) : journeys.length === 0 ? (
          <View style={styles.stateBox}>
            <View style={styles.stateArt}>
              <EmptyState
                icon="map-marker-path"
                title={range === 'all' ? 'No journeys yet' : 'No journeys in this period'}
                subtitle="When you submit an On-Duty request your route is recorded, and the journey appears here."
              />
            </View>
            {range !== 'all' ? (
              <Button title="Show all journeys" variant="outline" onPress={() => setRange('all')} style={styles.retry} />
            ) : (
              <Button title="Start On-Duty" onPress={() => router.push('/on-duty')} style={styles.retry} />
            )}
          </View>
        ) : (
          <>
            {current.length > 0 && (
              <View style={{ gap: 10 }}>
                {current.map((j) => (
                  <CurrentJourneyCard key={j.id} journey={j} now={now} onPress={() => open(j)} />
                ))}
              </View>
            )}

            {days.map((g) => (
              <View key={g.key} style={{ gap: 10 }}>
                <View style={styles.dayRow}>
                  <Text style={styles.dayLabel}>{g.label}</Text>
                  <View style={styles.dayLine} />
                  <Text style={styles.dayCount}>
                    {g.items.length} {g.items.length === 1 ? 'journey' : 'journeys'}
                  </Text>
                </View>
                {g.items.map((j) => (
                  <JourneyCard key={j.id} journey={j} now={now} onPress={() => open(j)} />
                ))}
              </View>
            ))}

            {(data?.total ?? 0) > journeys.length && (
              <View style={styles.more}>
                <MaterialCommunityIcons name="information-outline" size={14} color={C.textMuted} />
                <Text style={styles.moreText}>Showing your latest {journeys.length} journeys. Pick a shorter period to see fewer.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgLight },
    content: { padding: 16, gap: 16, paddingBottom: 40, flexGrow: 1 },
    // A horizontal ScrollView grows to fill spare height inside the page's (flexGrow) content: keep it one pill tall.
    filterScroll: { flexGrow: 0, flexShrink: 0 },
    filters: { flexDirection: 'row', gap: 8, paddingRight: 8 },
    pill: {
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: BorderRadius.full,
      backgroundColor: C.bgCard,
      borderWidth: 1,
      borderColor: C.border,
    },
    pillActive: { borderColor: C.primary, backgroundColor: C.primaryFixed },
    pillText: { fontSize: 12.5, fontWeight: '700', color: C.textSecondary },
    stateBox: { gap: 8, paddingTop: 16 },
    stateArt: { height: 250 }, // EmptyState fills its parent (flex: 1), so it is given a height inside the scrolling page
    retry: { alignSelf: 'center', minWidth: 200 },
    dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    dayLabel: { fontFamily: FontFamily.headlineSemibold, fontSize: 13, color: C.textPrimary },
    dayLine: { flex: 1, height: 1, backgroundColor: C.border },
    dayCount: { fontSize: 11.5, color: C.textMuted },
    more: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
    moreText: { fontSize: 11.5, color: C.textMuted, flexShrink: 1, textAlign: 'center' },
  });
