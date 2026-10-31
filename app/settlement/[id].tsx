import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useMyAdvance, type MyAdvance, type ScheduleRow, type TimelineEvent } from '../../src/hooks/useAdvances';
import { Skeleton } from '../../src/components/ui/Skeleton';
import { Reveal } from '../../src/components/Reveal';
import { applyDate } from '../../src/components/settlement/RecordCard';
import { Bar, ErrorBox, RingMeter, StatusPill, TypeIcon } from '../../src/components/settlement/parts';
import { DecisionBadge } from '../../src/components/approval/ApprovalTrail';
import { deciderForAdvance } from '../../src/lib/approvalsDecider';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, ClayElevation } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import { monthLabel, repaidRatio, rupees } from '../../src/lib/settlement';

/** One application in full: asked vs approved, the deduction months (deducted / due / upcoming) and what happened. */
export default function AdvanceDetailScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = Number(id);
  const query = useMyAdvance(Number.isFinite(numericId) && numericId > 0 ? numericId : null);
  const a = query.data;

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
          <Text style={styles.headerTitle}>{a?.typeLabel ?? 'Application'}</Text>
          <Text style={styles.headerSubtitle}>{a?.createdAt ? `Applied ${applyDate(a.createdAt)}` : 'Advances & Loans'}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isLoading}
            onRefresh={() => void query.refetch()}
            tintColor={Colors.primary}
          />
        }
      >
        {query.isLoading && !a ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={170} borderRadius={16} />
            <Skeleton height={200} borderRadius={16} />
            <Skeleton height={160} borderRadius={16} />
          </View>
        ) : !a ? (
          <ErrorBox
            text={query.isError ? 'Could not load this application.' : 'This application was not found.'}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <Detail a={a} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ a }: { a: MyAdvance }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const decided = a.status === 'approved' || a.status === 'closed';
  const ratio = decided ? repaidRatio(a.amount, a.deductedTotal) : 0;
  const ringColor = a.status === 'closed' ? Colors.statusGreen : a.status === 'rejected' ? Colors.statusRed : Colors.primaryLight;

  return (
    <View style={{ gap: 14 }}>
      <Reveal index={0}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <TypeIcon type={a.advanceType} />
            <View style={{ flex: 1 }}>
              <Text style={styles.heroType}>{a.typeLabel}</Text>
              {!!a.purpose && <Text style={styles.heroPurpose} numberOfLines={2}>{a.purpose}</Text>}
            </View>
            <StatusPill status={a.status} advanceType={a.advanceType} deductedTotal={a.deductedTotal} />
          </View>

          <View style={styles.heroBody}>
            <RingMeter ratio={ratio} color={ringColor} size={108} stroke={11}>
              {decided ? (
                <>
                  <Text style={[styles.ringPct, TabularNums, { color: ringColor }]}>{Math.round(ratio * 100)}%</Text>
                  <Text style={styles.ringSmall}>repaid</Text>
                </>
              ) : (
                <MaterialCommunityIcons
                  name={a.status === 'rejected' ? 'close-circle-outline' : 'timer-sand'}
                  size={30}
                  color={ringColor}
                />
              )}
            </RingMeter>
            <View style={{ flex: 1, gap: 8 }}>
              <Figure label="Asked for" value={rupees(a.requestedAmount)} />
              <Figure
                label="Approved"
                value={a.approvedAmount != null ? rupees(a.approvedAmount) : a.status === 'rejected' ? 'Not approved' : 'Waiting for HR'}
                tone={a.approvedLess ? Colors.badgeYellowText : undefined}
              />
              {decided && (
                <Figure
                  label="Still owed"
                  value={rupees(a.balanceDue)}
                  tone={a.balanceDue > 0 ? Colors.statusRed : Colors.statusGreen}
                />
              )}
            </View>
          </View>

          <DecisionBadge decider={deciderForAdvance(a)} style={{ marginTop: 12 }} />

          {a.approvedLess && (
            <View style={styles.lessNote}>
              <MaterialCommunityIcons name="information-outline" size={15} color={Colors.badgeYellowText} />
              <Text style={styles.lessText}>
                HR approved {rupees(a.amount)} of the {rupees(a.requestedAmount)} you asked for. Deductions follow the
                approved amount.
              </Text>
            </View>
          )}
        </View>
      </Reveal>

      {a.status !== 'rejected' && (
        <Reveal index={1}>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Repayment</Text>
              {!!a.deductionLabel && <Text style={styles.cardMeta}>{a.deductionLabel}</Text>}
            </View>
            {a.advanceType === 'term' && a.emiAmount > 0 && (
              <Text style={styles.cardText}>
                {rupees(a.emiAmount)} a month{a.repaymentMonths ? ` for ${a.repaymentMonths} month${a.repaymentMonths === 1 ? '' : 's'}` : ''}
                , the last EMI covering what is left.
              </Text>
            )}
            {a.advanceType === 'general' && (
              <Text style={styles.cardText}>Deducted in full from one month's salary.</Text>
            )}
            {a.scheduleIsEstimate && (
              <Text style={[styles.cardText, { color: Colors.badgeYellowText }]}>
                Planned schedule. It becomes final when HR approves (HR may change the amount or the start month).
              </Text>
            )}
            {decided && (
              <View style={{ gap: 4 }}>
                <Bar ratio={ratio} color={ringColor} />
                <Text style={[styles.cardMeta, TabularNums]}>
                  {rupees(a.deductedTotal)} deducted of {rupees(a.amount)}
                </Text>
              </View>
            )}
            {a.schedule.length === 0 ? (
              <Text style={styles.cardText}>No deductions are scheduled.</Text>
            ) : (
              <View style={{ marginTop: 4 }}>
                {a.schedule.map((s, i) => (
                  <ScheduleItem key={`${s.year}-${s.month}-${i}`} s={s} last={i === a.schedule.length - 1} />
                ))}
              </View>
            )}
          </View>
        </Reveal>
      )}

      <Reveal index={2}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What happened</Text>
          <View style={{ marginTop: 4 }}>
            {a.timeline.map((e, i) => (
              <TimelineItem key={`${e.kind}-${i}`} e={e} last={i === a.timeline.length - 1} />
            ))}
          </View>
        </View>
      </Reveal>

      {a.salaryAtRequest != null && a.advanceType === 'general' && (
        <Reveal index={3}>
          <Text style={styles.foot}>
            Your monthly salary when you applied: {rupees(a.salaryAtRequest)} (60% limit{' '}
            {rupees(Math.floor(a.salaryAtRequest * 0.6))}).
          </Text>
        </Reveal>
      )}
    </View>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
      <Text style={styles.figLabel}>{label}</Text>
      <Text style={[styles.figValue, TabularNums, { color: tone ?? Colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const SCHEDULE_LOOK = {
  deducted: { icon: 'check-circle', label: 'Deducted' },
  due: { icon: 'clock-outline', label: 'This month' },
  upcoming: { icon: 'circle-outline', label: 'Upcoming' },
  planned: { icon: 'circle-outline', label: 'Planned' },
} as const;

function ScheduleItem({ s, last }: { s: ScheduleRow; last: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const look = SCHEDULE_LOOK[s.state] ?? SCHEDULE_LOOK.upcoming;
  const color =
    s.state === 'deducted' ? Colors.statusGreen : s.state === 'due' ? Colors.statusYellow : Colors.outline;
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <MaterialCommunityIcons name={look.icon as any} size={18} color={color} />
        {!last && <View style={[styles.railLine, s.state === 'deducted' && { backgroundColor: Colors.statusGreen }]} />}
      </View>
      <View style={styles.rowBody}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{monthLabel(s.month, s.year)} salary</Text>
          <Text style={[styles.rowSub, { color }]}>
            {s.state === 'due' ? 'Due this month (deducted when payroll runs)' : look.label}
          </Text>
        </View>
        <Text style={[styles.rowAmt, TabularNums, s.state === 'deducted' && { color: Colors.statusGreen }]}>
          {rupees(s.amount)}
        </Text>
      </View>
    </View>
  );
}

const EVENT_ICON: Record<TimelineEvent['kind'], string> = {
  applied: 'send-circle-outline',
  waiting: 'timer-sand',
  approved: 'check-decagram',
  rejected: 'close-circle',
  deducted: 'cash-check',
  closed: 'flag-checkered',
};

function TimelineItem({ e, last }: { e: TimelineEvent; last: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const color =
    e.kind === 'rejected'
      ? Colors.statusRed
      : e.kind === 'waiting'
        ? Colors.statusYellow
        : e.kind === 'applied'
          ? Colors.primaryLight
          : Colors.statusGreen;
  const when = e.at ? applyDate(e.at) : '';
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <MaterialCommunityIcons name={EVENT_ICON[e.kind] as any} size={18} color={color} />
        {!last && <View style={styles.railLine} />}
      </View>
      <View style={[styles.rowBody, { flexDirection: 'column', alignItems: 'flex-start', gap: 2 }]}>
        <Text style={styles.rowTitle}>
          {e.title}
          {when ? <Text style={styles.rowWhen}>{`  ${when}`}</Text> : null}
        </Text>
        <Text style={styles.rowText}>{e.text}</Text>
        {!!e.by && <Text style={styles.rowSub}>By {e.by}</Text>}
        {!!e.comment && (
          <View style={styles.comment}>
            <Text style={styles.commentText}>"{e.comment}"</Text>
          </View>
        )}
      </View>
    </View>
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
  content: { padding: 16, paddingBottom: 40 },

  hero: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border,
    padding: 14, gap: 14, ...ClayElevation.low,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroType: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 16 },
  heroPurpose: { color: Colors.textMuted, fontSize: 12.5, marginTop: 1 },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringPct: { fontFamily: FontFamily.displayBold, fontSize: 22 },
  ringSmall: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
  figLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  figValue: { fontFamily: FontFamily.displayBold, fontSize: 17 },
  lessNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.badgeYellowBg, borderRadius: BorderRadius.lg, padding: 10,
  },
  lessText: { flex: 1, color: Colors.badgeYellowText, fontSize: 12, lineHeight: 17 },

  card: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border,
    padding: 14, gap: 8, ...ClayElevation.low,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  cardTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 15 },
  cardMeta: { color: Colors.textMuted, fontSize: 12, flexShrink: 1, textAlign: 'right' },
  cardText: { color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18 },

  row: { flexDirection: 'row', gap: 10 },
  rail: { width: 20, alignItems: 'center' },
  railLine: { flex: 1, width: 2, backgroundColor: Colors.border, marginVertical: 2, minHeight: 12 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingBottom: 12, gap: 8 },
  rowTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },
  rowWhen: { color: Colors.textMuted, fontSize: 11.5, fontFamily: FontFamily.bodyRegular },
  rowSub: { color: Colors.textMuted, fontSize: 11.5 },
  rowText: { color: Colors.textSecondary, fontSize: 12.5, lineHeight: 17 },
  rowAmt: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  comment: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md, paddingHorizontal: 10, paddingVertical: 6, marginTop: 2 },
  commentText: { color: Colors.textSecondary, fontSize: 12, fontStyle: 'italic' },

  foot: { color: Colors.textMuted, fontSize: 11.5, textAlign: 'center', paddingHorizontal: 12 },
});
