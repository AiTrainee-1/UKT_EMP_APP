import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { format, subDays } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { useMinuteNow } from './HomeClock';
import { useGeoPunchStatus } from '../../hooks/useGeoAttendance';
import type { AttendanceRecord } from '../../hooks/useAttendance';
import type { ShiftInfo } from '../../hooks/useShift';
import { useReduceMotion } from '../../lib/motionPrefs';
import {
  PUNCH_ROWS_COLLAPSED,
  axisNow,
  barFraction,
  dayBarModel,
  dayOffOf,
  geoPunchesGrew,
  hourLabel,
  pickShiftDay,
  presenceLine,
  punchA11y,
  punchMeta,
  punchStory,
  shiftProgress,
  shiftProgressAt,
  shiftStatusText,
  shiftTitle,
  shiftWindow,
  to12h,
  visiblePunches,
  type DayBarModel,
  type DayOffKind,
  type GeoCount,
  type PunchKind,
  type PunchStep,
} from '../../lib/homePunches';
import { Reveal } from '../Reveal';
import { Skeleton } from '../ui/Skeleton';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';

// Home's "Right now / Today's punches" panel: the live clock, the shift and how far into it we are, and today's punches
// drawn on the day as a bar (time inside filled in, a dot per punch, "now") plus the same punches in words, labelled by
// what they are ("Arrived", "Stepped out", "Came back", "Left for the day"). The native twin of the Employee Web App's
// dashboard TodayPanel; the rules live in src/lib/homePunches.ts.
//
// Data: the month's attendance Home already loads (today's record; yesterday's for a night worker still on last night's
// shift) and the shift assignment. The geo-punch status the slide-to-punch bar already polls only tells it when a new punch
// has landed, so the month is re-read once and a biometric punch shows up without pulling to refresh.

const KIND_ICON: Record<PunchKind, string> = {
  arrived: 'login',
  came_back: 'restore',
  in_again: 'login',
  stepped_out: 'coffee-outline',
  out: 'logout',
  left: 'home-outline',
};

type RowTone = 'in' | 'out' | 'left';
const KIND_TONE: Record<PunchKind, RowTone> = {
  arrived: 'in',
  came_back: 'in',
  in_again: 'in',
  stepped_out: 'out',
  out: 'out',
  left: 'left',
};

const DAY_OFF_ICON: Record<DayOffKind, string> = {
  leave: 'umbrella-outline',
  casual_leave: 'calendar-star',
  holiday: 'party-popper',
  weekly_off: 'sofa-outline',
};

const BAR_H = 44;
const TRACK_H = 12;
const DOT = 20;
const TICK_W = 44;

/** "#RRGGBB" + alpha (0..1) -> "#RRGGBBAA"; any other colour string comes back unchanged. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  return `#${m[1]}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

function rowTone(C: Palette, tone: RowTone): { bg: string; fg: string } {
  if (tone === 'in') return { bg: C.badgeGreenBg, fg: C.badgeGreenText };
  if (tone === 'out') return { bg: C.badgeYellowBg, fg: C.badgeYellowText };
  return { bg: C.badgeBlueBg, fg: C.badgeBlueText };
}

function chipTone(C: Palette, kind: DayOffKind | 'night'): { bg: string; fg: string } {
  switch (kind) {
    case 'leave':
    case 'casual_leave':
      return { bg: C.badgeLeaveBg, fg: C.badgeLeaveText };
    case 'holiday':
      return { bg: C.badgeYellowBg, fg: C.badgeYellowText };
    case 'weekly_off':
      return { bg: C.badgePendingBg, fg: C.badgePendingText };
    default:
      return { bg: C.badgeBlueBg, fg: C.badgeBlueText };
  }
}

export function TodayPanel({
  employeeId,
  records,
  recordsLoading,
  recordsFailed,
  shift,
  shiftLoading,
}: {
  employeeId: number | null;
  /** This month's attendance records (useAttendance). */
  records: readonly AttendanceRecord[] | undefined;
  recordsLoading: boolean;
  /** The month could not be read (and nothing is cached): the punches part offers "Try again". */
  recordsFailed: boolean;
  shift: ShiftInfo | null | undefined;
  shiftLoading: boolean;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const now = useMinuteNow();
  const [expanded, setExpanded] = useState(false);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayKey = format(now, 'yyyy-MM-dd');
  const start = shift?.startTime ?? null;
  const end = shift?.endTime ?? null;
  const { record, carried } = pickShiftDay(records, {
    today: todayKey,
    yesterday: format(subDays(now, 1), 'yyyy-MM-dd'),
    shiftStart: start,
    shiftEnd: end,
    nowMinutes: nowMin,
  });
  const steps = punchStory(record?.punches, { shiftStart: start, shiftEnd: end });
  const dayOff = carried ? null : dayOffOf(record);
  const win = shiftWindow(start, end);
  const nowAxis = axisNow(nowMin, carried);
  const progress = win ? (carried ? shiftProgressAt(win, nowAxis) : shiftProgress(start, end, nowMin)) : null;
  const inside = !!steps[steps.length - 1]?.isIn;
  const presence = presenceLine(steps, { dayOff, shiftStart: start, shiftEnd: end, nowMinutes: nowMin });
  const loading = recordsLoading && !records;
  // A day off with no punch has nothing to measure; a worked holiday still shows how far into the shift it is.
  const showProgress = progress != null && !(dayOff && steps.length === 0);
  const chip = carried
    ? { icon: 'weather-night', text: 'Night shift · since yesterday', tone: chipTone(Colors, 'night') }
    : dayOff
      ? { icon: DAY_OFF_ICON[dayOff.kind], text: dayOff.short, tone: chipTone(Colors, dayOff.kind) }
      : null;

  // A new punch in the geo status (polled by the slide-to-punch bar) re-reads the month once.
  const geo = useGeoPunchStatus(!!employeeId);
  const queryClient = useQueryClient();
  const seen = useRef<GeoCount | null>(null);
  const geoDate = geo.data?.date;
  const geoCount = geo.data?.punches?.length;
  useEffect(() => {
    if (geoDate == null || geoCount == null) return;
    const next = { date: geoDate, count: geoCount };
    if (geoPunchesGrew(seen.current, next, todayKey)) {
      void queryClient.invalidateQueries({ queryKey: ['attendance', employeeId] });
    }
    seen.current = next;
  }, [geoDate, geoCount, todayKey, employeeId, queryClient]);

  return (
    <View style={styles.card}>
      <View style={styles.glow} pointerEvents="none" />

      {/* ── Right now ── */}
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>RIGHT NOW</Text>
        {chip && (
          <View style={[styles.chip, { backgroundColor: chip.tone.bg }]}>
            <MaterialCommunityIcons name={chip.icon as any} size={12} color={chip.tone.fg} />
            <Text style={[styles.chipText, { color: chip.tone.fg }]} numberOfLines={1}>
              {chip.text}
            </Text>
          </View>
        )}
      </View>
      <BigClock now={now} />
      {loading ? (
        <Skeleton width={190} height={18} style={{ marginTop: 8 }} />
      ) : recordsFailed ? null : (
        <View style={styles.presenceRow}>
          <PresenceDot inside={inside} reduce={reduce} />
          <Text style={styles.presenceText}>{presence}</Text>
        </View>
      )}

      {shift ? (
        <View style={styles.shiftCard}>
          <View style={styles.shiftRow}>
            <MaterialCommunityIcons name="clock-outline" size={16} color={Colors.statusBlue} />
            <Text style={styles.shiftName} numberOfLines={1}>
              {shiftTitle(shift.shiftName)}
            </Text>
            <Text style={styles.shiftTimes} accessibilityLabel={`From ${to12h(start)} to ${to12h(end)}`}>
              {to12h(start)} – {to12h(end)}
            </Text>
          </View>
          {showProgress && progress != null && (
            <>
              <ProgressBar value={progress} reduce={reduce} />
              <Text style={styles.shiftStatus}>
                {shiftStatusText(progress, { start, nowMinutes: nowMin, graceMinutes: shift.gracePeriod })}
              </Text>
            </>
          )}
        </View>
      ) : shiftLoading ? (
        <Skeleton height={66} borderRadius={BorderRadius.md} style={{ marginTop: 14 }} />
      ) : (
        <Text style={styles.noShift}>No shift is assigned to you yet.</Text>
      )}

      <View style={styles.divider} />

      {/* ── Today's punches ── */}
      <View style={styles.punchHeader}>
        <MaterialCommunityIcons name="fingerprint" size={18} color={Colors.categoryPunch} />
        <Text style={styles.punchTitle} accessibilityRole="header">
          {carried ? "This shift's punches" : "Today's punches"}
        </Text>
        <View style={{ flex: 1 }} />
        {!loading && !recordsFailed && steps.length > 0 && (
          <View style={styles.countPill}>
            <Text style={styles.countText}>{steps.length} recorded</Text>
          </View>
        )}
      </View>

      {recordsFailed ? (
        <View style={styles.failedRow}>
          <Text style={styles.failedText}>Today's punches could not be loaded just now.</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void queryClient.invalidateQueries({ queryKey: ['attendance', employeeId] })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Try loading today's punches again"
          >
            <MaterialCommunityIcons name="refresh" size={14} color={Colors.primary} />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={36} borderRadius={18} />
          <Skeleton height={52} borderRadius={BorderRadius.md} />
        </View>
      ) : steps.length === 0 ? (
        <NoPunches dayOff={dayOff?.kind ?? null} over={!dayOff && progress != null && progress >= 1} />
      ) : (
        <>
          <DayBar model={dayBarModel(steps, { shiftStart: start, shiftEnd: end, nowAxis })} reduce={reduce} />
          <PunchList steps={steps} expanded={expanded} onToggle={setExpanded} />
        </>
      )}
    </View>
  );
}

/** "2:47" with a small "PM" beside it; the panel re-renders once a minute, so this does too. */
function BigClock({ now }: { now: Date }) {
  const styles = useThemedStyles(makeStyles);
  const h = now.getHours();
  const text = `${h % 12 === 0 ? 12 : h % 12}:${String(now.getMinutes()).padStart(2, '0')}`;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return (
    <View style={styles.clockRow} accessible accessibilityRole="text" accessibilityLabel={`Time now ${text} ${ampm}`}>
      <Text style={styles.clock}>{text}</Text>
      <Text style={styles.clockAmPm}>{ampm}</Text>
    </View>
  );
}

/** Green with a soft ring while the employee is inside (last punch an IN); a grey dot otherwise. */
function PresenceDot({ inside, reduce }: { inside: boolean; reduce: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const color = inside ? Colors.statusGreen : withAlpha(Colors.textPrimary, 0.25);
  return (
    <View style={styles.presenceDotWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {inside && !reduce && (
        <MotiView
          from={{ opacity: 0.45, scale: 1 }}
          animate={{ opacity: 0, scale: 2.6 }}
          transition={{ type: 'timing', duration: 2000, loop: true, repeatReverse: false }}
          style={[styles.presenceDot, styles.presenceRing, { backgroundColor: color }]}
        />
      )}
      <View style={[styles.presenceDot, { backgroundColor: color }]} />
    </View>
  );
}

/** How far into the shift: a sapphire gradient bar that fills on first show (instantly with Reduce Motion on). */
function ProgressBar({ value, reduce }: { value: number; reduce: boolean }) {
  const { isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [w, setW] = useState(0);
  const target = Math.round(w * value);
  const colors = isDark ? (['#3B82F6', '#60A5FA', '#93C5FD'] as const) : (['#1E3A8A', '#2563EB', '#3B82F6'] as const);
  const fill = <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />;
  return (
    <View
      style={styles.progressTrack}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="How far into today's shift"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
    >
      {w > 0 &&
        (reduce ? (
          <View style={[styles.progressFill, { width: target }]}>{fill}</View>
        ) : (
          <MotiView
            from={{ width: 0 }}
            animate={{ width: target }}
            transition={{ type: 'timing', duration: 900 }}
            style={styles.progressFill}
          >
            {fill}
          </MotiView>
        ))}
    </View>
  );
}

/**
 * The day as a bar: the shift window lightly tinted, time spent inside filled in, one dot per punch, and a "now" marker.
 * Hidden from screen readers: the list under it says the same in words.
 */
function DayBar({ model, reduce }: { model: DayBarModel; reduce: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const [w, setW] = useState(0);
  const x = (m: number) => barFraction(model, m) * w;

  return (
    <View style={styles.barWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.barArea} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <View style={styles.track} />
        {w > 0 && (
          <>
            {model.shift && (
              <View
                style={[styles.shiftWindow, { left: x(model.shift.from), width: Math.max(2, x(model.shift.to) - x(model.shift.from)) }]}
              />
            )}
            {model.inside.map((seg, i) => (
              <InsideSegment key={seg.from} left={x(seg.from)} width={Math.max(3, x(seg.to) - x(seg.from))} index={i} reduce={reduce} />
            ))}
            {model.dots.map((d, i) => (
              <PunchDot key={d.key} left={x(d.at)} isIn={d.isIn} index={i} reduce={reduce} />
            ))}
            {model.now != null && <NowMarker left={x(model.now)} reduce={reduce} />}
          </>
        )}
      </View>
      <View style={styles.ticks}>
        {w > 0 &&
          model.ticks.map((t) => {
            const raw = x(t) - TICK_W / 2;
            const atLeft = raw < 0;
            const atRight = raw > w - TICK_W;
            return (
              <Text
                key={t}
                style={[
                  styles.tick,
                  { left: atLeft ? 0 : atRight ? w - TICK_W : raw, textAlign: atLeft ? 'left' : atRight ? 'right' : 'center' },
                ]}
                numberOfLines={1}
              >
                {hourLabel(t)}
              </Text>
            );
          })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchInside]} />
          <Text style={styles.legendText}>Inside</Text>
        </View>
        {model.shift && (
          <View style={styles.legendItem}>
            <View style={[styles.swatch, styles.swatchShift]} />
            <Text style={styles.legendText}>Shift time</Text>
          </View>
        )}
        <View style={styles.legendItem}>
          <View style={styles.swatchNow} />
          <Text style={styles.legendText}>Now</Text>
        </View>
      </View>
    </View>
  );
}

function InsideSegment({ left, width, index, reduce }: { left: number; width: number; index: number; reduce: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const fill = (
    <LinearGradient
      colors={[withAlpha(Colors.statusGreen, 0.7), Colors.statusGreen]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={StyleSheet.absoluteFill}
    />
  );
  if (reduce) return <View style={[styles.inside, { left, width }]}>{fill}</View>;
  return (
    <MotiView
      from={{ width: 0 }}
      animate={{ width }}
      transition={{ type: 'timing', duration: 700, delay: 200 + index * 100 }}
      style={[styles.inside, { left }]}
    >
      {fill}
    </MotiView>
  );
}

function PunchDot({ left, isIn, index, reduce }: { left: number; isIn: boolean; index: number; reduce: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const style = [styles.dot, { left: left - DOT / 2, backgroundColor: isIn ? Colors.statusGreen : Colors.statusYellow }];
  const icon = <MaterialCommunityIcons name={isIn ? 'login' : 'door-open'} size={11} color={Colors.onPrimary} />;
  if (reduce) return <View style={style}>{icon}</View>;
  return (
    <MotiView
      from={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 24, delay: 300 + index * 80 }}
      style={style}
    >
      {icon}
    </MotiView>
  );
}

function NowMarker({ left, reduce }: { left: number; reduce: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.nowWrap, { left: left - 6 }]}>
      <View style={styles.nowLine} />
      {!reduce && (
        <MotiView
          from={{ opacity: 0.45, scale: 1 }}
          animate={{ opacity: 0, scale: 2.4 }}
          transition={{ type: 'timing', duration: 2000, loop: true, repeatReverse: false }}
          style={styles.nowDot}
        />
      )}
      <View style={styles.nowDot} />
    </View>
  );
}

/** The punches in words, oldest first; past four, the latest four with "Show N earlier" above them. */
function PunchList({ steps, expanded, onToggle }: { steps: PunchStep[]; expanded: boolean; onToggle: (v: boolean) => void }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { shown, hiddenCount } = visiblePunches(steps, expanded);
  return (
    <View style={styles.list} accessibilityRole="list">
      {hiddenCount > 0 && (
        <TouchableOpacity
          style={styles.moreRow}
          onPress={() => onToggle(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Show ${hiddenCount} earlier punch${hiddenCount === 1 ? '' : 'es'}`}
        >
          <MaterialCommunityIcons name="chevron-up" size={16} color={Colors.primary} />
          <Text style={styles.moreText}>
            Show {hiddenCount} earlier punch{hiddenCount === 1 ? '' : 'es'}
          </Text>
        </TouchableOpacity>
      )}
      {shown.map((s, i) => (
        <PunchRow key={s.key} step={s} index={i} divider={i > 0 || hiddenCount > 0} />
      ))}
      {expanded && steps.length > PUNCH_ROWS_COLLAPSED && (
        <TouchableOpacity
          style={[styles.moreRow, styles.moreRowBottom]}
          onPress={() => onToggle(false)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Show fewer punches"
        >
          <MaterialCommunityIcons name="chevron-down" size={16} color={Colors.primary} />
          <Text style={styles.moreText}>Show fewer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function PunchRow({ step, index, divider }: { step: PunchStep; index: number; divider: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = rowTone(Colors, KIND_TONE[step.kind]);
  const meta = punchMeta(step);
  return (
    <Reveal index={index} offsetY={6}>
      <View style={[styles.row, divider && styles.rowDivider]} accessible accessibilityLabel={punchA11y(step)}>
        <View style={[styles.rowIcon, { backgroundColor: tone.bg }]}>
          <MaterialCommunityIcons name={KIND_ICON[step.kind] as any} size={17} color={tone.fg} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {step.label}
          </Text>
          {!!meta && (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {meta}
            </Text>
          )}
        </View>
        <Text style={styles.rowTime}>{step.time}</Text>
      </View>
    </Reveal>
  );
}

/** No punch on the day: why that is fine (a day off), what to do (shift over: ask for the missing punch), or how punches arrive. */
function NoPunches({ dayOff, over }: { dayOff: DayOffKind | null; over: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const icon = dayOff ? DAY_OFF_ICON[dayOff] : over ? 'fingerprint-off' : 'gesture-swipe-right';
  const text = dayOff
    ? 'No punch is expected today. If you do work, your punches show here.'
    : over
      ? 'No punch was recorded for your shift. If you were at work, ask for the missing punch.'
      : 'No punch yet. Biometric punches show here once the device sends them, or slide the bar below to punch by GPS.';
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon as any} size={20} color={Colors.textMuted} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.emptyText}>{text}</Text>
        {over && (
          <TouchableOpacity
            style={styles.emptyLink}
            onPress={() => router.push('/missing-punch' as any)}
            activeOpacity={0.75}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityHint="Opens Missing Punch"
          >
            <Text style={styles.emptyLinkText}>Request a missing punch</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 16,
      marginBottom: 20,
      overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
        android: { elevation: 1 },
      }),
    },
    glow: {
      position: 'absolute',
      top: -90,
      right: -60,
      width: 210,
      height: 210,
      borderRadius: 105,
      backgroundColor: Colors.primaryFixed,
      opacity: 0.5,
    },

    // Right now
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 22 },
    eyebrow: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 1 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 1,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    chipText: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
    clockRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 },
    clock: {
      color: Colors.textPrimary,
      fontFamily: FontFamily.displayBold,
      fontSize: 46,
      lineHeight: 52,
      letterSpacing: -1,
      ...TabularNums,
    },
    clockAmPm: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 15, marginTop: 8, marginLeft: 6 },
    presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 4 },
    presenceDotWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
    presenceDot: { width: 10, height: 10, borderRadius: 5 },
    presenceRing: { position: 'absolute' },
    presenceText: { flex: 1, color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 15, ...TabularNums },

    // Shift card
    shiftCard: {
      marginTop: 14,
      gap: 8,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: withAlpha(Colors.textPrimary, 0.03),
      padding: 12,
    },
    shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    shiftName: { flex: 1, color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
    shiftTimes: { color: Colors.textMuted, fontSize: 12.5, ...TabularNums },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: withAlpha(Colors.textPrimary, 0.1), overflow: 'hidden' },
    progressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, overflow: 'hidden' },
    shiftStatus: { color: Colors.textMuted, fontSize: 12, ...TabularNums },
    noShift: { marginTop: 12, color: Colors.textMuted, fontSize: 13 },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: 16 },

    // Today's punches
    punchHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    punchTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
    countPill: { backgroundColor: Colors.badgeBlueBg, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
    countText: { color: Colors.badgeBlueText, fontSize: 11, fontWeight: '700', ...TabularNums },

    // Day bar
    barWrap: { marginBottom: 14 },
    barArea: { height: BAR_H },
    track: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: (BAR_H - TRACK_H) / 2,
      height: TRACK_H,
      borderRadius: TRACK_H / 2,
      backgroundColor: withAlpha(Colors.textPrimary, 0.07),
    },
    shiftWindow: {
      position: 'absolute',
      top: (BAR_H - TRACK_H) / 2,
      height: TRACK_H,
      borderRadius: TRACK_H / 2,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: withAlpha(Colors.primary, 0.45),
      backgroundColor: withAlpha(Colors.primary, 0.1),
    },
    inside: {
      position: 'absolute',
      top: (BAR_H - TRACK_H) / 2,
      height: TRACK_H,
      borderRadius: TRACK_H / 2,
      overflow: 'hidden',
    },
    dot: {
      position: 'absolute',
      top: (BAR_H - DOT) / 2,
      width: DOT,
      height: DOT,
      borderRadius: DOT / 2,
      borderWidth: 2,
      borderColor: Colors.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2 },
        android: { elevation: 2 },
      }),
    },
    nowWrap: { position: 'absolute', top: 0, bottom: 0, width: 12, alignItems: 'center' },
    nowLine: { position: 'absolute', top: 6, bottom: 4, width: 1, backgroundColor: withAlpha(Colors.textPrimary, 0.5) },
    nowDot: { position: 'absolute', top: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textPrimary },
    ticks: { height: 16, marginTop: 2 },
    tick: { position: 'absolute', width: TICK_W, color: Colors.textMuted, fontSize: 11, ...TabularNums },
    legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4, marginTop: 6 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendText: { color: Colors.textMuted, fontSize: 11.5 },
    swatch: { width: 16, height: 8, borderRadius: 4 },
    swatchInside: { backgroundColor: Colors.statusGreen },
    swatchShift: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: withAlpha(Colors.primary, 0.5),
      backgroundColor: withAlpha(Colors.primary, 0.1),
    },
    swatchNow: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textPrimary },

    // Punch rows
    list: {
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: withAlpha(Colors.textPrimary, 0.03),
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, minHeight: 54 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
    rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1, gap: 1 },
    rowLabel: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
    rowMeta: { color: Colors.textMuted, fontSize: 12 },
    rowTime: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5, ...TabularNums },
    moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44 },
    moreRowBottom: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
    moreText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },

    // Could not load
    failedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    failedText: { flex: 1, color: Colors.textMuted, fontSize: 12.5, lineHeight: 18 },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primaryFixed,
    },
    retryText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },

    // No punch
    empty: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: Colors.outlineVariant,
      padding: 14,
    },
    emptyText: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
    emptyLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 32 },
    emptyLinkText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  });
