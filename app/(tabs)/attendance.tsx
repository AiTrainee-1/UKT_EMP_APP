import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../src/hooks/useAuth';
import { useAttendance } from '../../src/hooks/useAttendance';
import { AttendanceCalendar } from '../../src/components/AttendanceCalendar';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function AttendanceScreen() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isLoading, refetch, isRefetching } = useAttendance(
    user?.employeeId ?? null,
    month,
    year
  );

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    const future = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
    if (future) return;
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Attendance</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Month Selector */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTHS[month - 1]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Summary */}
        {isLoading ? (
          <SkeletonCard lines={2} />
        ) : (
          <View style={styles.summaryRow}>
            {[
              { label: 'Present', value: data?.present ?? 0, color: Colors.statusGreen },
              { label: 'Absent', value: data?.absent ?? 0, color: Colors.statusRed },
              { label: 'Late', value: data?.late ?? 0, color: Colors.statusYellow },
              { label: 'On Leave', value: data?.onLeave ?? 0, color: Colors.statusBlue },
            ].map(({ label, value, color }) => (
              <View key={label} style={styles.summaryItem}>
                <Text style={[styles.summaryNum, { color }]}>{value}</Text>
                <Text style={styles.summaryLabel}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Calendar */}
        <View style={styles.calendarCard}>
          {isLoading ? (
            <SkeletonCard lines={5} />
          ) : (
            <AttendanceCalendar
              records={data?.records ?? []}
              month={month}
              year={year}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDark },
  header: {
    padding: 16,
    paddingTop: 8,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  navBtn: {
    padding: 8,
  },
  monthLabel: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    paddingVertical: 16,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 4,
  },
  summaryNum: {
    fontSize: 24,
    fontWeight: '800',
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  calendarCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
  },
});
