import React, { useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MotiView } from 'moti';

import { useAuth } from '../../src/hooks/useAuth';
import { useCasualLeaves, useCLEligibility, useCLHistory } from '../../src/hooks/useCasualLeave';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { workflowOff } from '../../src/lib/approval';
import {
  asPortion,
  asStatus,
  clCardState,
  daysText,
  isYearly,
  monthKeyOf,
  showBalance,
  usageRows,
  withHrProposals,
  yearMonths,
  yearRange,
  yearTotals,
  type CLRow,
} from '../../src/lib/casualLeave';
import { useReduceMotion } from '../../src/lib/motionPrefs';
import {
  defaultView,
  monthEmptyText,
  monthForRow,
  rowsForView,
  viewCounts,
  waitingInOtherMonths,
  type RequestView,
  type ViewOptions,
} from '../../src/lib/requestViews';
import { currentMonth, laterMonth, latestMonthOf } from '../../src/lib/monthSwitch';
import { useSelectedMonth } from '../../src/hooks/useSelectedMonth';
import { MonthSwitcher } from '../../src/components/MonthSwitcher';
import { RequestViewSwitcher } from '../../src/components/requests/RequestViewSwitcher';
import { WaitingElsewhereNote } from '../../src/components/requests/WaitingElsewhereNote';
import { REQUEST_FOCUS_ORDER, requestViewHasInItsMonth } from '../../src/lib/focusItem';
import { useFocusItem, useFocusParam } from '../../src/hooks/useFocusItem';
import { FocusFrame, FocusMissingNote } from '../../src/components/focus/FocusFrame';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';
import { ClApplySheet } from '../../src/components/casualLeave/ClApplySheet';
import { ClRequestCard } from '../../src/components/casualLeave/ClRequestCard';
import { ClLegend, ClMonthCalendar, ClYearGrid } from '../../src/components/casualLeave/ClYearView';
import { ClBalanceBar } from '../../src/components/casualLeave/ClBalanceBar';
import { ClBalanceHistory } from '../../src/components/casualLeave/ClBalanceHistory';
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

/** The day a Casual Leave is for: what the month switcher files it under. */
const clDay = (r: CasualLeaveRequest) => r.date;

export default function CasualLeaveScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  const thisYear = new Date().getFullYear();

  // Every request the employee ever made (a few a year): one call, so switching years is instant.
  const list = useCasualLeaves(employeeId);
  const elig = useCLEligibility(employeeId);
  const { data: approvalSummary } = useApprovalSummary();
  const off = workflowOff(approvalSummary?.casualLeave);

  // The month switcher (owner 2026-11-02) drives the whole screen below the "This month" card: the year view follows the
  // month's year, the month calendar shows that month, and the applications' four views list and count that month's
  // Casual Leave only (by the day each one is for). The ‹ arrow stops at January of the first year the year view offers.
  const [selected, setSelected] = useSelectedMonth();
  const year = selected.year;
  const selectedMonth = selected.month;
  const [view, setView] = useState<RequestView | null>(null);
  const [showApply, setShowApply] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const all = list.data ?? [];
  const rows: CLRow[] = useMemo(
    () =>
      all.map((r) => ({
        id: r.id, date: r.date, portion: asPortion(r.portion), status: asStatus(r.status), source: r.source, kind: 'casual_leave' as const,
      })),
    [all],
  );
  const range = yearRange(rows, thisYear);

  // The yearly balance (owner 2026-11-02). `balance` is today's year; an older server sends none (then everything below
  // works as before: one Casual Leave a month, the month dials).
  const eligData = elig.data;
  const balance = eligData?.balance ?? null;
  const yearlyNow = isYearly({ balance, rule: eligData?.rule });
  const balanceShown = showBalance({ balance, eligible: eligData?.eligible, months: eligData?.months });
  const cutOver = balance?.cutOver ?? null;
  // A year the balance covers (the cut-over's year on) is drawn as day counts; an earlier one keeps the month dials.
  const countMode = !!balance && !!cutOver && year >= Number(cutOver.slice(0, 4));
  // The year month by month from the server (`monthsUsage`, today's year only): it also holds the Casual Leave HR proposed
  // on an attendance edit that still waits, which the Casual Leave list cannot have.
  const usage = eligData?.monthsUsage && balance && year === balance.year ? eligData.monthsUsage : undefined;
  const allRows = useMemo(() => withHrProposals(rows, usage), [rows, usage]);
  const months = useMemo(
    () => (usage ? yearMonths(usageRows(usage), year, cutOver) : yearMonths(allRows, year, countMode ? cutOver : null)),
    [usage, allRows, year, cutOver, countMode],
  );
  const totals = useMemo(() => yearTotals(allRows, year), [allRows, year]);
  const history = useCLHistory(employeeId, year);
  const yearBalance = balance && year === balance.year ? balance : history.data?.balance ?? null;
  // Today's year only for someone who can have Casual Leave (casualLeave.showBalance); a past year as its history says.
  const ownYear = !balance || year !== balance.year || balanceShown;
  const leftDays = countMode && ownYear && yearBalance?.tracked ? yearBalance.remaining : null;
  const minMonth = { year: range.min, month: 1 };
  const maxMonth = laterMonth(currentMonth(), latestMonthOf(all, clDay) ?? currentMonth());

  const viewOpts: ViewOptions<CasualLeaveRequest> = {
    statusOf: (r) => r.status,
    scope: { ...selected, daysOf: clDay },
  };
  const counts = viewCounts(all, viewOpts);
  const activeView = view ?? defaultView(counts);
  const shown = rowsForView(all, activeView, viewOpts).sort(
    (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
  );
  const elsewhere = waitingInOtherMonths(all, viewOpts);
  const empty = monthEmptyText(activeView, 'Casual Leave applications', selected, counts.month);

  // Switching years opens the month that matters: this month for this year, else the first month with Casual Leave
  // (else the same month of that year).
  const pickYear = (y: number) => {
    if (y === thisYear) {
      setSelected(currentMonth());
      return;
    }
    const first = yearMonths(rows, y).find((m) => m.shape !== 'none')?.month;
    setSelected({ year: y, month: first ?? selectedMonth });
  };

  // A notification's View opens this screen with ?focus=<Casual Leave id> (src/lib/notificationTarget.ts): the month (and
  // with it the year) of that Casual Leave opens first, then the view that holds it, the page scrolls to it and it pulses
  // once (src/hooks/useFocusItem.ts).
  const scrollRef = useRef<ScrollViewInstance>(null);
  const focus = useFocusItem<CasualLeaveRequest, RequestView>({
    request: useFocusParam(),
    rows: list.data,
    idOf: (r) => r.id,
    views: { order: REQUEST_FOCUS_ORDER, current: activeView, set: setView, has: (r, v) => requestViewHasInItsMonth(r, v, viewOpts) },
    reveal: (r) => {
      const m = monthForRow(r, viewOpts);
      if (m) setSelected(m);
    },
    refresh: () => list.refetch(),
    fetching: list.isFetching,
    scrollRef,
  });

  const eligMonths = elig.data?.months;
  const thisMonth = eligMonths?.find((m) => m.month === monthKeyOf(new Date())) ?? eligMonths?.[eligMonths.length - 1];
  const state = elig.data
    ? clCardState({ balance, rule: elig.data.rule, month: thisMonth, eligible: elig.data.eligible, reason: elig.data.reason })
    : null;
  const canApply = !!state && (state.tone === 'open' || state.tone === 'half' || (elig.data?.months ?? []).some((m) => m.eligible));
  const tone = toneColors(state?.tone ?? 'closed', Colors);
  const refreshing = list.isRefetching || elig.isRefetching;
  const onRefresh = () => {
    void list.refetch();
    void elig.refetch();
    void history.refetch();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75} accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Casual Leave</Text>
          <Text style={styles.headerSubtitle}>
            {yearlyNow ? `${balance?.total ?? 12} paid days a year, full or half days` : 'One paid day a month, or two half-days'}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
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
                  <Text style={styles.heroKicker}>{yearlyNow && balance ? `CASUAL LEAVE ${balance.year}` : 'THIS MONTH'}</Text>
                  <View style={styles.heroRow}>
                    <MotiView
                      from={reduce ? undefined : { scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={reduce ? { type: 'timing', duration: 0 } : { type: 'spring', damping: 12, stiffness: 160 }}
                      style={[styles.heroIcon, { backgroundColor: tone.bg }]}
                    >
                      <MaterialCommunityIcons name={TONE_ICON[state.tone] as any} size={24} color={tone.fg} />
                    </MotiView>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroTitle}>{state.title}</Text>
                      <Text style={styles.heroDetail}>{state.detail}</Text>
                    </View>
                  </View>
                  {/* The yearly balance: twelve boxes and "11 of 12 CL left in 2026 · resets on 1 Jan". An older server (no
                      balance) keeps its one line. */}
                  {balanceShown && balance ? (
                    <ClBalanceBar balance={balance} />
                  ) : !balance && elig.data?.yearlyEntitlement != null ? (
                    <Text style={[styles.heroYear, TabularNums]}>
                      {daysText(Number(elig.data.usedThisYear ?? 0))} of {elig.data.yearlyEntitlement} days taken in {elig.data.year ?? thisYear}
                    </Text>
                  ) : null}
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
              onPress={() => pickYear(Math.max(range.min, year - 1))}
              disabled={year <= range.min}
              style={[styles.yearBtn, year <= range.min && { opacity: 0.35 }]}
              accessibilityLabel="Previous year"
              testID="cl-year-prev"
            >
              <MaterialCommunityIcons name="chevron-left" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.yearLabel, TabularNums]}>{year}</Text>
            <TouchableOpacity
              onPress={() => pickYear(Math.min(range.max, year + 1))}
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
                // Under the yearly balance what is left matters, not how many months were used.
                leftDays != null
                  ? { label: 'Left', value: daysText(leftDays), color: Colors.statusGreen }
                  : { label: 'Months used', value: String(totals.monthsUsed), color: Colors.statusGreen },
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
              onSelect={(m) => setSelected({ year, month: m })}
              mode={countMode ? 'count' : 'dial'}
            />
            <ClLegend
              mode={countMode ? 'count' : 'dial'}
              cutOver={cutOver}
              notCounted={countMode && months.some((m) => m.notCountedDays > 0)}
            />
            <ClMonthCalendar year={year} month={selectedMonth} rows={allRows} cutOver={countMode ? cutOver : null} />
          </>
        )}

        {/* Balance history (GET /casual-leaves/history): every move of the year's balance, newest first. Nothing on an
            older server (it has no history). */}
        {history.isError && !history.data ? (
          <View style={{ marginTop: 22 }}>
            <LoadError title="Could not load your balance history" onRetry={() => void history.refetch()} busy={history.isFetching} />
          </View>
        ) : history.data && ownYear ? (
          <View style={{ marginTop: 22 }}>
            <Text style={styles.sectionTitle}>Balance history</Text>
            {history.data.balance?.tracked === false || history.data.entries.length === 0 ? (
              <Text style={styles.historyNote}>
                No Casual Leave balance was kept for {year}: Casual Leave then followed the one-a-month rule.
              </Text>
            ) : (
              <ClBalanceHistory history={history.data} />
            )}
          </View>
        ) : null}

        {/* Applications */}
        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Your applications</Text>
        <MonthSwitcher
          value={selected}
          onChange={setSelected}
          min={minMonth}
          max={maxMonth}
          style={styles.monthSwitch}
          testID="cl-month"
        />
        <View style={styles.switcherWrap}>
          <RequestViewSwitcher
            value={activeView}
            counts={counts}
            onChange={setView}
            month={selected}
            testID="cl-views"
          />
        </View>
        <WaitingElsewhereNote
          count={elsewhere.count}
          month={elsewhere.month}
          onShow={(m) => { setSelected(m); setView('waiting'); }}
        />
        {focus.missing && <FocusMissingNote onDismiss={focus.dismissMissing} />}
        {list.isError && !list.data ? (
          <LoadError title="Could not load your applications" onRetry={() => void list.refetch()} busy={list.isFetching} />
        ) : list.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : !shown.length ? (
          <EmptyState icon="calendar-star" title={empty.title} subtitle={empty.subtitle} />
        ) : (
          shown.map((r, i) => (
            <FocusFrame key={r.id} {...focus.frame(r.id)} bottomInset={10}>
              <ClRequestCard request={r} index={i} />
            </FocusFrame>
          ))
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
          setSelected(currentMonth());
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
    historyNote: { color: Colors.textMuted, fontSize: 12, lineHeight: 17 },

    switcherWrap: { marginHorizontal: -16, marginBottom: 8 },
    monthSwitch: { marginBottom: 6 },
  });
