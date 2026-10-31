import React, { useEffect, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MotiView } from 'moti';

import { useAuth } from '../../src/hooks/useAuth';
import { useCasualLeaves, useCLEligibility } from '../../src/hooks/useCasualLeave';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { workflowOff } from '../../src/lib/approval';
import {
  asPortion,
  asStatus,
  daysText,
  monthCardState,
  monthKeyOf,
  yearMonths,
  yearRange,
  yearTotals,
  type CLRow,
} from '../../src/lib/casualLeave';
import { defaultView, rowsForView, viewCounts, type RequestView, type ViewOptions } from '../../src/lib/requestViews';
import { RequestViewSwitcher } from '../../src/components/requests/RequestViewSwitcher';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';
import { ClApplySheet } from '../../src/components/casualLeave/ClApplySheet';
import { ClRequestCard } from '../../src/components/casualLeave/ClRequestCard';
import { ClLegend, ClMonthCalendar, ClYearGrid } from '../../src/components/casualLeave/ClYearView';
import { TONE_ICON, toneColors } from '../../src/components/casualLeave/ClEntryCard';
import { LoadError } from '../../src/components/casualLeave/LoadError';
import { Reveal } from '../../src/components/Reveal';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Skeleton, SkeletonCard } from '../../src/components/ui/Skeleton';
import { SuccessOverlay } from '../../src/components/ui/SuccessOverlay';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import type { CasualLeaveRequest } from '../../src/hooks/useCasualLeave';

const VIEW_EMPTY: Record<RequestView, { title: string; subtitle: string }> = {
  waiting: { title: 'Nothing waiting', subtitle: 'Casual Leave you ask for waits here until it is approved or rejected.' },
  month: { title: 'No Casual Leave this month', subtitle: 'Approved Casual Leave for days of this month shows here.' },
  approved: { title: 'Nothing approved yet', subtitle: 'Approved Casual Leave of this year shows here.' },
  rejected: { title: 'Nothing rejected', subtitle: 'Rejected Casual Leave of this year shows here.' },
};

export default function CasualLeaveScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  const thisYear = new Date().getFullYear();

  // Every request the employee ever made (a few a year): one call, so switching years is instant.
  const list = useCasualLeaves(employeeId);
  const elig = useCLEligibility(employeeId);
  const { data: approvalSummary } = useApprovalSummary();
  const off = workflowOff(approvalSummary?.casualLeave);

  const [year, setYear] = useState(thisYear);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(new Date().getMonth() + 1);
  const [view, setView] = useState<RequestView | null>(null);
  const [showApply, setShowApply] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const all = list.data ?? [];
  const rows: CLRow[] = useMemo(
    () => all.map((r) => ({ id: r.id, date: r.date, portion: asPortion(r.portion), status: asStatus(r.status) })),
    [all],
  );
  const range = yearRange(rows, thisYear);
  const months = useMemo(() => yearMonths(rows, year), [rows, year]);
  const totals = useMemo(() => yearTotals(rows, year), [rows, year]);
  const yearRequests = useMemo(() => all.filter((r) => r.date.startsWith(`${year}-`)), [all, year]);

  const viewOpts: ViewOptions<CasualLeaveRequest> = {
    statusOf: (r) => r.status,
    month: { dateOf: (r) => r.date, kind: 'taken' },
  };
  const counts = viewCounts(yearRequests, viewOpts);
  const activeView = view ?? defaultView(counts);
  const shown = rowsForView(yearRequests, activeView, viewOpts).sort(
    (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
  );

  // Switching years opens the month that matters: this month for this year, else the first month with Casual Leave.
  useEffect(() => {
    if (year === thisYear) setSelectedMonth(new Date().getMonth() + 1);
    else setSelectedMonth(months.find((m) => m.shape !== 'none')?.month ?? null);
    // only on a year change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const eligMonths = elig.data?.months;
  const thisMonth = eligMonths?.find((m) => m.month === monthKeyOf(new Date())) ?? eligMonths?.[eligMonths.length - 1];
  const state = elig.data ? monthCardState(thisMonth, { eligible: elig.data.eligible, reason: elig.data.reason }) : null;
  const canApply = !!state && (state.tone === 'open' || state.tone === 'half' || (elig.data?.months ?? []).some((m) => m.eligible));
  const tone = toneColors(state?.tone ?? 'closed', Colors);
  const refreshing = list.isRefetching || elig.isRefetching;
  const onRefresh = () => {
    void list.refetch();
    void elig.refetch();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75} accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Casual Leave</Text>
          <Text style={styles.headerSubtitle}>One paid day a month, or two half-days</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* This month */}
        {elig.isError && !elig.data ? (
          <LoadError title="Could not check this month's Casual Leave" onRetry={() => void elig.refetch()} busy={elig.isFetching} />
        ) : (
          <Reveal>
            <View style={styles.hero} testID="cl-month-card">
              {!state ? (
                <View style={{ gap: 10 }}>
                  <Skeleton width="40%" height={14} />
                  <Skeleton width="70%" height={22} />
                  <Skeleton width="90%" height={12} />
                </View>
              ) : (
                <>
                  <Text style={styles.heroKicker}>THIS MONTH</Text>
                  <View style={styles.heroRow}>
                    <MotiView
                      from={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', damping: 12, stiffness: 160 }}
                      style={[styles.heroIcon, { backgroundColor: tone.bg }]}
                    >
                      <MaterialCommunityIcons name={TONE_ICON[state.tone] as any} size={24} color={tone.fg} />
                    </MotiView>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroTitle}>{state.title}</Text>
                      <Text style={styles.heroDetail}>{state.detail}</Text>
                    </View>
                  </View>
                  {elig.data?.yearlyEntitlement != null && (
                    <Text style={[styles.heroYear, TabularNums]}>
                      {daysText(Number(elig.data.usedThisYear ?? 0))} of {elig.data.yearlyEntitlement} days taken in {elig.data.year ?? thisYear}
                    </Text>
                  )}
                  <WorkflowOffNote workflow={approvalSummary?.casualLeave} />
                  <TouchableOpacity
                    style={[styles.applyBtn, (!canApply || off) && styles.applyBtnOff]}
                    disabled={!canApply || off}
                    onPress={() => setShowApply(true)}
                    activeOpacity={0.85}
                    testID="cl-apply"
                  >
                    <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                    <Text style={styles.applyText}>Apply for Casual Leave</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Reveal>
        )}

        {/* The year */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Your year</Text>
          <View style={styles.yearSwitch}>
            <TouchableOpacity
              onPress={() => setYear((y) => Math.max(range.min, y - 1))}
              disabled={year <= range.min}
              style={[styles.yearBtn, year <= range.min && { opacity: 0.35 }]}
              accessibilityLabel="Previous year"
              testID="cl-year-prev"
            >
              <MaterialCommunityIcons name="chevron-left" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.yearLabel, TabularNums]}>{year}</Text>
            <TouchableOpacity
              onPress={() => setYear((y) => Math.min(range.max, y + 1))}
              disabled={year >= range.max}
              style={[styles.yearBtn, year >= range.max && { opacity: 0.35 }]}
              accessibilityLabel="Next year"
              testID="cl-year-next"
            >
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {list.isError && !list.data ? (
          <LoadError title="Could not load your Casual Leave" onRetry={() => void list.refetch()} busy={list.isFetching} />
        ) : list.isLoading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={58} borderRadius={16} />
            <Skeleton height={220} borderRadius={16} />
          </View>
        ) : (
          <>
            <View style={styles.stats}>
              {[
                { label: 'Taken', value: daysText(totals.takenDays), color: Colors.primary },
                { label: 'Waiting', value: daysText(totals.waitingDays), color: Colors.statusYellow },
                { label: 'Months used', value: String(totals.monthsUsed), color: Colors.statusGreen },
                { label: 'Rejected', value: String(totals.rejected), color: Colors.statusRed },
              ].map((s, i) => (
                <Reveal key={s.label} index={i} style={styles.stat}>
                  <Text style={[styles.statValue, { color: s.color }, TabularNums]}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </Reveal>
              ))}
            </View>
            <ClYearGrid
              months={months}
              year={year}
              selected={selectedMonth}
              onSelect={(m) => setSelectedMonth((cur) => (cur === m ? null : m))}
            />
            <ClLegend />
            {selectedMonth !== null && <ClMonthCalendar year={year} month={selectedMonth} rows={rows} />}
          </>
        )}

        {/* Applications */}
        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Your applications in {year}</Text>
        <View style={styles.switcherWrap}>
          <RequestViewSwitcher
            value={activeView}
            counts={counts}
            onChange={setView}
            labels={{ month: 'Taken this month' }}
            testID="cl-views"
          />
        </View>
        {list.isError && !list.data ? (
          <LoadError title="Could not load your applications" onRetry={() => void list.refetch()} busy={list.isFetching} />
        ) : list.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : !shown.length ? (
          <EmptyState icon="calendar-star" title={VIEW_EMPTY[activeView].title} subtitle={VIEW_EMPTY[activeView].subtitle} />
        ) : (
          shown.map((r, i) => <ClRequestCard key={r.id} request={r} index={i} />)
        )}
      </ScrollView>

      <ClApplySheet
        visible={showApply}
        onClose={() => setShowApply(false)}
        employeeId={employeeId}
        months={elig.data?.months}
        shift={elig.data?.shift}
        workflow={approvalSummary?.casualLeave}
        onSubmitted={(msg) => {
          setShowApply(false);
          setView('waiting');
          setYear(thisYear);
          setSuccess(msg);
        }}
      />
      <SuccessOverlay visible={!!success} title="Request sent" message={success ?? ''} onDone={() => setSuccess(null)} />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bgLight },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.bgSurfaceLow,
    },
    headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
    headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },
    content: { padding: 16, paddingBottom: 40 },

    hero: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 16,
      gap: 12,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
        android: { elevation: 2 },
      }),
    },
    heroKicker: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    heroIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    heroTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 19 },
    heroDetail: { color: Colors.textSecondary, fontSize: 12.5, marginTop: 3, lineHeight: 18 },
    heroYear: { color: Colors.textMuted, fontSize: 12 },
    applyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: Colors.primary,
      borderRadius: BorderRadius.full,
      paddingVertical: 12,
    },
    applyBtnOff: { opacity: 0.45 },
    applyText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },

    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
    sectionTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 16, marginBottom: 10 },
    yearSwitch: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.border,
      marginBottom: 10,
    },
    yearBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    yearLabel: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 14, minWidth: 40, textAlign: 'center' },

    stats: {
      flexDirection: 'row',
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingVertical: 12,
      marginBottom: 10,
    },
    stat: { flex: 1, alignItems: 'center', gap: 2 },
    statValue: { fontFamily: FontFamily.displayBold, fontSize: 15 },
    statLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '600' },

    switcherWrap: { marginHorizontal: -16, marginBottom: 8 },
  });
