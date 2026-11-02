import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';

import { useAuth } from '../../hooks/useAuth';
import { useOnDutyHistory, type OnDutyHistoryItem } from '../../hooks/useOnDutyHistory';
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
} from '../../lib/requestViews';
import { onDutyDay, onDutyRowLabel, onDutyViewOptions } from '../../lib/myRequests';
import { monthKey } from '../../lib/monthSwitch';
import { useSelectedMonth } from '../../hooks/useSelectedMonth';
import { MonthSwitcher } from '../MonthSwitcher';
import { WaitingElsewhereNote } from '../requests/WaitingElsewhereNote';
import { parseClock, to12hLabel } from '../../lib/punchTimePicker';
import { formatDistance } from '../../tracking/format';
import { trackingRoutes } from '../../tracking/routes';
import { RequestViewSwitcher } from '../requests/RequestViewSwitcher';
import { REQUEST_FOCUS_ORDER, requestViewHasInItsMonth } from '../../lib/focusItem';
import { useFocusItem, type RouteRequest } from '../../hooks/useFocusItem';
import { FocusFrame, FocusMissingNote } from '../focus/FocusFrame';
import { ListSkeleton, LoadError, StaleNote } from '../myrequests/ListStates';
import { ApprovalTrail, WaitingChip } from '../approval/ApprovalTrail';
import { deciderFromStamps } from '../../lib/approvalsDecider';
import { Reveal } from '../Reveal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

type Row = { kind: 'item'; key: string; item: OnDutyHistoryItem; index: number };

const PUNCH_TONE = { approved: 'statusGreen', pending: 'statusYellow', rejected: 'statusRed' } as const;

/**
 * On-Duty -> View Records: the employee's On-Duty requests of one month (the month switcher, 2026-11-02), in the four
 * views (Waiting / This month or "All in Sep" / Approved / Rejected), each with the day, the places, how the day went (the
 * four geo-punches), who approved or rejected it, and the recorded route when there is one.
 * Data: GET /on-duty-sessions/mine?month=YYYY-MM (useOnDutyHistory).
 *
 * `focusRequest`: a notification's View opened the screen on one request (`/on-duty?view=records&focus=<session id>`,
 * read by app/on-duty/index.tsx): its month opens, then the view that holds it (older pages of the whole history are
 * loaded if need be to find it), it scrolls into view, opens its details and pulses once (src/hooks/useFocusItem.ts).
 */
export function OnDutyRecords({
  header,
  onApply,
  focusRequest = null,
}: {
  header: React.ReactNode;
  onApply: () => void;
  focusRequest?: RouteRequest<number> | null;
}) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  // The month switcher (owner 2026-11-02): the four views list and count only the requests whose day (the session date)
  // is in the month on screen; the second card is every request of that month ("This month" / "All in Sep").
  const [selectedMonth, setSelectedMonth] = useSelectedMonth();
  const key = monthKey(selectedMonth);
  // The month's own list (GET /on-duty-sessions/mine?month=YYYY-MM): its rows and its counts.
  const history = useOnDutyHistory(employeeId, { poll: true, month: key });
  // Every request, newest first (the same cache the On-Duty page's "Your past requests" line reads): where a
  // notification's request is looked up (older pages loaded if need be), what the month on screen shows while its own
  // list loads, and what "waiting in other months" counts.
  const allHistory = useOnDutyHistory(employeeId, { poll: true });
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = history;
  const listReady = data ?? allHistory.data;
  const isError = history.isError || allHistory.isError;
  const isRefetching = history.isRefetching || allHistory.isRefetching;
  const refetch = () => Promise.all([history.refetch(), allHistory.refetch()]);

  // Opening the records always asks again: a request sent a minute ago must be in "Waiting".
  useEffect(() => {
    if (listReady) void refetch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allItems = allHistory.data?.pages.flatMap((p) => p.items) ?? [];
  const opts: ViewOptions<OnDutyHistoryItem> = {
    ...onDutyViewOptions<OnDutyHistoryItem>(new Date()),
    scope: { ...selectedMonth, daysOf: onDutyDay },
  };
  // The month's list once it is here; until then whatever the loaded history holds of that month.
  const items = data ? data.pages.flatMap((p) => p.items) : allItems;
  // A server that applied the month counts over all of the month's requests; else (an older server, or still loading)
  // the rows on hand are counted.
  const counts = data?.pages[0]?.month === key ? data.pages[0].counts : viewCounts(items, opts);
  const isLoading = !data && history.isPending && rowsInScope(allItems, opts).length === 0;

  const [view, setView] = useState<RequestView>('waiting');
  const [open, setOpen] = useState<number | null>(null);
  const chosen = useRef(false);
  // A view picked by hand or by a notification is never overruled by the opening choice below (the month's list can
  // arrive after the notification's request was found in the whole history).
  const pickView = (next: RequestView) => {
    chosen.current = true;
    setView(next);
  };
  useEffect(() => {
    if (!chosen.current && data) {
      chosen.current = true;
      setView(defaultView(counts));
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // One month is on screen, so no month headings: the switcher already names it.
  const visible = rowsForView(items, view, opts);
  const rows: Row[] = visible.map((item, index) => ({ kind: 'item', key: String(item.id), item, index }));
  const elsewhere = waitingInOtherMonths(allItems, opts);

  // A notification's request: looked up in the whole history (older pages loaded if need be); its month opens first,
  // then the view that holds it, its details open, it scrolls into view and pulses once.
  const listRef = useRef<FlatList<Row>>(null);
  const focus = useFocusItem<OnDutyHistoryItem, RequestView>({
    request: focusRequest,
    rows: allHistory.data ? allItems : undefined,
    idOf: (r) => r.id,
    views: { order: REQUEST_FOCUS_ORDER, current: view, set: pickView, has: (r, v) => requestViewHasInItsMonth(r, v, opts) },
    reveal: (r) => {
      const m = monthForRow(r, opts);
      if (m) setSelectedMonth(m);
      setOpen(r.id);
    },
    refresh: () => allHistory.refetch(),
    more: { has: !!allHistory.hasNextPage, load: () => allHistory.fetchNextPage() },
    fetching: allHistory.isFetching,
    list: { ref: listRef, indexOf: (id) => rows.findIndex((r) => r.kind === 'item' && r.item.id === id) },
  });

  const empty = monthEmptyText(view, 'On-Duty requests', selectedMonth, counts.month);
  const failedFirstLoad = isError && !listReady;

  const renderCard = (item: OnDutyHistoryItem, index: number) => {
    const label = onDutyRowLabel(item);
    const expanded = open === item.id;
    const day = item.date ? parseISO(item.date) : null;
    return (
      <Reveal index={index}>
        <FocusFrame {...focus.frame(item.id)} bottomInset={10}>
          <Pressable
            onPress={() => setOpen(expanded ? null : item.id)}
            style={styles.card}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`On-Duty ${item.date ?? ''} to ${item.destination}, ${label.label}. ${label.detail}. Tap for ${expanded ? 'less' : 'details'}.`}
            testID={`on-duty-record-${item.id}`}
          >
            <View style={styles.cardTop}>
              <View style={styles.dateTile}>
                <Text style={styles.dateDay}>{day ? format(day, 'dd') : '–'}</Text>
                <Text style={styles.dateMonth}>{day ? format(day, 'MMM').toUpperCase() : ''}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.place} numberOfLines={expanded ? undefined : 2}>{item.destination}</Text>
                <Text style={styles.detail}>{day ? format(day, 'EEEE') : ''}{label.detail ? ` · ${label.detail}` : ''}</Text>
              </View>
              <Badge label={label.label} variant={label.variant} />
            </View>

            {/* The day's four geo-punches */}
            <View style={styles.punchRow} accessible accessibilityLabel={`${item.punchCount} of 4 geo-punches recorded`}>
              {[1, 2, 3, 4].map((n) => {
                const p = item.punches.find((x) => x.punchNumber === n);
                const tone = p ? Colors[PUNCH_TONE[p.status] ?? 'statusGrey'] : Colors.outlineVariant;
                const t = p ? parseClock(p.punchTime) : null;
                return (
                  <View key={n} style={styles.punchCell}>
                    <View style={[styles.punchBar, { backgroundColor: p ? tone : Colors.bgSurfaceHigh }]} />
                    <Text style={[styles.punchText, !p && { color: Colors.textMuted }]}>
                      {n % 2 ? 'In' : 'Out'} {t != null ? to12hLabel(t) : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>

            <WaitingChip
              approval={item.approval}
              fallback={deciderFromStamps({
                status: (item as any).approvalStatus ?? item.status,
                hodBy: (item as any).hodReviewedBy,
                hodAt: (item as any).hodReviewedAt,
                hrBy: (item as any).hrReviewedBy,
                hrAt: (item as any).hrReviewedAt,
              })}
            />

            {expanded && (
              <MotiView from={{ opacity: 0, translateY: -4 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 200 }} style={{ gap: 8 }}>
                {item.branchName && <Text style={styles.meta}>Branch: {item.branchName}</Text>}
                {item.approval ? (
                  <ApprovalTrail approval={item.approval} title="APPROVAL" />
                ) : (
                  <>
                    {item.hodReviewedBy && <Text style={styles.meta}>Department Head: {item.hodReviewedBy}{item.hodReviewComment ? ` · "${item.hodReviewComment}"` : ''}</Text>}
                    {item.hrReviewedBy && <Text style={styles.meta}>HR: {item.hrReviewedBy}{item.hrReviewComment ? ` · "${item.hrReviewComment}"` : ''}</Text>}
                  </>
                )}
                <Text style={styles.ref}>#OD-{item.id}{item.createdAt ? ` · Sent ${format(new Date(item.createdAt), 'dd MMM, h:mm a')}` : ''}</Text>
              </MotiView>
            )}

            <View style={styles.cardBottom}>
              {item.journey ? (
                <TouchableOpacity
                  onPress={() => router.push(trackingRoutes.journey(item.journey!.id))}
                  style={styles.journeyBtn}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`See the route of this day, ${formatDistance(item.journey.distanceM)}`}
                  hitSlop={6}
                >
                  <MaterialCommunityIcons name="map-marker-path" size={15} color={Colors.primary} />
                  <Text style={styles.journeyText}>
                    See route{item.journey.distanceM > 0 ? ` · ${formatDistance(item.journey.distanceM)}` : ''}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.noRoute}>No route recorded</Text>
              )}
              <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
            </View>
          </Pressable>
        </FocusFrame>
      </Reveal>
    );
  };

  return (
    <FlatList
      ref={listRef}
      data={failedFirstLoad || isLoading ? [] : rows}
      keyExtractor={(r) => r.key}
      onScrollToIndexFailed={focus.onScrollToIndexFailed}
      extraData={focus.activeId}
      contentContainerStyle={[styles.pad, !rows.length && styles.grow]}
      refreshControl={<RefreshControl refreshing={isRefetching && !isFetchingNextPage} onRefresh={() => { void refetch(); }} tintColor={Colors.primary} />}
      ListHeaderComponent={
        <>
          {header}
          {!failedFirstLoad && (
            <>
              <MonthSwitcher
                value={selectedMonth}
                onChange={setSelectedMonth}
                style={styles.monthSwitch}
                testID="on-duty-month"
              />
              <View style={styles.switcher}>
                <RequestViewSwitcher value={view} counts={counts} onChange={pickView} month={selectedMonth} testID="on-duty-views" />
              </View>
              <WaitingElsewhereNote
                count={elsewhere.count}
                month={elsewhere.month}
                onShow={(m) => { setSelectedMonth(m); pickView('waiting'); }}
              />
            </>
          )}
          {focus.missing && <FocusMissingNote onDismiss={focus.dismissMissing} />}
          {isError && !!listReady && <StaleNote onRetry={() => { void refetch(); }} />}
        </>
      }
      ListEmptyComponent={
        isLoading ? (
          <ListSkeleton />
        ) : failedFirstLoad ? (
          <LoadError what="your On-Duty records" onRetry={() => { void refetch(); }} retrying={isRefetching} />
        ) : (
          <View>
            <EmptyState icon="briefcase-outline" title={empty.title} subtitle={hasNextPage ? 'Older records are not loaded yet.' : empty.subtitle} />
            {!hasNextPage && view !== 'rejected' && (
              <Button title="Apply On-Duty" variant="outline" onPress={onApply} style={styles.cta} />
            )}
          </View>
        )
      }
      ListFooterComponent={
        hasNextPage ? (
          <Button
            title={isFetchingNextPage ? 'Loading older records…' : 'Show older records'}
            variant="ghost"
            onPress={() => { void fetchNextPage(); }}
            loading={isFetchingNextPage}
            style={styles.more}
          />
        ) : undefined
      }
      renderItem={({ item: row }) => renderCard(row.item, row.index)}
    />
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    pad: { padding: 16, paddingBottom: 32 },
    grow: { flexGrow: 1 },
    switcher: { marginHorizontal: -16, marginBottom: 10 },
    monthSwitch: { marginBottom: 6 },
    cta: { alignSelf: 'center', minWidth: 200 },
    more: { alignSelf: 'center', marginTop: 4 },

    card: {
      backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border,
      padding: 14, marginBottom: 10, gap: 10,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    dateTile: {
      width: 48, paddingVertical: 6, borderRadius: BorderRadius.md, backgroundColor: Colors.badgeYellowBg,
      alignItems: 'center',
    },
    dateDay: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18, lineHeight: 22 },
    dateMonth: { color: Colors.categoryOnDuty, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
    place: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14, lineHeight: 19 },
    detail: { color: Colors.textMuted, fontSize: 11.5 },

    punchRow: { flexDirection: 'row', gap: 6 },
    punchCell: { flex: 1, gap: 4 },
    punchBar: { height: 5, borderRadius: 3 },
    punchText: { color: Colors.textSecondary, fontSize: 10.5, fontWeight: '700' },

    meta: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
    ref: { color: Colors.outline, fontSize: 10.5, fontWeight: '700' },

    cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    journeyBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12,
      borderRadius: BorderRadius.full, backgroundColor: Colors.primaryFixed,
    },
    journeyText: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
    noRoute: { color: Colors.textMuted, fontSize: 11.5 },
  });
