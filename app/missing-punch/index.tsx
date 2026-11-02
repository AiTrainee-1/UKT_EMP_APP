import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useMissingPunch, PUNCH_SLOT_LABEL, type MissingPunchItem } from '../../src/hooks/useRequests';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { hasProgressed, pipelineSentence, workflowOff } from '../../src/lib/approval';
import {
  defaultView,
  monthEmptyText,
  monthForRow,
  rowsForView,
  rowsInScope,
  viewCounts,
  waitingInOtherMonths,
  type RequestView,
  type ViewOptions,
} from '../../src/lib/requestViews';
import { istDateOf, missingPunchViewOptions } from '../../src/lib/myRequests';
import { useSelectedMonth } from '../../src/hooks/useSelectedMonth';
import { MonthSwitcher } from '../../src/components/MonthSwitcher';
import { WaitingElsewhereNote } from '../../src/components/requests/WaitingElsewhereNote';
import { parseClock, to12hLabel } from '../../src/lib/punchTimePicker';
import { ApprovalTrail, WaitingChip } from '../../src/components/approval/ApprovalTrail';
import { deciderFromStamps } from '../../src/lib/approvalsDecider';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';
import { RequestViewSwitcher } from '../../src/components/requests/RequestViewSwitcher';
import { REQUEST_FOCUS_ORDER, requestViewHasInItsMonth } from '../../src/lib/focusItem';
import { useFocusItem, useFocusParam } from '../../src/hooks/useFocusItem';
import { FocusFrame, FocusMissingNote } from '../../src/components/focus/FocusFrame';
import { ListSkeleton, LoadError, StaleNote } from '../../src/components/myrequests/ListStates';
import { Reveal } from '../../src/components/Reveal';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

const STAGE_LABEL: Record<string, string> = {
  pending_hod: 'Pending HOD Review',
  pending_hr: 'Pending HR Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function badgeVariant(status: string): 'pending' | 'approved' | 'rejected' | 'onleave' {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending_hr') return 'onleave';
  return 'pending';
}

// HR's pipeline decides who holds a pending request, and `pending_hod` / `pending_hr` no longer say so - the waiting
// chip under the badge does. Blue once a step has been approved, as `pending_hr` used to show. Without `approval` (an
// older backend, whose two stages are fixed) the status names still say it.
function stageBadge(item: MissingPunchItem): { label: string; variant: ReturnType<typeof badgeVariant> } {
  if (item.approval && (item.status === 'pending_hod' || item.status === 'pending_hr')) {
    return { label: 'Pending', variant: hasProgressed(item.approval) ? 'onleave' : 'pending' };
  }
  return { label: STAGE_LABEL[item.status] ?? item.status, variant: badgeVariant(item.status) };
}

const SLOT_ICON: Record<string, string> = {
  morning_in: 'login',
  lunch_out: 'silverware-fork-knife',
  lunch_in: 'silverware-fork-knife',
  evening_out: 'logout',
};

type Row = { kind: 'item'; key: string; item: MissingPunchItem; index: number };

/** "Wed, 29 Oct 2026" from "2026-10-29" without a time-zone shift. */
function dayLabel(date: string): string {
  try {
    return format(parseISO(date), 'EEE, dd MMM yyyy');
  } catch {
    return date;
  }
}

/** "9:05 AM" from "09:05" / "09:05:00". */
function timeLabel(t: string): string {
  const m = parseClock(t);
  return m == null ? t : to12hLabel(m);
}

export default function MissingPunchScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  // The month switcher (owner 2026-11-02): the four views list and count only the requests whose PUNCH DATE is in the
  // month on screen; the second card is every request of that month ("This month" / "All in Sep").
  const [selectedMonth, setSelectedMonth] = useSelectedMonth();
  // Every request (the latest 300, newest first): what a notification's request is looked up in, and what the month on
  // screen shows straight away while its own list loads.
  const all = useMissingPunch(employeeId);
  // The month's own list (GET /missing-punch-requests?month=&year=, by punch date): complete even for a month older than
  // the latest 300.
  const monthQuery = useMissingPunch(employeeId, selectedMonth.month, selectedMonth.year);
  const { data } = all;
  const listData = monthQuery.data ?? data;
  const isError = all.isError || monthQuery.isError;
  const isRefetching = all.isRefetching || monthQuery.isRefetching;
  const refetch = () => Promise.all([all.refetch(), monthQuery.refetch()]);
  // Who approves a missing punch, and whether HR has switched new ones off (Approval Workflow Control).
  const { data: approvalSummary } = useApprovalSummary();
  const missingPunchOff = workflowOff(approvalSummary?.missingPunch);

  const items = listData ?? [];
  // "Now" is read when the screen renders, never once at module load: the app process lives for days.
  const opts: ViewOptions<MissingPunchItem> = {
    ...missingPunchViewOptions<MissingPunchItem>(new Date()),
    scope: { ...selectedMonth, daysOf: (r) => r.date },
  };
  const counts = viewCounts(items, opts);
  // Skeleton while nothing of the month is on hand yet (not the month's empty state, which its own list may yet fill).
  const isLoading =
    (!listData && (all.isLoading || monthQuery.isLoading)) ||
    (!monthQuery.data && monthQuery.isPending && rowsInScope(items, opts).length === 0);

  // Opens on Waiting when something is waiting, else on the month view - decided once, when the list first arrives.
  const [view, setView] = useState<RequestView>('waiting');
  const chosen = useRef(false);
  // A view picked by hand or by a notification is never overruled by that opening choice.
  const pickView = (next: RequestView) => {
    chosen.current = true;
    setView(next);
  };
  useEffect(() => {
    if (!chosen.current && listData) {
      chosen.current = true;
      setView(defaultView(counts));
    }
  }, [listData]); // eslint-disable-line react-hooks/exhaustive-deps

  // One month is on screen, so no month headings: the switcher already names it.
  const visible = rowsForView(items, view, opts);
  const rows: Row[] = visible.map((item, index) => ({ kind: 'item', key: String(item.id), item, index }));
  const elsewhere = waitingInOtherMonths(data ?? [], opts);

  // A notification's View opens this screen with ?focus=<missing punch id> (src/lib/notificationTarget.ts): the month of
  // its punch date opens first, then the view that holds it, the list scrolls to it and it pulses once
  // (src/hooks/useFocusItem.ts). Looked up in the latest 300, which the month on screen falls back to while it loads.
  const listRef = useRef<FlatList<Row>>(null);
  const focus = useFocusItem<MissingPunchItem, RequestView>({
    request: useFocusParam(),
    rows: data,
    idOf: (r) => r.id,
    views: { order: REQUEST_FOCUS_ORDER, current: view, set: pickView, has: (r, v) => requestViewHasInItsMonth(r, v, opts) },
    reveal: (r) => {
      const m = monthForRow(r, opts);
      if (m) setSelectedMonth(m);
    },
    refresh: () => refetch(),
    fetching: all.isFetching,
    list: { ref: listRef, indexOf: (id) => rows.findIndex((r) => r.kind === 'item' && r.item.id === id) },
  });

  const empty = monthEmptyText(view, 'missing punch requests', selectedMonth, counts.month);
  const failedFirstLoad = isError && !listData;

  const renderCard = (item: MissingPunchItem, index: number) => {
    const badge = stageBadge(item);
    const sent = istDateOf(item.createdAt);
    return (
      <Reveal index={index}>
        <FocusFrame {...focus.frame(item.id)} bottomInset={10}>
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardTopLeft}>
                <View style={styles.slotIconWrap}>
                  <MaterialCommunityIcons name={(item.punchSlot ? SLOT_ICON[item.punchSlot] : 'fingerprint') as any} size={16} color={Colors.categoryPunch} />
                </View>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.type}>
                    {item.punchSlot ? PUNCH_SLOT_LABEL[item.punchSlot] : (item.punchType === 'IN' ? 'Check-In' : 'Check-Out')}
                  </Text>
                  <Text style={styles.dateTime}>{dayLabel(item.date)} · {timeLabel(item.punchTime)}</Text>
                </View>
              </View>
              <Badge label={badge.label} variant={badge.variant} />
            </View>

            {!!item.reason && (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonQuote}>"</Text>
                <Text style={styles.reason}>{item.reason}</Text>
              </View>
            )}

            <WaitingChip
              approval={item.approval}
              fallback={deciderFromStamps({
                status: item.status,
                hodBy: item.hodReviewedBy,
                hodAt: (item as any).hodReviewedAt,
                hrBy: item.hrReviewedBy,
                hrAt: (item as any).hrReviewedAt,
              })}
            />

            {item.approval ? (
              <ApprovalTrail approval={item.approval} title="APPROVAL WORKFLOW" />
            ) : (item.hodReviewedBy || item.hrReviewedBy) ? (
              <View style={styles.workflow}>
                <Text style={styles.workflowLabel}>APPROVAL WORKFLOW</Text>
                {item.hodReviewedBy && (
                  <View style={styles.workflowRow}>
                    <MaterialCommunityIcons
                      name={item.status === 'rejected' && !item.hrReviewedBy ? 'close-circle' : 'check-circle'}
                      size={15}
                      color={item.status === 'rejected' && !item.hrReviewedBy ? Colors.statusRed : Colors.statusGreen}
                    />
                    <Text style={styles.workflowText}>Department Head: {item.hodReviewedBy}</Text>
                  </View>
                )}
                {item.hrReviewedBy && (
                  <View style={styles.workflowRow}>
                    <MaterialCommunityIcons
                      name={item.status === 'rejected' ? 'close-circle' : 'check-circle'}
                      size={15}
                      color={item.status === 'rejected' ? Colors.statusRed : Colors.statusGreen}
                    />
                    <Text style={styles.workflowText}>HR: {item.hrReviewedBy}</Text>
                  </View>
                )}
              </View>
            ) : null}

            <View style={styles.cardFooter}>
              <Text style={styles.refText}>#MP-{item.id}{sent ? ` · Sent ${dayLabel(sent)}` : ''}</Text>
              {item.status === 'approved' && <Text style={styles.approvedHint}>Added to your attendance</Text>}
            </View>
          </View>
        </FocusFrame>
      </Reveal>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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
          <Text style={styles.headerTitle}>Missing Punch</Text>
          <Text style={styles.headerSubtitle}>Biometric punch regularization</Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={failedFirstLoad || isLoading ? [] : rows}
        keyExtractor={(r) => r.key}
        onScrollToIndexFailed={focus.onScrollToIndexFailed}
        extraData={focus.activeId}
        contentContainerStyle={[styles.pad, !rows.length && styles.grow]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <>
            <Reveal index={0}>
              <View style={styles.introCard}>
                <View style={styles.introIconWrap}>
                  <MaterialCommunityIcons name="fingerprint" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.introTitle}>Missing Punch Regularization</Text>
                  <Text style={styles.introBody}>
                    Forgot to punch in or out? Tell us the day, the time and why. {pipelineSentence(approvalSummary?.missingPunch)}
                  </Text>
                </View>
              </View>
            </Reveal>

            <WorkflowOffNote workflow={approvalSummary?.missingPunch} style={styles.offNote} />

            {!failedFirstLoad && (
              <>
                <MonthSwitcher
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  style={styles.monthSwitch}
                  testID="missing-punch-month"
                />
                <View style={styles.switcher}>
                  <RequestViewSwitcher
                    value={view}
                    counts={counts}
                    onChange={pickView}
                    month={selectedMonth}
                    testID="missing-punch-views"
                  />
                </View>
                <WaitingElsewhereNote
                  count={elsewhere.count}
                  month={elsewhere.month}
                  onShow={(m) => { setSelectedMonth(m); pickView('waiting'); }}
                />
              </>
            )}
            {focus.missing && <FocusMissingNote onDismiss={focus.dismissMissing} />}
            {isError && !!listData && <StaleNote onRetry={() => { void refetch(); }} />}
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <ListSkeleton />
          ) : failedFirstLoad ? (
            <LoadError what="your missing punch requests" onRetry={() => { void refetch(); }} retrying={isRefetching} />
          ) : (
            <EmptyState icon="fingerprint" title={empty.title} subtitle={empty.subtitle} />
          )
        }
        renderItem={({ item: row }) => renderCard(row.item, row.index)}
      />

      <TouchableOpacity
        style={[styles.fab, missingPunchOff && styles.fabOff]}
        onPress={() => router.push('/missing-punch/report')}
        activeOpacity={0.85}
        disabled={missingPunchOff}
        accessibilityRole="button"
        accessibilityLabel="Report a missing punch"
        testID="missing-punch-new"
      >
        <MaterialCommunityIcons name="plus" size={26} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
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
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 19 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },

  pad: { padding: 16, paddingBottom: 100 },
  grow: { flexGrow: 1 },
  switcher: { marginHorizontal: -16, marginBottom: 10 },
  monthSwitch: { marginBottom: 6 },

  introCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.xl,
    padding: 14,
    marginBottom: 14,
  },
  introIconWrap: { width: 38, height: 38, borderRadius: BorderRadius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 14, color: Colors.textPrimary, marginBottom: 4 },
  introBody: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  offNote: { marginBottom: 14 },

  card: { backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10, gap: 10, ...cardShadow },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  slotIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.badgeBlueBg, alignItems: 'center', justifyContent: 'center' },
  type: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  dateTime: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  reasonBox: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 10, flexDirection: 'row', gap: 4 },
  reasonQuote: { color: Colors.outline, fontSize: 18, fontFamily: FontFamily.displayBold, lineHeight: 18 },
  reason: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  workflow: { gap: 5 },
  workflowLabel: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  workflowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  workflowText: { color: Colors.textSecondary, fontSize: 11.5 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  refText: { color: Colors.outline, fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  approvedHint: { color: Colors.statusGreen, fontSize: 11, fontWeight: '600' },

  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  fabOff: { opacity: 0.5 },
});
