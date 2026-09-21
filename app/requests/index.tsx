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
import { useShiftStats } from '../../src/hooks/useShiftStats';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

const now = new Date();

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

  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data, isLoading, refetch, isRefetching } = usePermissions(user?.employeeId ?? null, month, year);
  const { data: shiftStats } = useShiftStats(month, year);

  const items = data?.items ?? [];
  const monthlyUsed = data?.monthlyUsed ?? 0;
  const monthlyLimit = data?.monthlyLimit ?? 3;
  const remaining = Math.max(0, monthlyLimit - monthlyUsed);
  const dailyLimit = data?.dailyLimit ?? 1;
  const weeklyLimit = data?.weeklyLimit ?? 2;

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
          <Text style={styles.headerSubtitle}>Late In • Early Out • Short Leave</Text>
        </View>
      </View>

      <FlatList
        data={activeList}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.pad, !activeList.length && styles.center]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
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
                  <Text style={styles.usageSub}>Quota used {monthlyUsed} of {monthlyLimit}</Text>
                  <View style={styles.policyPill}>
                    <Text style={styles.policyPillText}>Monthly Policy</Text>
                  </View>
                </View>
              </View>
              <View style={styles.statsGrid2}>
                <View style={styles.statCell}>
                  <Text style={styles.statCellLabel}>Weekly Cap</Text>
                  <Text style={styles.statCellValue}>{weeklyLimit}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellLabel}>Daily Cap</Text>
                  <Text style={styles.statCellValue}>{dailyLimit}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellLabel}>Shift Deduction</Text>
                  <Text style={[styles.statCellValue, { color: Colors.statusGreen }]}>{shiftStats?.summary.shiftDeductions ?? '—'}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statCellLabel}>Salary Cut</Text>
                  <Text style={[styles.statCellValue, { color: Colors.statusGreen }]}>
                    {shiftStats ? currency(shiftStats.summary.salaryDeductionAmount) : '—'}
                  </Text>
                </View>
              </View>
            </View>

            {/* How this is calculated */}
            <View style={styles.calcInfoBox}>
              <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
              <Text style={styles.calcInfoText}>
                Every employee gets 3 free lates/permissions a month (combined pool). Each additional 3 beyond that
                costs a ¼ shift deduction from salary — the same rule and numbers HR sees on the Report Log.
              </Text>
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
          isLoading ? (
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
          const variant = item.status === 'Approved' ? 'approved' : item.status === 'Rejected' ? 'rejected' : 'pending';
          return (
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardIconWrap}>
                  <MaterialCommunityIcons
                    name={item.type === 'Early Out' ? 'exit-run' : item.type === 'Late In' ? 'login' : 'timer-sand'}
                    size={16} color={Colors.tertiary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.type}>{item.type}</Text>
                  <Text style={styles.dateTime}>
                    {format(new Date(item.date), 'dd MMM yyyy')} · {item.time}
                  </Text>
                </View>
                <Badge label={item.status} variant={variant} />
              </View>
              {item.reason && <Text style={styles.reason}><Text style={styles.reasonLabel}>Reason: </Text>{item.reason}</Text>}
              <View style={styles.cardFooterRow}>
                <Text style={styles.refText}>Req ID: #PR-{item.id}</Text>
                {!!item.durationMinutes && <Text style={styles.durationText}>{item.durationMinutes} min</Text>}
              </View>
            </View>
          );
        }}
      />

      {/* Footer CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.newBtn, remaining === 0 && styles.newBtnDisabled]}
          onPress={() => router.push('/requests/new' as any)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#fff" />
          <Text style={styles.newBtnText}>New Permission Request</Text>
        </TouchableOpacity>
        <Text style={styles.footerHint}>
          {remaining} free quota remaining this calendar cycle
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
  statCell: { flexBasis: '47%', flexGrow: 1, backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 10, gap: 2 },
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
  refText: { color: Colors.outline, fontSize: 10.5, fontWeight: '700' },

  footer: { padding: 16, paddingTop: 10, backgroundColor: Colors.bgLight, borderTopWidth: 1, borderTopColor: Colors.border, gap: 6 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 15,
  },
  newBtnDisabled: { opacity: 0.7 },
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
