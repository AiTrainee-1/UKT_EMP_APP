import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { TabularNums } from '../../constants/typography';
import type { Tone } from '../../tracking/activity';
import { formatDuration } from '../../tracking/format';
import { breakParts, distanceText, lastUpdateText, liveStatus, runningS } from '../../tracking/journeyList';
import type { JourneyListItem } from '../../tracking/journeyModel';
import { toneStyle } from '../journey/tone';

interface Props {
  /** The journey of this session as the server knows it; null until its first upload. */
  journey: JourneyListItem | null;
  now: number;
  /** Why the route is NOT being recorded right now (the first red issue), or null. */
  problem: string | null;
  /** The session is over: the strip becomes the journey's summary. */
  finished: boolean;
  onPress: () => void;
}

/**
 * Journey tracking as a compact live strip on the On-Duty page (not a separate screen): moving / still / offline / location
 * off, when the last position arrived, how long the journey has run, the breaks so far and the distance. Tap for the full journey.
 */
export function JourneyStrip({ journey, now, problem, finished, onPress }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);

  let label: string;
  let tone: Tone;
  let line: string;
  if (finished) {
    label = 'Journey ended';
    tone = 'grey';
    line = journey ? `${formatDuration(runningS(journey, now))} · ${distanceText(journey)} · ${breakParts(journey).value === 'None' ? 'no breaks' : breakParts(journey).value}` : 'Your route was recorded';
  } else if (problem) {
    label = 'Not recording';
    tone = 'red';
    line = problem;
  } else if (journey) {
    const live = liveStatus(journey.state);
    label = live.label;
    tone = live.tone;
    const breaks = journey.stopCount === 1 ? '1 break' : `${journey.stopCount} breaks`;
    line = `${lastUpdateText(journey, now)} · running ${formatDuration(runningS(journey, now))} · ${breaks} · ${distanceText(journey)}`;
  } else {
    label = 'Recording';
    tone = 'blue';
    line = 'Waiting for the first location';
  }
  const t = toneStyle(tone, C);

  return (
    <TouchableOpacity
      style={styles.strip}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Journey tracking: ${label}. ${line}. Open the journey`}
    >
      <View style={[styles.dotWrap, { backgroundColor: t.bg }]}>
        <View style={[styles.dot, { backgroundColor: t.solid }]} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
        <Text style={[styles.line, TabularNums]} numberOfLines={2}>{line}</Text>
      </View>
      <MaterialCommunityIcons name="map-marker-path" size={20} color={C.primary} />
      <MaterialCommunityIcons name="chevron-right" size={18} color={C.outline} />
    </TouchableOpacity>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    strip: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, backgroundColor: C.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8 },
    dotWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    dot: { width: 12, height: 12, borderRadius: 6 },
    label: { fontSize: 13, fontWeight: '800' },
    line: { fontSize: 11.5, color: C.textMuted, lineHeight: 16 },
  });
