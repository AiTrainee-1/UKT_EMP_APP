import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { format, parseISO } from 'date-fns';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import type { AttendanceRecord } from '../hooks/useAttendance';
import type { DetectionFlags } from '../hooks/useShiftStats';
import {
  DAY_TONES, OFF_DAY_ORDER, OUTCOME_ORDER, RING, attendanceRate, tally, weeksOf,
  type Counts, type DayVisualKey,
} from '../lib/attendanceVisual';

// The month at a glance: a donut of how the days went (the same colours as the calendar below it) with the
// attendance rate in the middle, and week-by-week stacked bars you can tap. Both sweep in when the month changes.
// Hand-drawn with react-native-svg / Views: the app has no charting library, and none is needed.

const DONUT = 148;
const STROKE = 18;
const GAP = 2.5; // px of empty ring between two segments
const BAR_H = 104;

/** 0 -> 1 with ease-out over `ms`, restarted whenever `resetKey` changes. */
function useSweep(resetKey: string, ms = 800): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    setP(0);
    const tick = () => {
      const x = Math.min(1, (Date.now() - start) / ms);
      setP(1 - Math.pow(1 - x, 3));
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [resetKey, ms]);
  return p;
}

const dayRange = (from: string, to: string) =>
  from === to ? format(parseISO(from), 'd MMM') : `${format(parseISO(from), 'd')}–${format(parseISO(to), 'd MMM')}`;

interface Props {
  records: AttendanceRecord[];
  month: number;
  year: number;
  detect: DetectionFlags;
}

export function AttendanceOverview({ records, month, year, detect }: Props) {
  const { C: Colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { width: windowWidth } = useWindowDimensions();

  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const counts = useMemo(() => tally(records, detect, todayIso), [records, detect, todayIso]);
  const weeks = useMemo(() => weeksOf(records, month, year, detect, todayIso), [records, month, year, detect, todayIso]);
  const rate = attendanceRate(counts);
  const total = OUTCOME_ORDER.reduce((n, k) => n + counts[k], 0);

  const resetKey = `${year}-${month}-${total}-${counts.late}`;
  const sweep = useSweep(resetKey);

  // The week you are in (or the last one for a past month) is open first; tapping another bar switches.
  const defaultWeek = useMemo(() => {
    const cur = weeks.find((w) => todayIso >= w.from && todayIso <= w.to);
    return (cur ?? weeks[weeks.length - 1])?.index ?? 1;
  }, [weeks, todayIso]);
  const [picked, setPicked] = useState<{ key: string; week: number } | null>(null);
  const week = picked && picked.key === `${year}-${month}` ? picked.week : defaultWeek;
  const openWeek = weeks.find((w) => w.index === week) ?? weeks[0];

  if (records.length === 0 || total === 0) {
    return <Text style={styles.empty}>No attendance recorded for this month yet.</Text>;
  }

  const fillOf = (k: DayVisualKey) => DAY_TONES[k].solid;
  const r = (DONUT - STROKE) / 2;
  const C = 2 * Math.PI * r;

  // Donut: each outcome is an arc; `sweep` reveals them in order around the ring.
  let acc = 0;
  const arcs = OUTCOME_ORDER.filter((k) => counts[k] > 0).map((k) => {
    const a = acc / total;
    acc += counts[k];
    const b = acc / total;
    const visible = Math.max(0, Math.min(sweep, b) - a) * C;
    return { k, a, dash: Math.max(0, visible - (visible > GAP ? GAP : 0)) };
  });

  const barWidth = Math.min(34, Math.max(18, (windowWidth - 64 - weeks.length * 10) / weeks.length));
  const maxTotal = Math.max(1, ...weeks.map((w) => w.total));

  return (
    <View>
      <View style={styles.topRow}>
        <View style={styles.donutWrap}>
          <Svg width={DONUT} height={DONUT}>
            <G transform={`rotate(-90 ${DONUT / 2} ${DONUT / 2})`}>
              <Circle cx={DONUT / 2} cy={DONUT / 2} r={r} stroke={isDark ? '#FFFFFF14' : '#0F172A0D'} strokeWidth={STROKE} fill="none" />
              {arcs.map((s) => (
                <Circle
                  key={s.k}
                  cx={DONUT / 2}
                  cy={DONUT / 2}
                  r={r}
                  stroke={fillOf(s.k)}
                  strokeWidth={STROKE}
                  fill="none"
                  strokeDasharray={`${s.dash} ${C}`}
                  strokeDashoffset={-s.a * C}
                />
              ))}
            </G>
          </Svg>
          <View style={styles.donutCenter} pointerEvents="none">
            <Text style={styles.rate}>{rate == null ? '–' : Math.round(rate * sweep)}<Text style={styles.ratePct}>{rate == null ? '' : '%'}</Text></Text>
            <Text style={styles.rateLabel}>attendance</Text>
          </View>
        </View>

        <View style={styles.legendCol}>
          {OUTCOME_ORDER.filter((k) => counts[k] > 0 || k === 'present' || k === 'absent').map((k) => (
            <View key={k} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: fillOf(k) }]} />
              <Text style={styles.legendLabel} numberOfLines={1}>{DAY_TONES[k].label}</Text>
              <Text style={styles.legendCount}>{counts[k]}</Text>
            </View>
          ))}
        </View>
      </View>

      {(counts.late > 0 || counts.earlyOut > 0 || counts.sunday > 0 || counts.holiday > 0) && (
        <View style={styles.chipRow}>
          {detect.lateIn && counts.late > 0 && (
            <View style={[styles.chip, { borderColor: RING.late }]}>
              <Text style={[styles.chipText, { color: RING.late }]}>{counts.late} late</Text>
            </View>
          )}
          {detect.earlyOut && counts.earlyOut > 0 && (
            <View style={[styles.chip, { borderColor: isDark ? '#A5B4FC' : RING.earlyOut }]}>
              <Text style={[styles.chipText, { color: isDark ? '#A5B4FC' : RING.earlyOut }]}>{counts.earlyOut} early out</Text>
            </View>
          )}
          {OFF_DAY_ORDER.filter((k) => counts[k] > 0).map((k) => (
            <View key={k} style={[styles.chip, styles.chipSoft, { backgroundColor: isDark ? DAY_TONES[k].fillDark : DAY_TONES[k].fillLight }]}>
              <Text style={[styles.chipText, { color: isDark ? DAY_TONES[k].inkDark : DAY_TONES[k].inkLight }]}>
                {counts[k]} {k === 'sunday' ? (counts[k] === 1 ? 'Sunday' : 'Sundays') : counts[k] === 1 ? 'holiday' : 'holidays'}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>WEEK BY WEEK  ·  TAP A BAR</Text>
      <View style={styles.bars}>
        {weeks.map((w) => {
          const open = w.index === week;
          return (
            <TouchableOpacity
              key={w.index}
              activeOpacity={0.8}
              onPress={() => setPicked({ key: `${year}-${month}`, week: w.index })}
              style={styles.barCol}
              accessibilityRole="button"
              accessibilityLabel={`Week ${w.index}, ${dayRange(w.from, w.to)}`}
              accessibilityState={{ selected: open }}
            >
              <View style={[styles.barTrack, { height: BAR_H, width: barWidth }, open && styles.barTrackOpen]}>
                <View style={[styles.barStack, { height: (w.total / maxTotal) * BAR_H * sweep }]}>
                  {[...OUTCOME_ORDER].reverse().map((k) =>
                    w.counts[k] > 0 ? (
                      <View key={k} style={{ flex: w.counts[k], backgroundColor: fillOf(k), opacity: open ? 1 : 0.55, marginBottom: 1 }} />
                    ) : null,
                  )}
                </View>
              </View>
              <Text style={[styles.barLabel, open && styles.barLabelOpen]}>W{w.index}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {openWeek && <WeekDetail counts={openWeek.counts} from={openWeek.from} to={openWeek.to} index={openWeek.index} styles={styles} isDark={isDark} detect={detect} />}
    </View>
  );
}

function WeekDetail({
  counts, from, to, index, styles, isDark, detect,
}: {
  counts: Counts; from: string; to: string; index: number;
  styles: ReturnType<typeof makeStyles>; isDark: boolean; detect: DetectionFlags;
}) {
  const parts = OUTCOME_ORDER.filter((k) => counts[k] > 0);
  const off = OFF_DAY_ORDER.filter((k) => counts[k] > 0);
  return (
    <View style={styles.detail}>
      <Text style={styles.detailTitle}>Week {index} · {dayRange(from, to)}</Text>
      {parts.length === 0 ? (
        <Text style={styles.detailEmpty}>Nothing recorded yet this week.</Text>
      ) : (
        <View style={styles.chipRow}>
          {parts.map((k) => (
            <View key={k} style={[styles.chip, styles.chipSoft, { backgroundColor: isDark ? DAY_TONES[k].fillDark : DAY_TONES[k].fillLight }]}>
              <Text style={[styles.chipText, { color: isDark ? DAY_TONES[k].inkDark : DAY_TONES[k].inkLight }]}>
                {counts[k]} {DAY_TONES[k].label}
              </Text>
            </View>
          ))}
          {detect.lateIn && counts.late > 0 && (
            <View style={[styles.chip, { borderColor: RING.late }]}><Text style={[styles.chipText, { color: RING.late }]}>{counts.late} late</Text></View>
          )}
          {detect.earlyOut && counts.earlyOut > 0 && (
            <View style={[styles.chip, { borderColor: isDark ? '#A5B4FC' : RING.earlyOut }]}>
              <Text style={[styles.chipText, { color: isDark ? '#A5B4FC' : RING.earlyOut }]}>{counts.earlyOut} early out</Text>
            </View>
          )}
        </View>
      )}
      {off.length > 0 && (
        <Text style={styles.detailEmpty}>
          Off: {off.map((k) => `${counts[k]} ${k === 'sunday' ? 'Sunday' : counts[k] === 1 ? 'holiday' : 'holidays'}`).join(' · ')}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  empty: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 20 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  donutWrap: { width: DONUT, height: DONUT, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  rate: { color: Colors.textPrimary, fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  ratePct: { fontSize: 16, fontWeight: '800', color: Colors.textMuted },
  rateLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700', marginTop: -2 },

  legendCol: { flex: 1, gap: 7 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, color: Colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
  legendCount: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800', minWidth: 20, textAlign: 'right' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { borderWidth: 1.5, borderColor: 'transparent', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipSoft: { borderWidth: 0 },
  chipText: { fontSize: 11, fontWeight: '800' },

  sectionLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginTop: 18, marginBottom: 8 },
  bars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  barCol: { alignItems: 'center', gap: 6 },
  barTrack: { borderRadius: 10, justifyContent: 'flex-end', overflow: 'hidden', backgroundColor: Colors.bgSurfaceLow, borderWidth: 1.5, borderColor: 'transparent' },
  barTrackOpen: { borderColor: Colors.primary },
  barStack: { width: '100%', flexDirection: 'column', justifyContent: 'flex-end' },
  barLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700' },
  barLabelOpen: { color: Colors.primary, fontWeight: '900' },

  detail: { marginTop: 14, backgroundColor: Colors.bgSurfaceLow, borderRadius: 12, padding: 12 },
  detailTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  detailEmpty: { color: Colors.textMuted, fontSize: 11.5, marginTop: 8 },
});
