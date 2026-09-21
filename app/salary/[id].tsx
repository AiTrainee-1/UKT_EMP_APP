import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSalarySlip, downloadAndShareSalarySlip } from '../../src/hooks/useSalarySlips';
import { Badge } from '../../src/components/ui/Badge';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';

const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function Row({ label, sub, value, highlight, tone }: { label: string; sub?: string; value: string; highlight?: boolean; tone?: 'green' | 'red' }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <Text style={[
        styles.rowValue, TabularNums,
        highlight && styles.rowHighlight,
        tone === 'green' && { color: Colors.statusGreen },
        tone === 'red' && { color: Colors.statusRed },
      ]}>{value}</Text>
    </View>
  );
}

function currency(n: number) {
  return `₹${(n || 0).toLocaleString('en-IN')}`;
}

export default function SalarySlipDetail() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: slip, isLoading } = useSalarySlip(Number(id));
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!slip) return;
    setDownloading(true);
    try {
      await downloadAndShareSalarySlip(slip);
    } catch {
      Alert.alert('Download failed', 'Could not generate the PDF right now. Please try again later.');
    } finally {
      setDownloading(false);
    }
  };

  const totalEarnings = slip ? slip.basic + slip.hra + slip.allowances : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Salary Breakdown</Text>
          {!!slip && <Text style={styles.headerSubtitle}>Monthly Payslip • {MONTHS[slip.month]} {slip.year}</Text>}
        </View>
      </View>

      {isLoading || !slip ? (
        <View style={styles.pad}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
          {/* ─── Net pay hero ─── */}
          <View style={styles.netCard}>
            <View style={styles.netTopRow}>
              <Text style={styles.netLabel}>NET TAKE-HOME PAY</Text>
              <Badge
                label={slip.emailedAt ? 'Emailed & Verified' : 'Generated'}
                variant={slip.emailedAt ? 'paid' : 'generated'}
              />
            </View>
            <Text style={[styles.netValue, TabularNums]}>{currency(slip.netSalary)}</Text>
          </View>

          {/* ─── Identity ─── */}
          <View style={styles.idCard}>
            <View style={styles.idAvatar}>
              <Text style={styles.idAvatarText}>{slip.employeeName?.[0] ?? '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.idName}>{slip.employeeName}</Text>
                <Text style={styles.idCode}>{slip.employeeCode}</Text>
              </View>
              <Text style={styles.idMeta}>{slip.departmentName ?? '—'}</Text>
            </View>
          </View>

          {/* ─── Attendance factor ─── */}
          <Text style={styles.sectionLabel}>MUSTER ROLL & ATTENDANCE</Text>
          <View style={styles.statsGrid}>
            {[
              { label: 'Total Days', value: slip.workingDays },
              { label: 'Present', value: slip.presentDays, color: Colors.statusGreen },
              { label: 'Absent', value: slip.absentDays, color: Colors.statusRed },
              { label: 'Late', value: slip.lateDays, color: Colors.statusYellow },
            ].map(({ label, value, color }) => (
              <View key={label} style={styles.statCell}>
                <Text style={[styles.statNum, TabularNums, color && { color }]}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* ─── Gross / Deductions summary chips ─── */}
          <View style={styles.chipsRow}>
            <View style={[styles.chip, styles.chipGreen]}>
              <MaterialCommunityIcons name="arrow-down-bold-circle-outline" size={13} color={Colors.statusGreen} />
              <Text style={[styles.chipLabel, { color: Colors.statusGreen }]}>Gross Earnings</Text>
              <Text style={[styles.chipValue, TabularNums, { color: Colors.statusGreen }]}>{currency(totalEarnings)}</Text>
            </View>
            <View style={[styles.chip, styles.chipRed]}>
              <MaterialCommunityIcons name="arrow-up-bold-circle-outline" size={13} color={Colors.statusRed} />
              <Text style={[styles.chipLabel, { color: Colors.statusRed }]}>Deductions</Text>
              <Text style={[styles.chipValue, TabularNums, { color: Colors.statusRed }]}>{currency(slip.totalDeductions)}</Text>
            </View>
          </View>

          {/* ─── Earnings ─── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIcon, { backgroundColor: Colors.badgeGreenBg }]}>
                <MaterialCommunityIcons name="plus" size={14} color={Colors.statusGreen} />
              </View>
              <Text style={styles.sectionTitle}>Earnings Breakdown</Text>
            </View>
            <Row label="Basic Salary" value={currency(slip.basic)} />
            <Row label="House Rent Allowance (HRA)" value={currency(slip.hra)} />
            <Row label="Other Allowances" value={currency(slip.allowances)} />
            <Row label="Gross Total Earnings" value={currency(totalEarnings)} highlight />
          </View>

          {/* ─── Deductions ─── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={[styles.sectionIcon, { backgroundColor: Colors.badgeRedBg }]}>
                <MaterialCommunityIcons name="minus" size={14} color={Colors.statusRed} />
              </View>
              <Text style={styles.sectionTitle}>Deductions & Recoveries</Text>
            </View>
            <Row label="Provident Fund (PF)" sub="Employee share" value={currency(slip.pfDeduction)} />
            <Row label="Employee State Insurance (ESI)" value={currency(slip.esiDeduction)} />
            <Row label="Advance Salary Recovery" value={currency(slip.advanceDeduction)} />
            <Row label="Other Deductions" value={currency(slip.otherDeductions)} />
            <Row label="Total Deductions" value={currency(slip.totalDeductions)} highlight />
          </View>

          {/* ─── Final calculation bar ─── */}
          <View style={styles.calcBar}>
            <View style={styles.calcIconWrap}>
              <MaterialCommunityIcons name="calculator-variant-outline" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.calcLabel}>Gross {currency(totalEarnings)} − Deductions {currency(slip.totalDeductions)}</Text>
              <Text style={styles.calcHint}>Final Disbursement</Text>
            </View>
            <Text style={[styles.calcValue, TabularNums]}>{currency(slip.netSalary)}</Text>
          </View>

          <View style={styles.verifyBox}>
            <MaterialCommunityIcons name="shield-check-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.verifyText}>
              This is a digitally generated payslip from the UKTextiles Payroll System. No physical signature required.
            </Text>
          </View>

          {/* ─── Download / Share ─── */}
          <TouchableOpacity
            style={[styles.downloadBtn, downloading && styles.downloadBtnDisabled]}
            onPress={handleDownload}
            disabled={downloading}
            activeOpacity={0.85}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="download-outline" size={18} color="#fff" />
            )}
            <Text style={styles.downloadText}>{downloading ? 'Preparing PDF…' : 'Download / Share PDF'}</Text>
          </TouchableOpacity>
        </ScrollView>
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

  pad: { padding: Spacing.base, paddingBottom: 40, gap: 12 },

  netCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: 18,
    gap: 8,
    ...cardShadow,
  },
  netTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  netLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  netValue: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 30, letterSpacing: -0.4 },

  idCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    ...cardShadow,
  },
  idAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  idAvatarText: { color: Colors.primary, fontFamily: FontFamily.displayBold, fontSize: 15 },
  idName: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14.5 },
  idCode: { color: Colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  idMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statCell: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
    ...cardShadow,
  },
  statNum: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
  statLabel: { color: Colors.textMuted, fontSize: 9.5, fontWeight: '700', textAlign: 'center' },

  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, borderRadius: BorderRadius.lg, padding: 12, gap: 2 },
  chipGreen: { backgroundColor: Colors.badgeGreenBg },
  chipRed: { backgroundColor: Colors.badgeRedBg },
  chipLabel: { fontSize: 10.5, fontWeight: '700' },
  chipValue: { fontFamily: FontFamily.displayBold, fontSize: 16 },

  section: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    ...cardShadow,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  rowLabel: { color: Colors.textPrimary, fontSize: 13 },
  rowSub: { color: Colors.textMuted, fontSize: 10.5, marginTop: 1 },
  rowValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  rowHighlight: { color: Colors.textPrimary, fontWeight: '800', fontSize: 14 },

  calcBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: 14,
  },
  calcIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  calcLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },
  calcHint: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 1 },
  calcValue: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 18 },

  verifyBox: {
    flexDirection: 'row', gap: 8,
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.lg,
    padding: 12,
  },
  verifyText: { flex: 1, color: Colors.textMuted, fontSize: 11, lineHeight: 16 },

  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  downloadBtnDisabled: { opacity: 0.6 },
  downloadText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
});
