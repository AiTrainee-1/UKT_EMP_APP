import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useSalarySlip,
  useSalaryBreakdown,
  downloadAndShareSalarySlip,
  type SalaryPeriod,
  type SalarySlip,
} from '../../src/hooks/useSalarySlips';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Skeleton, SkeletonCard } from '../../src/components/ui/Skeleton';
import { Reveal } from '../../src/components/Reveal';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import {
  formatCount,
  formatInr,
  periodTitle,
  slipCycleLabel,
  slipPeriodLabel,
  waterfallRows,
  type WaterfallRow,
} from '../../src/lib/salaryInsights';

function Row({ label, sub, value, highlight, tone }: { label: string; sub?: string; value: string; highlight?: boolean; tone?: 'green' | 'red' }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}${sub ? `, ${sub}` : ''}: ${value}`}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <Text style={[
        styles.rowValue, TabularNums,
        highlight && styles.rowHighlight,
        tone === 'green' && { color: Colors.statusGreen },
        tone === 'red' && { color: Colors.statusRed },
      ]}>{value}</Text>
    </View>
  );
}

export default function SalarySlipDetail() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { id } = useLocalSearchParams<{ id: string }>();
  const slipId = Number(id);
  const validId = Number.isInteger(slipId) && slipId > 0;
  const slipQ = useSalarySlip(validId ? slipId : null);
  const breakdownQ = useSalaryBreakdown(validId ? slipId : null);
  const slip = slipQ.data;
  const breakdown = breakdownQ.data;
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!slip) return;
    setDownloading(true);
    try {
      await downloadAndShareSalarySlip(slip);
    } catch {
      Alert.alert('Download failed', 'Could not generate the PDF right now. Please try again later.');
    } finally {
      setDownloading(false);
    }
  };

  const subtitle = breakdown
    ? periodTitle(breakdown)
    : slip
      ? [slipPeriodLabel(slip), slipCycleLabel(slip)].filter(Boolean).join(' · ')
      : '';

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
        <Text style={styles.headerTitle} accessibilityRole="header">Salary Breakdown</Text>
        {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  );

  if (!validId || (slipQ.isError && !slip)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        <View style={styles.errorWrap}>
          <EmptyState
            icon="file-alert-outline"
            title={validId ? 'Could not load this salary slip' : 'Salary slip not found'}
            subtitle={
              validId
                ? 'Check your connection and try again. If it keeps failing, please contact HR.'
                : 'Go back to your salary slips and open one from the list.'
            }
          />
          {validId && (
            <TouchableOpacity style={styles.retryBtn} onPress={() => { void slipQ.refetch(); void breakdownQ.refetch(); }} accessibilityRole="button" accessibilityLabel="Try again">
              <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (slipQ.isLoading || !slip) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        <View style={styles.pad}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  const production = breakdown ? breakdown.kind !== 'staff' : slip.employmentType === 'production';
  const payroll = breakdown?.payroll ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {header}
      <ScrollView
        contentContainerStyle={styles.pad}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={slipQ.isRefetching || breakdownQ.isRefetching}
            onRefresh={() => { void slipQ.refetch(); void breakdownQ.refetch(); }}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* ─── Net pay hero ─── */}
        <Reveal index={0}>
          <View style={styles.netCard}>
            <View style={styles.netTopRow}>
              <Text style={styles.netLabel}>FINAL PAYABLE SALARY</Text>
              <Badge label={slip.emailedAt ? 'Emailed' : 'Generated'} variant={slip.emailedAt ? 'paid' : 'generated'} />
            </View>
            <Text style={[styles.netValue, TabularNums]}>{formatInr(slip.netSalary)}</Text>
            {!!payroll && (
              <View style={styles.paidRow}>
                <MaterialCommunityIcons
                  name={payroll.status === 'paid' ? 'check-circle' : 'clock-outline'}
                  size={14}
                  color="rgba(255,255,255,0.9)"
                />
                <Text style={styles.paidText}>{payroll.statusLabel || (payroll.status === 'paid' ? 'Paid' : 'Not paid yet')}</Text>
              </View>
            )}
            {!!breakdown && breakdown.attendanceLoss != null && (
              <Text style={styles.netHint}>
                {breakdown.attendanceLoss > 0
                  ? `Attendance cost you ${formatInr(breakdown.attendanceLoss)} this period.`
                  : 'You lost nothing to attendance this period.'}
              </Text>
            )}
          </View>
        </Reveal>

        {/* ─── Identity ─── */}
        <View style={styles.idCard}>
          <View style={styles.idAvatar}>
            <Text style={styles.idAvatarText}>{slip.employeeName?.[0] ?? '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.idName}>{slip.employeeName}</Text>
              <Text style={styles.idCode}>{slip.employeeCode}</Text>
            </View>
            <Text style={styles.idMeta}>
              {[slip.departmentName, slip.slipNumber].filter(Boolean).join(' · ') || '—'}
            </Text>
          </View>
        </View>

        {/* ─── The waterfall ─── */}
        <Reveal index={1}>
          <WaterfallCard
            breakdown={breakdown}
            loading={breakdownQ.isLoading}
            failed={breakdownQ.isError && !breakdown}
            onRetry={() => breakdownQ.refetch()}
          />
        </Reveal>

        {/* ─── HR changes after the slip ─── */}
        {!!payroll && payroll.hrChanged && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIcon, { backgroundColor: Colors.badgeBlueBg }]}>
                <MaterialCommunityIcons name="account-edit-outline" size={14} color={Colors.badgeBlueText} />
              </View>
              <Text style={styles.sectionTitle}>Changed by HR after this slip</Text>
            </View>
            <Text style={styles.sectionNote}>
              HR updated your payroll after the slip was made. The slip above stays as it was printed; this is what the
              payroll shows now. Ask HR if anything is unclear.
            </Text>
            {!!payroll.bonus && <Row label="Bonus added by HR" value={`+ ${formatInr(payroll.bonus)}`} tone="green" />}
            {!!payroll.deductionChange && (
              <Row
                label="Change to deductions"
                value={`${payroll.deductionChange > 0 ? '- ' : '+ '}${formatInr(Math.abs(payroll.deductionChange))}`}
                tone={payroll.deductionChange > 0 ? 'red' : 'green'}
              />
            )}
            <Row label="Amount on the payroll now" value={formatInr(payroll.net)} highlight />
          </View>
        )}

        {/* ─── Attendance behind the pay ─── */}
        <Text style={styles.sectionLabel}>ATTENDANCE BEHIND THIS PAY</Text>
        <AttendanceGrid slip={slip} breakdown={breakdown} production={production} />

        {/* ─── Earnings components ─── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIcon, { backgroundColor: Colors.badgeGreenBg }]}>
              <MaterialCommunityIcons name="plus" size={14} color={Colors.statusGreen} />
            </View>
            <Text style={styles.sectionTitle}>Earnings on the slip</Text>
          </View>
          {production ? (
            <Row label="Pay for shifts worked" value={formatInr(slip.grossSalary ?? slip.basic)} />
          ) : (
            <>
              <Row label="Basic Salary" value={formatInr(slip.basic)} />
              <Row label="House Rent Allowance (HRA)" value={formatInr(slip.hra)} />
              <Row label="Other Allowances" value={formatInr(slip.allowances)} />
              <Row label="Salary earned" sub="Basic + HRA + Other Allowances" value={formatInr(slip.grossSalary ?? slip.basic + slip.hra + slip.allowances)} highlight />
            </>
          )}
          {!!slip.otAmount && <Row label="Overtime pay" value={`+ ${formatInr(slip.otAmount)}`} tone="green" />}
          {!!slip.incentives && <Row label="Incentives" value={`+ ${formatInr(slip.incentives)}`} tone="green" />}
          {!!slip.bonuses && <Row label="Bonus" value={`+ ${formatInr(slip.bonuses)}`} tone="green" />}
        </View>

        {/* ─── Deductions (from the slip itself when the breakdown could not be loaded) ─── */}
        {!breakdown && !breakdownQ.isLoading && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIcon, { backgroundColor: Colors.badgeRedBg }]}>
                <MaterialCommunityIcons name="minus" size={14} color={Colors.statusRed} />
              </View>
              <Text style={styles.sectionTitle}>Deductions & Recoveries</Text>
            </View>
            <Row label="Provident Fund (PF)" value={formatInr(slip.pfDeduction)} />
            <Row label="Employee State Insurance (ESI)" value={formatInr(slip.esiDeduction)} />
            {!!slip.tdsDeduction && <Row label="Income tax (TDS)" value={formatInr(slip.tdsDeduction)} />}
            <Row label="Advance Salary Recovery" value={formatInr(slip.advanceDeduction)} />
            <Row label="Other Deductions" sub="Late and permission deductions" value={formatInr(slip.otherDeductions)} />
            <Row label="Total Deductions" value={formatInr(slip.totalDeductions)} highlight />
          </View>
        )}

        <View style={styles.verifyBox}>
          <MaterialCommunityIcons name="shield-check-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.verifyText}>
            Every figure on this page is what the UKTextiles payroll stored for this slip. If something looks wrong,
            please contact HR.
          </Text>
        </View>

        {/* ─── Download / Share ─── */}
        <TouchableOpacity
          style={[styles.downloadBtn, downloading && styles.downloadBtnDisabled]}
          onPress={handleDownload}
          disabled={downloading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Download or share the salary slip PDF"
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialCommunityIcons name="download-outline" size={18} color="#fff" />
          )}
          <Text style={styles.downloadText}>{downloading ? 'Preparing PDF…' : 'Download / Share PDF'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  From the allocated salary to the final payable salary
// ─────────────────────────────────────────────────────────────────────────────

function WaterfallCard({
  breakdown,
  loading,
  failed,
  onRetry,
}: {
  breakdown: SalaryPeriod | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (loading) {
    return (
      <View style={styles.section}>
        <Skeleton height={18} width="60%" style={{ marginBottom: 14 }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={34} style={{ marginBottom: 10 }} />
        ))}
      </View>
    );
  }
  if (failed || !breakdown) {
    return (
      <View style={styles.inlineError}>
        <MaterialCommunityIcons name="chart-waterfall" size={18} color={Colors.statusRed} />
        <Text style={styles.inlineErrorText}>The step-by-step breakdown could not be loaded. The slip below is complete.</Text>
        <TouchableOpacity onPress={onRetry} style={styles.inlineRetry} accessibilityRole="button" accessibilityLabel="Try loading the breakdown again">
          <Text style={styles.inlineRetryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const rows = waterfallRows(breakdown.steps);
  const color = (r: WaterfallRow) =>
    r.tone === 'loss' ? Colors.statusRed : r.tone === 'gain' ? Colors.statusGreen : r.tone === 'result' ? Colors.primary : Colors.textMuted;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionIcon, { backgroundColor: Colors.primaryFixed }]}>
          <MaterialCommunityIcons name="chart-waterfall" size={14} color={Colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>How your pay was worked out</Text>
      </View>
      {rows.map((r, i) => {
        const strong = r.op === 'start' || r.op === 'subtotal' || r.op === 'total';
        return (
          <View
            key={`${r.key}-${i}`}
            style={[styles.wfRow, r.op === 'total' && styles.wfTotal]}
            accessible
            accessibilityLabel={`${r.label}: ${r.amountText}. ${r.note}`}
          >
            <View style={styles.wfTop}>
              <Text style={[styles.wfLabel, strong && styles.wfLabelStrong]}>{r.label}</Text>
              <Text style={[styles.wfAmount, TabularNums, { color: r.amount == null ? Colors.textMuted : r.op === 'minus' && !r.amount ? Colors.textMuted : color(r) }, strong && styles.wfAmountStrong]}>
                {r.amountText}
              </Text>
            </View>
            <View style={styles.wfTrack}>
              {r.to > r.from && (
                <MotiView
                  from={{ opacity: 0, scaleX: 0.6 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ type: 'timing', duration: 380, delay: Math.min(i, 10) * 45 }}
                  style={[
                    styles.wfBar,
                    { left: `${r.from * 100}%`, width: `${(r.to - r.from) * 100}%`, backgroundColor: color(r) },
                    r.tone === 'base' && { backgroundColor: Colors.bgSurfaceHighest },
                  ]}
                />
              )}
            </View>
            {!!r.note && <Text style={styles.wfNote}>{r.note}</Text>}
          </View>
        );
      })}
      {!breakdown.reconciles && (
        <View style={styles.warnBox}>
          <MaterialCommunityIcons name="alert-outline" size={15} color={Colors.badgeYellowText} />
          <Text style={styles.warnText}>
            These lines do not add up exactly to the net pay on this older slip. Please ask HR to explain the difference.
          </Text>
        </View>
      )}
    </View>
  );
}

function AttendanceGrid({ slip, breakdown, production }: { slip: SalarySlip; breakdown: SalaryPeriod | undefined; production: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const c = breakdown?.counts;
  const cells: { label: string; value: string; color?: string }[] = production
    ? [
        { label: 'Days in period', value: formatCount(c?.totalDays ?? slip.workingDays) },
        { label: 'Days worked', value: formatCount(c?.daysWorked ?? null) },
        { label: 'Absent', value: formatCount(c?.absentDays ?? slip.absentDays), color: Colors.statusRed },
        { label: 'Shifts earned', value: formatCount(c?.totalShifts ?? slip.presentDays), color: Colors.statusGreen },
        { label: 'Late days', value: formatCount(c?.lateInDays ?? slip.lateDays), color: Colors.statusYellow },
        { label: 'Rate / shift', value: c?.ratePerShift != null ? formatInr(c.ratePerShift) : '—' },
      ]
    : [
        { label: 'Working days', value: formatCount(c?.workingDays ?? slip.workingDays) },
        { label: 'Days paid', value: formatCount(c?.paidDays ?? null), color: Colors.statusGreen },
        { label: 'Absent', value: formatCount(c?.absentDays ?? slip.absentDays), color: Colors.statusRed },
        { label: 'Half days', value: formatCount(c?.halfDays ?? null) },
        { label: 'Late marks', value: formatCount(c?.lateMarks ?? slip.lateDays), color: Colors.statusYellow },
        { label: 'Permissions', value: formatCount(c?.permissionsApproved ?? null) },
        { label: 'Paid leave', value: formatCount(c?.paidLeaveDays ?? slip.paidLeaveDays ?? null) },
        { label: 'Unpaid leave', value: formatCount(c?.unpaidLeaveDays ?? slip.unpaidLeaveDays ?? null) },
      ];
  return (
    <View style={styles.statsGrid}>
      {cells.map(({ label, value, color }) => (
        <View key={label} style={styles.statCell} accessible accessibilityLabel={`${label}: ${value}`}>
          <Text style={[styles.statNum, TabularNums, color && value !== '—' ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <Text style={styles.statLabel}>{label}</Text>
        </View>
      ))}
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

  pad: { padding: Spacing.base, paddingBottom: 40, gap: 12 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 24 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 20, paddingVertical: 12, minHeight: 44,
  },
  retryText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  inlineError: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.badgeRedBg, borderRadius: BorderRadius.lg, padding: 12,
  },
  inlineErrorText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },
  inlineRetry: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgCard, minHeight: 36, justifyContent: 'center',
  },
  inlineRetryText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5 },

  netCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: 18,
    gap: 8,
    ...cardShadow,
  },
  netTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  netLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  netValue: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 30, letterSpacing: -0.4 },
  paidRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  paidText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  netHint: { color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 17 },

  idCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    ...cardShadow,
  },
  idAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  idAvatarText: { color: Colors.primary, fontFamily: FontFamily.displayBold, fontSize: 15 },
  idName: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14.5 },
  idCode: { color: Colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  idMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: {
    flexBasis: '22%',
    flexGrow: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 2,
    ...cardShadow,
  },
  statNum: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 17 },
  statLabel: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '700', textAlign: 'center' },

  section: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    ...cardShadow,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  sectionNote: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  rowLabel: { color: Colors.textPrimary, fontSize: 13 },
  rowSub: { color: Colors.textMuted, fontSize: 10.5, marginTop: 1 },
  rowValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  rowHighlight: { color: Colors.textPrimary, fontWeight: '800', fontSize: 14 },

  wfRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant, gap: 5 },
  wfTotal: { borderBottomWidth: 0, backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.md, paddingHorizontal: 10, marginTop: 6 },
  wfTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  wfLabel: { flex: 1, color: Colors.textPrimary, fontSize: 13 },
  wfLabelStrong: { fontFamily: FontFamily.bodySemibold },
  wfAmount: { fontSize: 13, fontWeight: '700' },
  wfAmountStrong: { fontSize: 14.5, fontWeight: '800' },
  wfTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.bgSurfaceLow, overflow: 'hidden' },
  wfBar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  wfNote: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16 },
  warnBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.badgeYellowBg, borderRadius: BorderRadius.md, padding: 10, marginTop: 10,
  },
  warnText: { flex: 1, color: Colors.badgeYellowText, fontSize: 12, lineHeight: 17 },

  verifyBox: {
    flexDirection: 'row', gap: 8,
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.lg,
    padding: 12,
  },
  verifyText: { flex: 1, color: Colors.textMuted, fontSize: 11, lineHeight: 16 },

  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    minHeight: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  downloadBtnDisabled: { opacity: 0.6 },
  downloadText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
});
