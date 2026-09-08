import React from 'react';
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDocuments, EmployeeDocument } from '../../src/hooks/useDocuments';
import { DocumentCategoryCard } from '../../src/components/DocumentCategoryCard';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';

interface CategoryGroup {
  category: string;
  categoryLabel: string;
  files: EmployeeDocument[];
}

function groupByCategory(docs: EmployeeDocument[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  for (const doc of docs) {
    if (!groups.has(doc.category)) {
      groups.set(doc.category, { category: doc.category, categoryLabel: doc.categoryLabel, files: [] });
    }
    groups.get(doc.category)!.files.push(doc);
  }
  return Array.from(groups.values());
}

export default function DocumentsScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { data, isLoading, refetch, isRefetching } = useDocuments();
  const groups = groupByCategory(data || []);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {isLoading ? (
        <View style={styles.pad}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.category}
          contentContainerStyle={[styles.pad, !groups.length && styles.center]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="folder-outline"
              title="No documents yet"
              subtitle="Documents uploaded by HR will appear here"
            />
          }
          renderItem={({ item }) => (
            <DocumentCategoryCard
              category={item.category}
              categoryLabel={item.categoryLabel}
              files={item.files}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  pad: { padding: 16, paddingBottom: 32 },
  center: { flex: 1 },
});
