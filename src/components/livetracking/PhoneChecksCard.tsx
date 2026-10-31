import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import type { CheckRow, FixAction } from '../../lib/liveTrackingStatus';
import { toneColors } from './parts';

interface Props {
  rows: CheckRow[];
  busy: boolean;
  onFix: (fix: FixAction) => void;
  onOpenHealth: () => void;
  onOpenSetup: () => void;
}

/**
 * The phone settings that decide whether tracking CAN work (permission, GPS, battery optimisation ...), each with a fix
 * when something is off. Every fix helps tracking work; none of them stops it.
 */
export function PhoneChecksCard({ rows, busy, onFix, onOpenHealth, onOpenSetup }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      {rows.map((r, idx) => {
        const t = toneColors(r.tone, C);
        return (
          <View key={r.id} style={[styles.row, idx > 0 && styles.rowBorder]}>
            <View style={[styles.dot, { backgroundColor: t.solid }]} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.rowTop}>
                <Text style={styles.label}>{r.label}</Text>
                <Text style={[styles.value, { color: r.tone === 'neutral' || r.tone === 'good' ? C.textPrimary : t.fg }]}>{r.value}</Text>
              </View>
              {!!r.hint && <Text style={styles.hint}>{r.hint}</Text>}
              {r.fix && r.fixLabel && (
                <TouchableOpacity
                  style={[styles.fixBtn, { borderColor: t.solid }, busy && { opacity: 0.5 }]}
                  onPress={() => onFix(r.fix as FixAction)}
                  disabled={busy}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.fixLabel}: ${r.label}`}
                >
                  <MaterialCommunityIcons name="wrench-outline" size={14} color={t.fg} />
                  <Text style={[styles.fixText, { color: t.fg }]}>{r.fixLabel}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
      <View style={styles.links}>
        <TouchableOpacity style={styles.link} onPress={onOpenHealth} activeOpacity={0.8} accessibilityRole="button">
          <MaterialCommunityIcons name="heart-pulse" size={16} color={C.primary} />
          <Text style={styles.linkText}>Full tracking health</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={C.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={onOpenSetup} activeOpacity={0.8} accessibilityRole="button">
          <MaterialCommunityIcons name="cog-outline" size={16} color={C.primary} />
          <Text style={styles.linkText}>Tracking set-up</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={C.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: C.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11 },
    rowBorder: { borderTopWidth: 1, borderTopColor: C.outlineVariant },
    dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
    label: { color: C.textSecondary, fontSize: 12.5, flexShrink: 1 },
    value: { fontSize: 12.5, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
    hint: { color: C.textMuted, fontSize: 11.5, lineHeight: 16 },
    fixBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      minHeight: 36,
      borderWidth: 1.5,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 12,
      marginTop: 6,
    },
    fixText: { fontSize: 12, fontWeight: '800', fontFamily: FontFamily.bodySemibold },
    links: { borderTopWidth: 1, borderTopColor: C.outlineVariant, marginTop: 2 },
    link: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
    linkText: { flex: 1, color: C.primary, fontSize: 13, fontWeight: '800' },
  });
