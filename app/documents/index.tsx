import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '../../src/hooks/useAuth';
import { useEmployee } from '../../src/hooks/useEmployee';
import { useDocuments, EmployeeDocument } from '../../src/hooks/useDocuments';
import { DocumentCategoryCard } from '../../src/components/DocumentCategoryCard';
import { Avatar } from '../../src/components/ui/Avatar';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

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

  const { user } = useAuth();
  const { data: emp } = useEmployee(user?.employeeId ?? null);
  const { data, isLoading, refetch, isRefetching } = useDocuments();
  const allGroups = groupByCategory(data || []);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const groups = activeCategory ? allGroups.filter((g) => g.category === activeCategory) : allGroups;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Personal Documents</Text>
          <Text style={styles.headerSubtitle}>HR-Verified Records & Compliance</Text>
        </View>
      </View>

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
          ListHeaderComponent={
            !!data?.length ? (
              <>
                <View style={styles.vaultCard}>
                  <Avatar uri={emp?.photoUrl} name={emp?.name ?? user?.name} size={40} borderColor={Colors.border} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vaultName}>{emp?.name ?? user?.name}</Text>
                    <Text style={styles.vaultMeta}>{emp?.employeeCode} · {emp?.departmentName ?? emp?.designationTitle}</Text>
                  </View>
                  <View style={styles.vaultCountPill}>
                    <MaterialCommunityIcons name="file-check-outline" size={13} color={Colors.primary} />
                    <Text style={styles.vaultCountText}>{data.length} File{data.length === 1 ? '' : 's'}</Text>
                  </View>
                </View>

                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, !activeCategory && styles.chipActive]}
                    onPress={() => setActiveCategory(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, !activeCategory && styles.chipTextActive]}>All ({data.length})</Text>
                  </TouchableOpacity>
                  {allGroups.map((g) => (
                    <TouchableOpacity
                      key={g.category}
                      style={[styles.chip, activeCategory === g.category && styles.chipActive]}
                      onPress={() => setActiveCategory(activeCategory === g.category ? null : g.category)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, activeCategory === g.category && styles.chipTextActive]} numberOfLines={1}>
                        {g.categoryLabel} ({g.files.length})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null
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

  pad: { padding: 16, paddingBottom: 32 },
  center: { flex: 1 },

  vaultCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
    ...cardShadow,
  },
  vaultName: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  vaultMeta: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  vaultCountPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.badgeGreenBg, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 6 },
  vaultCountText: { color: Colors.primary, fontSize: 11, fontWeight: '800' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontSize: 11.5, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
});
