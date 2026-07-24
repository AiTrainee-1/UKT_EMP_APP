import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors } from '../constants/colors';
import { Badge } from './ui/Badge';
import { SalarySlip } from '../hooks/useSalarySlips';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  slip: SalarySlip;
  onPress: () => void;
}

export function SalarySlipCard({ slip, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.left}>
        <Text style={styles.month}>
          {MONTH_NAMES[slip.month]} {slip.year}
        </Text>
        <Text style={styles.net}>₹{slip.netSalary.toLocaleString('en-IN')}</Text>
      </View>
      <View style={styles.right}>
        <Badge
          label={slip.emailedAt ? 'Emailed' : 'Generated'}
          variant={slip.emailedAt ? 'paid' : 'generated'}
        />
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={Colors.textMuted}
          style={{ marginTop: 8 }}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  left: {
    gap: 4,
  },
  month: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  net: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: '800',
  },
  right: {
    alignItems: 'flex-end',
  },
});
