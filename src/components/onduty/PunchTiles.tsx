import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { PunchTile } from '../../lib/onDutyPunches';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/**
 * The four On-Duty punches as four cards (owner 2026-11-24): Morning Punch, Lunch Out, Lunch In, Night Punch, each with
 * its expected time and what happened to it. Any open one can be tapped, in any order (forgot the morning one? the Night
 * Punch can still be recorded). The rules are src/lib/onDutyPunches.ts.
 */
export function PunchTiles({
  tiles,
  onSelect,
  disabled,
}: {
  tiles: PunchTile[];
  onSelect: (tile: PunchTile) => void;
  disabled?: boolean;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const doneCount = tiles.filter((t) => t.state !== 'open').length;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Geo-punches</Text>
        <Text style={styles.count}>
          {doneCount} of 4 done · {4 - doneCount} left
        </Text>
      </View>
      <Text style={styles.hint}>Tap any punch to record it, in any order. Each needs a selfie and your location.</Text>
      <View style={styles.grid}>
        {tiles.map((t) => {
          const tone =
            t.state === 'done'
              ? { fg: C.statusGreen, bg: C.badgeGreenBg, icon: 'check-circle' as const }
              : t.state === 'saved'
                ? { fg: C.badgeYellowText, bg: C.badgeYellowBg, icon: 'cloud-upload-outline' as const }
                : t.state === 'failed'
                  ? { fg: C.badgeRedText, bg: C.badgeRedBg, icon: 'alert-circle-outline' as const }
                  : { fg: C.primary, bg: C.primaryFixed, icon: 'camera-plus-outline' as const };
          const tappable = t.selectable && !disabled;
          return (
            <Pressable
              key={t.punchNumber}
              onPress={() => tappable && onSelect(t)}
              disabled={!tappable}
              style={({ pressed }) => [
                styles.tile,
                t.state === 'open' && t.selectable ? styles.tileOpen : styles.tileDone,
                pressed && tappable && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !tappable }}
              accessibilityLabel={`${t.name}, expected ${t.expected ?? 'any time'}. ${t.statusLabel}${t.time ? ` at ${t.time}` : ''}.${tappable ? ' Tap to record.' : ''}`}
              testID={`punch-tile-${t.punchNumber}`}
            >
              <View style={styles.tileTop}>
                <View style={[styles.iconWell, { backgroundColor: tone.bg }]}>
                  <MaterialCommunityIcons name={t.icon as any} size={18} color={tone.fg} />
                </View>
                <MaterialCommunityIcons name={tone.icon} size={18} color={tone.fg} />
              </View>
              <Text style={styles.name} numberOfLines={1}>{t.name}</Text>
              <Text style={styles.expected}>
                {t.expected ? `Expected ${t.expected}` : 'Any time'}
                {t.kind === 'IN' ? ' · In' : ' · Out'}
              </Text>
              {t.time ? (
                <Text style={[styles.time, { color: tone.fg }]}>{t.time}</Text>
              ) : (
                <Text style={[styles.time, { color: tappable ? C.primary : C.textMuted }]}>{tappable ? 'Tap to record' : '—'}</Text>
              )}
              <Text style={[styles.status, { color: tone.fg }]} numberOfLines={2}>{t.statusLabel}</Text>
              {!!t.note && <Text style={styles.note} numberOfLines={3}>{t.note}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    title: { fontFamily: FontFamily.headlineSemibold, fontSize: 16, color: C.textPrimary },
    count: { fontFamily: FontFamily.bodySemibold, fontSize: 12.5, color: C.textSecondary },
    hint: { fontSize: 12, color: C.textMuted, lineHeight: 17 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: {
      flexBasis: '47%',
      flexGrow: 1,
      minHeight: 150,
      borderRadius: BorderRadius.lg,
      padding: 12,
      gap: 2,
      backgroundColor: C.bgCard,
      borderWidth: 1,
    },
    tileOpen: { borderColor: C.primary, borderStyle: 'dashed' },
    tileDone: { borderColor: C.border },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    iconWell: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    name: { fontFamily: FontFamily.headlineSemibold, fontSize: 14.5, color: C.textPrimary },
    expected: { fontSize: 11.5, color: C.textMuted },
    time: { fontFamily: FontFamily.displayBold, fontSize: 17, marginTop: 4 },
    status: { fontFamily: FontFamily.bodySemibold, fontSize: 11.5 },
    note: { fontSize: 11, color: C.badgeRedText, marginTop: 2, lineHeight: 15 },
  });
