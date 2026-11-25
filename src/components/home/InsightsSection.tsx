import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMyInsights } from '../../hooks/useMyInsights';
import { useReduceMotion } from '../../lib/motionPrefs';
import {
  arrivalText,
  countText,
  currentMonth,
  durationText,
  healthScore,
  insightLines,
  insightsEmpty,
  payChart,
  pctText,
  periodsFor,
  totalsOf,
  trendBars,
  type InsightLine,
  type InsightsScope,
  type ScoreTone,
} from '../../lib/myInsights';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily, TabularNums } from '../../constants/typography';
import { Skeleton } from '../ui/Skeleton';
import { CountUp, Meter, PayBars, ScoreRing, TrendChart, seriesColors } from './InsightsCharts';
import { useSalaryShown } from './salaryVisibility';

/**
 * Home's "My Insights" (owner 2026-11-25): a small health report of the employee's own last 6 months, after Quick
 * Actions and Last salary. An attendance health score (ring, 0-100, with a plain grade), short sentences ("On time 18
 * of 21 days this month"), the attendance / on-time trend, punctuality, early outs, time off, On-Duty days, overtime and
 * pay earned vs lost to attendance (masked while Home's salary eye is closed).
 *
 * The numbers come from GET /my/analytics (backend api/mobile_analytics.py); the score and every sentence from
 * src/lib/myInsights.ts. The charts draw themselves the first time the section scrolls into view (`revealed`, from Home)
 * and are still under Reduce Motion.
 */
export function InsightsSection({
  employeeId,
  employmentType,
  revealed,
  anchorRef,
}: {
  employeeId: number | null;
  employmentType?: string | null;
  revealed: boolean;
  /** The header, for the app tour's spotlight. */
  anchorRef?: React.Ref<ViewInstance>;
}) {
  const { C, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const { data, isLoading, isError, refetch, isRefetching } = useMyInsights(employeeId);
  const [shown, toggleShown] = useSalaryShown();
  const hidden = !shown;
  const [scope, setScope] = useState<InsightsScope>('window');
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!data) return;
    if (reduce) {
      progress.value = 1;
      return;
    }
    if (!revealed) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, [revealed, data, reduce, scope, progress]);

  const periods = useMemo(() => periodsFor(data, scope), [data, scope]);
  const score = useMemo(() => healthScore(periods), [periods]);
  const totals = useMemo(() => totalsOf(periods), [periods]);
  const lines = useMemo(() => insightLines(data, hidden).slice(0, 5), [data, hidden]);
  const trend = useMemo(() => trendBars(data), [data]);
  const pay = useMemo(() => payChart(data, hidden), [data, hidden]);
  const colors = seriesColors(C, isDark);
  const months = data?.periods.length ?? 6;
  const production = (data?.employmentType ?? employmentType) === 'production';
  const cur = currentMonth(data);

  const toneColor: Record<ScoreTone, string> = {
    great: C.statusGreen,
    good: colors.attendance,
    fair: C.statusYellow,
    low: C.statusRed,
    none: C.outline,
  };
  const tonePill: Record<ScoreTone, { bg: string; fg: string }> = {
    great: { bg: C.badgeGreenBg, fg: C.badgeGreenText },
    good: { bg: C.badgeBlueBg, fg: C.badgeBlueText },
    fair: { bg: C.badgeYellowBg, fg: C.badgeYellowText },
    low: { bg: C.badgeRedBg, fg: C.badgeRedText },
    none: { bg: C.badgePendingBg, fg: C.badgePendingText },
  };

  const header = (
    <View ref={anchorRef} collapsable={false} style={styles.headerRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>My Insights</Text>
        <Text style={styles.sectionHint}>Your attendance health report</Text>
      </View>
      {!!data && !insightsEmpty(data) && (
        <View style={styles.segment} accessibilityRole="tablist">
          {(['window', 'month'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setScope(k)}
              style={[styles.segmentItem, scope === k && styles.segmentItemOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: scope === k }}
            >
              <Text style={[styles.segmentText, scope === k && styles.segmentTextOn]}>
                {k === 'window' ? `${months} months` : 'This month'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  if (isLoading || (!data && isRefetching)) {
    return (
      <View style={styles.wrap}>
        {header}
        <View style={[styles.card, styles.heroRow]}>
          <Skeleton width={112} height={112} borderRadius={56} />
          <View style={{ flex: 1, gap: 10 }}>
            <Skeleton width="50%" height={12} />
            <Skeleton width="70%" height={20} />
            <Skeleton width="100%" height={10} />
            <Skeleton width="85%" height={10} />
          </View>
        </View>
        <View style={styles.card}>
          <Skeleton width="40%" height={14} style={{ marginBottom: 14 }} />
          <Skeleton width="100%" height={120} borderRadius={12} />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.wrap}>
        {header}
        <View style={[styles.card, styles.stateCard]}>
          <View style={[styles.stateIcon, { backgroundColor: C.badgeRedBg }]}>
            <MaterialCommunityIcons name="cloud-alert-outline" size={22} color={C.statusRed} />
          </View>
          <Text style={styles.stateTitle}>{isError ? 'Couldn’t load your insights' : 'No insights yet'}</Text>
          <Text style={styles.stateText}>Check your connection and try again.</Text>
          <Pressable
            onPress={() => void refetch()}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="refresh" size={16} color={C.onPrimary} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (insightsEmpty(data)) {
    return (
      <View style={styles.wrap}>
        {header}
        <View style={[styles.card, styles.stateCard]}>
          <View style={[styles.stateIcon, { backgroundColor: C.badgeBlueBg }]}>
            <MaterialCommunityIcons name="chart-arc" size={22} color={colors.attendance} />
          </View>
          <Text style={styles.stateTitle}>Your insights will appear here</Text>
          <Text style={styles.stateText}>
            Once you have working days this month, your attendance health score, trends and pay summary show up here.
          </Text>
        </View>
      </View>
    );
  }

  const periodCaption =
    scope === 'month'
      ? `${cur?.label ?? 'This month'} so far`
      : `${data.periods[0]?.shortLabel ?? ''} – ${data.periods[data.periods.length - 1]?.label ?? ''}`;
  const pill = tonePill[score.tone];
  const onTime = score.parts.punctuality;

  const tiles: { key: string; icon: string; tint: string; bg: string; value: string; label: string; caption: string }[] = [
    {
      key: 'punctuality',
      icon: 'clock-check-outline',
      tint: colors.onTime,
      bg: C.badgeYellowBg,
      value: pctText(onTime),
      label: 'On time',
      caption:
        totals.arrivals > 0
          ? `${countText(totals.onTime)} of ${countText(totals.arrivals)} days · ${arrivalText(totals.avgArrivalDelta)}${
              data.shift?.start && totals.avgArrivalDelta != null ? ` vs ${data.shift.start}` : ''
            }`
          : 'No arrivals yet',
    },
    {
      key: 'present',
      icon: 'calendar-check-outline',
      tint: colors.attendance,
      bg: C.badgeBlueBg,
      value: `${countText(totals.attended)}/${countText(totals.working)}`,
      label: 'Days present',
      caption: `${countText(totals.absent)} absent · ${countText(totals.half)} half day${totals.half === 1 ? '' : 's'}`,
    },
    {
      key: 'earlyOut',
      icon: 'exit-run',
      tint: C.statusRed,
      bg: C.badgeRedBg,
      value: countText(totals.earlyOutDays),
      label: totals.earlyOutDays === 1 ? 'Early out' : 'Early outs',
      caption: totals.earlyOutDays > 0 ? `${durationText(totals.earlyOutMinutes)} left early` : 'Full days every time',
    },
    production
      ? {
          key: 'holidays',
          icon: 'flag-outline',
          tint: C.statusLeave,
          bg: C.badgeLeaveBg,
          value: countText(totals.holidays),
          label: 'Holidays',
          caption: 'Company holidays in this period',
        }
      : {
          key: 'timeOff',
          icon: 'umbrella-outline',
          tint: C.statusLeave,
          bg: C.badgeLeaveBg,
          value: countText(totals.leave),
          label: totals.leave === 1 ? 'Leave day' : 'Leave days',
          caption: `${countText(totals.permissions)} permission${totals.permissions === 1 ? '' : 's'} · ${countText(totals.casualLeave)} casual leave`,
        },
    {
      key: 'onDuty',
      icon: 'briefcase-outline',
      tint: C.tertiary,
      bg: C.tertiaryContainer,
      value: countText(totals.onDutyDays),
      label: totals.onDutyDays === 1 ? 'On-Duty day' : 'On-Duty days',
      caption: totals.onDutyDays > 0 ? 'Worked away from the branch' : 'None in this period',
    },
    {
      key: 'ot',
      icon: 'timer-plus-outline',
      tint: colors.kept,
      bg: C.badgeGreenBg,
      value: durationText(totals.overtimeMinutes),
      label: 'Overtime',
      caption: 'Worked past your shift end',
    },
  ];

  return (
    <View style={styles.wrap}>
      {header}

      {/* ─── The score ─── */}
      <View style={styles.card}>
        <View style={styles.heroRow}>
          <ScoreRing score={score.score} color={toneColor[score.tone]} progress={progress} size={116} stroke={11}>
            {score.score == null ? (
              <Text style={styles.scoreNone}>—</Text>
            ) : (
              <>
                <CountUp value={score.score} run={revealed} reduce={reduce} style={styles.scoreNum} />
                <Text style={styles.scoreOf}>of 100</Text>
              </>
            )}
          </ScoreRing>
          <View style={{ flex: 1 }}>
            <Text style={styles.overline}>ATTENDANCE HEALTH</Text>
            <View style={[styles.gradePill, { backgroundColor: pill.bg }]}>
              <Text style={[styles.gradeText, { color: pill.fg }]}>{score.grade}</Text>
            </View>
            <Text style={styles.summary}>{score.summary}</Text>
            <Text style={styles.periodCaption}>{periodCaption}</Text>
          </View>
        </View>
        <View style={styles.parts}>
          {[
            { key: 'a', label: 'Attendance', value: score.parts.attendance, color: colors.attendance },
            { key: 'p', label: 'On time', value: score.parts.punctuality, color: colors.onTime },
            { key: 'f', label: 'Full days', value: score.parts.fullDays, color: colors.kept },
          ].map((p) => (
            <View key={p.key} style={styles.partRow} accessible accessibilityLabel={`${p.label} ${pctText(p.value)}`}>
              <Text style={styles.partLabel}>{p.label}</Text>
              <View style={{ flex: 1 }}>
                <Meter value={p.value} color={p.color} progress={progress} />
              </View>
              <Text style={styles.partValue}>{pctText(p.value)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ─── Highlights ─── */}
      {lines.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Highlights</Text>
          {lines.map((l) => (
            <HighlightRow key={l.key} line={l} />
          ))}
        </View>
      )}

      {/* ─── Trend ─── */}
      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardTitle}>Attendance trend</Text>
          <Text style={styles.cardHint}>Last {months} months</Text>
        </View>
        <TrendChart bars={trend} progress={progress} />
      </View>

      {/* ─── Tiles ─── */}
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View key={t.key} style={styles.tile} accessible accessibilityLabel={`${t.label}: ${t.value}. ${t.caption}`}>
            <View style={[styles.tileIcon, { backgroundColor: t.bg }]}>
              <MaterialCommunityIcons name={t.icon as any} size={16} color={t.tint} />
            </View>
            <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
              {t.value}
            </Text>
            <Text style={styles.tileLabel} numberOfLines={1}>{t.label}</Text>
            <Text style={styles.tileCaption} numberOfLines={2}>{t.caption}</Text>
          </View>
        ))}
      </View>

      {/* ─── Pay: earned vs lost to attendance ─── */}
      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Pay: earned vs lost</Text>
            <Text style={styles.cardHint}>From your salary slips</Text>
          </View>
          <Pressable
            onPress={toggleShown}
            hitSlop={10}
            style={styles.eyeBtn}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide salary amounts' : 'Show salary amounts'}
          >
            <MaterialCommunityIcons name={shown ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textSecondary} />
          </Pressable>
        </View>
        {pay.any ? (
          <>
            <View style={styles.payTotals}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payTotalLabel}>Earned</Text>
                <Text style={styles.payTotal} numberOfLines={1}>{pay.totalEarnedText}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.payTotalLabel}>Lost to attendance</Text>
                <Text style={styles.payTotal} numberOfLines={1}>{pay.totalLostText}</Text>
              </View>
            </View>
            {pay.keptPct != null && (
              <Text style={styles.keptLine}>
                You kept <Text style={styles.keptStrong}>{pay.keptPct}%</Text> of your fixed pay over these months.
              </Text>
            )}
            <PayBars chart={pay} progress={progress} hidden={hidden} />
          </>
        ) : (
          <Text style={styles.noPay}>No salary slips in the last {months} months yet.</Text>
        )}
      </View>
    </View>
  );
}

function HighlightRow({ line }: { line: InsightLine }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = {
    good: { bg: C.badgeGreenBg, fg: C.statusGreen },
    warn: { bg: C.badgeYellowBg, fg: C.statusYellow },
    bad: { bg: C.badgeRedBg, fg: C.statusRed },
    info: { bg: C.badgeBlueBg, fg: C.badgeBlueText },
  }[line.tone];
  return (
    <View style={styles.lineRow}>
      <View style={[styles.lineIcon, { backgroundColor: tone.bg }]}>
        <MaterialCommunityIcons name={line.icon as any} size={15} color={tone.fg} />
      </View>
      <Text style={styles.lineText}>{line.text}</Text>
    </View>
  );
}

const shadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
});

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    wrap: { marginBottom: 8 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    sectionTitle: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 17 },
    sectionHint: { color: C.textMuted, fontSize: 11, fontWeight: '600', marginTop: 1 },
    segment: {
      flexDirection: 'row',
      backgroundColor: C.bgSurfaceHigh,
      borderRadius: BorderRadius.full,
      padding: 3,
    },
    segmentItem: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.full },
    segmentItemOn: { backgroundColor: C.bgCard, ...shadow },
    segmentText: { color: C.textMuted, fontSize: 11.5, fontFamily: FontFamily.bodySemibold },
    segmentTextOn: { color: C.textPrimary },

    card: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 12,
      ...shadow,
    },
    cardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
    cardTitle: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
    cardHint: { color: C.textMuted, fontSize: 11, marginTop: 1 },

    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    scoreNum: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 32, letterSpacing: -0.8, ...TabularNums },
    scoreOf: { color: C.textMuted, fontSize: 10.5, fontWeight: '700', marginTop: -2 },
    scoreNone: { color: C.textMuted, fontFamily: FontFamily.displayBold, fontSize: 28 },
    overline: { color: C.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
    gradePill: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
    gradeText: { fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
    summary: { color: C.textSecondary, fontSize: 12.5, lineHeight: 17, marginTop: 8 },
    periodCaption: { color: C.textMuted, fontSize: 11, marginTop: 6 },
    parts: { marginTop: 16, gap: 10 },
    partRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    partLabel: { width: 76, color: C.textSecondary, fontSize: 12, fontFamily: FontFamily.bodySemibold },
    partValue: { width: 40, textAlign: 'right', color: C.textPrimary, fontSize: 12, fontWeight: '700', ...TabularNums },

    lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    lineIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    lineText: { flex: 1, color: C.textPrimary, fontSize: 13, lineHeight: 18 },

    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    tile: {
      width: '48.4%',
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: 12,
      minHeight: 116,
      ...shadow,
    },
    tileIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    tileValue: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 21, letterSpacing: -0.3, ...TabularNums },
    tileLabel: { color: C.textSecondary, fontFamily: FontFamily.bodySemibold, fontSize: 12, marginTop: 1 },
    tileCaption: { color: C.textMuted, fontSize: 11, marginTop: 3, lineHeight: 15 },

    eyeBtn: {
      width: 34, height: 34, borderRadius: BorderRadius.full,
      backgroundColor: C.bgSurfaceLow,
      alignItems: 'center', justifyContent: 'center',
    },
    payTotals: { flexDirection: 'row', gap: 12, marginBottom: 6 },
    payTotalLabel: { color: C.textMuted, fontSize: 11, fontWeight: '600' },
    payTotal: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18, marginTop: 2, ...TabularNums },
    keptLine: { color: C.textSecondary, fontSize: 12, marginBottom: 12 },
    keptStrong: { color: C.textPrimary, fontFamily: FontFamily.bodySemibold },
    noPay: { color: C.textMuted, fontSize: 12.5, paddingVertical: 8 },

    stateCard: { alignItems: 'center', paddingVertical: 22 },
    stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    stateTitle: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15, textAlign: 'center' },
    stateText: { color: C.textMuted, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 4, paddingHorizontal: 8 },
    retryBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14,
      backgroundColor: C.primary, borderRadius: BorderRadius.full, paddingHorizontal: 18, paddingVertical: 9,
    },
    retryText: { color: C.onPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  });
