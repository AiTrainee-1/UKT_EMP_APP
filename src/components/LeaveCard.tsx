import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { MotiView } from 'moti';
import { format } from 'date-fns';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { BorderRadius } from '../constants/theme';
import { Badge } from './ui/Badge';
import { LeaveRequest } from '../hooks/useLeave';

interface Props {
  request: LeaveRequest;
  index?: number;
}

export function LeaveCard({ request, index = 0 }: Props) {
  const variant =
    request.status === 'Approved' ? 'approved'
    : request.status === 'Rejected' ? 'rejected'
    : 'pending';

  const days = request.totalDays ?? request.days ?? 1;
  const isSingleDay = request.startDate === request.endDate || days === 1;

  const dateLabel = isSingleDay
    ? format(new Date(request.startDate + 'T00:00:00'), 'EEEE, d MMMM yyyy')
    : `${format(new Date(request.startDate + 'T00:00:00'), 'dd MMM')} → ${format(new Date(request.endDate + 'T00:00:00'), 'dd MMM yyyy')}`;

  const borderColor =
    variant === 'approved' ? Colors.clayGreen
    : variant === 'rejected' ? Colors.clayRed
    : Colors.badgePendingBg;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 260, delay: Math.min(index, 8) * 50 }}
      style={[styles.card, { borderLeftColor: borderColor }]}
    >
      <View style={styles.top}>
        <View style={styles.typeRow}>
          <MaterialCommunityIcons name="umbrella-outline" size={16} color={Colors.primary} />
          <Text style={styles.type}>{request.leaveType}</Text>
        </View>
        <Badge label={request.status} variant={variant} />
      </View>
      <View style={styles.dateRow}>
        <MaterialCommunityIcons name="calendar-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.dateRange}>{dateLabel}</Text>
        {!isSingleDay && (
          <View style={styles.daysBadge}>
            <Text style={styles.daysText}>{days}d</Text>
          </View>
        )}
      </View>
      {request.reason && (
        <Text style={styles.reason} numberOfLines={2}>"{request.reason}"</Text>
      )}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 14,
    marginBottom: 10,
    gap: 8,
    borderLeftWidth: 4,
    ...Platform.select({
      ios: { shadowColor: '#006496', shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.09, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  type: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateRange: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  daysBadge: {
    backgroundColor: Colors.primaryFixed,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  daysText: { color: Colors.primary, fontSize: 11, fontWeight: '700' },
  reason: {
    color: Colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
});
