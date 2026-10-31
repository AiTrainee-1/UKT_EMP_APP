import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Pressable,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../../src/hooks/useAuth';
import { useEmployee } from '../../src/hooks/useEmployee';
import {
  useDocuments,
  openDocument,
  saveDocumentCopy,
  shareDocument,
  clearDocumentCache,
  removeLegacyCacheCopies,
  type EmployeeDocument,
} from '../../src/hooks/useDocuments';
import { DocumentCategoryCard, categoryIcon, type DocumentAction } from '../../src/components/DocumentCategoryCard';
import { ImagePreviewModal } from '../../src/components/documents/ImagePreviewModal';
import { RetryPanel } from '../../src/components/documents/RetryPanel';
import { Reveal } from '../../src/components/Reveal';
import { Avatar } from '../../src/components/ui/Avatar';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SkeletonCard, Skeleton } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';
import {
  describeFileError,
  groupByCategory,
  latestUpload,
  resolveActiveCategory,
  shortDate,
  type CategoryGroup,
} from '../../src/lib/documents';

type Group = CategoryGroup<EmployeeDocument>;

export default function DocumentsScreen() {
  const { C, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const { data: emp } = useEmployee(user?.employeeId ?? null);
  const { data, isLoading, isError, refetch, isRefetching, isFetching } = useDocuments();

  const allGroups = useMemo(() => groupByCategory(data), [data]);
  const [chosenCategory, setChosenCategory] = useState<string | null>(null);
  // A chip whose category disappeared after a refresh falls back to "All" — never a dead end.
  const activeCategory = resolveActiveCategory(chosenCategory, allGroups);
  const groups = activeCategory ? allGroups.filter((g) => g.category === activeCategory) : allGroups;
  const lastUpdated = shortDate(latestUpload(data));

  const [busy, setBusy] = useState<{ id: number; action: DocumentAction } | null>(null);
  const [preview, setPreview] = useState<{ uri: string; doc: EmployeeDocument } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 4200);
  }, []);

  // Temporary copies of identity documents are removed when the employee arrives and when they leave.
  useEffect(() => {
    clearDocumentCache();
    return () => {
      clearDocumentCache();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  const legacyCleaned = useRef(false);
  useEffect(() => {
    if (data?.length && !legacyCleaned.current) {
      legacyCleaned.current = true;
      removeLegacyCacheCopies(data);
    }
  }, [data]);

  const fail = useCallback(
    (err: unknown) => {
      const { title, message } = describeFileError(err);
      showToast(`${title}. ${message}`, 'error');
    },
    [showToast],
  );

  const handleOpen = useCallback(
    async (doc: EmployeeDocument) => {
      setBusy({ id: doc.id, action: 'open' });
      try {
        const r = await openDocument(doc);
        if (r.type === 'image') setPreview({ uri: r.uri, doc });
        else if (r.type === 'shared') {
          showToast('No viewer app was found, so the share menu opened. Pick an app there to view the file.', 'info');
        }
      } catch (err) {
        fail(err);
      } finally {
        setBusy(null);
      }
    },
    [fail, showToast],
  );

  const handleSave = useCallback(
    async (doc: EmployeeDocument) => {
      setBusy({ id: doc.id, action: 'save' });
      try {
        const r = await saveDocumentCopy(doc);
        if (r.type === 'saved') showToast(`Saved “${r.fileName}” to ${r.folder}.`, 'success');
      } catch (err) {
        fail(err);
      } finally {
        setBusy(null);
      }
    },
    [fail, showToast],
  );

  const handleShare = useCallback(
    async (doc: EmployeeDocument) => {
      setBusy({ id: doc.id, action: 'share' });
      try {
        await shareDocument(doc);
      } catch (err) {
        fail(err);
      } finally {
        setBusy(null);
      }
    },
    [fail],
  );

  const refreshControl = (
    <RefreshControl
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
      }}
      tintColor={C.primary}
      colors={[C.primary]}
    />
  );

  const fileCount = data?.length ?? 0;
  const header = (
    <>
      <Reveal index={0} offsetY={14}>
        <LinearGradient colors={C.gradientRoyal} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <Avatar uri={emp?.photoUrl} name={emp?.name ?? user?.name} size={46} borderColor="rgba(255,255,255,0.5)" />
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName} numberOfLines={1}>{emp?.name ?? user?.name ?? 'My documents'}</Text>
              <Text style={styles.heroMeta} numberOfLines={1}>
                {[emp?.employeeCode, emp?.departmentName ?? emp?.designationTitle].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={styles.heroLock} accessibilityLabel="Private to you" accessible>
              <MaterialCommunityIcons name="shield-lock-outline" size={18} color="#fff" />
            </View>
          </View>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, TabularNums]}>{fileCount}</Text>
              <Text style={styles.statLabel}>{fileCount === 1 ? 'File' : 'Files'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, TabularNums]}>{allGroups.length}</Text>
              <Text style={styles.statLabel}>{allGroups.length === 1 ? 'Category' : 'Categories'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={[styles.stat, { flex: 1.4 }]}>
              <Text style={[styles.statValue, styles.statValueSmall, TabularNums]} numberOfLines={1}>
                {lastUpdated || '—'}
              </Text>
              <Text style={styles.statLabel}>Last added</Text>
            </View>
          </View>
        </LinearGradient>
      </Reveal>

      <Reveal index={1}>
        <View style={styles.tip}>
          <MaterialCommunityIcons name="gesture-tap" size={16} color={C.primary} />
          <Text style={styles.tipText}>
            Tap a file to open it. Use <Text style={styles.tipStrong}>Save</Text> to keep a copy in a folder you choose,
            or <Text style={styles.tipStrong}>Share</Text> to send it.
          </Text>
        </View>
      </Reveal>

      {isError && !!data && (
        <View style={styles.staleBanner} accessibilityLiveRegion="polite">
          <MaterialCommunityIcons name="wifi-off" size={14} color={C.badgeYellowText} />
          <Text style={styles.staleText}>Couldn’t refresh. Showing the last list you loaded.</Text>
        </View>
      )}

      {allGroups.length > 1 && (
        <Reveal index={2}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            accessibilityRole="tablist"
          >
            {[{ category: null as string | null, categoryLabel: 'All', count: fileCount }]
              .concat(allGroups.map((g) => ({ category: g.category, categoryLabel: g.categoryLabel, count: g.files.length })))
              .map((g) => {
                const active = activeCategory === g.category;
                return (
                  <Pressable
                    key={g.category ?? 'all'}
                    onPress={() => setChosenCategory(g.category)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${g.categoryLabel}, ${g.count} ${g.count === 1 ? 'file' : 'files'}`}
                    style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.8 }]}
                  >
                    {g.category && (
                      <MaterialCommunityIcons
                        name={categoryIcon(g.category) as any}
                        size={14}
                        color={active ? C.onPrimary : C.textMuted}
                      />
                    )}
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                      {g.categoryLabel}
                    </Text>
                    <View style={[styles.chipCount, active && styles.chipCountActive]}>
                      <Text style={[styles.chipCountText, active && styles.chipTextActive, TabularNums]}>{g.count}</Text>
                    </View>
                  </Pressable>
                );
              })}
          </ScrollView>
        </Reveal>
      )}
    </>
  );

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <View style={styles.pad} accessible accessibilityLabel="Loading your documents">
        <Skeleton height={150} borderRadius={BorderRadius.xxl} style={{ marginBottom: 14 }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </View>
    );
  } else if (isError && !data) {
    content = (
      <RetryPanel
        title="Couldn’t load your documents"
        message="Check your internet connection, then try again."
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  } else if (!data?.length) {
    content = (
      <ScrollView contentContainerStyle={styles.emptyWrap} refreshControl={refreshControl}>
        <EmptyState
          icon="folder-account-outline"
          title="No documents yet"
          subtitle="When HR uploads your documents (PAN, Aadhaar, offer letter and others) they will appear here. Pull down to check again."
        />
      </ScrollView>
    );
  } else {
    content = (
      <FlatList<Group>
        data={groups}
        keyExtractor={(g) => g.category}
        contentContainerStyle={styles.pad}
        refreshControl={refreshControl}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <Reveal index={index + 3}>
            <DocumentCategoryCard
              category={item.category}
              categoryLabel={item.categoryLabel}
              files={item.files}
              busy={busy}
              onOpen={handleOpen}
              onSave={handleSave}
              onShare={handleShare}
            />
          </Reveal>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <MaterialCommunityIcons name="lock-outline" size={13} color={C.textMuted} />
            <Text style={styles.footerText}>
              Only you and HR can see these files. Copies opened here are removed from the app when you leave this page.
            </Text>
          </View>
        }
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} accessibilityRole="header">My Documents</Text>
          <Text style={styles.headerSubtitle}>Records HR keeps for you</Text>
        </View>
      </View>

      {content}

      <ImagePreviewModal
        uri={preview?.uri ?? null}
        title={preview?.doc.originalFilename ?? ''}
        onClose={() => setPreview(null)}
        busy={busy && preview && busy.id === preview.doc.id && busy.action !== 'open' ? busy.action : null}
        onSave={() => {
          if (!preview) return;
          const d = preview.doc;
          // The save picker / share sheet must not open on top of the photo viewer.
          setPreview(null);
          setTimeout(() => void handleSave(d), Platform.OS === 'ios' ? 450 : 50);
        }}
        onShare={() => {
          if (!preview) return;
          const d = preview.doc;
          setPreview(null);
          setTimeout(() => void handleShare(d), Platform.OS === 'ios' ? 450 : 50);
        }}
      />

      <Toast {...toast} />
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgLight },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.bgSurfaceLow,
    },
    headerTitle: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
    headerSubtitle: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11.5, marginTop: 1 },

    pad: { padding: 16, paddingBottom: 40 },
    emptyWrap: { flexGrow: 1, justifyContent: 'center' },

    hero: {
      borderRadius: BorderRadius.xxl,
      padding: 18,
      marginBottom: 12,
      overflow: 'hidden',
    },
    heroGlow: {
      position: 'absolute',
      width: 200,
      height: 200,
      borderRadius: 100,
      right: -60,
      top: -90,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    heroName: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 17 },
    heroMeta: { color: 'rgba(255,255,255,0.78)', fontFamily: FontFamily.bodyRegular, fontSize: 12.5, marginTop: 2 },
    heroLock: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(255,255,255,0.14)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderRadius: BorderRadius.lg,
      paddingVertical: 10,
    },
    stat: { flex: 1, alignItems: 'center' },
    statValue: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 19 },
    statValueSmall: { fontSize: 13.5, paddingTop: 3, paddingBottom: 2 },
    statLabel: { color: 'rgba(255,255,255,0.72)', fontFamily: FontFamily.bodyRegular, fontSize: 11, marginTop: 1 },
    statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.18)' },

    tip: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      backgroundColor: C.primaryFixed,
      borderRadius: BorderRadius.md,
      padding: 12,
      marginBottom: 12,
    },
    tipText: { flex: 1, color: C.onPrimaryContainer, fontFamily: FontFamily.bodyRegular, fontSize: 12.5, lineHeight: 18 },
    tipStrong: { fontFamily: FontFamily.bodySemibold },

    staleBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.badgeYellowBg,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 12,
    },
    staleText: { flex: 1, fontFamily: FontFamily.bodySemibold, fontSize: 12, color: C.badgeYellowText },

    chipRow: { gap: 8, paddingBottom: 14, paddingRight: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.bgCard,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: BorderRadius.full,
      paddingLeft: 12,
      paddingRight: 6,
      paddingVertical: 6,
      minHeight: 38,
    },
    chipActive: { backgroundColor: C.primary, borderColor: C.primary },
    chipText: { color: C.textSecondary, fontFamily: FontFamily.bodySemibold, fontSize: 12.5, maxWidth: 180 },
    chipTextActive: { color: C.onPrimary },
    chipCount: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.bgSurfaceLow,
    },
    chipCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
    chipCountText: { color: C.textMuted, fontFamily: FontFamily.bodySemibold, fontSize: 11 },

    footer: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', paddingHorizontal: 6, paddingTop: 6 },
    footerText: { flex: 1, color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11.5, lineHeight: 17 },
  });
