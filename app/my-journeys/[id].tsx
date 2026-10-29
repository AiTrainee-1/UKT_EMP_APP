import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ActivityTimeline } from '../../src/components/journey/ActivityTimeline';
import { PunchRecords } from '../../src/components/journey/PunchRecords';
import { StatusChip } from '../../src/components/journey/StatusChip';
import { useNow } from '../../src/components/journey/useNow';
import { toneStyle } from '../../src/components/journey/tone';
import { JourneyMap } from '../../src/components/tracking/JourneyMap';
import type { JourneyMapHandle } from '../../src/components/tracking/JourneyMap';
import { TrackingHeader } from '../../src/components/tracking/TrackingHeader';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import { buildActivity, journeyTiles, TONE_COLOR } from '../../src/tracking/activity';
import type { Tone } from '../../src/tracking/activity';
import { formatDateTime } from '../../src/tracking/format';
import { endNote, journeyChip, lastUpdateText, liveStatus } from '../../src/tracking/journeyList';
import { buildMapPayload } from '../../src/tracking/journeyModel';
import { useJourney } from '../../src/tracking/useTracking';
import { trackingRoutes } from '../../src/tracking/routes';

const MAP_HEIGHT = 300;

export default function JourneyDetailScreen() {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const journeyId = Number(id);
  const scroll = useRef<ScrollViewInstance>(null);
  const mapRef = useRef<JourneyMapHandle>(null);
  const mapY = useRef(0);
  const now = useNow();

  const { data: journey, isLoading, isError, refetch, isRefetching } = useJourney(Number.isFinite(journeyId) ? journeyId : null);

  const payload = useMemo(() => (journey ? buildMapPayload(journey) : null), [journey]);
  const rows = useMemo(() => (journey ? buildActivity(journey, now) : []), [journey, now]);
  const tiles = useMemo(() => (journey ? journeyTiles(journey) : []), [journey]);
  const hasMap = !!payload && (payload.route.length > 1 || payload.stops.length > 0 || payload.events.length > 0);

  /** Scrolls up to the map and flies it to a place (a timeline row or a geo-punch). */
  const showOnMap = (lat: number, lng: number) => {
    scroll.current?.scrollTo({ y: Math.max(0, mapY.current - 8), animated: true });
    mapRef.current?.focus(lat, lng);
  };

  const track = journey?.track;
  const chip = track ? journeyChip(track) : null;
  const live = track?.status === 'active' ? liveStatus(track.state) : null;
  const note = track ? endNote(track) : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TrackingHeader
        title={track?.destination || 'On-Duty Journey'}
        subtitle={track ? formatDateTime(track.startedAt) : undefined}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(trackingRoutes.journeys))}
      />
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} colors={[C.primary]} tintColor={C.primary} />}
      >
        {isLoading ? (
          <>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={5} />
            <SkeletonCard lines={4} />
          </>
        ) : isError || !journey || !payload || !track ? (
          <View style={styles.stateBox}>
            <View style={styles.stateArt}>
              <EmptyState icon="map-marker-off-outline" title="Journey not found" subtitle="It may still be uploading from the phone. Pull down to try again." />
            </View>
            <Button title="Try again" variant="outline" onPress={() => { void refetch(); }} loading={isRefetching} style={styles.retry} />
          </View>
        ) : (
          <>
            <View style={styles.statusRow}>
              {chip && <StatusChip label={chip.label} tone={chip.tone} dot />}
              {live && (
                <StatusChip label={live.label} tone={live.tone} />
              )}
              {!!note && <Text style={styles.statusNote} numberOfLines={2}>{note}</Text>}
            </View>
            {live && (
              <View style={styles.liveBox}>
                <MaterialCommunityIcons name="crosshairs-gps" size={16} color={C.textMuted} />
                <Text style={styles.liveText}>
                  {lastUpdateText(track, now)}
                  {live.hint ? `. ${live.hint}` : ''}
                </Text>
              </View>
            )}
            {track.hasMock && (
              <View style={[styles.banner, { backgroundColor: C.badgeRedBg }]}>
                <MaterialCommunityIcons name="alert-outline" size={16} color={C.statusRed} />
                <Text style={[styles.bannerText, { color: C.badgeRedText }]}>A fake location was detected during this journey.</Text>
              </View>
            )}

            <View style={styles.tiles}>
              {tiles.map((t) => {
                const accent = t.tone === 'neutral' ? C.primary : toneStyle(t.tone as Tone, C).solid;
                return (
                  <View key={t.key} style={styles.tile}>
                    <View style={[styles.tileBar, { backgroundColor: accent }]} />
                    <Text style={[styles.tileValue, TabularNums]} numberOfLines={1} adjustsFontSizeToFit>{t.value}</Text>
                    <Text style={styles.tileLabel} numberOfLines={1}>{t.label}</Text>
                    {!!t.hint && <Text style={styles.tileHint} numberOfLines={2}>{t.hint}</Text>}
                  </View>
                );
              })}
            </View>

            <View onLayout={(e: LayoutChangeEvent) => { mapY.current = e.nativeEvent.layout.y; }} style={{ gap: 10 }}>
              {hasMap ? (
                <JourneyMap ref={mapRef} payload={payload} height={MAP_HEIGHT} />
              ) : (
                <View style={styles.noMap}>
                  <MaterialCommunityIcons name="map-marker-question-outline" size={28} color={C.textMuted} />
                  <Text style={styles.noMapText}>No locations have reached the office for this journey yet. They upload when your phone has internet.</Text>
                </View>
              )}
              <View style={styles.legend}>
                <Legend color={TONE_COLOR.green} label="Start / end" styles={styles} />
                <Legend color={TONE_COLOR.amber} label="Break under 15 min" styles={styles} />
                <Legend color={TONE_COLOR.purple} label="Break 15 min or more" styles={styles} />
                <Legend color={TONE_COLOR.blue} label="Travelling" styles={styles} line />
                <Legend color={TONE_COLOR.grey} label="No location" styles={styles} dashed />
                {track.hasMock && <Legend color={TONE_COLOR.red} label="Fake location" styles={styles} />}
              </View>
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.section}>Activity</Text>
              <Text style={styles.sectionHint}>Tap a row for details</Text>
            </View>
            <ActivityTimeline rows={rows} onShowOnMap={showOnMap} />

            <View style={styles.sectionRow}>
              <Text style={styles.section}>Geo-punch records</Text>
              <Text style={styles.sectionHint}>{journey.punches.length ? `${journey.punches.length} ${journey.punches.length === 1 ? 'record' : 'records'}` : ''}</Text>
            </View>
            <PunchRecords punches={journey.punches} onShowOnMap={showOnMap} />

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

function Legend({ color, label, styles, dashed, line }: { color: string; label: string; styles: ReturnType<typeof makeStyles>; dashed?: boolean; line?: boolean }) {
  return (
    <View style={styles.legendItem}>
      {dashed ? (
        <View style={[styles.legendDash, { borderColor: color }]} />
      ) : line ? (
        <View style={[styles.legendLine, { backgroundColor: color }]} />
      ) : (
        <View style={[styles.legendDot, { backgroundColor: color }]} />
      )}
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgLight },
    content: { padding: 16, gap: 14, paddingBottom: 40, flexGrow: 1 },
    stateBox: { gap: 8, paddingTop: 16 },
    stateArt: { height: 250 }, // EmptyState fills its parent (flex: 1), so it is given a height inside the scrolling page
    retry: { alignSelf: 'center', minWidth: 200 },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    statusNote: { fontSize: 12, color: C.textMuted, flexShrink: 1 },
    liveBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 10 },
    liveText: { flex: 1, fontSize: 12, lineHeight: 17, color: C.textSecondary },
    banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: BorderRadius.md, padding: 10 },
    bannerText: { flex: 1, fontSize: 12, lineHeight: 17 },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: {
      flexBasis: '31%',
      flexGrow: 1,
      minWidth: 96,
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 11,
      paddingTop: 12,
      paddingBottom: 10,
      overflow: 'hidden',
    },
    tileBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    tileValue: { fontFamily: FontFamily.displayBold, fontSize: 17, color: C.textPrimary },
    tileLabel: { fontSize: 11, color: C.textMuted, marginTop: 2 },
    tileHint: { fontSize: 10, color: C.textMuted, marginTop: 2 },
    noMap: { alignItems: 'center', gap: 8, backgroundColor: C.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: C.border, padding: 24 },
    noMapText: { fontSize: 12, color: C.textSecondary, lineHeight: 17, textAlign: 'center' },
    legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 11, height: 11, borderRadius: 6 },
    legendLine: { width: 16, height: 4, borderRadius: 2 },
    legendDash: { width: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed' },
    legendText: { fontSize: 11.5, color: C.textMuted },
    sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 },
    section: { fontFamily: FontFamily.headlineSemibold, fontSize: 16, color: C.textPrimary },
    sectionHint: { fontSize: 11.5, color: C.textMuted },
    deviceText: { fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 4 },
  });
