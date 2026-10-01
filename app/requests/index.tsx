import React, { useState } from 'react';
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
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { usePermissions } from '../../src/hooks/useRequests';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { pipelineSentence, workflowOff } from '../../src/lib/approval';
import { getRequestWindow } from '../../src/lib/requestWindow';
import { ApprovalTrail, WaitingChip } from '../../src/components/approval/ApprovalTrail';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';
import {
  useShiftStats,
  latePoolView,
  detectionFlags,
  latePoolNames,
  permissionLimitFromStats,
  DEFAULT_FREE_ALLOWANCE,
} from '../../src/hooks/useShiftStats';
import {
  capRulesKnown,
  formatPermissionDuration,
  permissionTypeIcon,
  resolvePermissionLimit,
} from '../../src/lib/permissions';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

type ReqTab = 'live' | 'confirmed';

function currency(n: number) {
  return `₹${(n || 0).toLocaleString('en-IN')}`;
}

export default function RequestsScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const [tab, setTab] = useState<ReqTab>('live');

  // "Now" is read when the screen renders, never once at module load: the app process lives for days.
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  // On the 1st and 2nd last month is still open for a new permission, so one filed for it is listed too (below this month's).
  const graceOpen = getRequestWindow(now).graceOpen;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const employeeId = user?.employeeId ?? null;

  const { data, isLoading, refetch, isRefetching } = usePermissions(employeeId, month, year);
  // No employee id = the query stays off, so nothing is fetched for last month once its grace days are over.
  const {
    data: prevData,
    isLoading: prevLoading,
    refetch: refetchPrev,
    isRefetching: prevRefetching,
  } = usePermissions(graceOpen ? employeeId : null, prevMonth, prevYear);
  const { data: shiftStats } = useShiftStats(month, year);
  // Who approves a permission, and whether HR has switched new ones off (Approval Workflow Control).
  const { data: approvalSummary } = useApprovalSummary();
  const permissionOff = workflowOff(approvalSummary?.permission);

  // Newest first, as the server sends each month: this month's, then last month's.
  const items = [...(data?.items ?? []), ...(graceOpen ? (prevData?.items ?? []) : [])];
  // The allowance card below is about this month only.
  const monthlyUsed = data?.monthlyUsed ?? 0;
  // The company policy / shift-stats summary carry the cap on the new backend; the permission
  // list only once it has a row; the old backend's is 3.
  const monthlyLimit = resolvePermissionLimit(permissionLimitFromStats(shiftStats), data?.monthlyLimit);
  const remaining = Math.max(0, monthlyLimit - monthlyUsed);
  // Late-pool preview with every new field defaulted (freeAllowance ?? 3 and so on), and only the
  // checks HR has switched on (unknown = on).
  const pool = shiftStats ? latePoolView(shiftStats) : null;
  const detect = detectionFlags(shiftStats);
  // Does the server speak the monthly-limit rules (Allowed / Overdue-Excess, the free pool)? An
  // older backend sends no policy, cap/allowance or capStatus/statusLabel, and then the copy
  // below states things neutrally instead of asserting rules it cannot back.
  const capKnown = capRulesKnown({ policy: shiftStats?.policy, summary: shiftStats?.summary, items });
  const statCells: { label: string; value: string; tone?: 'good' | 'bad' }[] = pool
    ? [
        ...(pool.hasBreakdown && detect.lateIn ? [{ label: 'Late-Ins', value: String(pool.lateIn) }] : []),
        ...(pool.hasBreakdown && detect.earlyOut ? [{ label: 'Early-Outs', value: String(pool.earlyOut) }] : []),
        ...(capKnown ? [{ label: 'Excess Permissions', value: String(pool.excess) }] : []),
        { label: 'Free Allowance', value: `${pool.freeUsed}/${pool.freeAllowance}` },
        { label: 'Billable', value: String(pool.billable), tone: pool.billable > 0 ? 'bad' : 'good' },
        { label: 'Shift Deduction', value: String(pool.shiftDeductions), tone: pool.shiftDeductions > 0 ? 'bad' : 'good' },
        { label: 'Salary Cut', value: currency(pool.salaryDeductionAmount), tone: pool.salaryDeductionAmount > 0 ? 'bad' : 'good' },
      ]
    : [
        // Still loading, or the stats call failed: keep the grid's shape with dashes.
        { label: 'Shift Deduction', value: '—' },
        { label: 'Salary Cut', value: '—' },
      ];

  const liveList = items.filter((i) => i.status === 'Pending');
  const confirmedList = items.filter((i) => i.status !== 'Pending');
  const activeList = tab === 'live' ? liveList : confirmedList;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Permission Requests</Text>
          <Text style={styles.headerSubtitle}>Morning Late-In • Evening Early-Out • Middle One-Hour</Text>
        </View>
      </View>

      <FlatList
        data={activeList}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.pad, !activeList.length && styles.center]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching || (graceOpen && prevRefetching)}
            onRefresh={() => { refetch(); if (graceOpen) refetchPrev(); }}
            tintColor={Colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            {/* Usage + deduction stats */}
            <View style={styles.statsCard}>
              <View style={styles.statsTopRow}>
                <View style={styles.usageRing}>
                  <Text style={styles.usageNum}>{remaining}</Text>
                  <Text style={styles.usageLabel}>left</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.usageTitle}>Permissions this month</Text>
                  <Text style={styles.usageSub}>Used {monthlyUsed} of {monthlyLimit}</Text>
                  <View style={styles.policyPill}>
                    <Text style={styles.policyPillText}>Monthly Policy</Text>
                  </View>
                </View>
              </View>
              <View style={styles.statsGrid2}>
                {statCells.map((c) => (
                  <View key={c.label} style={styles.statCell}>
                    <Text style={styles.statCellLabel}>{c.label}</Text>
                    <Text
                      style={[
                        styles.statCellValue,
                        c.tone && { color: c.tone === 'bad' ? Colors.statusRed : Colors.statusGreen },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {c.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* How this is calculated */}
            <View style={styles.calcInfoBox}>
              <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
              {capKnown ? (
                <Text style={styles.calcInfoText}>
                  Each permission is 1 hour. Your first {monthlyLimit} approved permissions in a month are Allowed and
                  protect that day. Any approved beyond that is Overdue / Excess: it does not protect the day and
                  counts as one occurrence toward late deductions.{'\n'}
                  {latePoolNames(detect, pool?.isProduction)} count toward one monthly pool: the first{' '}
                  {pool?.freeAllowance ?? DEFAULT_FREE_ALLOWANCE} are free, the rest are billed as a shift deduction
                  from salary — the same numbers HR sees on the Report Log.
                </Text>
              ) : (
                <Text style={styles.calcInfoText}>
                  {pipelineSentence(approvalSummary?.permission)} Approved permissions and late marks count toward a
                  monthly total; beyond the free amount they are billed as a shift deduction from salary — the same
                  numbers HR sees on the Report Log.
                </Text>
              )}
            </View>

            {/* Tab switch */}
            <View style={styles.tabBar}>
              {([
                { key: 'live' as ReqTab, label: 'Active', count: liveList.length },
                { key: 'confirmed' as ReqTab, label: 'Past Records', count: confirmedList.length },
              ]).map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
                  onPress={() => setTab(t.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                    {t.label} ({t.count})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        }
        ListEmptyComponent={
          isLoading || (graceOpen && prevLoading) ? (
            <View>{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</View>
          ) : (
            <EmptyState
              icon="hand-pointing-right"
              title={tab === 'live' ? 'No active requests' : 'No past records'}
              subtitle="Your permission requests will appear here"
            />
          )
        }
        renderItem={({ item }) => {
          // Outcome badge: Allowed (green) / Pending (grey) / Not Allowed (red) / Overdue-Excess (amber).
          const duration = formatPermissionDuration(item.durationMinutes);
          return (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardIconWrap}>
                  <MaterialCommunityIcons
                    name={permissionTypeIcon(item.typeKey) as any}
                    size={16} color={Colors.tertiary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.type}>{item.typeLabel}</Text>
                  <Text style={styles.dateTime}>
                    {format(new Date(item.date), 'dd MMM yyyy')} · {item.time}
                  </Text>
                </View>
                <Badge label={item.outcomeLabel} variant={item.outcomeBadge} />
              </View>
              {item.reason && <Text style={styles.reason}><Text style={styles.reasonLabel}>Reason: </Text>{item.reason}</Text>}
              {item.outcome === 'excess' && (
                <Text style={styles.excessNote}>
                  Beyond your monthly limit: this does not protect the day and counts toward late deductions.
                </Text>
              )}
              <WaitingChip approval={item.approval} />
              <ApprovalTrail approval={item.approval} />
              <View style={styles.cardFooterRow}>
                <Text style={styles.refText}>Req ID: #PR-{item.id}</Text>
                {!!duration && <Text style={styles.durationText}>{duration}</Text>}
              </View>
            </View>
          );
        }}
      />

      {/* Footer CTA */}
      <View style={styles.footer}>
        <WorkflowOffNote workflow={approvalSummary?.permission} />
        <TouchableOpacity
          style={[styles.newBtn, remaining === 0 && styles.newBtnDisabled, permissionOff && styles.newBtnOff]}
          onPress={() => router.push('/requests/new' as any)}
          activeOpacity={0.85}
          disabled={permissionOff}
        >
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#fff" />
          <Text style={styles.newBtnText}>New Permission Request</Text>
        </TouchableOpacity>
        <Text style={styles.footerHint}>
          {remaining > 0
            ? `${remaining} of ${monthlyLimit} permissions left this month`
            : capKnown
              ? 'Limit reached: further approved permissions are Overdue / Excess'
              : 'Monthly limit reached'}
        </Text>
      </View>
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
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },

  pad: { padding: 16, paddingBottom: 120 },
  center: { flex: 1 },

  statsCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 14,
    gap: 14,
    ...cardShadow,
  },
  statsTopRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  usageRing: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Colors.primary,
  },
  usageNum: { color: Colors.primary, fontSize: 18, fontWeight: '900' },
  usageLabel: { color: Colors.primary, fontSize: 8, fontWeight: '700', marginTop: -2 },
  usageTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  usageSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: 6 },
  policyPill: { alignSelf: 'flex-start', backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  policyPillText: { color: Colors.textSecondary, fontSize: 9.5, fontWeight: '800' },

  statsGrid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: { flexBasis: '30%', flexGrow: 1, backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 10, gap: 2 },
  statCellLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700' },
  statCellValue: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 16 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    gap: 4,
    marginBottom: 12,
    ...cardShadow,
  },
  tabBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  tabLabelActive: { color: '#fff' },

  card: { backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10, gap: 8, ...cardShadow },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.badgeYellowBg, alignItems: 'center', justifyContent: 'center' },
  type: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14.5 },
  dateTime: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },
  reason: { color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },
  reasonLabel: { color: Colors.textPrimary, fontWeight: '700' },
  excessNote: { color: Colors.badgeYellowText, fontSize: 11.5, lineHeight: 16 },
  refText: { color: Colors.outline, fontSize: 10.5, fontWeight: '700' },

  footer: { padding: 16, paddingTop: 10, backgroundColor: Colors.bgLight, borderTopWidth: 1, borderTopColor: Colors.border, gap: 6 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 15,
  },
  newBtnDisabled: { opacity: 0.7 },
  newBtnOff: { opacity: 0.5 },
  newBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  footerHint: { textAlign: 'center', color: Colors.textMuted, fontSize: 11 },

  calcInfoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 12,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  calcInfoText: { flex: 1, color: Colors.textMuted, fontSize: 11.5, lineHeight: 16 },

  cardFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  durationText: { color: Colors.primary, fontSize: 10.5, fontWeight: '800' },
});
