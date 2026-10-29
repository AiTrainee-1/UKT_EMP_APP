import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import type { Tone } from '../../tracking/activity';
import { toneStyle } from './tone';

interface Props {
  label: string;
  tone: Tone;
  /** A small dot in the journey colour before the label. */
  dot?: boolean;
}

/** A small pill: "Completed", "In progress", "Ended by day-end", "Approved" ... in the shared journey colours. */
export function StatusChip({ label, tone, dot }: Props) {
  const { C } = useTheme();
  const t = toneStyle(tone, C);
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]} accessible accessibilityLabel={label}>
      {dot && <View style={[styles.dot, { backgroundColor: t.solid }]} />}
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 11.5, fontWeight: '800' },
});
