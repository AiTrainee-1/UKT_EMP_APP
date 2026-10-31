import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, type LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import {
  barPosition,
  buildTimeChips,
  clampMinutes,
  dayBarRange,
  from12h,
  hourCells,
  minuteCells,
  nudge,
  slotTargets,
  to12h,
  to12hLabel,
  type Meridiem,
  type PunchSlot,
  type ShiftTimes,
} from '../../lib/punchTimePicker';

export type DayPunch = { minutes: number; type: 'IN' | 'OUT' };

/**
 * The Missing Punch time picker (owner, 2026-10-31: make picking the time much easier). Three ways in, from fastest:
 * one-tap chips of the employee's own shift times (+ "Now" today), a big hour / minute grid with AM-PM, and -5 / -1 /
 * +1 / +5 nudges for the exact minute. A small day bar shows the picked time against the shift and the punches already
 * recorded that day. Times still to come today cannot be picked. Rules: src/lib/punchTimePicker.ts (tested).
 */
export function PunchTimePicker({
  value,
  onChange,
  shift,
  slot,
  nowMinutes,
  dayPunches,
  problem,
  hint,
}: {
  value: number;
  onChange: (minutes: number) => void;
  shift: ShiftTimes;
  slot: PunchSlot;
  /** The time now when the chosen day is today, else null. */
  nowMinutes: number | null;
  /** Punches already recorded that day, or whether they are still loading / could not be loaded. */
  dayPunches: DayPunch[] | 'loading' | 'error';
  /** Blocking problem (shown in red). */
  problem?: string | null;
  /** Gentle hint (shown in amber). */
  hint?: string | null;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { hour12, minute, meridiem } = to12h(value);

  // Never let a tap land on a time still to come today: pull it back to now.
  const set = (m: number) => onChange(nowMinutes != null ? Math.min(clampMinutes(m), nowMinutes) : clampMinutes(m));

  const chips = buildTimeChips(shift, slot, nowMinutes);
  const hours = hourCells(meridiem, nowMinutes);
  const minutes = minuteCells(hour12, meridiem, nowMinutes);
  const pmLocked = nowMinutes != null && from12h(12, 0, 'PM') > nowMinutes;

  const switchMeridiem = (next: Meridiem) => {
    if (next === meridiem) return;
    set(from12h(hour12, minute, next));
  };

  return (
    <View style={styles.wrap} testID="punch-time-picker">
      {/* The picked time, big, with AM / PM beside it */}
      <View style={styles.display}>
        <View style={styles.displayLeft}>
          <MaterialCommunityIcons name="clock-time-four-outline" size={20} color={Colors.primary} />
          <MotiView
            key={value}
            from={{ opacity: 0.4, translateY: -4 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 180 }}
          >
            <Text style={[styles.bigTime, TabularNums]} accessibilityLiveRegion="polite" testID="punch-time-value">
              {hour12}:{String(minute).padStart(2, '0')}
            </Text>
          </MotiView>
        </View>
        <View style={styles.meridiem} accessibilityRole="radiogroup">
          {(['AM', 'PM'] as const).map((m) => {
            const active = m === meridiem;
            const locked = m === 'PM' && pmLocked;
            return (
              <Pressable
                key={m}
                onPress={() => switchMeridiem(m)}
                disabled={locked}
                style={[styles.meridiemBtn, active && styles.meridiemBtnActive, locked && styles.dim]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled: locked }}
                accessibilityLabel={m === 'AM' ? 'Morning, A M' : 'Afternoon or evening, P M'}
                hitSlop={4}
              >
                <Text style={[styles.meridiemText, active && styles.meridiemTextActive]}>{m}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* One tap: the shift's own times */}
      <Text style={styles.groupLabel}>QUICK PICK</Text>
      <View style={styles.chips}>
        {chips.map((c) => {
          const active = c.minutes === value;
          return (
            <Pressable
              key={c.key}
              onPress={() => set(c.minutes)}
              disabled={c.disabled}
              style={[
                styles.chip,
                c.suggested && styles.chipSuggested,
                active && styles.chipActive,
                c.disabled && styles.dim,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: c.disabled }}
              accessibilityLabel={`${c.label}, ${to12hLabel(c.minutes)}${c.disabled ? ', not yet today' : ''}`}
              testID={`punch-time-chip-${c.key}`}
            >
              {c.key === 'now' ? (
                <MaterialCommunityIcons name="clock-fast" size={14} color={active ? '#fff' : Colors.primary} />
              ) : c.suggested ? (
                <MaterialCommunityIcons name="star-four-points" size={12} color={active ? '#fff' : Colors.primary} />
              ) : null}
              <Text style={[styles.chipLabel, active && styles.chipTextActive]}>{c.label}</Text>
              <Text style={[styles.chipTime, active && styles.chipTextActive, TabularNums]}>{to12hLabel(c.minutes)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Or choose: hour, then minute */}
      <Text style={styles.groupLabel}>HOUR</Text>
      <View style={styles.grid}>
        {hours.map((h) => {
          const active = h.hour12 === hour12;
          return (
            <Pressable
              key={h.hour12}
              onPress={() => set(from12h(h.hour12, minute, meridiem))}
              disabled={h.disabled}
              style={[styles.cell, active && styles.cellActive, h.disabled && styles.dim]}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: h.disabled }}
              accessibilityLabel={`${h.hour12} ${meridiem}`}
            >
              <Text style={[styles.cellText, active && styles.cellTextActive, TabularNums]}>{h.hour12}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.groupLabel}>MINUTE</Text>
      <View style={styles.grid}>
        {minutes.map((m) => {
          const active = m.minute === minute;
          return (
            <Pressable
              key={m.minute}
              onPress={() => set(from12h(hour12, m.minute, meridiem))}
              disabled={m.disabled}
              style={[styles.cell, active && styles.cellActive, m.disabled && styles.dim]}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: m.disabled }}
              accessibilityLabel={`${m.minute} minutes past`}
            >
              <Text style={[styles.cellText, active && styles.cellTextActive, TabularNums]}>
                :{String(m.minute).padStart(2, '0')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The exact minute */}
      <View style={styles.nudges}>
        {[-5, -1, 1, 5].map((d) => {
          const blocked = d > 0 && nowMinutes != null && value >= nowMinutes;
          return (
            <Pressable
              key={d}
              onPress={() => set(nudge(value, d))}
              disabled={blocked}
              style={[styles.nudge, blocked && styles.dim]}
              accessibilityRole="button"
              accessibilityLabel={`${d > 0 ? 'Add' : 'Take away'} ${Math.abs(d)} minute${Math.abs(d) === 1 ? '' : 's'}`}
              testID={`punch-time-nudge-${d}`}
            >
              <Text style={styles.nudgeText}>{d > 0 ? `+${d}` : `−${Math.abs(d)}`} min</Text>
            </Pressable>
          );
        })}
      </View>

      <DayBar value={value} shift={shift} dayPunches={dayPunches} />

      {problem ? (
        <View style={[styles.note, styles.noteBad]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={15} color={Colors.statusRed} />
          <Text style={[styles.noteText, { color: Colors.statusRed }]}>{problem}</Text>
        </View>
      ) : hint ? (
        <View style={[styles.note, styles.noteWarn]}>
          <MaterialCommunityIcons name="information-outline" size={15} color={Colors.badgeYellowText} />
          <Text style={[styles.noteText, { color: Colors.badgeYellowText }]}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The picked time against the shift and the day's recorded punches, on a small horizontal day bar. */
function DayBar({
  value,
  shift,
  dayPunches,
}: {
  value: number;
  shift: ShiftTimes;
  dayPunches: DayPunch[] | 'loading' | 'error';
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const targets = slotTargets(shift);
  const punches = Array.isArray(dayPunches) ? dayPunches : [];
  const range = dayBarRange([targets.morning_in.minutes, targets.evening_out.minutes, value, ...punches.map((p) => p.minutes)]);
  const x = (m: number) => barPosition(m, range) * width;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const pinLeft = Math.max(0, Math.min(width - 2, x(value)));

  return (
    <View style={styles.bar} accessible accessibilityLabel={barSummary(value, targets, punches)}>
      <View style={styles.barHead}>
        <Text style={styles.groupLabel}>YOUR DAY</Text>
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: Colors.statusGreen }]} />
          <Text style={styles.legendText}>In</Text>
          <View style={[styles.legendDot, { backgroundColor: Colors.statusOrange }]} />
          <Text style={styles.legendText}>Out</Text>
          <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
          <Text style={styles.legendText}>Missed punch</Text>
        </View>
      </View>
      <View style={styles.track} onLayout={onLayout}>
        {width > 0 && (
          <>
            {/* the shift, from start to end */}
            <View
              style={[
                styles.shiftSpan,
                { left: x(targets.morning_in.minutes), width: Math.max(2, x(targets.evening_out.minutes) - x(targets.morning_in.minutes)) },
              ]}
            />
            {punches.map((p, i) => (
              <View
                key={`${p.minutes}-${i}`}
                style={[
                  styles.punchDot,
                  { left: x(p.minutes) - 5, backgroundColor: p.type === 'IN' ? Colors.statusGreen : Colors.statusOrange },
                ]}
              />
            ))}
            <MotiView
              animate={{ translateX: pinLeft }}
              transition={{ type: 'spring', damping: 18, stiffness: 180 }}
              style={styles.pinWrap}
            >
              <View style={styles.pin} />
            </MotiView>
          </>
        )}
      </View>
      <View style={styles.barScale}>
        <Text style={styles.scaleText}>{to12hLabel(range.start)}</Text>
        <Text style={styles.scaleText}>
          {dayPunches === 'loading'
            ? 'Loading that day’s punches…'
            : dayPunches === 'error'
              ? 'Could not load that day’s punches'
              : punches.length
              ? `${punches.length} punch${punches.length === 1 ? '' : 'es'} recorded that day`
              : 'No punch recorded that day'}
        </Text>
        <Text style={styles.scaleText}>{to12hLabel(Math.min(range.end, 1439))}</Text>
      </View>
    </View>
  );
}

function barSummary(value: number, targets: ReturnType<typeof slotTargets>, punches: DayPunch[]): string {
  const recorded = punches.length
    ? `Recorded that day: ${punches.map((p) => `${p.type === 'IN' ? 'in' : 'out'} at ${to12hLabel(p.minutes)}`).join(', ')}.`
    : 'No punch recorded that day.';
  return `Missed punch at ${to12hLabel(value)}. Shift ${to12hLabel(targets.morning_in.minutes)} to ${to12hLabel(targets.evening_out.minutes)}. ${recorded}`;
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 14,
      gap: 8,
      marginBottom: 14,
    },
    display: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    displayLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    bigTime: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 40, lineHeight: 46 },
    meridiem: { flexDirection: 'row', backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.full, padding: 4, gap: 4 },
    meridiemBtn: { minWidth: 56, minHeight: 44, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
    meridiemBtnActive: { backgroundColor: Colors.primary },
    meridiemText: { color: Colors.textSecondary, fontFamily: FontFamily.bodySemibold, fontSize: 15 },
    meridiemTextActive: { color: '#fff' },

    groupLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44,
      paddingHorizontal: 12, borderRadius: BorderRadius.full,
      backgroundColor: Colors.bgSurfaceLow, borderWidth: 1.5, borderColor: Colors.border,
    },
    chipSuggested: { borderColor: Colors.primary, backgroundColor: Colors.primaryFixed },
    chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
    chipTime: { color: Colors.textPrimary, fontSize: 12.5, fontWeight: '800' },
    chipTextActive: { color: '#fff' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    cell: {
      width: '15%', flexGrow: 1, minHeight: 44, borderRadius: BorderRadius.md,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.bgSurfaceLow, borderWidth: 1, borderColor: Colors.border,
    },
    cellActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    cellText: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 15 },
    cellTextActive: { color: '#fff' },
    dim: { opacity: 0.35 },

    nudges: { flexDirection: 'row', gap: 6, marginTop: 4 },
    nudge: {
      flex: 1, minHeight: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: Colors.outlineVariant, backgroundColor: Colors.bgCard,
    },
    nudgeText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },

    bar: { marginTop: 6, gap: 6 },
    barHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
    legendText: { color: Colors.textMuted, fontSize: 10 },
    track: { height: 26, borderRadius: 13, backgroundColor: Colors.bgSurfaceLow, justifyContent: 'center' },
    shiftSpan: { position: 'absolute', top: 9, height: 8, borderRadius: 4, backgroundColor: Colors.badgeBlueBg },
    punchDot: { position: 'absolute', top: 8, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Colors.bgCard },
    pinWrap: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, alignItems: 'center' },
    pin: { width: 4, height: 26, borderRadius: 2, backgroundColor: Colors.primary },
    barScale: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    scaleText: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },

    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: BorderRadius.md, padding: 10, marginTop: 4 },
    noteBad: { backgroundColor: Colors.badgeRedBg },
    noteWarn: { backgroundColor: Colors.badgeYellowBg },
    noteText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  });
