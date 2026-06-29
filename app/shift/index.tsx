import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../src/hooks/useAuth';
import { useShift } from '../../src/hooks/useShift';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ShiftScreen() {
  const { user } = useAuth();
  const { data: shift, isLoading } = useShift(user?.employeeId ?? null);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.pad}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (!shift) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          icon="clock-outline"
          title="No shift assigned"
          subtitle="Your shift details will appear here once assigned by HR"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        {/* Main Card */}
        <View style={styles.shiftCard}>
          <Text style={styles.shiftName}>{shift.shiftName}</Text>
          <View style={styles.timeRow}>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>Start Time</Text>
              <Text style={styles.timeValue}>{shift.startTime}</Text>
            </View>
            <MaterialCommunityIcons name="arrow-right" size={24} color={Colors.textMuted} />
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>End Time</Text>
              <Text style={styles.timeValue}>{shift.endTime}</Text>
            </View>
          </View>
        </View>

        {/* Details */}
        <View style={styles.card}>
          {[
            { icon: 'timer-outline', label: 'Grace Period', value: `${shift.gracePeriod} minutes` },
            { icon: 'calendar-week-outline', label: 'Saturday Off', value: shift.saturdayOff ? 'Yes' : 'No' },
          ].map(({ icon, label, value }) => (
            <View key={label} style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <MaterialCommunityIcons name={icon as any} size={18} color={Colors.primary} />
                <Text style={styles.detailLabel}>{label}</Text>
              </View>
              <Text style={styles.detailValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Weekly Schedule */}
        <View style={styles.card}>
          <Text style={styles.scheduleTitle}>Weekly Schedule</Text>
          <View style={styles.daysRow}>
            {ALL_DAYS.map((day) => {
              const isWorking = shift.workingDays?.includes(day);
              return (
                <View
                  key={day}
                  style={[styles.dayChip, isWorking && styles.dayChipActive]}
                >
                  <Text style={[styles.dayText, isWorking && styles.dayTextActive]}>
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.infoText}>
            Shift details are managed by HR. Contact HR to request a shift change.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDark },
  pad: { padding: 16, paddingBottom: 40, gap: 12 },
  shiftCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  shiftName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  timeBlock: { flex: 1, gap: 4 },
  timeLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  timeValue: { color: '#fff', fontSize: 24, fontWeight: '800' },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { color: Colors.textSecondary, fontSize: 14 },
  detailValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  scheduleTitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  dayChipActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}22`,
  },
  dayText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  dayTextActive: { color: Colors.primary },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
  },
  infoText: { color: Colors.textMuted, fontSize: 12, flex: 1, lineHeight: 18 },
});
