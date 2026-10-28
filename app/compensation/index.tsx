import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format } from 'date-fns';

import { useEmployeeCompensation } from '../../src/hooks/useCompensation';
import { ContactBlockCard } from '../../src/components/support/ContactBlockCard';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import { COMPENSATION_TONES } from '../../src/lib/attendanceVisual';
import {
  ASK_HR_NOT_SELF_SERVICE,
  STAFF_ONLY_MESSAGE,
  allowanceView,
  askHrOf,
  balanceView,
  earlierRecordLabel,
  formatLongDate,
  groupItems,
  itemFacts,
  kindTone,
  statusTone,
  type AllowanceNotice,
  type CompensationItem,
  type StatusTone,
} from '../../src/lib/compensation';

type Tab = 'mine' | 'ask';

export default function CompensationScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [tab, setTab] = useState<Tab>('mine');
  const { data, isLoading, refetch, isRefetching } = useEmployeeCompensation();

  // "Today" is read at render: the screen can stay open past midnight, and the allowance banners are about today / tomorrow.
  const todayIso = format(new Date(), 'yyyy-MM-dd');

  const statusColors = (tone: StatusTone) => {
    switch (tone) {
      case 'good': return { bg: Colors.badgeGreenBg, fg: Colors.badgeGreenText };
      case 'info': return { bg: Colors.badgeBlueBg, fg: Colors.badgeBlueText };
      case 'warn': return { bg: Colors.badgeYellowBg, fg: Colors.badgeYellowText };
      case 'bad': return { bg: Colors.badgeRedBg, fg: Colors.badgeRedText };
      default: return { bg: Colors.badgePendingBg, fg: Colors.badgePendingText };
    }
  };

  const header = (
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
        <Text style={styles.headerTitle} accessibilityRole="header">Compensation</Text>
        <Text style={styles.headerSubtitle}>Detected for you and assigned by HR</Text>
      </View>
    </View>
  );

  // ── loading / failed / not for production ─────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        <View style={styles.pad}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        <View style={styles.errorWrap}>
          <EmptyState
            icon="cloud-alert-outline"
            title="Could not load compensation"
            subtitle="Check your connection and try again. If it keeps failing, please contact HR."
          />
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => refetch()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!data.isStaff) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        <EmptyState
          icon="briefcase-clock-outline"
          title="Staff employees only"
          subtitle={data.message ?? STAFF_ONLY_MESSAGE}
        />
      </SafeAreaView>
    );
  }

  const sections = groupItems(data.items);
  const ask = askHrOf(data);
  const balance = balanceView(data.balanceShifts);
  const showBalance = data.enabled.holidayWork || data.balanceShifts > 0;
  const today = data.todayAllowance;
  const tomorrow = data.tomorrowAllowance;

  const refresh = (
    <RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={Colors.primary} colors={[Colors.primary]} />
  );

  const allowanceBanner = (notice: AllowanceNotice, which: 'today' | 'tomorrow') => {
    const v = allowanceView(notice, which, todayIso);
    const tone = COMPENSATION_TONES.ot_allowance;
    return (
      <View
        key={which}
        style={[styles.banner, { backgroundColor: isDark ? tone.softDark : tone.softLight, borderColor: tone.solid }]}
        accessible
        accessibilityLabel={`${v.title}. ${v.body}${v.until ? ` On time until ${v.until}.` : ''}`}
      >
        <View style={[styles.bannerIcon, { backgroundColor: tone.solid }]}>
          <MaterialCommunityIcons name={tone.icon as any} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerTitle, { color: isDark ? tone.inkDark : tone.inkLight }]}>{v.title}</Text>
          <Text style={styles.bannerBody}>{v.body}</Text>
          {!!v.until && (
            <View style={[styles.untilChip, { backgroundColor: tone.solid }]}>
              <MaterialCommunityIcons name="clock-check-outline" size={12} color="#fff" />
              <Text style={styles.untilText}>On time until {v.until}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderItem = (item: CompensationItem) => {
    const tone = kindTone(item.kind);
    const sc = statusColors(statusTone(item.status));
    const facts = itemFacts(item);
    const date = formatLongDate(item.date);
    // A record from before the compensation overhaul (the server's `legacy: true`): marked, as on the web.
    const earlier = earlierRecordLabel(item);
    return (
      <View
        key={item.key}
        style={[styles.itemCard, { borderLeftColor: tone.solid }]}
        accessible
        accessibilityLabel={`${tone.label}${date ? `, ${date}` : ''}. ${item.title}. ${item.statusLabel}.${earlier ? ` ${earlier}.` : ''}`}
      >
        <View style={styles.itemTop}>
          <View style={[styles.kindChip, { backgroundColor: isDark ? tone.softDark : tone.softLight }]}>
            <MaterialCommunityIcons name={tone.icon as any} size={13} color={isDark ? tone.inkDark : tone.inkLight} />
            <Text style={[styles.kindChipText, { color: isDark ? tone.inkDark : tone.inkLight }]} numberOfLines={1}>{tone.label}</Text>
          </View>
          {!!item.statusLabel && (
            <View style={[styles.statusChip, { backgroundColor: sc.bg }]}>
              <Text style={[styles.statusChipText, { color: sc.fg }]} numberOfLines={2}>{item.statusLabel}</Text>
            </View>
          )}
        </View>
        {!!earlier && (
          <View style={styles.earlierChip} testID="compensation-earlier-record">
            <MaterialCommunityIcons name="history" size={12} color={Colors.textMuted} />
            <Text style={styles.earlierChipText}>{earlier}</Text>
          </View>
        )}
        <Text style={styles.itemTitle}>{item.title}</Text>
        {!!date && (
          <View style={styles.dateRow}>
            <MaterialCommunityIcons name="calendar-month-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.dateText}>{date}</Text>
          </View>
        )}
        {!!item.detail && <Text style={styles.itemDetail}>{item.detail}</Text>}
        {facts.length > 0 && (
          <View style={styles.factRow}>
            {facts.map((f) => (
              <View key={`${f.icon}:${f.text}`} style={styles.factChip}>
                <MaterialCommunityIcons name={f.icon as any} size={12} color={Colors.textMuted} />
                <Text style={[styles.factText, TabularNums]}>{f.text}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {header}

      {/* Two tabs: what the system found / what HR gave, and how to ask HR. */}
      <View style={styles.tabs} accessibilityRole="tablist">
        {([
          { key: 'mine' as Tab, label: 'My Compensation', icon: 'briefcase-clock-outline' },
          { key: 'ask' as Tab, label: 'Ask Request for Compensation', icon: 'headset' },
        ]).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
            >
              <MaterialCommunityIcons name={t.icon as any} size={15} color={active ? '#fff' : Colors.textSecondary} />
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={2}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'mine' ? (
        <ScrollView
          key="mine"
          contentContainerStyle={styles.pad}
          showsVerticalScrollIndicator={false}
          refreshControl={refresh}
        >
          {showBalance && (
            <LinearGradient
              colors={Colors.gradientPrimary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.balanceCard}
              accessible
              accessibilityLabel={`Compensation balance: ${balance.value} ${balance.unit}`}
            >
              <View style={styles.balanceDeco} />
              <Text style={styles.balanceLabel}>COMPENSATION BALANCE</Text>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceValue, TabularNums]}>{balance.value}</Text>
                <Text style={styles.balanceUnit}>{balance.unit}</Text>
              </View>
              <Text style={styles.balanceHint}>
                Added when your Department Head approves work you did on a Sunday or a company holiday. HR gives you a day
                off from it.
              </Text>
            </LinearGradient>
          )}

          {!!today && allowanceBanner(today, 'today')}
          {!!tomorrow && allowanceBanner(tomorrow, 'tomorrow')}

          {!data.enabled.master ? (
            <View style={styles.noteBox}>
              <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
              <Text style={styles.noteText}>
                Compensation is switched off by HR right now: nothing new is detected or applied. Your earlier records are
                still listed below.
              </Text>
            </View>
          ) : !data.enabled.any ? (
            <View style={styles.noteBox}>
              <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
              <Text style={styles.noteText}>Compensation is not switched on yet. Contact HR for any question.</Text>
            </View>
          ) : null}

          {sections.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons name="briefcase-clock-outline" size={30} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyText}>
                When you work extra hours, or on a Sunday or a company holiday, it is detected and listed here. Anything HR
                assigns to you appears here too.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => setTab('ask')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="How to ask HR for compensation"
              >
                <MaterialCommunityIcons name="headset" size={15} color={Colors.primary} />
                <Text style={styles.emptyBtnText}>How to ask HR</Text>
              </TouchableOpacity>
            </View>
          ) : (
            sections.map((s) => (
              <View key={s.group} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">{s.title}</Text>
                  <Text style={styles.sectionCount}>{s.items.length}</Text>
                </View>
                {!!s.subtitle && <Text style={styles.sectionSub}>{s.subtitle}</Text>}
                <View style={styles.itemList}>{s.items.map(renderItem)}</View>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView
          key="ask"
          contentContainerStyle={styles.pad}
          showsVerticalScrollIndicator={false}
          refreshControl={refresh}
        >
          <View style={styles.askCard}>
            <View style={styles.askHead}>
              <View style={styles.askIcon}>
                <MaterialCommunityIcons name="headset" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.askTitle} accessibilityRole="header">{ask.title}</Text>
            </View>
            <Text style={styles.askText}>{ask.text}</Text>
            {ask.points.length > 0 && (
              <View style={styles.points}>
                {ask.points.map((p, i) => (
                  <View key={`${i}:${p}`} style={styles.pointRow}>
                    <MaterialCommunityIcons name="check-circle-outline" size={15} color={Colors.statusGreen} style={styles.pointIcon} />
                    <Text style={styles.pointText}>{p}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.noteBox}>
            <MaterialCommunityIcons name="shield-account-outline" size={16} color={Colors.primary} />
            <Text style={styles.noteText}>{ASK_HR_NOT_SELF_SERVICE}</Text>
          </View>

          <ContactBlockCard
            block={ask.contact}
            title="Contact HR"
            description="Tell HR which day you worked extra. They will check it and raise the compensation for you."
            style={styles.contact}
          />
        </ScrollView>
      )}
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

  pad: { padding: 16, paddingBottom: 32 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 24 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: 20, paddingVertical: 12, minHeight: 44,
  },
  retryText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 13.5 },

  // Tabs
  tabs: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 12,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 46,
    paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { flexShrink: 1, color: Colors.textSecondary, fontFamily: FontFamily.bodySemibold, fontSize: 12, textAlign: 'center' },
  tabTextActive: { color: '#fff' },

  // Balance
  balanceCard: {
    borderRadius: BorderRadius.xl, padding: 18, marginBottom: 14, overflow: 'hidden', gap: 4,
    ...cardShadow,
  },
  balanceDeco: {
    position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  balanceLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  balanceValue: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 36 },
  balanceUnit: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '700' },
  balanceHint: { color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 17, marginTop: 4 },

  // Allowance banner
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderRadius: BorderRadius.xl, borderWidth: 1.5,
    padding: 14, marginBottom: 12,
  },
  bannerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  bannerBody: { color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  untilChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8,
  },
  untilText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },

  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.lg,
    padding: 12, marginBottom: 14,
  },
  noteText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },

  // Sections and items
  section: { marginBottom: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 },
  sectionTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
  sectionCount: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  sectionSub: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2, marginBottom: 8 },
  itemList: { gap: 10, marginBottom: 12 },

  itemCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4,
    padding: 14, gap: 8,
    ...cardShadow,
  },
  // The kind and the status sit side by side when both fit and stack (status under the kind) when the status is long
  // ("Waiting for your Department Head"): never a clipped kind name.
  itemTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8, rowGap: 6 },
  kindChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%',
    borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4,
  },
  kindChipText: { fontSize: 11.5, fontWeight: '800', flexShrink: 1 },
  statusChip: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4, maxWidth: '100%' },
  statusChipText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  // "Earlier record": muted, under the kind/status row, the way the web draws its muted chip.
  earlierChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: Colors.badgePendingBg, borderRadius: BorderRadius.full,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  earlierChipText: { color: Colors.badgePendingText, fontSize: 11, fontWeight: '700' },
  itemTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14, lineHeight: 20 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  itemDetail: { color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  factChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.full,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  factText: { color: Colors.textSecondary, fontSize: 11.5, fontWeight: '600' },

  // Empty
  emptyCard: {
    alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 24, marginTop: 4,
    ...cardShadow,
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 16 },
  emptyText: { color: Colors.textMuted, fontSize: 12.5, lineHeight: 19, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.full,
    paddingHorizontal: 16, paddingVertical: 10, marginTop: 6, minHeight: 44,
  },
  emptyBtnText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },

  // Ask tab
  askCard: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, marginBottom: 14, gap: 10,
    ...cardShadow,
  },
  askHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  askIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  askTitle: { flex: 1, color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 16, lineHeight: 22 },
  askText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  points: { gap: 9, marginTop: 2 },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  pointIcon: { marginTop: 2 },
  pointText: { flex: 1, color: Colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
  contact: { marginTop: 0 },
});
