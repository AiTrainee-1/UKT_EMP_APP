import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSalaryInsights, useSalarySlips, type SalaryInsights } from '../../src/hooks/useSalarySlips';
import { SalarySlipCard } from '../../src/components/SalarySlipCard';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard, Skeleton } from '../../src/components/ui/Skeleton';
import { Reveal } from '../../src/components/Reveal';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import {
  comparisonBars,
  formatInr,
  formatInrShort,
  latestPeriod,
  lossSentence,
  periodTitle,
  sortSlipsNewestFirst,
} from '../../src/lib/salaryInsights';

/** How many periods the chart shows before "Show all" (weekly pay has ~52 a year). */
const CHART_ROWS = 6;

export default function SalarySlipsScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const slips = useSalarySlips();
  const [year, setYear] = useState<number | null>(null);
  const insights = useSalaryInsights(year);

  const sorted = useMemo(() => sortSlipsNewestFirst(slips.data ?? []), [slips.data]);
  const lostBySlip = useMemo(() => {
    const m = new Map<number, number | null>();
    for (const p of insights.data?.periods ?? []) m.set(p.slipId, p.attendanceLoss);
    return m;
  }, [insights.data]);

  const refreshing = slips.isRefetching || insights.isRefetching;
  const onRefresh = () => {
    void slips.refetch();
    void insights.refetch();
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backBtn}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} accessibilityRole="header">Salary Slips</Text>
        <Text style={styles.headerSubtitle}>What you were given, what you earned, what you lost</Text>
      </View>
    </View>
  );

  if (slips.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        <View style={styles.pad}>
          <Skeleton height={150} borderRadius={BorderRadius.xl} style={{ marginBottom: 12 }} />
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (slips.isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        <View style={styles.errorWrap}>
          <EmptyState
            icon="cloud-alert-outline"
            title="Could not load your salary slips"
            subtitle="This is a connection problem, not a missing salary. Check your connection and try again."
          />
          <TouchableOpacity style={styles.retryBtn} onPress={() => slips.refetch()} accessibilityRole="button" accessibilityLabel="Try again">
            <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {header}
      <FlatList
        data={sorted}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.pad, !sorted.length && styles.grow]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        ListHeaderComponent={
          sorted.length ? (
            <ComparisonSection
              data={insights.data}
              loading={insights.isLoading}
              failed={insights.isError && !insights.data}
              onRetry={() => insights.refetch()}
              onYear={setYear}
            />
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState
            icon="cash-multiple"
            title="No salary slips yet"
            subtitle="Your salary slips will appear here once HR generates payroll"
          />
        }
        renderItem={({ item, index }) => (
          <Reveal index={index}>
            <SalarySlipCard
              slip={item}
              lost={lostBySlip.has(item.id) ? lostBySlip.get(item.id) : undefined}
              onPress={() => router.push(`/salary/${item.id}` as any)}
            />
          </Reveal>
        )}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Allocated vs earned
// ─────────────────────────────────────────────────────────────────────────────

function ComparisonSection({
  data,
  loading,
  failed,
  onRetry,
  onYear,
}: {
  data: SalaryInsights | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onYear: (y: number) => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <View style={{ marginBottom: 16 }}>
        <Skeleton height={150} borderRadius={BorderRadius.xl} style={{ marginBottom: 12 }} />
        <Skeleton height={180} borderRadius={BorderRadius.xl} />
      </View>
    );
  }
  if (failed || !data) {
    return (
      <View style={{ marginBottom: 8 }}>
        <View style={styles.inlineError}>
          <MaterialCommunityIcons name="chart-bar" size={18} color={Colors.statusRed} />
          <Text style={styles.inlineErrorText}>
            The salary comparison could not be loaded. Your slips below are fine.
          </Text>
          <TouchableOpacity onPress={onRetry} style={styles.inlineRetry} accessibilityRole="button" accessibilityLabel="Try loading the comparison again">
            <Text style={styles.inlineRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.listTitle} accessibilityRole="header">All salary slips</Text>
      </View>
    );
  }

  const s = data.summary;
  const production = data.employmentType === 'production';
  const latest = latestPeriod(data.periods);
  const bars = comparisonBars(data.periods).reverse(); // newest first
  const shown = showAll ? bars : bars.slice(0, CHART_ROWS);
  const latestLost = (latest?.attendanceLoss ?? 0) > 0;

  return (
    <View style={{ marginBottom: 8 }}>
      {data.years.length > 1 && (
        <View style={styles.yearRow} accessibilityRole="tablist">
          {data.years.map((y) => {
            const active = y === data.year;
            return (
              <TouchableOpacity
                key={y}
                onPress={() => onYear(y)}
                style={[styles.yearChip, active && styles.yearChipActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Year ${y}`}
              >
                <Text style={[styles.yearText, active && styles.yearTextActive]}>{y}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {data.periods.length === 0 ? (
        <View style={styles.noteBox}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
          <Text style={styles.noteText}>No salary was generated for you in {data.year}.</Text>
        </View>
      ) : (
        <>
          <Reveal index={0}>
            <LinearGradient colors={Colors.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={styles.heroDeco} />
              <Text style={styles.heroLabel}>
                {data.year} · {s.periods} {s.periods === 1 ? 'PAY PERIOD' : 'PAY PERIODS'}
              </Text>
              <View style={styles.heroGrid}>
                {!production && <HeroFigure label="Allocated" value={formatInr(s.allocated)} />}
                <HeroFigure label={production ? 'Earned for shifts' : 'Earned'} value={formatInr(s.earnedGross)} />
                <HeroFigure label="Payable" value={formatInr(s.netPayable)} />
              </View>
              {s.attendanceLoss != null && (
                <View
                  style={styles.heroLoss}
                  accessible
                  accessibilityLabel={`Lost to attendance in ${data.year}: ${formatInr(s.attendanceLoss)}`}
                >
                  <MaterialCommunityIcons name="trending-down" size={16} color="#FECACA" />
                  <Text style={styles.heroLossText}>
                    Lost to attendance: <Text style={[styles.heroLossValue, TabularNums]}>{formatInr(s.attendanceLoss)}</Text>
                  </Text>
                </View>
              )}
              {production && !!data.notes[0] && <Text style={styles.heroNote}>{data.notes[0]}</Text>}
            </LinearGradient>
          </Reveal>

          {!!latest && (
            <Reveal index={1}>
              <TouchableOpacity
                style={styles.latestCard}
                onPress={() => router.push(`/salary/${latest.slipId}` as any)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${lossSentence(latest)} Open the slip.`}
              >
                <View style={[styles.latestIcon, { backgroundColor: latestLost ? Colors.badgeRedBg : Colors.badgeGreenBg }]}>
                  <MaterialCommunityIcons
                    name={latestLost ? 'alert-circle-outline' : 'check-decagram-outline'}
                    size={20}
                    color={latestLost ? Colors.statusRed : Colors.statusGreen}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.latestTitle}>Latest: {periodTitle(latest)}</Text>
                  <Text style={styles.latestText}>{lossSentence(latest)}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </Reveal>
          )}

          <Reveal index={2}>
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle} accessibilityRole="header">
                {production ? 'Earned vs payable' : 'Allocated vs earned'}
              </Text>
              <Text style={styles.chartSub}>Tap a period to open its slip</Text>
              <View style={styles.legend}>
                {!production && <LegendDot color={Colors.bgSurfaceHigh} label="Allocated" />}
                <LegendDot color={Colors.primary} label={production ? 'Earned' : 'Earned for attendance'} />
                <LegendDot color={Colors.statusGreen} label="Payable" bar />
              </View>
              {shown.map((b, i) => (
                <TouchableOpacity
                  key={b.slipId}
                  style={styles.barRow}
                  onPress={() => router.push(`/salary/${b.slipId}` as any)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.label}: ${b.allocated != null ? `allocated ${formatInr(b.allocated)}, ` : ''}earned ${formatInr(b.earned)}, payable ${formatInr(b.net)}${b.lost ? `, lost ${formatInr(b.lost)}` : ''}`}
                >
                  <Text style={styles.barLabel} numberOfLines={1}>{b.label}</Text>
                  <View style={styles.barArea}>
                    <View style={[styles.barTrack, { width: `${b.allocatedRatio * 100}%` }]} />
                    <MotiView
                      from={{ width: '0%' }}
                      animate={{ width: `${b.earnedRatio * 100}%` }}
                      transition={{ type: 'timing', duration: 500, delay: Math.min(i, 8) * 40 }}
                      style={styles.barFill}
                    />
                    <View style={[styles.barNet, { left: `${b.netRatio * 100}%` }]} />
                  </View>
                  <View style={styles.barRight}>
                    <Text style={[styles.barEarned, TabularNums]}>{formatInrShort(b.net)}</Text>
                    {b.lost ? (
                      <Text style={[styles.barLost, TabularNums]}>-{formatInrShort(b.lost)}</Text>
                    ) : (
                      <Text style={styles.barOk}>{b.lost === 0 ? 'no loss' : ' '}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
              {bars.length > CHART_ROWS && (
                <TouchableOpacity onPress={() => setShowAll((v) => !v)} style={styles.showAll} accessibilityRole="button">
                  <Text style={styles.showAllText}>{showAll ? 'Show fewer' : `Show all ${bars.length} periods`}</Text>
                  <MaterialCommunityIcons name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          </Reveal>

          <Reveal index={3}>
            <View style={styles.whyCard}>
              <Text style={styles.chartTitle} accessibilityRole="header">Where the money went in {data.year}</Text>
              {!production && <WhyRow icon="calendar-remove-outline" label="Days not paid" value={s.absentLoss} tone="loss" />}
              <WhyRow icon="clock-alert-outline" label="Late deductions" value={s.lateDeduction} tone="loss" />
              {!production && (
                <WhyRow icon="account-clock-outline" label="Permission deductions" value={s.permissionDeduction} tone="loss" />
              )}
              <WhyRow icon="shield-account-outline" label="PF, ESI and TDS" value={s.statutory} tone="neutral" />
              <WhyRow icon="hand-coin-outline" label="Advance / loan recovery" value={s.advance} tone="neutral" />
              {s.otPay > 0 && <WhyRow icon="cash-plus" label="Overtime pay added" value={s.otPay} tone="gain" />}
            </View>
          </Reveal>
        </>
      )}
      <Text style={styles.listTitle} accessibilityRole="header">All salary slips</Text>
    </View>
  );
}

function HeroFigure({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.heroFigure} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.heroFigureLabel}>{label}</Text>
      <Text style={[styles.heroFigureValue, TabularNums]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label, bar }: { color: string; label: string; bar?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.legendItem}>
      <View style={[bar ? styles.legendBar : styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function WhyRow({ icon, label, value, tone }: { icon: string; label: string; value: number | null; tone: 'loss' | 'gain' | 'neutral' }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const color = tone === 'loss' ? Colors.statusRed : tone === 'gain' ? Colors.statusGreen : Colors.textPrimary;
  const sign = value ? (tone === 'gain' ? '+ ' : '- ') : '';
  const text = value == null ? 'Not recorded' : `${sign}${formatInr(value)}`;
  return (
    <View style={styles.whyRow} accessible accessibilityLabel={`${label}: ${text}`}>
      <MaterialCommunityIcons name={icon as any} size={16} color={Colors.textMuted} />
      <Text style={styles.whyLabel}>{label}</Text>
      <Text style={[styles.whyValue, TabularNums, { color: value ? color : Colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
}) as object;

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },
  pad: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  grow: { flexGrow: 1 },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 24 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 20, paddingVertical: 12, minHeight: 44,
  },
  retryText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  inlineError: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.badgeRedBg, borderRadius: BorderRadius.lg,
    padding: 12, marginBottom: 14,
  },
  inlineErrorText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },
  inlineRetry: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgCard, minHeight: 36, justifyContent: 'center',
  },
  inlineRetryText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },

  yearRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  yearChip: {
    paddingHorizontal: 14, paddingVertical: 7, minHeight: 36, justifyContent: 'center',
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  yearChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  yearText: { color: Colors.textSecondary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },
  yearTextActive: { color: '#fff' },

  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.lg,
    padding: 12, marginBottom: 14,
  },
  noteText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },

  hero: { borderRadius: BorderRadius.xl, padding: 18, marginBottom: 12, overflow: 'hidden', ...cardShadow },
  heroDeco: {
    position: 'absolute', top: -40, right: -30, width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  heroGrid: { flexDirection: 'row', gap: 10, marginTop: 10 },
  heroFigure: { flex: 1, minWidth: 0 },
  heroFigureLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
  heroFigureValue: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 17, marginTop: 2 },
  heroLoss: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: 'rgba(127,29,29,0.45)', borderRadius: BorderRadius.full,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 14,
  },
  heroLossText: { color: '#FEE2E2', fontSize: 12.5, fontWeight: '600' },
  heroLossValue: { color: '#fff', fontFamily: FontFamily.displayBold },
  heroNote: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, lineHeight: 16, marginTop: 10 },

  latestCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12,
    ...cardShadow,
  },
  latestIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  latestTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  latestText: { color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 2 },

  chartCard: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12,
    ...cardShadow,
  },
  chartTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14.5 },
  chartSub: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendBar: { width: 3, height: 12, borderRadius: 1 },
  legendText: { color: Colors.textSecondary, fontSize: 11 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, minHeight: 44 },
  barLabel: { width: 62, color: Colors.textSecondary, fontSize: 11.5, fontWeight: '600' },
  barArea: { flex: 1, height: 16, justifyContent: 'center' },
  barTrack: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5, backgroundColor: Colors.bgSurfaceHigh },
  barFill: { position: 'absolute', left: 0, top: 3, bottom: 3, borderRadius: 4, backgroundColor: Colors.primary },
  barNet: {
    position: 'absolute', top: -3, bottom: -3, width: 3, marginLeft: -1.5, borderRadius: 2,
    backgroundColor: Colors.statusGreen,
  },
  barRight: { width: 62, alignItems: 'flex-end' },
  barEarned: { color: Colors.textPrimary, fontSize: 12, fontWeight: '700' },
  barLost: { color: Colors.statusRed, fontSize: 10.5, fontWeight: '700' },
  barOk: { color: Colors.statusGreen, fontSize: 10.5, fontWeight: '600' },
  showAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 8, minHeight: 36 },
  showAllText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },

  whyCard: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12, gap: 2,
    ...cardShadow,
  },
  whyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant,
  },
  whyLabel: { flex: 1, color: Colors.textPrimary, fontSize: 13 },
  whyValue: { fontSize: 13, fontWeight: '700' },

  listTitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 6, marginBottom: 10 },
});
