import React from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSalarySlips } from '../../src/hooks/useSalarySlips';
import { SalarySlipCard } from '../../src/components/SalarySlipCard';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { Spacing } from '../../src/constants/theme';

export default function SalarySlipsScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

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

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  pad: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  center: { flex: 1 },
});
