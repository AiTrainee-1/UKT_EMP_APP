import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius, Spacing } from '../../constants/theme';
import { TabularNums } from '../../constants/typography';
import type { ActivityKind, ActivityRow } from '../../tracking/activity';
import { StatusChip } from './StatusChip';
import { toneStyle } from './tone';

const ICON: Record<ActivityKind, string> = {
  start: 'flag-variant',
  break: 'coffee',
  resume: 'play',
  travel: 'navigation-variant',
  gap: 'signal-off',
  punch: 'fingerprint',
  event: 'alert',
  complete: 'flag-checkered',
  live: 'crosshairs-gps',
};

interface Props {
  rows: ActivityRow[];
  /** "Show on map": the screen scrolls to the map and flies it to the place. */
  onShowOnMap: (lat: number, lng: number) => void;
}

/**
 * The journey in the order it happened: "Journey started", each "Break taken" (numbered like its pin on the map, amber under
 * 15 min, purple from 15), "Journey resumed", a stretch with no location, the geo-punches, and "On-duty completed". A row opens
 * to show its details and to take you to the place on the map.
 */
export function ActivityTimeline({ rows, onShowOnMap }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <View style={styles.wrap}>
      {rows.map((row, i) => {
        const t = toneStyle(row.tone, C);
        const isOpen = open === row.key;
        const last = i === rows.length - 1;
        const nextBlue = row.kind === 'resume' || row.kind === 'travel';
        const lineColor = nextBlue ? `${t.solid}99` : C.border;
        const label = `${row.title}, ${row.when}${row.summary ? `, ${row.summary}` : ''}`;
        return (
          <View key={row.key} style={styles.row}>
            <View style={styles.rail}>
              {row.minor ? (
                <View style={styles.miniWrap}>
                  <View style={[styles.mini, { backgroundColor: t.solid }]} />
                </View>
              ) : (
                <View style={[styles.node, { backgroundColor: t.solid }]}>
                  {row.kind === 'break' && row.stopNumber != null ? (
                    <Text style={styles.nodeNum}>{row.stopNumber}</Text>
                  ) : (
                    <MaterialCommunityIcons name={ICON[row.kind] as any} size={16} color="#fff" />
                  )}
                </View>
              )}
              {!last && <View style={[styles.line, { backgroundColor: lineColor }]} />}
            </View>

            <View style={[styles.content, last && { paddingBottom: 0 }]}>
              <TouchableOpacity
                onPress={() => setOpen(isOpen ? null : row.key)}
                activeOpacity={0.7}
                style={styles.head}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ expanded: isOpen }}
                accessibilityHint={isOpen ? 'Hides the details' : 'Shows the details'}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, row.minor && styles.titleMinor]} numberOfLines={2}>{row.title}</Text>
                    {row.chip && <StatusChip label={row.chip.label} tone={row.chip.tone} />}
                  </View>
                  {!!row.summary && <Text style={styles.summary} numberOfLines={isOpen ? undefined : 2}>{row.summary}</Text>}
                </View>
                <View style={styles.headRight}>
                  <Text style={[styles.when, TabularNums]} numberOfLines={1}>{row.when}</Text>
                  <MaterialCommunityIcons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.outline} />
                </View>
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.details}>
                  {row.details.map((d) => (
                    <View key={d.label} style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{d.label}</Text>
                      <Text style={styles.detailValue}>{d.value}</Text>
                    </View>
                  ))}
                  {row.place && (
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={styles.action}
                        onPress={() => onShowOnMap(row.place![0], row.place![1])}
                        accessibilityRole="button"
                        accessibilityLabel={`Show ${row.title} on the map`}
                      >
                        <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color={C.primary} />
                        <Text style={styles.actionText}>Show on map</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.action}
                        onPress={() => {
                          void Linking.openURL(`https://www.google.com/maps?q=${row.place![0]},${row.place![1]}`);
                        }}
                        accessibilityRole="link"
                        accessibilityLabel={`Open ${row.title} in Google Maps`}
                      >
                        <MaterialCommunityIcons name="google-maps" size={16} color={C.primary} />
                        <Text style={styles.actionText}>Open in Google Maps</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: { backgroundColor: C.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: C.border, paddingVertical: Spacing.base, paddingRight: Spacing.base, paddingLeft: 12 },
    row: { flexDirection: 'row', alignItems: 'stretch' },
    rail: { width: 32, alignItems: 'center' },
    node: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bgCard },
    nodeNum: { color: '#fff', fontSize: 13, fontWeight: '800' },
    miniWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    mini: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.bgCard },
    line: { flex: 1, width: 3, borderRadius: 2, marginTop: 2, marginBottom: 2 },
    content: { flex: 1, paddingBottom: 6, paddingLeft: 8 },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, minHeight: 44, paddingVertical: 4 },
    titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    title: { fontSize: 14, fontWeight: '800', color: C.textPrimary, flexShrink: 1 },
    titleMinor: { fontWeight: '700', color: C.textSecondary },
    summary: { fontSize: 12.5, color: C.textMuted, lineHeight: 17 },
    headRight: { alignItems: 'flex-end', gap: 2, maxWidth: 132 },
    when: { fontSize: 11.5, color: C.textMuted, textAlign: 'right' },
    details: { backgroundColor: C.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 10, gap: 6, marginTop: 2, marginBottom: 8 },
    detailRow: { flexDirection: 'row', gap: 10 },
    detailLabel: { width: 96, fontSize: 11.5, color: C.textMuted },
    detailValue: { flex: 1, fontSize: 12.5, fontWeight: '600', color: C.textPrimary },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: BorderRadius.md, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border },
    actionText: { fontSize: 12.5, fontWeight: '700', color: C.primary },
  });
