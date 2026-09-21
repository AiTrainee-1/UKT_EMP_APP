import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useAdvances, Advance } from '../../src/hooks/useAdvances';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing, ClayElevation } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';

function AdvanceCard({ advance }: { advance: Advance }) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={[styles.amount, TabularNums]}>₹{advance.amount.toLocaleString('en-IN')}</Text>
          <Text style={styles.purpose} numberOfLines={1}>{advance.purpose}</Text>
          <Text style={styles.date}>{format(new Date(advance.createdAt), 'dd MMM yyyy')}</Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.remainingLabel}>Remaining</Text>
          <Text style={[
            styles.remaining,
            TabularNums,
            advance.outstanding > 0 ? styles.remainingAlert : styles.remainingClear,
          ]}>
            ₹{advance.outstanding.toLocaleString('en-IN')}
          </Text>
          <Text style={[styles.repaid, TabularNums]}>₹{advance.totalRepaid.toLocaleString('en-IN')} repaid</Text>
        </View>
      </View>

      {advance.repayments?.length > 0 && (
        <TouchableOpacity style={styles.expandBtn} onPress={() => setExpanded((v) => !v)}>
          <Text style={styles.expandText}>
            {expanded ? 'Hide' : 'Show'} repayment history ({advance.repayments.length})
          </Text>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={Colors.primary}
          />
        </TouchableOpacity>
      )}

      {expanded && (
        <View style={styles.repayments}>
          {advance.repayments.map((r, i) => (
            <View key={i} style={styles.repayRow}>
              <Text style={styles.repayDate}>{format(new Date(r.date), 'dd MMM yyyy')}</Text>
              <Text style={styles.repayAmount}>₹{r.amount.toLocaleString('en-IN')}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function SettlementScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useAdvances(user?.employeeId ?? null);

  const totalOutstanding = (data ?? []).reduce((sum, a) => sum + a.outstanding, 0);
  const totalRepaid = (data ?? []).reduce((sum, a) => sum + a.totalRepaid, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Advances & Loans</Text>
          <Text style={styles.headerSubtitle}>{data?.length ?? 0} record{data?.length === 1 ? '' : 's'}</Text>
        </View>
      </View>

      <FlatList
        data={data || []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.pad, !(data?.length) && styles.center]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          !!data?.length ? (
            <View style={styles.summaryRow}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Outstanding</Text>
                <Text style={[styles.summaryValue, { color: totalOutstanding > 0 ? Colors.statusRed : Colors.statusGreen }, TabularNums]}>
                  ₹{totalOutstanding.toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Total Repaid</Text>
                <Text style={[styles.summaryValue, { color: Colors.textPrimary }, TabularNums]}>
                  ₹{totalRepaid.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View>
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
            </View>
          ) : (
            <EmptyState
              icon="cash-minus"
              title="No advances or loans"
              subtitle="Your advance and loan records will appear here"
            />
          )
        }
        renderItem={({ item }) => <AdvanceCard advance={item} />}
      />
    </SafeAreaView>
  );
}

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

  summaryRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 16,
    marginBottom: 14,
    ...ClayElevation.low,
  },
  summaryCell: { flex: 1, alignItems: 'center', gap: 4 },
  summaryDivider: { width: 1, backgroundColor: Colors.outlineVariant },
  summaryLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700' },
  summaryValue: { fontFamily: FontFamily.displayBold, fontSize: 18 },

  pad: { padding: 16, paddingBottom: 32 },
  center: { flex: 1 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    ...ClayElevation.low,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft: { flex: 1, gap: 4 },
  amount: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 22 },
  purpose: { color: Colors.textSecondary, fontSize: 14 },
  date: { color: Colors.textMuted, fontSize: 12 },
  cardRight: { alignItems: 'flex-end', gap: 2 },
  remainingLabel: { color: Colors.textMuted, fontSize: 11 },
  remaining: { fontSize: 18, fontWeight: '700' },
  remainingAlert: { color: Colors.primary },
  remainingClear: { color: Colors.statusGreen },
  repaid: { color: Colors.textMuted, fontSize: 11 },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  expandText: { color: Colors.primary, fontSize: 13 },
  repayments: {
    marginTop: 8,
    gap: 6,
  },
  repayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  repayDate: { color: Colors.textMuted, fontSize: 13 },
  repayAmount: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
});
