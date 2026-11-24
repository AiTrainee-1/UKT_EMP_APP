import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { durationText, endSummary, type PunchTile } from '../../lib/onDutyPunches';
import { formatClock, formatDistance } from '../../tracking/format';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

/**
 * "End On-Duty" (owner 2026-11-24): the whole day at a glance before it is closed - where, since when, how long, the four
 * punches (done / not recorded), the distance travelled when the route was recorded - and only then "Yes, end On-Duty".
 * Missing punches are named: once the session ends they can no longer be added to it.
 */
export function EndOnDutySheet({
  visible,
  onClose,
  onConfirm,
  ending,
  destination,
  startedAt,
  approvalText,
  tiles,
  distanceM,
  now,
  otCount = 0,
  otText = null,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  ending: boolean;
  destination: string;
  startedAt: string | null;
  approvalText: string | null;
  tiles: PunchTile[];
  distanceM?: number | null;
  now: number;
  /** Overtime punches after the four, and "1 h 20 min past your Night Punch time". */
  otCount?: number;
  otText?: string | null;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const summary = endSummary(tiles, startedAt, now);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="End On-Duty?">
      <Text style={styles.lead}>Check your day before you end it.</Text>

      <View style={styles.facts}>
        <Fact icon="map-marker-outline" label="Where" value={destination} />
        <Fact icon="clock-start" label="Started" value={startedAt ? formatClock(startedAt) : '—'} />
        <Fact icon="timer-outline" label="Duration" value={durationText(summary.durationMs)} />
        {distanceM != null && distanceM > 0 && <Fact icon="map-marker-distance" label="Travelled" value={formatDistance(distanceM)} />}
        {!!approvalText && <Fact icon="shield-check-outline" label="Approval" value={approvalText} />}
      </View>

      <Text style={styles.section}>
        Geo-punches · {summary.done.length} done, {summary.missing.length} not recorded
      </Text>
      <View style={styles.punches}>
        {tiles.map((t) => {
          const done = t.state !== 'open';
          return (
            <View key={t.punchNumber} style={styles.punchRow}>
              <MaterialCommunityIcons
                name={done ? (t.state === 'done' ? 'check-circle' : 'cloud-upload-outline') : 'circle-outline'}
                size={18}
                color={done ? (t.state === 'done' ? C.statusGreen : C.badgeYellowText) : C.textMuted}
              />
              <Text style={styles.punchName}>{t.name}</Text>
              <Text style={[styles.punchState, !done && { color: C.textMuted }]}>
                {done ? `${t.time ?? ''}${t.time ? ' · ' : ''}${t.statusLabel}` : `Not recorded (expected ${t.expected ?? '—'})`}
              </Text>
            </View>
          );
        })}
      </View>

      {otCount > 0 && (
        <View style={[styles.fact, { marginTop: 10 }]}>
          <MaterialCommunityIcons name="clock-plus-outline" size={16} color={C.categoryOnDuty} />
          <Text style={styles.factLabel}>Overtime</Text>
          <Text style={styles.factValue}>
            {otCount} OT punch{otCount === 1 ? '' : 'es'}
            {otText ? ` · ${otText}` : ''}
          </Text>
        </View>
      )}

      {summary.missingNames ? (
        <View style={styles.warn}>
          <MaterialCommunityIcons name="alert-outline" size={18} color={C.badgeYellowText} />
          <Text style={styles.warnText}>
            {summary.missingNames} {summary.missing.length === 1 ? 'is' : 'are'} not recorded. After you end this On-Duty
            you cannot add {summary.missing.length === 1 ? 'it' : 'them'} to it. If you missed one, record it first, or ask
            for a missing punch later.
          </Text>
        </View>
      ) : (
        <View style={[styles.warn, { backgroundColor: C.badgeGreenBg }]}>
          <MaterialCommunityIcons name="check-all" size={18} color={C.badgeGreenText} />
          <Text style={[styles.warnText, { color: C.badgeGreenText }]}>All four punches are in.</Text>
        </View>
      )}

      <Text style={styles.after}>
        Ending stops the route recording. Your punches stay with HR for approval as usual. You can apply for a new On-Duty
        after this one is closed.
      </Text>

      <Button title="Yes, end On-Duty" onPress={onConfirm} loading={ending} style={{ marginTop: 6 }} />
      <Button title="Not yet" variant="ghost" onPress={onClose} disabled={ending} />
    </BottomSheet>
  );
}

function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.fact}>
      <MaterialCommunityIcons name={icon as any} size={16} color={C.textMuted} />
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    lead: { fontSize: 13, color: C.textSecondary, marginBottom: 10 },
    facts: { borderRadius: BorderRadius.lg, backgroundColor: C.bgSurfaceLow, padding: 12, gap: 8 },
    fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    factLabel: { width: 78, fontSize: 12.5, color: C.textMuted, fontFamily: FontFamily.bodySemibold },
    factValue: { flex: 1, fontSize: 13.5, color: C.textPrimary },
    section: { fontFamily: FontFamily.headlineSemibold, fontSize: 14, color: C.textPrimary, marginTop: 14, marginBottom: 6 },
    punches: { gap: 8 },
    punchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    punchName: { width: 110, fontFamily: FontFamily.bodySemibold, fontSize: 13.5, color: C.textPrimary },
    punchState: { flex: 1, fontSize: 12.5, color: C.textSecondary },
    warn: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 14,
      padding: 12,
      borderRadius: BorderRadius.md,
      backgroundColor: C.badgeYellowBg,
    },
    warnText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: C.badgeYellowText },
    after: { fontSize: 12, lineHeight: 17, color: C.textMuted, marginTop: 10 },
  });
