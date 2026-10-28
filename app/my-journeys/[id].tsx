import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { JourneyMap } from '../../src/components/tracking/JourneyMap';
import type { JourneyMapHandle } from '../../src/components/tracking/JourneyMap';
import { TrackingHeader } from '../../src/components/tracking/TrackingHeader';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import { endReasonLabel, formatClock, formatDateTime, formatDistance, formatDuration, formatSpeedKmh } from '../../src/tracking/format';
import { buildMapPayload, buildTimeline, summaryCardInputs } from '../../src/tracking/journeyModel';
import type { TimelineItem } from '../../src/tracking/journeyModel';
import { useJourney } from '../../src/tracking/useTracking';
import { trackingRoutes } from '../../src/tracking/routes';

export default function JourneyDetailScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const journeyId = Number(id);
  const mapRef = useRef<JourneyMapHandle>(null);

  const { data: journey, isLoading, isError, refetch, isRefetching } = useJourney(Number.isFinite(journeyId) ? journeyId : null);

  const payload = useMemo(() => (journey ? buildMapPayload(journey) : null), [journey]);
  const timeline = useMemo(() => (journey ? buildTimeline(journey) : []), [journey]);
  const hasMap = !!payload && (payload.route.length > 1 || payload.stops.length > 0 || payload.events.length > 0);

  const cards = journey
    ? summaryCardInputs(journey.track).map((c) => ({
        key: c.key,
        label: c.label,
        value: 'seconds' in c ? formatDuration(c.seconds) : 'meters' in c ? formatDistance(c.meters) : String(c.count),
      }))
    : [];

  const onItem = (item: TimelineItem) => {
    if (item.type === 'segment') {
      const s = item.seg;
      const lat = s.centerLat ?? s.startLat ?? s.polyline[0]?.[0] ?? null;
      const lng = s.centerLng ?? s.startLng ?? s.polyline[0]?.[1] ?? null;
      if (lat != null && lng != null) mapRef.current?.focus(lat, lng);
    } else if (item.event.latitude != null && item.event.longitude != null) {
      mapRef.current?.focus(item.event.latitude, item.event.longitude);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TrackingHeader
        title={journey?.track.destination || 'Journey'}
        subtitle={journey ? `${formatDateTime(journey.track.startedAt)}${journey.track.status === 'active' ? ' · recording' : ''}` : undefined}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(trackingRoutes.journeys))}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}
      >
        {isLoading ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={5} />
          </>
        ) : isError || !journey || !payload ? (
          <EmptyState icon="map-marker-off-outline" title="Journey not found" subtitle="It may still be uploading from the phone. Pull down to try again." />
        ) : (
          <>
            <View style={styles.grid}>
              {cards.map((c) => (
                <View key={c.key} style={styles.cardSmall}>
                  <Text style={[styles.cardValue, TabularNums]}>{c.value}</Text>
                  <Text style={styles.cardLabel}>{c.label}</Text>
                </View>
              ))}
            </View>

            {journey.track.status === 'ended' && !!endReasonLabel(journey.track.endReason) && (
              <View style={styles.note}>
                <MaterialCommunityIcons name="flag-checkered" size={16} color={Colors.textMuted} />
                <Text style={styles.noteText}>{endReasonLabel(journey.track.endReason)}</Text>
              </View>
            )}
            {journey.track.hasMock && (
              <View style={[styles.note, { backgroundColor: Colors.badgeRedBg }]}>
                <MaterialCommunityIcons name="alert-outline" size={16} color={Colors.statusRed} />
                <Text style={[styles.noteText, { color: Colors.badgeRedText }]}>A fake location was detected during this journey.</Text>
              </View>
            )}

            {hasMap ? (
              <JourneyMap ref={mapRef} payload={payload} height={320} />
            ) : (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="map-marker-question-outline" size={28} color={Colors.textMuted} />
                <Text style={styles.noteText}>
                  No locations have reached the office for this journey yet. They upload when your phone has internet.
                </Text>
              </View>
            )}

            <View style={styles.legend}>
              <Legend color="#059669" label="Start" styles={styles} />
              <Legend color="#DC2626" label="End / last place" styles={styles} />
              <Legend color="#1E3A8A" label="Stop (numbered)" styles={styles} />
              <Legend color="#EA580C" label="No location" styles={styles} dashed />
            </View>

            <Text style={styles.section}>TIMELINE</Text>
            {timeline.length === 0 ? (
              <Text style={styles.noteText}>The timeline fills in as locations are processed.</Text>
            ) : (
              <View style={styles.timeline}>
                {timeline.map((item, i) => (
                  <TimelineRow key={`${item.type}-${i}`} item={item} onPress={() => onItem(item)} styles={styles} Colors={Colors} />
                ))}
              </View>
            )}

            {journey.device && (
              <Text style={styles.deviceText}>
                Recorded on {journey.device.model || 'this phone'}
                {journey.device.osVersion ? `, Android ${journey.device.osVersion}` : ''}
                {journey.device.appVersion ? `, app ${journey.device.appVersion}` : ''}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Legend({ color, label, styles, dashed }: { color: string; label: string; styles: ReturnType<typeof makeStyles>; dashed?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[dashed ? styles.legendDash : styles.legendDot, dashed ? { borderColor: color } : { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function TimelineRow({
  item,
  onPress,
  styles,
  Colors,
}: {
  item: TimelineItem;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  Colors: Palette;
}) {
  let icon = 'circle-small';
  let tone = Colors.textMuted;
  let meta = '';
  if (item.type === 'segment') {
    const s = item.seg;
    if (s.kind === 'stop') {
      icon = 'pause-circle';
      tone = Colors.primary;
      meta = `${formatClock(s.startedAt)} - ${formatClock(s.endedAt)} · ${formatDuration(s.durationS)}`;
    } else if (s.kind === 'gap') {
      icon = 'signal-off';
      tone = Colors.statusOrange;
      meta = `${formatClock(s.startedAt)} - ${formatClock(s.endedAt)} · ${formatDuration(s.durationS)}`;
    } else {
      icon = 'walk';
      tone = Colors.statusGreen;
      meta = `${formatClock(s.startedAt)} - ${formatClock(s.endedAt)} · ${formatDistance(s.distanceM)}${s.avgSpeedKmh != null ? ` · avg ${formatSpeedKmh(s.avgSpeedKmh)}` : ''}`;
    }
  } else {
    icon = item.problem ? 'alert-circle-outline' : 'information-outline';
    tone = item.problem ? Colors.statusRed : Colors.textMuted;
    meta = formatClock(item.event.startedAt) + (item.event.endedAt ? ` - ${formatClock(item.event.endedAt)}` : '');
  }
  const detail = item.type === 'segment' ? item.detail : '';
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <View style={[styles.rowIcon, { backgroundColor: `${tone}1A` }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        {!!meta && <Text style={styles.rowMeta}>{meta}</Text>}
        {!!detail && <Text style={styles.rowMeta}>{detail}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bgLight },
    content: { padding: 16, gap: 12, paddingBottom: 32 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cardSmall: {
      flexBasis: '23%',
      flexGrow: 1,
      minWidth: 72,
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 10,
    },
    cardValue: { fontFamily: FontFamily.displayBold, fontSize: 15, color: Colors.textPrimary },
    cardLabel: { fontSize: 10.5, color: Colors.textMuted, marginTop: 2 },
    note: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 10 },
    noteText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
    empty: { alignItems: 'center', gap: 8, backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, padding: 24 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendDash: { width: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed' },
    legendText: { fontSize: 11, color: Colors.textMuted },
    section: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
    timeline: { backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.base },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant },
    rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
    rowMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 1, lineHeight: 16 },
    deviceText: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  });
