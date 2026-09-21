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
import { useMissingPunch, PUNCH_SLOT_LABEL, type MissingPunchItem } from '../../src/hooks/useRequests';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';

const now = new Date();
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

const SLOT_ICON: Record<string, string> = {
  morning_in: 'login',
  lunch_out: 'silverware-fork-knife',
  lunch_in: 'silverware-fork-knife',
  evening_out: 'logout',
};

export default function MissingPunchScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const { data, isLoading, refetch, isRefetching } = useMissingPunch(user?.employeeId ?? null, month, year);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    const atCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
    if (atCurrent) return;
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const atCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const items = data ?? [];
  const totalCount = items.length;
  const activeItems = items.filter((i) => i.status === 'pending_hod' || i.status === 'pending_hr');
  const historyItems = items.filter((i) => i.status === 'approved' || i.status === 'rejected');
  const pendingCount = activeItems.length;
  const approvedCount = items.filter((i) => i.status === 'approved').length;
  const rejectedCount = items.filter((i) => i.status === 'rejected').length;
  const visibleItems = tab === 'active' ? activeItems : historyItems;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Missing Punch</Text>
          <Text style={styles.headerSubtitle}>Biometric punch regularization</Text>
        </View>
      </View>

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.pad, !visibleItems.length && styles.center]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.introCard}>
              <View style={styles.introIconWrap}>
                <MaterialCommunityIcons name="fingerprint" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.introTitle}>Missing Punch Regularization</Text>
                <Text style={styles.introBody}>
                  Forgot to punch in or out? Submit the date, time and reason — your Department Head reviews it first,
                  then HR gives the final approval.
                </Text>
              </View>
            </View>

            <View style={styles.monthRow}>
              <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={Colors.primary} />
              </TouchableOpacity>
              <View style={styles.monthLabelWrap}>
                <MaterialCommunityIcons name="calendar-month-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.monthLabel}>{MONTHS[month - 1]} {year}</Text>
              </View>
              <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn} disabled={atCurrentMonth}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={atCurrentMonth ? Colors.outlineVariant : Colors.primary} />
              </TouchableOpacity>
              {atCurrentMonth && (
                <View style={styles.activePeriodPill}>
                  <Text style={styles.activePeriodText}>Active Period</Text>
                </View>
              )}
            </View>

            <View style={styles.summaryGrid}>
              {[
                { label: 'Total', value: totalCount, color: Colors.textPrimary },
                { label: 'Pending', value: pendingCount, color: Colors.statusYellow },
                { label: 'Approved', value: approvedCount, color: Colors.statusGreen },
                { label: 'Rejected', value: rejectedCount, color: Colors.statusRed },
              ].map(({ label, value, color }) => (
                <View key={label} style={styles.summaryBox}>
                  <Text style={[styles.summaryNum, { color }, TabularNums]}>{value}</Text>
                  <Text style={styles.summaryLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabBtn, tab === 'active' && styles.tabBtnActive]}
                onPress={() => setTab('active')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabBtnText, tab === 'active' && styles.tabBtnTextActive]}>Active Requests</Text>
                <View style={[styles.tabCountPill, tab === 'active' && styles.tabCountPillActive]}>
                  <Text style={[styles.tabCountText, tab === 'active' && styles.tabCountTextActive]}>{activeItems.length}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, tab === 'history' && styles.tabBtnActive]}
                onPress={() => setTab('history')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabBtnText, tab === 'history' && styles.tabBtnTextActive]}>History & Resolved</Text>
                <View style={[styles.tabCountPill, tab === 'history' && styles.tabCountPillActive]}>
                  <Text style={[styles.tabCountText, tab === 'history' && styles.tabCountTextActive]}>{historyItems.length}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <View>{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</View>
          ) : (
            <EmptyState
              icon="fingerprint"
              title={tab === 'active' ? 'No active requests' : 'No resolved requests'}
              subtitle={tab === 'active' ? 'Requests awaiting review will appear here' : 'Approved and rejected requests will appear here'}
            />
          )
        }
        renderItem={({ item }: { item: MissingPunchItem }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardTopLeft}>
                <View style={styles.slotIconWrap}>
                  <MaterialCommunityIcons name={(item.punchSlot ? SLOT_ICON[item.punchSlot] : 'fingerprint') as any} size={16} color={Colors.categoryPunch} />
                </View>
                <View>
                  <Text style={styles.type}>
                    {item.punchSlot ? PUNCH_SLOT_LABEL[item.punchSlot] : (item.punchType === 'IN' ? 'Check-In' : 'Check-Out')}
                  </Text>
                  <Text style={styles.dateTime}>{format(new Date(item.date), 'EEE, dd MMM yyyy')} · {item.punchTime}</Text>
                </View>
              </View>
              <Badge label={STAGE_LABEL[item.status]} variant={badgeVariant(item.status)} />
            </View>

            {item.reason && (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonQuote}>"</Text>
                <Text style={styles.reason}>{item.reason}</Text>
              </View>
            )}

            {(item.hodReviewedBy || item.hrReviewedBy) && (
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
            )}

            <View style={styles.cardFooter}>
              <Text style={styles.refText}>#MP-{item.id}</Text>
              {item.status === 'approved' && <Text style={styles.approvedHint}>Added to your attendance</Text>}
            </View>
          </View>
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/missing-punch/report')} activeOpacity={0.85}>
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
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 19 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },

  pad: { padding: 16, paddingBottom: 100 },
  center: { flex: 1 },

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

  monthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 8, paddingHorizontal: 8,
    marginBottom: 12,
    ...cardShadow,
  },
  monthNavBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  monthLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' },
  monthLabel: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  activePeriodPill: { backgroundColor: Colors.badgeBlueBg, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  activePeriodText: { color: Colors.categoryTracking, fontSize: 10, fontWeight: '800' },

  summaryGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryBox: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
    ...cardShadow,
  },
  summaryNum: { fontFamily: FontFamily.displayBold, fontSize: 19 },
  summaryLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },

  tabRow: {
    flexDirection: 'row', gap: 6,
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.lg,
    padding: 4,
    marginBottom: 14,
  },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: BorderRadius.md },
  tabBtnActive: { backgroundColor: Colors.bgCard, ...cardShadow },
  tabBtnText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  tabBtnTextActive: { color: Colors.primary },
  tabCountPill: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabCountPillActive: { backgroundColor: Colors.primary },
  tabCountText: { color: Colors.textMuted, fontSize: 10, fontWeight: '800' },
  tabCountTextActive: { color: '#fff' },

  card: { backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10, gap: 10, ...cardShadow },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
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
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refText: { color: Colors.outline, fontSize: 10.5, fontWeight: '700' },
  approvedHint: { color: Colors.statusGreen, fontSize: 11, fontWeight: '600' },

  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
});
