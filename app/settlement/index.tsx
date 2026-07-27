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
import { format } from 'date-fns';

import { useAuth } from '../../src/hooks/useAuth';
import { useAdvances, Advance } from '../../src/hooks/useAdvances';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { BorderRadius, Spacing, ClayElevation } from '../../src/constants/theme';

function AdvanceCard({ advance }: { advance: Advance }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.amount}>₹{advance.amount.toLocaleString('en-IN')}</Text>
          <Text style={styles.purpose} numberOfLines={1}>{advance.purpose}</Text>
          <Text style={styles.date}>{format(new Date(advance.createdAt), 'dd MMM yyyy')}</Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.remainingLabel}>Remaining</Text>
          <Text style={[
            styles.remaining,
            advance.outstanding > 0 ? styles.remainingAlert : styles.remainingClear,
          ]}>
            ₹{advance.outstanding.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.repaid}>₹{advance.totalRepaid.toLocaleString('en-IN')} repaid</Text>
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
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useAdvances(user?.employeeId ?? null);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={data || []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.pad, !(data?.length) && styles.center]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  pad: { padding: 16, paddingBottom: 32 },
  center: { flex: 1 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    ...ClayElevation.low,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft: { flex: 1, gap: 4 },
  amount: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800' },
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
