import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSalarySlip } from '../../src/hooks/useSalarySlips';
import { Badge } from '../../src/components/ui/Badge';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowHighlight]}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function currency(n: number) {
  return `₹${(n || 0).toLocaleString('en-IN')}`;
}

export default function SalarySlipDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: slip, isLoading } = useSalarySlip(Number(id));

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.pad}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (!slip) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View>
            <Text style={styles.empName}>{slip.employeeName}</Text>
            <Text style={styles.empMeta}>{slip.employeeCode} · {slip.department}</Text>
            <Text style={styles.period}>{MONTHS[slip.month]} {slip.year}</Text>
          </View>
          <Badge label={slip.status} variant={slip.status === 'Paid' ? 'paid' : 'generated'} />
        </View>

        {/* Working Days */}
        <Section title="Attendance Summary">
          <View style={styles.statsRow}>
            {[
              { label: 'Working Days', value: slip.workingDays },
              { label: 'Present', value: slip.presentDays },
              { label: 'Absent', value: slip.absentDays },
              { label: 'Late', value: slip.lateDays },
            ].map(({ label, value }) => (
              <View key={label} style={styles.stat}>
                <Text style={styles.statNum}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* Earnings */}
        <Section title="Earnings">
          <Row label="Basic Salary" value={currency(slip.basicSalary)} />
          <Row label="HRA" value={currency(slip.hra)} />
          <Row label="Allowances" value={currency(slip.allowances)} />
          <Row
            label="Total Earnings"
            value={currency(slip.basicSalary + slip.hra + slip.allowances)}
            highlight
          />
        </Section>

        {/* Deductions */}
        <Section title="Deductions">
          <Row label="Provident Fund (PF)" value={currency(slip.pfDeduction)} />
          <Row label="ESI" value={currency(slip.esiDeduction)} />
          <Row label="Advance Recovered" value={currency(slip.advanceRecovered)} />
          <Row label="Late Deductions" value={currency(slip.lateDeductions)} />
          <Row
            label="Total Deductions"
            value={currency(slip.pfDeduction + slip.esiDeduction + slip.advanceRecovered + slip.lateDeductions)}
            highlight
          />
        </Section>

        {/* Net */}
        <View style={styles.netCard}>
          <Text style={styles.netLabel}>Net Salary</Text>
          <Text style={styles.netValue}>{currency(slip.netSalary)}</Text>
        </View>

        {/* Download */}
        <TouchableOpacity
          style={styles.downloadBtn}
          onPress={() => Alert.alert('Info', 'Contact HR for a physical copy of your salary slip.')}
        >
          <MaterialCommunityIcons name="download-outline" size={20} color={Colors.primary} />
          <Text style={styles.downloadText}>Download PDF</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDark },
  pad: { padding: 16, paddingBottom: 40, gap: 12 },
  headerCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  empName: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  empMeta: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  period: { color: Colors.primary, fontSize: 14, fontWeight: '600', marginTop: 4 },
  section: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    gap: 2,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: { alignItems: 'center', gap: 4 },
  statNum: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800' },
  statLabel: { color: Colors.textMuted, fontSize: 11 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowLabel: { color: Colors.textMuted, fontSize: 14 },
  rowValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '500' },
  rowHighlight: { color: Colors.primary, fontWeight: '700' },
  netCard: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  netValue: { color: '#fff', fontSize: 28, fontWeight: '900' },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  downloadText: { color: Colors.primary, fontSize: 15, fontWeight: '600' },
});
