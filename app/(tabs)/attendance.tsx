import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { router } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useAttendance } from '../../src/hooks/useAttendance';
import { useShift } from '../../src/hooks/useShift';
import { AttendanceCalendar } from '../../src/components/AttendanceCalendar';
import { GeoPunchCard } from '../../src/components/GeoPunchCard';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { BorderRadius } from '../../src/constants/theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SUMMARY = (data: any) => [
  { label: 'Present', value: data?.present ?? 0, color: Colors.statusGreen, bg: Colors.badgeGreenBg, icon: 'check-circle' },
  { label: 'Absent', value: data?.absent ?? 0, color: Colors.statusRed, bg: Colors.badgeRedBg, icon: 'close-circle' },
  { label: 'Late', value: data?.late ?? 0, color: Colors.statusYellow, bg: Colors.badgeYellowBg, icon: 'clock-alert' },
  { label: 'Half Shift', value: data?.halfShift ?? 0, color: Colors.statusYellow, bg: Colors.badgeYellowBg, icon: 'clock-time-four-outline' },
  { label: 'On Leave', value: data?.onLeave ?? 0, color: Colors.primary, bg: Colors.primaryFixed, icon: 'umbrella' },
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
  const { data: shift } = useShift(user?.employeeId ?? null);

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

  const atCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#006496" />

      <LinearGradient
        colors={['#006496', '#0090d0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerDeco} />
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.title}>Attendance</Text>
            <Text style={styles.subtitle}>Track your daily attendance</Text>
          </View>
          <View style={styles.monthPill}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
              <MaterialCommunityIcons name="chevron-left" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{MONTHS[month - 1].slice(0, 3)} {year}</Text>
            <TouchableOpacity onPress={nextMonth} style={[styles.navBtn, atCurrent && styles.navBtnDisabled]}>
              <MaterialCommunityIcons name="chevron-right" size={20} color={atCurrent ? 'rgba(255,255,255,0.35)' : '#fff'} />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        <GeoPunchCard />

        {/* Assigned shift */}
        {shift && (
          <TouchableOpacity style={styles.shiftBanner} onPress={() => router.push('/shift')} activeOpacity={0.8}>
            <View style={styles.shiftBannerIcon}>
              <MaterialCommunityIcons name="clock-outline" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shiftBannerLabel}>Assigned Shift</Text>
              <Text style={styles.shiftBannerValue}>
                {shift.shiftName} · {shift.startTime} – {shift.endTime}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Summary row */}
        {isLoading ? (
          <SkeletonCard lines={2} />
        ) : (
          <View style={styles.summaryRow}>
            {SUMMARY(data).map(({ label, value, color, bg, icon }) => (
              <View key={label} style={styles.summaryItem}>
                <View style={[styles.summaryIcon, { backgroundColor: bg }]}>
                  <MaterialCommunityIcons name={icon as any} size={18} color={color} />
                </View>
                <Text style={[styles.summaryNum, { color }]}>{value}</Text>
                <Text style={styles.summaryLabel}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Calendar card */}
        <View style={styles.calendarCard}>
          {isLoading ? (
            <SkeletonCard lines={5} />
          ) : (
            <AttendanceCalendar records={data?.records ?? []} month={month} year={year} />
          )}
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {[
            { label: 'Present', color: Colors.clayGreen },
            { label: 'Half Shift', color: Colors.clayYellow },
            { label: 'Absent', color: Colors.clayRed },
            { label: 'Late', color: Colors.clayYellow },
            { label: 'On Leave', color: Colors.clayBlue },
          ].map(({ label, color }) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  headerDeco: {
    position: 'absolute', top: -20, right: -20,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 2,
  },
  navBtn: { padding: 4, borderRadius: 20 },
  navBtnDisabled: { opacity: 0.4 },
  monthLabel: { color: '#fff', fontSize: 13, fontWeight: '700', minWidth: 64, textAlign: 'center' },

  content: { padding: 16, paddingBottom: 32, gap: 16 },

  shiftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: 12,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  shiftBannerIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  shiftBannerLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  shiftBannerValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700', marginTop: 1 },

  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    paddingVertical: 18,
    paddingHorizontal: 4,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.10, shadowRadius: 14 },
      android: { elevation: 4 },
    }),
  },
  summaryItem: { alignItems: 'center', gap: 6, width: '20%' },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryNum: { fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },

  calendarCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.09, shadowRadius: 14 },
      android: { elevation: 4 },
    }),
  },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
});
