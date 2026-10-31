import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useOutpassRequests, OUTPASS_PASS_TYPE_LABEL, type OutpassRequestItem } from '../../src/hooks/useOutpass';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { useNow } from '../../src/components/journey/useNow';
import { workflowOff } from '../../src/lib/approval';
import { defaultView, rowsForView, viewCounts, type RequestView } from '../../src/lib/requestViews';
import { emptyViewText, monthSections, outpassDay, outpassViewOptions } from '../../src/lib/myRequests';
import { outpassRowLabel, pickOpenPass } from '../../src/lib/outpassOpen';
import { WaitingChip } from '../../src/components/approval/ApprovalTrail';
import { deciderFromFields } from '../../src/lib/approvalsDecider';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';
import { OutpassFlipCard } from '../../src/components/outpass/OutpassFlipCard';
import { OpenPassBanner } from '../../src/components/outpass/OpenPassBanner';
import { TeaBreakPanel } from '../../src/components/tea-break/TeaBreakPanel';
import { RequestViewSwitcher } from '../../src/components/requests/RequestViewSwitcher';
import { ListSkeleton, LoadError, MonthHeading, StaleNote } from '../../src/components/myrequests/ListStates';
import { Reveal } from '../../src/components/Reveal';
import { BottomSheet } from '../../src/components/ui/BottomSheet';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

type Section = 'outpass' | 'teaBreak';

type Row =
  | { kind: 'heading'; key: string; title: string; count: number }
  | { kind: 'item'; key: string; item: OutpassRequestItem; index: number };

const APPROVER_LABEL: Record<string, string> = { dept_head: 'HOD', hr: 'HR', system: 'On-Duty approval' };

export default function OutpassScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const [section, setSection] = useState<Section>('outpass');
  const [previewItem, setPreviewItem] = useState<OutpassRequestItem | null>(null);

  const { data: employee } = useEmployee(user?.employeeId ?? null);
  const { data, isLoading, isError, refetch, isRefetching } = useOutpassRequests(user?.employeeId ?? null);
  // Whether HR has switched new outpass requests off (Approval Workflow Control).
  const { data: approvalSummary } = useApprovalSummary();
  const outpassOff = workflowOff(approvalSummary?.outpass);
  // Re-checks every 10 s which pass is open, so a pass whose 60-minute exit window ran out stops being pinned.
  const now = useNow(10_000);

  const items = data ?? [];
  const opts = outpassViewOptions<OutpassRequestItem>(new Date(now));
  const counts = viewCounts(items, opts);

  const [view, setView] = useState<RequestView>('waiting');
  const chosen = useRef(false);
  useEffect(() => {
    if (!chosen.current && data) {
      chosen.current = true;
      setView(defaultView(counts));
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // The gate pass open right now - out and not back yet, or approved and its exit QR still valid (either source:
  // a manual request, or one an On-Duty approval raised). Pinned at the top (owner, 2026-10-31).
  const openPass = pickOpenPass(items, now);

  const visible = rowsForView(items, view, opts);
  const rows: Row[] = [];
  if (view === 'approved' || view === 'rejected') {
    let i = 0;
    for (const s of monthSections(visible, outpassDay)) {
      rows.push({ kind: 'heading', key: `h-${s.key}`, title: s.title, count: s.rows.length });
      for (const item of s.rows) rows.push({ kind: 'item', key: String(item.id), item, index: i++ });
    }
  } else {
    visible.forEach((item, index) => rows.push({ kind: 'item', key: String(item.id), item, index }));
  }

  const empty = emptyViewText(view, 'outpasses', 'taken this month');
  const failedFirstLoad = isError && !data;

  const renderCard = (item: OutpassRequestItem, index: number) => {
    const badge = outpassRowLabel(item);
    const isOpen = openPass?.id === item.id;
    return (
      <Reveal index={index}>
        <View style={[styles.card, isOpen && styles.cardOpen]}>
          <View style={styles.cardTop}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="exit-run" size={16} color={Colors.categoryOutpass} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.destination} numberOfLines={1}>{item.destination}</Text>
              {!!item.passType && (
                <Text style={styles.passType}>{OUTPASS_PASS_TYPE_LABEL[item.passType] ?? item.passType}</Text>
              )}
            </View>
            <Badge label={badge.label} variant={badge.variant} />
          </View>
          <Text style={styles.reason}>{item.reason}</Text>
          <WaitingChip
            approval={item.approval}
            fallback={deciderFromFields({
              status: item.status,
              name: item.approvedBy,
              role: item.approverRole,
              at: item.approvedAt,
            })}
          />
          {(item.exitedAt || item.enteredAt) && (
            <View style={styles.gateRow}>
              {item.exitedAt && (
                <Text style={styles.gateText}>
                  <MaterialCommunityIcons name="logout" size={12} color={Colors.textMuted} /> Out {format(new Date(item.exitedAt), 'h:mm a')}
                </Text>
              )}
              {item.enteredAt && (
                <Text style={styles.gateText}>
                  <MaterialCommunityIcons name="login" size={12} color={Colors.textMuted} /> Back {format(new Date(item.enteredAt), 'h:mm a')}
                </Text>
              )}
            </View>
          )}
          <View style={styles.cardBottom}>
            <Text style={styles.dateTime}>
              {format(new Date(item.createdAt), 'dd MMM yyyy · h:mm a')}
              {item.source === 'on_duty' && ' · from On-Duty'}
              {item.approverRole && item.status === 'approved' && ` · Approved by ${APPROVER_LABEL[item.approverRole] ?? item.approverRole}`}
            </Text>
            <TouchableOpacity
              style={styles.previewBtn}
              onPress={() => setPreviewItem(item)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Open the pass card for ${item.destination}`}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="card-account-details-outline" size={15} color={Colors.primary} />
              <Text style={styles.previewBtnText}>Open card</Text>
            </TouchableOpacity>
          </View>
        </View>
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
          <Text style={styles.headerTitle}>Gate Outpass</Text>
          <Text style={styles.headerSubtitle}>Digital Transit Clearance</Text>
        </View>
      </View>

      {/* Outpass and Tea Break are two independent bodies sharing this one screen/route. */}
      <View style={styles.sectionBar} accessibilityRole="tablist">
        {([
          { key: 'outpass' as Section, label: 'Outpass' },
          { key: 'teaBreak' as Section, label: 'Tea Break' },
        ]).map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sectionBtn, section === s.key && styles.sectionBtnActive]}
            onPress={() => setSection(s.key)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === s.key }}
          >
            <Text style={[styles.sectionLabel, section === s.key && styles.sectionLabelActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {section === 'teaBreak' ? (
        <ScrollView contentContainerStyle={styles.pad}>
          <TeaBreakPanel employeeId={user?.employeeId ?? null} />
        </ScrollView>
      ) : (
        <FlatList
          data={failedFirstLoad || isLoading ? [] : rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={[styles.pad, !rows.length && styles.grow]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={Colors.primary} />
          }
          ListHeaderComponent={
            <>
              {openPass && (
                <Reveal index={0} offsetY={14}>
                  <View style={styles.openHead}>
                    <MaterialCommunityIcons name="pin" size={14} color={Colors.primary} />
                    <Text style={styles.openHeadText}>OPEN GATE PASS</Text>
                  </View>
                  <OpenPassBanner pass={openPass} />
                  <OutpassFlipCard request={openPass} employee={employee} />
                </Reveal>
              )}

              <WorkflowOffNote workflow={approvalSummary?.outpass} style={styles.offNote} />

              {!failedFirstLoad && (
                <View style={styles.switcher}>
                  <RequestViewSwitcher
                    value={view}
                    counts={counts}
                    onChange={setView}
                    labels={{ month: 'Taken this month' }}
                    testID="outpass-views"
                  />
                </View>
              )}
              {isError && !!data && <StaleNote onRetry={() => { void refetch(); }} />}
            </>
          }
          ListEmptyComponent={
            isLoading ? (
              <ListSkeleton />
            ) : failedFirstLoad ? (
              <LoadError what="your outpasses" onRetry={() => { void refetch(); }} retrying={isRefetching} />
            ) : (
              <EmptyState icon="exit-run" title={empty.title} subtitle={empty.subtitle} />
            )
          }
          renderItem={({ item: row }) =>
            row.kind === 'heading' ? <MonthHeading title={row.title} count={row.count} /> : renderCard(row.item, row.index)
          }
        />
      )}

      {section === 'outpass' && (
        <>
          <TouchableOpacity
            style={[styles.fab, outpassOff && styles.fabOff]}
            onPress={() => router.push('/outpass/request' as any)}
            activeOpacity={0.85}
            disabled={outpassOff}
            accessibilityRole="button"
            accessibilityLabel="Ask for a new outpass"
            testID="outpass-new"
          >
            <MaterialCommunityIcons name="plus" size={26} color="#fff" />
          </TouchableOpacity>

          {/* Outpass card preview - any request, any status, opened from its row */}
          <BottomSheet visible={!!previewItem} onClose={() => setPreviewItem(null)} title="Outpass Card">
            {previewItem && <OutpassFlipCard request={previewItem} employee={employee} />}
          </BottomSheet>
        </>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },

  pad: { padding: 16, paddingBottom: 100 },
  grow: { flexGrow: 1 },
  switcher: { marginHorizontal: -16, marginBottom: 10 },

  sectionBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    gap: 4,
  },
  sectionBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 11, alignItems: 'center' },
  sectionBtnActive: { backgroundColor: Colors.primary },
  sectionLabel: { color: Colors.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  sectionLabelActive: { color: '#fff' },

  openHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  openHeadText: { color: Colors.primary, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8 },

  card: { backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10, gap: 6 },
  cardOpen: { borderColor: Colors.primary, borderWidth: 1.5 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.bgSurfaceLow, alignItems: 'center', justifyContent: 'center' },
  destination: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 15 },
  passType: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  dateTime: { color: Colors.textMuted, fontSize: 12, flex: 1 },
  reason: { color: Colors.textSecondary, fontSize: 13 },
  gateRow: { flexDirection: 'row', gap: 14 },
  gateText: { color: Colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, gap: 8 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 36 },
  previewBtnText: { color: Colors.primary, fontSize: 12, fontWeight: '700' },

  fab: {
    position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  fabOff: { opacity: 0.5 },
  offNote: { marginBottom: 12 },
});
