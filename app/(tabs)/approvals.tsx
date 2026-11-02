// The Department Head's Approvals tab. Each category (Leave, Permission, Casual Leave, Attendance, Missing Punch, On-Duty,
// Outpass, Compensation, Resignations - all but the first two behind HR's per-person switches) has three lists:
//   Pending  - waiting for this head's decision now (the list the tab always had; Approve / Reject in the sheet),
//   Approved - finally approved, or approved by this head's step and now with HR,
//   Rejected - finally rejected, by whoever,
// with who decided each one shown prominently ("Approved by you", "Rejected by HR (Meena) · 31 Oct, 10:05 AM"), read from
// the approval trail.
// Server: backend/api/mobile_approvals_views.py (GET /manager/requests + /summary). Decisions still go through the
// unchanged PATCH /manager/.../status endpoints. An older backend without the history endpoint gets the old pending list
// (searchable on the phone) and a note on Approved / Rejected.
// Pieces: src/components/approvals/*, wording and rules: src/lib/approvalsHistory.ts + approvalsItems.ts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import {
  useApprovalCounts,
  useApprovalHistory,
  useManagerProfile,
  usePendingRequests,
} from '../../src/hooks/useManager';
import { useAuth } from '../../src/hooks/useAuth';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { approvalsBadgeCount, shownApprovalTabs } from '../../src/lib/approvalBadge';
import { approvalErrorMessage, hodTakesPart } from '../../src/lib/approval';
import {
  APPROVAL_STATUSES,
  CATEGORY_LABEL,
  CATEGORY_WORKFLOW,
  LEGACY_LIST_KEY,
  categoryFromWire,
  countsFromProfile,
  emptyCopy,
  legacyPendingCounts,
  matchesSearch,
  statusFromParam,
  visibleCategories,
  type ApprovalCategory,
  type ApprovalStatus,
  type StatusCounts,
} from '../../src/lib/approvalsHistory';
import { ApprovalsHeader } from '../../src/components/approvals/ApprovalsHeader';
import { CategoryRail } from '../../src/components/approvals/CategoryRail';
import { StatusSwitcher } from '../../src/components/approvals/StatusSwitcher';
import { ApprovalSearchBar } from '../../src/components/approvals/ApprovalSearchBar';
import { ApprovalCard } from '../../src/components/approvals/ApprovalCard';
import { DecisionSheet } from '../../src/components/approvals/DecisionSheet';
import {
  ApprovalEmpty,
  ApprovalError,
  ApprovalNotice,
  ApprovalSkeletons,
  ListFooter,
} from '../../src/components/approvals/ListStates';
import { useApprovalDecision } from '../../src/components/approvals/useApprovalDecision';
import type { ApprovalItem, SelectedApproval } from '../../src/components/approvals/types';
import { Reveal } from '../../src/components/Reveal';
import { useFocusItem, useFocusParam, useRouteRequest } from '../../src/hooks/useFocusItem';
import { FocusFrame, FocusMissingNote } from '../../src/components/focus/FocusFrame';
import { Toast } from '../../src/components/ui/Toast';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { trackingRoutes } from '../../src/tracking/routes';

/** `value`, once it has stopped changing for `ms` (the search box asks the server after the typing pauses). */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** "Now", moved on every minute, so "Waiting 3 hours" stays true while the tab is open. */
function useMinuteClock(): [Date, () => void] {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return [now, () => setNow(new Date())];
}

export default function ApprovalsScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{ category?: string; status?: string; focus?: string }>();
  const { user } = useAuth();
  const signedIn = !!user;
  const { data: manager } = useManagerProfile(signedIn);
  const { data: approvalSummary } = useApprovalSummary();

  const [category, setCategory] = useState<ApprovalCategory>(() => categoryFromWire(params.category) ?? 'leave');
  const [status, setStatus] = useState<ApprovalStatus>(() => statusFromParam(params.status) ?? 'pending');
  const [searchText, setSearchText] = useState('');
  const search = useDebounced(searchText.trim(), 300);
  const [selected, setSelected] = useState<SelectedApproval | null>(null);
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [now, tick] = useMinuteClock();

  // A link may name the list to open (?category=casual_leave&status=approved) and the request in it (&focus=<id>, a
  // notification's View: src/lib/notificationTarget.ts). Each param is read once and taken off the route, so the same link
  // opened again later (this tab stays mounted) still switches the list.
  const categoryLink = useRouteRequest('category', categoryFromWire);
  const statusLink = useRouteRequest('status', statusFromParam);
  const focusRequest = useFocusParam();
  // What the focus link came with, read in the render it arrived (the params are cleared right after).
  const focusLink = useRef<{ category: ApprovalCategory | null; status: ApprovalStatus | null }>({ category: null, status: null });
  if (params.focus !== undefined) {
    focusLink.current = { category: categoryFromWire(params.category), status: statusFromParam(params.status) };
  }
  useEffect(() => {
    if (categoryLink) setCategory(categoryLink.value);
  }, [categoryLink?.nonce]);
  useEffect(() => {
    if (statusLink) setStatus(statusLink.value);
  }, [statusLink?.nonce]);
  // Looking for one request: start on Pending (it most likely waits for this head) unless the link named a list, and drop a
  // search that could hide it.
  useEffect(() => {
    if (!focusRequest) return;
    setStatus(focusLink.current.status ?? 'pending');
    setSearchText('');
  }, [focusRequest?.nonce]);

  // Which categories this head sees: ONE definition shared with the Approvals badge on the tab bar (approvalBadge.ts).
  const categories = useMemo(() => visibleCategories(shownApprovalTabs(manager)), [manager]);
  // A category can disappear while it is open: HR switched the head's approval switch off, and the profile refetch that
  // follows a refused decision (or the 30 s poll) no longer lists it. Fall back to Leave instead of an unlisted list.
  const categoryKeys = categories.join(',');
  useEffect(() => {
    if (manager && !categoryKeys.split(',').includes(category)) setCategory('leave');
  }, [manager, categoryKeys, category]);

  // ── data ──
  const countsQuery = useApprovalCounts(signedIn);
  // null = the server has no history endpoint (an older backend): the old pending list stands in.
  const legacy = countsQuery.data === null;
  const listQuery = useApprovalHistory(category, status, search, signedIn && !legacy);
  const legacyQuery = usePendingRequests(signedIn && legacy);

  const items: ApprovalItem[] = useMemo(() => {
    if (legacy) {
      if (status !== 'pending') return [];
      const list = (legacyQuery.data as Record<string, unknown> | undefined)?.[LEGACY_LIST_KEY[category]];
      return (Array.isArray(list) ? (list as ApprovalItem[]) : []).filter((i) => matchesSearch(i, search));
    }
    return listQuery.data?.pages.flatMap((p) => p.items as ApprovalItem[]) ?? [];
  }, [legacy, status, legacyQuery.data, category, search, listQuery.data]);

  const categoryCounts = useMemo(
    () =>
      countsQuery.data ??
      (legacy ? legacyPendingCounts(legacyQuery.data as Record<string, unknown> | undefined) : countsFromProfile(manager as any)),
    [countsQuery.data, legacy, legacyQuery.data, manager],
  );
  // The open list's own reply carries its category's numbers too, fresher than the 30 s summary.
  const statusCounts: Partial<StatusCounts> | null = legacy
    ? (categoryCounts[category] ?? null)
    : (listQuery.data?.pages[0]?.counts ?? countsQuery.data?.[category] ?? null);

  const active = legacy ? legacyQuery : listQuery;
  const loading = active.isLoading;
  const loadError = active.isError && !items.length;
  const staleError = active.isError && items.length > 0;

  // ── actions ──
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };
  const closeSheet = () => {
    setSelected(null);
    setComment('');
  };
  const { decide, busy } = useApprovalDecision();

  // "View route" on an On-Duty request: the sheet is a modal that would sit on top of the journey screen, so it is put
  // away (the comment kept) and opened again when the head comes back to this tab, to decide with the route in mind.
  const reopenAfterRoute = useRef<SelectedApproval | null>(null);
  const onViewRoute = (journeyId: number) => {
    reopenAfterRoute.current = selected;
    setSelected(null);
    router.push(trackingRoutes.journey(journeyId));
  };
  useFocusEffect(
    useCallback(() => {
      const back = reopenAfterRoute.current;
      if (!back) return;
      reopenAfterRoute.current = null;
      setSelected(back);
    }, []),
  );

  const refreshAll = useCallback(async () => {
    tick();
    await Promise.allSettled([
      legacy ? legacyQuery.refetch() : listQuery.refetch(),
      countsQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ['manager-profile'] }),
    ]);
  }, [legacy, legacyQuery, listQuery, countsQuery, queryClient, tick]);

  const onDecide = async (decision: 'approved' | 'rejected') => {
    if (!selected) return;
    const result = await decide(selected, decision, comment);
    if (result.ok) {
      showToast(result.message, result.tone);
      closeSheet();
      return;
    }
    showToast(result.message, 'error');
    // A refusal means what is on screen is out of date: refresh it and drop the sheet. A network or server failure says
    // nothing about the request, so the sheet stays for another try.
    if (result.refused) {
      void refreshAll();
      closeSheet();
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  };

  const changeCategory = (c: ApprovalCategory) => {
    setCategory(c);
    setSearchText('');
  };

  // ?focus=<id>: find the request in Pending, then Approved, then Rejected (each its own server list, a few pages deep),
  // scroll to it and pulse it once (src/hooks/useFocusItem.ts). Waits until the linked category and a cleared search are
  // on screen; a category this head can no longer see is "no longer in this list".
  const listRef = useRef<FlatList<ApprovalItem>>(null);
  const linkCategory = focusLink.current.category;
  const focus = useFocusItem<ApprovalItem, ApprovalStatus>({
    request: focusRequest,
    rows: loading || loadError ? undefined : items,
    idOf: (i) => i.id,
    views: { order: legacy ? ['pending'] : APPROVAL_STATUSES, current: status, set: setStatus },
    refresh: () => (legacy ? legacyQuery.refetch() : listQuery.refetch()),
    more: legacy ? undefined : { has: !!listQuery.hasNextPage, load: () => listQuery.fetchNextPage() },
    fetching: active.isFetching,
    ready: !!manager && (!linkCategory || category === linkCategory) && search === searchText.trim(),
    unavailable: !!manager && !!linkCategory && !categories.includes(linkCategory),
    list: { ref: listRef, indexOf: (id) => items.findIndex((i) => i.id === id) },
  });

  const label = CATEGORY_LABEL[category];
  const empty = emptyCopy(category, status, {
    search,
    hodInPipeline: hodTakesPart(approvalSummary?.[CATEGORY_WORKFLOW[category]]),
  });

  const listHeader = (
    <View style={styles.listHeader}>
      <ApprovalSearchBar
        value={searchText}
        onChange={setSearchText}
        placeholder={`Search ${label.toLowerCase()} by name or code`}
      />
      <View style={styles.notices}>
        {focus.missing && <FocusMissingNote onDismiss={focus.dismissMissing} />}
        {legacy && status !== 'pending' && (
          <ApprovalNotice
            icon="update"
            text="Approved and rejected history needs the latest server update. Your pending requests are below."
          />
        )}
        {staleError && (
          <ApprovalNotice
            icon="wifi-alert"
            tone="warn"
            text="Couldn't refresh just now. Showing what was loaded before - pull down to try again."
          />
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <ApprovalsHeader pendingTotal={manager ? approvalsBadgeCount(manager) : null} />

      <View style={styles.controls}>
        <CategoryRail categories={categories} value={category} counts={categoryCounts} onChange={changeCategory} />
        <StatusSwitcher value={status} counts={statusCounts} onChange={setStatus} />
      </View>

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => `${category}-${item.id}`}
        onScrollToIndexFailed={focus.onScrollToIndexFailed}
        extraData={focus.activeId}
        contentContainerStyle={[styles.list, !items.length && styles.listGrow]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (!legacy && listQuery.hasNextPage && !listQuery.isFetchingNextPage) void listQuery.fetchNextPage();
        }}
        ListEmptyComponent={
          loading ? (
            <ApprovalSkeletons />
          ) : loadError ? (
            <ApprovalError
              message={approvalErrorMessage(active.error, 'Check your connection and try again.')}
              onRetry={() => void refreshAll()}
              retrying={active.isFetching}
            />
          ) : legacy && status !== 'pending' ? undefined : (
            <ApprovalEmpty copy={empty} />
          )
        }
        ListFooterComponent={
          <ListFooter
            loading={!legacy && listQuery.isFetchingNextPage}
            done={!legacy && !listQuery.hasNextPage}
            count={items.length}
          />
        }
        renderItem={({ item, index }) => (
          <Reveal index={index}>
            <FocusFrame {...focus.frame(item.id)}>
              <ApprovalCard
                category={category}
                status={status}
                item={item}
                now={now}
                onOpen={() => setSelected({ category, status, item })}
              />
            </FocusFrame>
          </Reveal>
        )}
      />

      <DecisionSheet
        selected={selected}
        comment={comment}
        onCommentChange={setComment}
        onDecide={onDecide}
        busy={busy}
        onClose={closeSheet}
        onViewRoute={onViewRoute}
      />

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bgLight },
    controls: { gap: 12, marginTop: 12, marginBottom: 4 },
    listHeader: { gap: 10, marginBottom: 10, marginHorizontal: -16, paddingTop: 8 },
    notices: { marginHorizontal: 16 },
    list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
    listGrow: { flexGrow: 1 },
  });
