import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius, Spacing } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { formatClock, formatDuration } from '../../tracking/format';
import { parseTime } from '../../tracking/geo';
import {
  breakParts,
  breaksText,
  dayParts,
  distanceText,
  endNote,
  journeyChip,
  lastUpdateText,
  liveStatus,
  punchText,
  runningS,
  timeRange,
} from '../../tracking/journeyList';
import type { JourneyListItem } from '../../tracking/journeyModel';
import { StatusChip } from './StatusChip';
import { toneStyle } from './tone';

interface CardProps {
  journey: JourneyListItem;
  now: number;
  onPress: () => void;
}

function Metric({ icon, value, label, color, styles }: { icon: string; value: string; label: string; color: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.metric}>
      <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.metricValue, TabularNums]} numberOfLines={1}>{value}</Text>
        <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

/** A finished journey in the history list: date tile, destination, time range, status chip and the four numbers that matter. */
export function JourneyCard({ journey: j, now, onPress }: CardProps) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const chip = journeyChip(j);
  const started = parseTime(j.startedAt);
  const date = started ? dayParts(started) : null;
  const punches = punchText(j);
  const note = endNote(j);
  const breaks = breakParts(j);
  const accent = toneStyle(chip.tone, C).solid;
  const label = `${j.destination || 'On-Duty'}, ${timeRange(j)}, ${chip.label}. ${formatDuration(runningS(j, now))}, ${distanceText(j)}, ${breaksText(j)}${punches ? `, ${punches} geo-punches` : ''}`;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.top}>
          {date && (
            <View style={styles.dateTile}>
              <Text style={styles.dateDay}>{date.day}</Text>
              <Text style={styles.dateMonth}>{date.month}</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.dest} numberOfLines={3}>{j.destination || `On-Duty #${j.sessionId ?? j.id}`}</Text>
            <View style={styles.timeRow}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={C.textMuted} />
              <Text style={[styles.time, TabularNums]}>{date ? `${date.weekday}, ` : ''}{timeRange(j)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.chipRow}>
          <StatusChip label={chip.label} tone={chip.tone} dot />
          {!!note && <Text style={styles.footerText} numberOfLines={1}>{note}</Text>}
        </View>

        <View style={styles.metrics}>
          <Metric icon="timer-outline" value={formatDuration(runningS(j, now))} label="Total time" color={C.primary} styles={styles} />
          <Metric icon="map-marker-distance" value={distanceText(j)} label="Distance" color={C.primary} styles={styles} />
          <Metric icon="coffee-outline" value={breaks.value} label={breaks.label} color={C.statusYellow} styles={styles} />
          {!!punches && <Metric icon="fingerprint" value={punches} label="Geo-punches" color={C.statusGreen} styles={styles} />}
        </View>

        {j.hasMock && (
          <View style={styles.footerItem}>
            <MaterialCommunityIcons name="alert-outline" size={14} color={C.statusRed} />
            <Text style={[styles.footerText, { color: C.statusRed }]} numberOfLines={1}>Fake location detected</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

/** The journey that is still recording: a highlighted card with the live status, how long it has been running, and the last update. */
export function CurrentJourneyCard({ journey: j, now, onPress }: CardProps) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const live = liveStatus(j.state);
  const dot = toneStyle(live.tone, C).solid;
  const punches = punchText(j);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Journey in progress. ${j.destination}. ${live.label}. Running for ${formatDuration(runningS(j, now))}. ${lastUpdateText(j, now)}.`}
    >
      <LinearGradient colors={C.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroBadge}>
            <View style={styles.heroPulse} />
            <Text style={styles.heroBadgeText}>IN PROGRESS</Text>
          </View>
          <View style={styles.heroLive}>
            <View style={[styles.heroLiveDot, { backgroundColor: dot }]} />
            <Text style={styles.heroLiveText}>{live.label}</Text>
          </View>
        </View>
        <Text style={styles.heroDest} numberOfLines={2}>{j.destination || 'On-Duty'}</Text>
        <Text style={[styles.heroSub, TabularNums]}>
          Started {formatClock(j.startedAt)} · running {formatDuration(runningS(j, now))}
        </Text>
        <View style={styles.heroUpdate}>
          <MaterialCommunityIcons name="crosshairs-gps" size={14} color="rgba(255,255,255,0.85)" />
          <Text style={styles.heroUpdateText}>{lastUpdateText(j, now)}</Text>
        </View>
        {!!live.hint && live.tone !== 'green' && live.tone !== 'blue' && (
          <View style={[styles.heroHint, live.tone === 'red' && styles.heroHintRed]}>
            <MaterialCommunityIcons name={live.tone === 'red' ? 'alert-circle' : 'information-outline'} size={16} color="#fff" />
            <Text style={styles.heroHintText}>{live.hint}</Text>
          </View>
        )}
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatValue, TabularNums]}>{distanceText(j)}</Text>
            <Text style={styles.heroStatLabel}>Distance</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatValue, TabularNums]}>{j.stopCount}</Text>
            <Text style={styles.heroStatLabel}>{j.stopCount === 1 ? 'Break' : 'Breaks'}</Text>
          </View>
          {!!punches && (
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatValue, TabularNums]}>{punches}</Text>
              <Text style={styles.heroStatLabel}>Geo-punches</Text>
            </View>
          )}
        </View>
        <View style={styles.heroCta}>
          <Text style={styles.heroCtaText}>View live route</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color="#fff" />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    accent: { width: 5 },
    body: { flex: 1, padding: Spacing.base - 2, gap: 12 },
    top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    chipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 4 },
    dateTile: { width: 46, borderRadius: BorderRadius.md, backgroundColor: C.primaryFixed, alignItems: 'center', paddingVertical: 5 },
    dateDay: { fontFamily: FontFamily.displayBold, fontSize: 18, lineHeight: 22, color: C.onPrimaryContainer },
    dateMonth: { fontSize: 10.5, fontWeight: '800', color: C.onPrimaryContainer, textTransform: 'uppercase', letterSpacing: 0.4 },
    dest: { fontFamily: FontFamily.headlineSemibold, fontSize: 14.5, lineHeight: 19, color: C.textPrimary },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    time: { fontSize: 12, color: C.textMuted, flexShrink: 1 },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 8 },
    metric: { flexDirection: 'row', alignItems: 'center', gap: 7, flexBasis: '47%', flexGrow: 1, minHeight: 36, backgroundColor: C.bgSurfaceLow, borderRadius: BorderRadius.md, paddingHorizontal: 9, paddingVertical: 6 },
    metricValue: { fontSize: 12.5, fontWeight: '800', color: C.textPrimary },
    metricLabel: { fontSize: 10.5, color: C.textMuted },
    footer: { gap: 4 },
    footerItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    footerText: { fontSize: 11.5, color: C.textMuted, flexShrink: 1 },

    hero: { borderRadius: BorderRadius.xxl, padding: Spacing.base + 2, gap: 8 },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroPulse: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#4ADE80', borderWidth: 2, borderColor: 'rgba(74,222,128,0.35)' },
    heroBadgeText: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
    heroLive: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    heroLiveDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#fff' },
    heroLiveText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    heroDest: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 18, lineHeight: 24 },
    heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5 },
    heroUpdate: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroUpdateText: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
    heroHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: BorderRadius.md, padding: 10 },
    heroHintRed: { backgroundColor: 'rgba(225,29,72,0.55)' },
    heroHintText: { flex: 1, color: '#fff', fontSize: 12, lineHeight: 17 },
    heroStats: { flexDirection: 'row', gap: 8, marginTop: 4 },
    heroStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: BorderRadius.md, paddingVertical: 8, paddingHorizontal: 10 },
    heroStatValue: { color: '#fff', fontSize: 15, fontWeight: '800' },
    heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, marginTop: 1 },
    heroCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 32 },
    heroCtaText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  });
