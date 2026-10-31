import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';

import { useAuth } from '../../hooks/useAuth';
import { useOnDutyHistory, type OnDutyHistoryItem } from '../../hooks/useOnDutyHistory';
import { defaultView, rowsForView, viewCounts, type RequestView } from '../../lib/requestViews';
import { emptyViewText, monthSections, onDutyRowLabel, onDutyViewOptions } from '../../lib/myRequests';
import { parseClock, to12hLabel } from '../../lib/punchTimePicker';
import { formatDistance } from '../../tracking/format';
import { trackingRoutes } from '../../tracking/routes';
import { RequestViewSwitcher } from '../requests/RequestViewSwitcher';
import { ListSkeleton, LoadError, MonthHeading, StaleNote } from '../myrequests/ListStates';
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

type Row =
  | { kind: 'heading'; key: string; title: string; count: number }
  | { kind: 'item'; key: string; item: OnDutyHistoryItem; index: number };

const PUNCH_TONE = { approved: 'statusGreen', pending: 'statusYellow', rejected: 'statusRed' } as const;

/**
 * On-Duty -> View Records: every On-Duty request the employee made, in the four views (Waiting / Sent this month /
 * Approved / Rejected), each with the day, the places, how the day went (the four geo-punches), who approved or rejected
 * it, and the recorded route when there is one. Data: GET /on-duty-sessions/mine (useOnDutyHistory).
 */
export function OnDutyRecords({ header, onApply }: { header: React.ReactNode; onApply: () => void }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const history = useOnDutyHistory(user?.employeeId ?? null, { poll: true });
  const { data, isLoading, isError, refetch, isRefetching, hasNextPage, fetchNextPage, isFetchingNextPage } = history;

  // Opening the records always asks again: a request sent a minute ago must be in "Waiting".
  useEffect(() => {
    if (data) void refetch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const opts = onDutyViewOptions<OnDutyHistoryItem>(new Date());
  // The server counts over every request (older pages included); the loaded rows are the fallback.
  const counts = data?.pages[0]?.counts ?? viewCounts(items, opts);

  const [view, setView] = useState<RequestView>('waiting');
  const [open, setOpen] = useState<number | null>(null);
  const chosen = useRef(false);
  useEffect(() => {
    if (!chosen.current && data) {
      chosen.current = true;
      setView(defaultView(counts));
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = rowsForView(items, view, opts);
  const rows: Row[] = [];
  if (view === 'approved' || view === 'rejected') {
    let i = 0;
    for (const s of monthSections(visible, (r) => r.date)) {
      rows.push({ kind: 'heading', key: `h-${s.key}`, title: s.title, count: s.rows.length });
      for (const item of s.rows) rows.push({ kind: 'item', key: String(item.id), item, index: i++ });
    }
  } else {
    visible.forEach((item, index) => rows.push({ kind: 'item', key: String(item.id), item, index }));
  }
  const empty = emptyViewText(view, 'On-Duty requests', 'sent this month');
  const failedFirstLoad = isError && !data;

  const renderCard = (item: OnDutyHistoryItem, index: number) => {
    const label = onDutyRowLabel(item);
    const expanded = open === item.id;
    const day = item.date ? parseISO(item.date) : null;
    return (
      <Reveal index={index}>
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
      </Reveal>
    );
  };

  return (
    <FlatList
      data={failedFirstLoad || isLoading ? [] : rows}
      keyExtractor={(r) => r.key}
      contentContainerStyle={[styles.pad, !rows.length && styles.grow]}
      refreshControl={<RefreshControl refreshing={isRefetching && !isFetchingNextPage} onRefresh={() => { void refetch(); }} tintColor={Colors.primary} />}
      ListHeaderComponent={
        <>
          {header}
          {!failedFirstLoad && (
            <View style={styles.switcher}>
              <RequestViewSwitcher value={view} counts={counts} onChange={setView} labels={{ month: 'Sent this month' }} testID="on-duty-views" />
            </View>
          )}
          {isError && !!data && <StaleNote onRetry={() => { void refetch(); }} />}
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
      renderItem={({ item: row }) =>
        row.kind === 'heading' ? <MonthHeading title={row.title} count={row.count} /> : renderCard(row.item, row.index)
      }
    />
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    pad: { padding: 16, paddingBottom: 32 },
    grow: { flexGrow: 1 },
    switcher: { marginHorizontal: -16, marginBottom: 10 },
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
