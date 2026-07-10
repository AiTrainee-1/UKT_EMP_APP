import React from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSalarySlips } from '../../src/hooks/useSalarySlips';
import { SalarySlipCard } from '../../src/components/SalarySlipCard';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';

export default function SalarySlipsScreen() {
  const { data, isLoading, refetch, isRefetching } = useSalarySlips();

  const sorted = [...(data || [])].sort(
    (a, b) => b.year - a.year || b.month - a.month
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {isLoading ? (
        <View style={styles.pad}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.pad, !sorted.length && styles.center]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="cash-multiple"
              title="No salary slips yet"
              subtitle="Your salary slips will appear here once HR generates payroll"
            />
          }
          renderItem={({ item }) => (
            <SalarySlipCard slip={item} onPress={() => router.push(`/salary/${item.id}` as any)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  pad: { padding: 16, paddingBottom: 32 },
  center: { flex: 1 },
});
