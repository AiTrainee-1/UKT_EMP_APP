import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { FontFamily, TabularNums } from '../../constants/typography';
import { pctText, type PayChart as PayChartData, type TrendBar } from '../../lib/myInsights';

/*
 * The charts of Home's "My Insights" (owner 2026-11-25), drawn with react-native-svg and animated on the UI thread by
 * one `progress` value (0 -> 1) the section starts when it scrolls into view (Reduce Motion: it is simply 1).
 *
 * Colours were run through the dataviz palette validator (light and dark): attendance blue vs on-time amber, pay kept
 * teal vs lost rose (red vs green failed the colour-blind check). Text always wears the text tokens; every chart has a
 * legend and a readout of the month you tap, so nothing is told by colour alone.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export const ONTIME_COLOR = '#D97706'; // amber-600: passes the lightness band on both surfaces
export const KEPT_COLOR = '#0D9488'; // teal-600
export function seriesColors(C: Palette, isDark: boolean) {
  return {
    attendance: isDark ? C.primary : C.primaryLight,
    onTime: ONTIME_COLOR,
    kept: KEPT_COLOR,
    lost: isDark ? '#F43F5E' : '#E11D48',
  };
}

/** A bar whose top corners are rounded and whose foot sits square on the baseline. */
function barPath(x: number, bottom: number, w: number, h: number, r: number): string {
  'worklet';
  if (h <= 0.5 || w <= 0) return `M${x},${bottom} L${x + w},${bottom} Z`;
  const rr = Math.min(r, w / 2, h);
  const top = bottom - h;
  return (
    `M${x},${bottom} L${x},${top + rr} Q${x},${top} ${x + rr},${top} ` +
    `L${x + w - rr},${top} Q${x + w},${top} ${x + w},${top + rr} L${x + w},${bottom} Z`
  );
}

/** The share of `progress` that belongs to bar `i` of `n`: a short left-to-right stagger. */
function staggered(p: number, i: number, n: number): number {
  'worklet';
  const step = n > 1 ? 0.35 / (n - 1) : 0;
  const local = (p - i * step) / (1 - 0.35);
  return Math.max(0, Math.min(1, local));
}

// ── the score ring ─────────────────────────────────────────────────────────

export function ScoreRing({
  score,
  color,
  progress,
  size = 128,
  stroke = 12,
  children,
}: {
  score: number | null;
  color: string;
  progress: SharedValue<number>;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const { C } = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - target * progress.value),
  }), [circumference, target]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.bgSurfaceHigh} strokeWidth={stroke} fill="none" />
        {score != null && (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            animatedProps={animatedProps}
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

/** A number that counts up to `value` once `run` turns true (instant under Reduce Motion). */
export function CountUp({ value, run, reduce, style }: { value: number; run: boolean; reduce: boolean; style?: any }) {
  const [shown, setShown] = useState(reduce ? value : 0);
  const fromRef = React.useRef(0);
  fromRef.current = shown;
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    if (!run) return;
    let frame = 0;
    const from = fromRef.current; // a refresh counts on from the figure already shown
    const start = Date.now();
    const DURATION = 900;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, run, reduce]);
  return <Text style={style}>{shown}</Text>;
}

/** A thin horizontal meter (0-100) that fills with `progress`. */
export function Meter({ value, color, progress }: { value: number | null; color: string; progress: SharedValue<number> }) {
  const { C } = useTheme();
  const target = Math.max(0, Math.min(100, value ?? 0));
  const fill = useAnimatedStyle(() => ({ width: `${target * progress.value}%` }), [target]);
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.bgSurfaceHigh, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: color }, fill]} />
    </View>
  );
}

// ── shared chart frame ─────────────────────────────────────────────────────

const CHART_H = 140;
const TOP_PAD = 18; // room for the selected bar's value label
const BOTTOM_PAD = 2;
const PLOT_H = CHART_H - TOP_PAD - BOTTOM_PAD;
const BASE_Y = CHART_H - BOTTOM_PAD;

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

/** Tap targets as wide as each month's column (bigger than the bar): a tap selects that month for the readout. */
function TapColumns({
  count,
  selected,
  onSelect,
  a11y,
}: {
  count: number;
  selected: number;
  onSelect: (i: number) => void;
  a11y: (i: number) => string;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
      {Array.from({ length: count }).map((_, i) => (
        <Pressable
          key={i}
          style={{ flex: 1 }}
          onPress={() => onSelect(i)}
          accessibilityRole="button"
          accessibilityState={{ selected: i === selected }}
          accessibilityLabel={a11y(i)}
        />
      ))}
    </View>
  );
}

function AnimatedBar({
  x, w, h, i, n, color, progress, opacity = 1,
}: { x: number; w: number; h: number; i: number; n: number; color: string; progress: SharedValue<number>; opacity?: number }) {
  const props = useAnimatedProps(() => ({ d: barPath(x, BASE_Y, w, h * staggered(progress.value, i, n), 4) }), [x, w, h, i, n]);
  return <AnimatedPath animatedProps={props} fill={color} opacity={opacity} />;
}

// ── attendance trend ───────────────────────────────────────────────────────

export function TrendChart({
  bars,
  progress,
}: {
  bars: TrendBar[];
  progress: SharedValue<number>;
}) {
  const { C, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const colors = seriesColors(C, isDark);
  const [width, onLayout] = useWidth();
  const n = bars.length;
  const currentIdx = Math.max(0, bars.findIndex((b) => b.current));
  const [selected, setSelected] = useState(currentIdx);
  useEffect(() => setSelected(currentIdx), [currentIdx, n]);

  const slot = n > 0 ? width / n : 0;
  const barW = Math.min(22, slot * 0.42);
  const yOf = (pct: number) => BASE_Y - (Math.max(0, Math.min(100, pct)) / 100) * PLOT_H;

  // The on-time line: one path per run of months that have arrivals (a month with none is a gap, not a zero).
  const runs = useMemo(() => {
    const out: { d: string; length: number }[] = [];
    let pts: [number, number][] = [];
    const flush = () => {
      if (pts.length >= 2) {
        let length = 0;
        for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        out.push({ d: pts.map((p, k) => `${k ? 'L' : 'M'}${p[0]},${p[1]}`).join(' '), length });
      }
      pts = [];
    };
    bars.forEach((b, i) => {
      if (b.onTime == null) flush();
      else pts.push([slot * i + slot / 2, yOf(b.onTime)]);
    });
    flush();
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, slot]);

  const sel = bars[selected];
  return (
    <View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.swatchBar, { backgroundColor: colors.attendance }]} />
          <Text style={styles.legendText}>Attendance</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatchDot, { backgroundColor: colors.onTime, borderColor: C.bgCard }]} />
          <Text style={styles.legendText}>On time</Text>
        </View>
      </View>
      {sel && (
        <Text style={styles.readout} accessibilityLiveRegion="polite">
          <Text style={styles.readoutStrong}>{sel.label}</Text>
          {`  ·  Attendance ${pctText(sel.attendance)}  ·  On time ${pctText(sel.onTime)}`}
        </Text>
      )}
      <View onLayout={onLayout} style={{ height: CHART_H }}>
        {width > 0 && (
          <Svg width={width} height={CHART_H}>
            {[0, 50, 100].map((g) => (
              <Line
                key={g}
                x1={0}
                x2={width}
                y1={yOf(g)}
                y2={yOf(g)}
                stroke={C.border}
                strokeWidth={1}
                strokeDasharray={g === 0 ? undefined : '3 4'}
              />
            ))}
            {bars.map((b, i) =>
              b.attendance == null ? null : (
                <AnimatedBar
                  key={b.key}
                  x={slot * i + (slot - barW) / 2}
                  w={barW}
                  h={(b.attendance / 100) * PLOT_H}
                  i={i}
                  n={n}
                  color={colors.attendance}
                  progress={progress}
                  opacity={i === selected ? 1 : 0.55}
                />
              ),
            )}
            {runs.map((r, k) => (
              <LineRun key={k} d={r.d} length={r.length} color={colors.onTime} progress={progress} />
            ))}
            {bars.map((b, i) =>
              b.onTime == null ? null : (
                <Dot key={`dot-${b.key}`} cx={slot * i + slot / 2} cy={yOf(b.onTime)} color={colors.onTime} ring={C.bgCard} progress={progress} />
              ),
            )}
            {sel?.attendance != null && (
              <SvgText
                x={slot * selected + slot / 2}
                y={Math.max(11, yOf(sel.attendance) - 6)}
                fontSize={10.5}
                fontWeight="700"
                fill={C.textPrimary}
                textAnchor="middle"
              >
                {pctText(sel.attendance)}
              </SvgText>
            )}
          </Svg>
        )}
        <TapColumns
          count={n}
          selected={selected}
          onSelect={setSelected}
          a11y={(i) => `${bars[i].label}: attendance ${pctText(bars[i].attendance)}, on time ${pctText(bars[i].onTime)}`}
        />
      </View>
      <View style={styles.labelsRowStatic}>
        {bars.map((b, i) => (
          <Text
            key={b.key}
            style={[styles.monthLabel, i === selected && styles.monthLabelOn, i === currentIdx && i !== selected && styles.monthLabelNow]}
            numberOfLines={1}
          >
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function LineRun({ d, length, color, progress }: { d: string; length: number; color: string; progress: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }), [length]);
  return (
    <AnimatedPath
      d={d}
      stroke={color}
      strokeWidth={2}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${length} ${length}`}
      animatedProps={props}
    />
  );
}

function Dot({ cx, cy, color, ring, progress }: { cx: number; cy: number; color: string; ring: string; progress: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ opacity: Math.max(0, Math.min(1, progress.value * 1.6 - 0.6)) }));
  return <AnimatedCircle cx={cx} cy={cy} r={4.5} fill={color} stroke={ring} strokeWidth={2} animatedProps={props} />;
}

// ── pay kept vs lost ───────────────────────────────────────────────────────

export function PayBars({ chart, progress, hidden }: { chart: PayChartData; progress: SharedValue<number>; hidden: boolean }) {
  const { C, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const colors = seriesColors(C, isDark);
  const [width, onLayout] = useWidth();
  const bars = chart.bars;
  const n = bars.length;
  const lastWithSlip = useMemo(() => {
    for (let i = n - 1; i >= 0; i--) if (bars[i].hasSlip) return i;
    return Math.max(0, n - 1);
  }, [bars, n]);
  const [selected, setSelected] = useState(lastWithSlip);
  useEffect(() => setSelected(lastWithSlip), [lastWithSlip]);
  const slot = n > 0 ? width / n : 0;
  const barW = Math.min(22, slot * 0.42);
  const GAP = 2; // surface gap between the kept and lost segments
  const sel = bars[selected];

  return (
    <View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.swatchBar, { backgroundColor: colors.kept }]} />
          <Text style={styles.legendText}>Earned</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatchBar, { backgroundColor: colors.lost }]} />
          <Text style={styles.legendText}>Lost to attendance</Text>
        </View>
      </View>
      {sel && (
        <Text style={styles.readout}>
          <Text style={styles.readoutStrong}>{sel.label}</Text>
          {sel.hasSlip
            ? `  ·  Earned ${sel.earnedText}  ·  Lost ${sel.lostText || (hidden ? '•••' : '₹0')}`
            : '  ·  No salary slip yet'}
        </Text>
      )}
      <View onLayout={onLayout} style={{ height: CHART_H }}>
        {width > 0 && (
          <Svg width={width} height={CHART_H}>
            <Line x1={0} x2={width} y1={BASE_Y} y2={BASE_Y} stroke={C.border} strokeWidth={1} />
            {bars.map((b, i) => {
              const x = slot * i + (slot - barW) / 2;
              if (!b.hasSlip) {
                return (
                  <Path
                    key={b.key}
                    d={barPath(x, BASE_Y, barW, 10, 3)}
                    fill="none"
                    stroke={C.outlineVariant}
                    strokeDasharray="2 3"
                    strokeWidth={1}
                  />
                );
              }
              const keptH = b.earnedRatio * PLOT_H;
              const lostH = b.lostRatio * PLOT_H;
              return (
                <StackedBar
                  key={b.key}
                  x={x}
                  w={barW}
                  keptH={keptH}
                  lostH={lostH}
                  gap={GAP}
                  i={i}
                  n={n}
                  kept={colors.kept}
                  lost={colors.lost}
                  dim={i !== selected}
                  progress={progress}
                />
              );
            })}
          </Svg>
        )}
        <TapColumns
          count={n}
          selected={selected}
          onSelect={setSelected}
          a11y={(i) =>
            bars[i].hasSlip
              ? `${bars[i].label}: earned ${hidden ? 'hidden' : bars[i].earnedText}, lost ${hidden ? 'hidden' : bars[i].lostText || 'nothing'}`
              : `${bars[i].label}: no salary slip yet`
          }
        />
      </View>
      <View style={styles.labelsRowStatic}>
        {bars.map((b, i) => (
          <Text key={b.key} style={[styles.monthLabel, i === selected && styles.monthLabelOn]} numberOfLines={1}>
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function StackedBar({
  x, w, keptH, lostH, gap, i, n, kept, lost, dim, progress,
}: {
  x: number; w: number; keptH: number; lostH: number; gap: number; i: number; n: number;
  kept: string; lost: string; dim: boolean; progress: SharedValue<number>;
}) {
  const hasLost = lostH > 0.5;
  // Only the topmost segment gets the rounded end; the lower one stays square under the gap.
  const keptProps = useAnimatedProps(() => {
    const p = staggered(progress.value, i, n);
    const h = keptH * p;
    return { d: hasLost ? barPath(x, BASE_Y, w, h, 0) : barPath(x, BASE_Y, w, h, 4) };
  }, [x, w, keptH, hasLost, i, n]);
  const lostProps = useAnimatedProps(() => {
    const p = staggered(progress.value, i, n);
    const bottom = BASE_Y - keptH * p - gap;
    return { d: barPath(x, bottom, w, Math.max(0, lostH * p - 0.5), 4) };
  }, [x, w, keptH, lostH, gap, i, n]);
  return (
    <>
      <AnimatedPath animatedProps={keptProps} fill={kept} opacity={dim ? 0.55 : 1} />
      {hasLost && <AnimatedPath animatedProps={lostProps} fill={lost} opacity={dim ? 0.55 : 1} />}
    </>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 6 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendText: { color: C.textSecondary, fontSize: 11.5, fontFamily: FontFamily.bodySemibold },
    swatchBar: { width: 10, height: 10, borderRadius: 3 },
    swatchDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
    readout: { color: C.textSecondary, fontSize: 12, marginBottom: 8, ...TabularNums },
    readoutStrong: { color: C.textPrimary, fontFamily: FontFamily.bodySemibold },
    labelsRowStatic: { flexDirection: 'row', marginTop: 6 },
    monthLabel: { flex: 1, textAlign: 'center', color: C.textMuted, fontSize: 11, fontWeight: '600' },
    monthLabelOn: { color: C.textPrimary, fontWeight: '800' },
    monthLabelNow: { color: C.textSecondary },
  });
