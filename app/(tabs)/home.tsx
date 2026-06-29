import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../src/hooks/useAuth';
import { useDashboard } from '../../src/hooks/useDashboard';
import { Colors } from '../../src/constants/colors';
import { SkeletonCard } from '../../src/components/ui/Skeleton';

const QUICK_ACTIONS = [
  { label: 'My Attendance', icon: 'calendar-check-outline', route: '/(tabs)/attendance' as const },
  { label: 'Salary Slips', icon: 'cash-multiple', route: '/salary' as const },
  { label: 'Apply Leave', icon: 'umbrella-outline', route: '/(tabs)/leave' as const },
  { label: 'My Shift', icon: 'clock-outline', route: '/shift' as const },
  { label: 'Permission', icon: 'hand-pointing-right', route: '/requests' as const },
  { label: 'Holidays', icon: 'flag-outline', route: '/holidays' as const },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'Present' ? Colors.statusGreen
    : status === 'Absent' ? Colors.statusRed
    : status === 'Late' ? Colors.statusYellow
    : status === 'On Leave' ? Colors.statusBlue
    : Colors.statusGrey;
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useDashboard(user?.employeeId ?? null);

  const today = format(new Date(), 'EEEE, d MMMM yyyy');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.name}>{user?.name || 'Employee'}</Text>
            <Text style={styles.date}>{today}</Text>
          </View>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => {}}
          >
            <MaterialCommunityIcons name="bell-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <View style={styles.summaryGrid}>
            {[
              { label: 'Present This Month', value: data?.presentDays ?? 0, icon: 'check-circle-outline', color: Colors.statusGreen },
              { label: 'Absent This Month', value: data?.absentDays ?? 0, icon: 'close-circle-outline', color: Colors.statusRed },
              { label: 'Leave Balance', value: data?.leaveBalance ?? 0, icon: 'umbrella-outline', color: Colors.statusBlue },
              { label: 'Pending Requests', value: data?.pendingRequests ?? 0, icon: 'clock-outline', color: Colors.statusYellow },
            ].map(({ label, value, icon, color }) => (
              <View key={label} style={styles.summaryCard}>
                <MaterialCommunityIcons name={icon as any} size={24} color={color} />
                <Text style={[styles.summaryNum, { color }]}>{value}</Text>
                <Text style={styles.summaryLabel}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map(({ label, icon, route }) => (
            <TouchableOpacity
              key={label}
              style={styles.actionBtn}
              onPress={() => router.push(route as any)}
              activeOpacity={0.8}
            >
              <View style={styles.actionIcon}>
                <MaterialCommunityIcons name={icon as any} size={26} color={Colors.primary} />
              </View>
              <Text style={styles.actionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Attendance */}
        {!isLoading && data?.recentAttendance && data.recentAttendance.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent Attendance</Text>
            <View style={styles.recentRow}>
              {data.recentAttendance.slice(0, 7).map((a, i) => (
                <View key={i} style={styles.recentItem}>
                  <StatusDot status={a.status} />
                  <Text style={styles.recentDate}>
                    {format(new Date(a.date), 'dd')}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Upcoming Holidays */}
        {!isLoading && data?.upcomingHolidays && data.upcomingHolidays.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming Holidays</Text>
            {data.upcomingHolidays.slice(0, 3).map((h, i) => (
              <View key={i} style={styles.holidayCard}>
                <MaterialCommunityIcons name="flag-outline" size={18} color={Colors.primary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.holidayName}>{h.name}</Text>
                  <Text style={styles.holidayDate}>
                    {format(new Date(h.date), 'EEEE, d MMMM')}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDark },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 4 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    marginTop: 8,
  },
  greeting: { color: Colors.textMuted, fontSize: 14 },
  name: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800' },
  date: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  notifBtn: {
    backgroundColor: Colors.bgCard,
    padding: 10,
    borderRadius: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  summaryCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 14,
    width: '47.5%',
    gap: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  summaryNum: {
    fontSize: 28,
    fontWeight: '900',
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 8,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    width: '30.5%',
    gap: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  actionIcon: {
    backgroundColor: `${Colors.primary}22`,
    padding: 8,
    borderRadius: 10,
  },
  actionLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
  recentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  recentItem: {
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  recentDate: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  holidayCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  holidayName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  holidayDate: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
