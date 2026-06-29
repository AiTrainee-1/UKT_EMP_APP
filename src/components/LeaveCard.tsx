import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { Colors } from '../constants/colors';
import { Badge } from './ui/Badge';
import { LeaveRequest } from '../hooks/useLeave';

interface Props {
  request: LeaveRequest;
}

export function LeaveCard({ request }: Props) {
  const variant =
    request.status === 'Approved' ? 'approved'
    : request.status === 'Rejected' ? 'rejected'
    : 'pending';

  const days = request.totalDays ?? request.days ?? 1;
  const isSingleDay = request.startDate === request.endDate || days === 1;

  const dateLabel = isSingleDay
    ? format(new Date(request.startDate + 'T00:00:00'), 'EEEE, d MMMM yyyy')
    : `${format(new Date(request.startDate + 'T00:00:00'), 'dd MMM')} → ${format(new Date(request.endDate + 'T00:00:00'), 'dd MMM yyyy')}`;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.type}>{request.leaveType}</Text>
        <Badge label={request.status} variant={variant} />
      </View>
      <View style={styles.row}>
        <Text style={styles.dateRange}>{dateLabel}</Text>
        {!isSingleDay && (
          <Text style={styles.days}>{days} day{days !== 1 ? 's' : ''}</Text>
        )}
      </View>
      {request.reason && (
        <Text style={styles.reason} numberOfLines={2}>{request.reason}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  type: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateRange: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  days: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  reason: {
    color: Colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
  },
});
