import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAdvanceEligibility, useMyAdvances, type AdvanceEligibility } from '../../src/hooks/useAdvances';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Skeleton, SkeletonCard } from '../../src/components/ui/Skeleton';
import { Reveal } from '../../src/components/Reveal';
import { RecordCard } from '../../src/components/settlement/RecordCard';
import { ErrorBox, TypeIcon, WindowBanner } from '../../src/components/settlement/parts';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, ClayElevation } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import {
  STATUS_FILTERS,
  TYPE_FILTERS,
  filterRecords,
  recordTotals,
  rupees,
  statusCounts,
  type StatusFilter,
  type TypeFilter,
} from '../../src/lib/settlement';

/** Advances & Loans: apply for a Salary Advance or a Term Loan (20th to month end) and follow every application,
 *  repayment and deduction. The server decides every rule (mobile_settlement_views.py); this screen words it. */
export default function SettlementScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const eligibility = useAdvanceEligibility();
  const records = useMyAdvances();
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const rows = useMemo(() => records.data ?? [], [records.data]);
  const shown = useMemo(() => filterRecords(rows, type, status), [rows, type, status]);
  const counts = useMemo(() => statusCounts(rows, type), [rows, type]);
  const totals = useMemo(() => recordTotals(rows), [rows]);

  const refreshing = (eligibility.isRefetching || records.isRefetching) && !eligibility.isLoading && !records.isLoading;
  const refresh = () => {
    void eligibility.refetch();
    void records.refetch();
  };

  const header = (
    <View style={{ gap: 14 }}>
      <Reveal index={0}>
        <View style={styles.intro}>
          <Text style={styles.introTitle}>Need money before payday?</Text>
          <Text style={styles.introText}>
            A <Text style={styles.bold}>Salary Advance</Text> is up to 60% of your monthly salary, taken back in full from
            this month's salary. A <Text style={styles.bold}>Term Loan</Text> is a larger amount you repay in monthly EMIs
            (1 to 12 months) from next month. HR approves every application.
          </Text>
        </View>
      </Reveal>

      {eligibility.isLoading ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={104} borderRadius={16} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Skeleton height={168} borderRadius={16} style={{ flex: 1 }} />
            <Skeleton height={168} borderRadius={16} style={{ flex: 1 }} />
          </View>
        </View>
      ) : eligibility.isError || !eligibility.data ? (
        <ErrorBox text="Could not check whether applications are open." onRetry={() => void eligibility.refetch()} />
      ) : (
        <>
          <Reveal index={1}>
            <WindowBanner window={eligibility.data.window} today={eligibility.data.today} />
          </Reveal>
          {!!eligibility.data.workflowMessage && (
            <View style={styles.offNote}>
              <MaterialCommunityIcons name="pause-circle-outline" size={16} color={Colors.badgeYellowText} />
              <Text style={styles.offNoteText}>{eligibility.data.workflowMessage}</Text>
            </View>
          )}
          <Reveal index={2}>
            <ApplyCards data={eligibility.data} />
          </Reveal>
        </>
      )}

      <Reveal index={3}>
        <View style={styles.recordsHead}>
          <Text style={styles.sectionTitle}>My applications</Text>
          {rows.length > 0 && (
            <Text style={styles.sectionMeta}>
              {rows.length} record{rows.length === 1 ? '' : 's'}
            </Text>
          )}
        </View>
      </Reveal>

      {rows.length > 0 && (
        <Reveal index={4}>
          <View style={styles.totals}>
            <Total label="Still owed" value={rupees(totals.owed)} color={totals.owed > 0 ? Colors.statusRed : Colors.statusGreen} />
            <View style={styles.totalDivider} />
            <Total label="Repaid so far" value={rupees(totals.repaid)} color={Colors.textPrimary} />
            <View style={styles.totalDivider} />
            <Total
              label="Waiting for HR"
              value={String(totals.waiting)}
              color={totals.waiting ? Colors.statusYellow : Colors.textPrimary}
            />
          </View>
        </Reveal>
      )}

      {rows.length > 0 && (
        <View style={{ gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {TYPE_FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} active={type === f.key} onPress={() => setType(f.key)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {STATUS_FILTERS.map((f) => (
              <Chip
                key={f.key}
                label={`${f.label} ${counts[f.key]}`}
                active={status === f.key}
                onPress={() => setStatus(f.key)}
                subtle
              />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Advances & Loans</Text>
          <Text style={styles.headerSubtitle}>Salary Advance · Term Loan</Text>
        </View>
      </View>

      <FlatList
        data={records.isLoading || records.isError ? [] : shown}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.pad}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={<View style={{ marginBottom: 14 }}>{header}</View>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
        renderItem={({ item, index }) => (
          <Reveal index={index}>
            <RecordCard
              item={item}
              onPress={() => router.push({ pathname: '/settlement/[id]', params: { id: String(item.id) } })}
            />
          </Reveal>
        )}
        ListEmptyComponent={
          records.isLoading ? (
            <View>
              {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}
            </View>
          ) : records.isError ? (
            <ErrorBox text="Could not load your applications." onRetry={() => void records.refetch()} />
          ) : rows.length === 0 ? (
            <View style={{ minHeight: 220 }}>
              <EmptyState
                icon="cash-multiple"
                title="No applications yet"
                subtitle="Every Salary Advance and Term Loan you apply for, with its repayments, will be listed here."
              />
            </View>
          ) : (
            <View style={styles.noMatch}>
              <Text style={styles.noMatchText}>Nothing matches these filters.</Text>
              <TouchableOpacity
                onPress={() => {
                  setType('all');
                  setStatus('all');
                }}
                accessibilityRole="button"
              >
                <Text style={styles.link}>Show all</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={{ height: 12 }} />;
}

function ApplyCards({ data }: { data: AdvanceEligibility }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const sa = data.salaryAdvance;
  const tl = data.termLoan;

  const cards = [
    {
      key: 'general' as const,
      title: 'Salary Advance',
      line: sa.limit != null ? `Up to ${rupees(sa.limit)}` : 'Up to 60% of salary',
      sub: `Deducted from ${sa.deductionLabel} salary`,
      can: sa.canApply,
      reason: sa.reason,
    },
    {
      key: 'term' as const,
      title: 'Term Loan',
      line: `${tl.minMonths} to ${tl.maxMonths} months EMI`,
      sub: `EMIs start ${tl.firstDeductionLabel}`,
      can: tl.canApply,
      reason: tl.reason,
    },
  ];
  // The window / switched-off / inactive reason is the same for both cards and is already shown above, so only a
  // card's OWN reason (no salary on record, one already this month, a loan still waiting) is spelled out here.
  const shared = !data.window.isOpen || !!data.workflowMessage || !data.employeeActive;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {cards.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.applyCard, !c.can && styles.applyCardOff]}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/settlement/apply', params: { type: c.key } })}
            accessibilityRole="button"
            accessibilityLabel={`${c.title}. ${c.line}. ${c.sub}. ${c.can ? 'Apply' : c.reason ?? 'Not available now'}`}
          >
            <TypeIcon type={c.key} size={42} />
            <Text style={styles.applyTitle}>{c.title}</Text>
            <Text style={[styles.applyLine, TabularNums]}>{c.line}</Text>
            <Text style={styles.applySub}>{c.sub}</Text>
            <View style={[styles.applyBtn, { backgroundColor: c.can ? Colors.primary : Colors.bgSurfaceHigh }]}>
              <Text style={[styles.applyBtnText, { color: c.can ? Colors.onPrimary : Colors.textMuted }]}>
                {c.can ? 'Apply' : 'See details'}
              </Text>
              <MaterialCommunityIcons name="arrow-right" size={14} color={c.can ? Colors.onPrimary : Colors.textMuted} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
      {!shared &&
        cards
          .filter((c) => !c.can && c.reason)
          .map((c) => (
            <View key={c.key} style={styles.reason}>
              <MaterialCommunityIcons name="information-outline" size={15} color={Colors.textSecondary} />
              <Text style={styles.reasonText}>
                <Text style={styles.bold}>{c.title}: </Text>
                {c.reason}
              </Text>
            </View>
          ))}
    </View>
  );
}

function Total({ label, value, color }: { label: string; value: string; color: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.totalCell}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, TabularNums, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function Chip({ label, active, onPress, subtle }: { label: string; active: boolean; onPress: () => void; subtle?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, subtle && styles.chipSubtle, active && styles.chipActive]}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
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
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },
  pad: { padding: 16, paddingBottom: 40 },
  bold: { fontFamily: FontFamily.bodySemibold, color: Colors.textPrimary },

  intro: { gap: 6 },
  introTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 20 },
  introText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },

  offNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.badgeYellowBg, borderRadius: BorderRadius.lg, padding: 12,
  },
  offNoteText: { flex: 1, color: Colors.badgeYellowText, fontSize: 12, lineHeight: 17, fontWeight: '600' },

  applyCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 4,
    ...ClayElevation.low,
  },
  applyCardOff: { opacity: 0.88 },
  applyTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 15, marginTop: 8 },
  applyLine: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  applySub: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16, minHeight: 32 },
  applyBtn: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderRadius: BorderRadius.md, paddingVertical: 9,
  },
  applyBtnText: { fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  reason: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.lg, padding: 10,
  },
  reasonText: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 17 },

  recordsHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 },
  sectionTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 16 },
  sectionMeta: { color: Colors.textMuted, fontSize: 12 },

  totals: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 14,
    ...ClayElevation.low,
  },
  totalCell: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 6 },
  totalDivider: { width: 1, backgroundColor: Colors.outlineVariant },
  totalLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700' },
  totalValue: { fontFamily: FontFamily.displayBold, fontSize: 17 },

  chipRow: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
  },
  chipSubtle: { paddingVertical: 5 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontSize: 12.5, fontFamily: FontFamily.bodySemibold },
  chipTextActive: { color: Colors.onPrimary },

  noMatch: { alignItems: 'center', gap: 6, paddingVertical: 28 },
  noMatchText: { color: Colors.textMuted, fontSize: 13 },
  link: { color: Colors.primaryLight, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
});
