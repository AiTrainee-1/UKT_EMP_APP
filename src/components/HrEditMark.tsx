import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius } from '../constants/theme';
import { FontFamily } from '../constants/typography';
import {
  HR_EDIT_OUTLINE,
  hrBadgeColors,
  hrEditA11y,
  hrEditTitle,
  hrEditNote,
  hrEditRows,
  hrStageTitle,
  hrStageTone,
  hrTone,
  type HrBadgeVariant,
  type HrEdit,
} from '../lib/hrEdit';

// The "HR edited this day" pieces of the attendance calendar (owner 2026-11-02): the "!" badge on a day, the "Edited by
// HR" section of the day sheet, and the legend rows. Every colour and word comes from src/lib/hrEdit.ts.

/** The "!" on a calendar day. Inside the cell's bounds (top-left corner: the dots use the right-hand corners), so a tap on
 *  it is never clipped on Android. `onPress` opens the day sheet with the HR details unfolded. */
export function HrEditBadge({
  variant,
  size = 13,
  onPress,
  accessibilityLabel,
  style,
}: {
  variant: HrBadgeVariant;
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: object;
}) {
  const { isDark } = useTheme();
  const c = hrBadgeColors(variant, isDark);
  const dot = (
    <View
      style={[
        badgeStyles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg, borderColor: c.border },
      ]}
    >
      <Text style={[badgeStyles.bang, { color: c.fg, fontSize: Math.round(size * 0.72), lineHeight: size - 2 }]}>!</Text>
    </View>
  );
  if (!onPress) return <View style={style} pointerEvents="none">{dot}</View>;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {dot}
    </Pressable>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  bang: { fontWeight: '900', textAlign: 'center', includeFontPadding: false },
});

/**
 * The day sheet's "Edited by HR" section: a row (what was edited, the stage as a pill) that unfolds into the details -
 * from -> to with shifts, HR's reason, who raised it and when, the approval stage in the server's words, who decided and
 * when, the comment - and one sentence on what the stage means for the day.
 */
export function HrEditPanel({
  edit,
  open,
  onToggle,
  reduceMotion,
}: {
  edit: HrEdit;
  open: boolean;
  onToggle: () => void;
  reduceMotion: boolean;
}) {
  const { C: Colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = hrTone(isDark);
  const stage = hrStageTone(edit);
  const variant: HrBadgeVariant = stage === 'applied' ? 'applied' : stage === 'rejected' ? 'rejected' : 'waiting';
  // The stage pill in the same colour as the day's "!" (indigo applied, amber waiting, rose rejected).
  const badge = hrBadgeColors(variant, isDark);
  const pill = { bg: badge.bg, fg: badge.fg };

  return (
    <View style={[styles.panel, { borderLeftColor: badge.bg, backgroundColor: isDark ? '#6366F11F' : '#EEF2FF' }]} testID="hr-edit-panel">
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${hrEditA11y(edit)} ${open ? 'Hide' : 'Show'} the details.`}
        style={styles.head}
        testID="hr-edit-toggle"
      >
        <HrEditBadge variant={variant} size={18} style={styles.headBadge} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: tone.ink }]}>{hrEditTitle(edit)}</Text>
          <Text style={styles.type} numberOfLines={open ? undefined : 2}>
            {edit.typeLabel}
          </Text>
          {/* The stage on its own line, so a long one ("Waiting for Department Head") is never cut. */}
          <View style={[styles.pill, { backgroundColor: pill.bg }]}>
            <Text style={[styles.pillText, { color: pill.fg }]}>{hrStageTitle(edit)}</Text>
          </View>
        </View>
        <MotiView
          animate={{ rotate: open ? '180deg' : '0deg' }}
          transition={{ type: 'timing', duration: reduceMotion ? 0 : 180 }}
        >
          <MaterialCommunityIcons name="chevron-down" size={20} color={Colors.textMuted} />
        </MotiView>
      </TouchableOpacity>

      {open && (
        <MotiView
          from={reduceMotion ? undefined : { opacity: 0, translateY: -4 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: reduceMotion ? 0 : 200 }}
          style={styles.body}
        >
          {hrEditRows(edit).map((r) => (
            <View key={r.key} style={styles.row} accessible accessibilityLabel={`${r.label}: ${r.value}`}>
              <Text style={styles.rowLabel}>{r.label.toUpperCase()}</Text>
              <Text style={[styles.rowValue, r.key === 'change' && { color: tone.ink, fontWeight: '700' }]}>{r.value}</Text>
            </View>
          ))}
          <Text style={styles.note}>{hrEditNote(edit)}</Text>
        </MotiView>
      )}
    </View>
  );
}

/** The legend's "HR EDITS" rows: the exact cell an applied edit gets (tint + outline + "!"), and the "!" of a waiting and of
 *  a rejected one. */
export function HrEditLegend({ presentFill, presentInk }: { presentFill: string; presentInk: string }) {
  const { isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = hrTone(isDark);
  return (
    <>
      <Text style={styles.legendTitle}>HR EDITS (TAP THE ! ON A DAY FOR DETAILS)</Text>
      <View style={styles.legendGrid}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: tone.fill, borderWidth: HR_EDIT_OUTLINE, borderColor: tone.solid }]}>
            <MaterialCommunityIcons name="check" size={11} color={tone.ink} />
            <HrEditBadge variant="applied" size={10} style={styles.swatchBadge} />
          </View>
          <Text style={styles.legendText}>Edited by HR</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: presentFill }]}>
            <MaterialCommunityIcons name="check" size={11} color={presentInk} />
            <HrEditBadge variant="waiting" size={10} style={styles.swatchBadge} />
          </View>
          <Text style={styles.legendText}>HR edit waiting for approval</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: presentFill }]}>
            <MaterialCommunityIcons name="check" size={11} color={presentInk} />
            <HrEditBadge variant="rejected" size={10} style={styles.swatchBadge} />
          </View>
          <Text style={styles.legendText}>HR edit rejected</Text>
        </View>
      </View>
    </>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    panel: {
      borderRadius: BorderRadius.md,
      borderLeftWidth: 3,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, minHeight: 44 },
    headBadge: { marginTop: 1 },
    title: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
    type: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5, marginTop: 1 },
    pill: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
    pillText: { fontSize: 10.5, fontWeight: '800' },
    body: { marginTop: 6, gap: 9 },
    row: { gap: 2 },
    rowLabel: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
    rowValue: { color: Colors.textPrimary, fontSize: 13, lineHeight: 18 },
    note: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },

    legendTitle: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
    legendGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 6 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7, width: '48%' },
    swatch: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    swatchBadge: { position: 'absolute', top: -4, left: -4 },
    legendText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  });
