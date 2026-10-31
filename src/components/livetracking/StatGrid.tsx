import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import type { StatTile } from '../../lib/liveTrackingStatus';

const ICON: Record<StatTile['id'], string> = {
  last_location: 'crosshairs-gps',
  last_sent: 'cloud-upload-outline',
  waiting: 'tray-full',
  last_ping: 'access-point',
};

/** Last location recorded, last sent to the office, what is waiting on the phone (and the live-sharing update). */
export function StatGrid({ tiles }: { tiles: StatTile[] }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.grid}>
      {tiles.map((t) => (
        <View key={t.id} style={styles.tile} accessible accessibilityLabel={`${t.label}: ${t.value}${t.hint ? `. ${t.hint}` : ''}`}>
          <View style={styles.top}>
            <Text style={styles.label} numberOfLines={2}>{t.label}</Text>
            <MaterialCommunityIcons name={ICON[t.id] as any} size={15} color={C.primary} />
          </View>
          <Text style={[styles.value, TabularNums]} numberOfLines={1}>{t.value}</Text>
          {!!t.hint && <Text style={styles.hint} numberOfLines={2}>{t.hint}</Text>}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: {
      flexGrow: 1,
      flexBasis: '45%',
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: 12,
      gap: 4,
    },
    top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
    label: { flex: 1, color: C.textMuted, fontSize: 11, fontWeight: '700' },
    value: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 16 },
    hint: { color: C.textMuted, fontSize: 10.5, lineHeight: 14 },
  });
