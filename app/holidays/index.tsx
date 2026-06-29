import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, isPast, parseISO } from 'date-fns';

import { useHolidays } from '../../src/hooks/useHolidays';
import { Badge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function groupByMonth(holidays: any[]) {
  const groups: Record<string, any[]> = {};
  for (const h of holidays) {
    const month = MONTHS[new Date(h.date).getMonth()];
    if (!groups[month]) groups[month] = [];
    groups[month].push(h);
  }
  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

function typeBadgeVariant(type: string): 'present' | 'pending' | 'onleave' {
  if (type === 'National') return 'present';
  if (type === 'Regional') return 'onleave';
  return 'pending';
}

export default function HolidaysScreen() {
  const year = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(year);
  const { data, isLoading, refetch, isRefetching } = useHolidays(selectedYear);

  const upcoming = (data || []).filter((h) => !isPast(parseISO(h.date)));
  const sections = groupByMonth(data || []);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Year Selector */}
      <View style={styles.yearNav}>
        <TouchableOpacity onPress={() => setSelectedYear((y) => y - 1)} style={styles.navBtn}>
          <MaterialCommunityIcons name="chevron-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.yearLabel}>{selectedYear}</Text>
        <TouchableOpacity onPress={() => setSelectedYear((y) => y + 1)} style={styles.navBtn}>
          <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
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
            upcoming.length > 0 ? (
              <View style={styles.nextHoliday}>
                <Text style={styles.nextLabel}>Next Holiday</Text>
                <Text style={styles.nextName}>{upcoming[0].name}</Text>
                <Text style={styles.nextDate}>
                  {format(parseISO(upcoming[0].date), 'EEEE, d MMMM yyyy')}
                </Text>
              </View>
            ) : null
          }
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.monthHeader}>{title}</Text>
          )}
          renderItem={({ item }) => {
            const past = isPast(parseISO(item.date));
            return (
              <View style={[styles.card, past && styles.pastCard]}>
                <View>
                  <Text style={[styles.holidayName, past && styles.pastText]}>{item.name}</Text>
                  <Text style={[styles.holidayDate, past && styles.pastText]}>
                    {format(parseISO(item.date), 'EEEE, d MMMM')}
                  </Text>
                </View>
                <Badge label={item.type} variant={typeBadgeVariant(item.type)} />
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDark },
  yearNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  navBtn: { padding: 8 },
  yearLabel: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  pad: { padding: 16, paddingBottom: 32 },
  nextHoliday: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    gap: 4,
  },
  nextLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  nextName: { color: '#fff', fontSize: 22, fontWeight: '800' },
  nextDate: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  monthHeader: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pastCard: { opacity: 0.5 },
  holidayName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  holidayDate: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  pastText: { color: Colors.textMuted },
});
