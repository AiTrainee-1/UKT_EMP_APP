import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format, isPast, isToday, parseISO, differenceInCalendarDays } from 'date-fns';

import { useHolidays, type Holiday } from '../../src/hooks/useHolidays';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type TypeFilter = 'All' | Holiday['type'];

const TYPE_TONE: Record<Holiday['type'], { bg: string; text: string }> = {
  National: { bg: '#DBEAFE', text: '#2563EB' },
  Regional: { bg: '#FDF3E3', text: '#B7791F' },
  Company: { bg: '#ECFDF5', text: '#059669' },
};

function groupByMonth(holidays: Holiday[]) {
  const groups: Record<string, Holiday[]> = {};
  for (const h of holidays) {
    const month = MONTHS[new Date(h.date).getMonth()];
    if (!groups[month]) groups[month] = [];
    groups[month].push(h);
  }
  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

export default function HolidaysScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const year = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(year);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const { data, isLoading, refetch, isRefetching } = useHolidays(selectedYear);

  const all = data || [];
  const filtered = typeFilter === 'All' ? all : all.filter((h) => h.type === typeFilter);
  const upcoming = filtered.filter((h) => !isPast(parseISO(h.date)) || isToday(parseISO(h.date)));
  const sections = groupByMonth(filtered);
  const now = new Date();
  const thisMonthCount = all.filter((h) => {
    const d = parseISO(h.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const typeCounts = {
    National: all.filter((h) => h.type === 'National').length,
    Regional: all.filter((h) => h.type === 'Regional').length,
    Company: all.filter((h) => h.type === 'Company').length,
  };

  const next = upcoming[0];
  const daysUntilNext = next ? Math.max(0, differenceInCalendarDays(parseISO(next.date), now)) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Company Holidays</Text>
          <Text style={styles.headerSubtitle}>Annual Holiday Calendar</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.pad}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : !data?.length ? (
        <EmptyState
          icon="flag-outline"
          title="No holidays"
          subtitle={`No holidays found for ${selectedYear}`}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.pad}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
          }
          ListHeaderComponent={
            <>
              {/* Year nav */}
              <View style={styles.yearCard}>
                <TouchableOpacity onPress={() => setSelectedYear((y) => y - 1)} style={styles.navBtn}>
                  <MaterialCommunityIcons name="chevron-left" size={20} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.yearLabel}>{selectedYear}</Text>
                <TouchableOpacity onPress={() => setSelectedYear((y) => y + 1)} style={styles.navBtn}>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <View style={styles.totalPill}>
                  <Text style={styles.totalPillText}>{all.length} Total Holidays</Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statCell}>
                  <View style={styles.statIconWrap}>
                    <MaterialCommunityIcons name="calendar-month-outline" size={15} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={[styles.statValue, TabularNums]}>{thisMonthCount}</Text>
                    <Text style={styles.statLabel}>{MONTHS[now.getMonth()]} · This Month</Text>
                  </View>
                </View>
                <View style={styles.statCell}>
                  <View style={[styles.statIconWrap, { backgroundColor: Colors.badgeGreenBg }]}>
                    <MaterialCommunityIcons name="timer-sand" size={15} color={Colors.statusGreen} />
                  </View>
                  <View>
                    <Text style={[styles.statValue, TabularNums]}>{upcoming.length}</Text>
                    <Text style={styles.statLabel}>Remaining in {selectedYear}</Text>
                  </View>
                </View>
              </View>

              {/* Next holiday hero */}
              {next && (
                <View style={styles.nextHoliday}>
                  <View style={styles.nextTopRow}>
                    <View style={styles.nextBellPill}>
                      <MaterialCommunityIcons name="bell-ring-outline" size={12} color="#fff" />
                      <Text style={styles.nextBellText}>Next Holiday</Text>
                    </View>
                    <View style={styles.nextDaysPill}>
                      <Text style={styles.nextDaysText}>
                        {daysUntilNext === 0 ? 'Today' : `In ${daysUntilNext} day${daysUntilNext === 1 ? '' : 's'}`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.nextBodyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nextName}>{next.name}</Text>
                      <Text style={styles.nextDate}>{format(parseISO(next.date), 'EEEE, d MMMM yyyy')}</Text>
                      <View style={[styles.nextTypePill, { backgroundColor: 'rgba(255,255,255,0.16)' }]}>
                        <Text style={styles.nextTypeText}>{next.type} Holiday</Text>
                      </View>
                    </View>
                    <View style={styles.dateBadge}>
                      <Text style={styles.dateBadgeMonth}>{format(parseISO(next.date), 'MMM').toUpperCase()}</Text>
                      <Text style={[styles.dateBadgeDay, TabularNums]}>{format(parseISO(next.date), 'd')}</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Type filter */}
              <Text style={styles.filterLabel}>FILTER BY TYPE</Text>
              <View style={styles.filterRow}>
                {([
                  { key: 'All' as TypeFilter, label: 'All', count: all.length },
                  { key: 'National' as TypeFilter, label: 'National', count: typeCounts.National },
                  { key: 'Regional' as TypeFilter, label: 'Regional', count: typeCounts.Regional },
                  { key: 'Company' as TypeFilter, label: 'Company', count: typeCounts.Company },
                ]).filter((f) => f.key === 'All' || f.count > 0).map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.filterChip, typeFilter === f.key && styles.filterChipActive]}
                    onPress={() => setTypeFilter(f.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterChipText, typeFilter === f.key && styles.filterChipTextActive]}>
                      {f.label} {f.count}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          }
          renderSectionHeader={({ section: { title, data: sectionData } }) => (
            <View style={styles.monthHeaderRow}>
              <Text style={styles.monthHeader}>{title} {selectedYear}</Text>
              <Text style={styles.monthCount}>{sectionData.length} Holiday{sectionData.length === 1 ? '' : 's'}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const past = isPast(parseISO(item.date)) && !isToday(parseISO(item.date));
            const isNext = next?.id === item.id;
            const tone = TYPE_TONE[item.type];
            return (
              <View style={[styles.card, past && styles.pastCard, isNext && styles.nextCard]}>
                <View style={[styles.dayBadge, past && styles.dayBadgePast, isNext && styles.dayBadgeNext]}>
                  <Text style={[styles.dayBadgeWeekday, isNext && styles.dayBadgeTextNext]}>{format(parseISO(item.date), 'EEE').toUpperCase()}</Text>
                  <Text style={[styles.dayBadgeNum, TabularNums, isNext && styles.dayBadgeTextNext]}>{format(parseISO(item.date), 'd')}</Text>
                  <Text style={[styles.dayBadgeMonth, isNext && styles.dayBadgeTextNext]}>{format(parseISO(item.date), 'MMM').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTitleRow}>
                    <Text style={[styles.holidayName, past && styles.pastText]} numberOfLines={1}>{item.name}</Text>
                    {isNext && (
                      <View style={styles.nextTag}><Text style={styles.nextTagText}>Next</Text></View>
                    )}
                    {past && (
                      <View style={styles.passedTag}><Text style={styles.passedTagText}>Passed</Text></View>
                    )}
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.typeBadgeText, { color: tone.text }]}>{item.type} Holiday</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
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

  yearCard: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 8, paddingHorizontal: 8,
    marginBottom: 12,
    ...cardShadow,
  },
  navBtn: { padding: 4 },
  yearLabel: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 15 },
  totalPill: { backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 5 },
  totalPillText: { color: Colors.primary, fontSize: 10.5, fontWeight: '800' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCell: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 10,
    ...cardShadow,
  },
  statIconWrap: { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.badgeBlueBg, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 17 },
  statLabel: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '600' },

  nextHoliday: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: 16,
    marginBottom: 18,
    gap: 12,
    ...cardShadow,
  },
  nextTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextBellPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  nextBellText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  nextDaysPill: { backgroundColor: '#F59E0B', borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  nextDaysText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  nextBodyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nextName: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 20, letterSpacing: -0.3 },
  nextDate: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 2, marginBottom: 8 },
  nextTypePill: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  nextTypeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  dateBadge: { width: 52, height: 56, borderRadius: BorderRadius.md, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', gap: 1 },
  dateBadgeMonth: { color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '800' },
  dateBadgeDay: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 20 },

  filterLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  filterChip: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 7 },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { color: Colors.textSecondary, fontSize: 11.5, fontWeight: '700' },
  filterChipTextActive: { color: '#fff' },

  monthHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
  monthHeader: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15 },
  monthCount: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
    ...cardShadow,
  },
  pastCard: { opacity: 0.55 },
  nextCard: { borderColor: Colors.primary, borderWidth: 1.5 },
  dayBadge: { width: 48, height: 54, borderRadius: BorderRadius.md, backgroundColor: Colors.bgSurfaceLow, alignItems: 'center', justifyContent: 'center' },
  dayBadgePast: {},
  dayBadgeNext: { backgroundColor: Colors.primary },
  dayBadgeWeekday: { color: Colors.textMuted, fontSize: 8, fontWeight: '800' },
  dayBadgeNum: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 17, lineHeight: 20 },
  dayBadgeMonth: { color: Colors.textMuted, fontSize: 8, fontWeight: '800' },
  dayBadgeTextNext: { color: '#fff' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  holidayName: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14, flexShrink: 1 },
  nextTag: { backgroundColor: Colors.primaryFixed, borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
  nextTagText: { color: Colors.primary, fontSize: 9, fontWeight: '800' },
  passedTag: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
  passedTagText: { color: Colors.textMuted, fontSize: 9, fontWeight: '800' },
  typeBadge: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  pastText: { color: Colors.textMuted },
});
