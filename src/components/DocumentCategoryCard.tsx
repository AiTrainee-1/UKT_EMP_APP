import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius } from '../constants/theme';
import { FontFamily } from '../constants/typography';
import type { EmployeeDocument } from '../hooks/useDocuments';
import { fileKind, kindLabel, shortDate, type FileKind } from '../lib/documents';

const CATEGORY_ICONS: Record<string, string> = {
  pan_card: 'card-account-details-outline',
  aadhaar_card: 'fingerprint',
  educational_certificate: 'school-outline',
  voter_id_or_birth_certificate: 'vote-outline',
  bank_passbook: 'bank-outline',
  offer_letter: 'file-sign',
  experience_letter: 'file-clock-outline',
  resignation_letter: 'file-remove-outline',
  staff_letter: 'file-account-outline',
  production_employee_documents: 'factory',
};

export function categoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? 'folder-outline';
}

function kindVisual(kind: FileKind, C: Palette): { icon: string; fg: string; bg: string } {
  switch (kind) {
    case 'pdf':
      return { icon: 'file-pdf-box', fg: C.statusRed, bg: C.badgeRedBg };
    case 'image':
      return { icon: 'file-image-outline', fg: C.statusBlue, bg: C.badgeBlueBg };
    case 'word':
      return { icon: 'file-word-outline', fg: C.primaryLight, bg: C.clayBlue };
    case 'sheet':
      return { icon: 'file-excel-outline', fg: C.statusGreen, bg: C.badgeGreenBg };
    default:
      return { icon: 'file-outline', fg: C.textMuted, bg: C.bgSurfaceMid };
  }
}

export type DocumentAction = 'open' | 'save' | 'share';

interface Props {
  categoryLabel: string;
  category: string;
  files: EmployeeDocument[];
  /** The document + action currently working (shows a spinner and blocks double taps). */
  busy: { id: number; action: DocumentAction } | null;
  onOpen: (doc: EmployeeDocument) => void;
  onSave: (doc: EmployeeDocument) => void;
  onShare: (doc: EmployeeDocument) => void;
}

/** One category ("PAN Card", "Offer Letter" …) with its files. Tap a file to open it. */
export function DocumentCategoryCard({ categoryLabel, category, files, busy, onOpen, onSave, onShare }: Props) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name={categoryIcon(category) as any} size={18} color={C.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {categoryLabel}
        </Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{files.length}</Text>
        </View>
      </View>

      <View style={styles.files}>
        {files.map((doc) => {
          const kind = fileKind(doc.originalFilename);
          const v = kindVisual(kind, C);
          const date = shortDate(doc.uploadedAt);
          const working = busy?.id === doc.id ? busy.action : null;
          const anyBusy = busy !== null;
          return (
            <View key={doc.id} style={styles.fileRow}>
              <Pressable
                onPress={() => onOpen(doc)}
                disabled={anyBusy}
                accessibilityRole="button"
                accessibilityLabel={`Open ${doc.originalFilename}, ${kindLabel(kind)}${date ? `, uploaded ${date}` : ''}`}
                accessibilityState={{ busy: working === 'open', disabled: anyBusy && working !== 'open' }}
                style={({ pressed }) => [styles.fileMain, pressed && styles.pressed]}
              >
                <View style={[styles.kindTile, { backgroundColor: v.bg }]}>
                  {working === 'open' ? (
                    <ActivityIndicator size="small" color={v.fg} />
                  ) : (
                    <MaterialCommunityIcons name={v.icon as any} size={22} color={v.fg} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {doc.originalFilename}
                  </Text>
                  <Text style={styles.fileMeta} numberOfLines={1}>
                    {working === 'open' ? 'Opening…' : `${kindLabel(kind)}${date ? ` · ${date}` : ''}`}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => onShare(doc)}
                disabled={anyBusy}
                accessibilityRole="button"
                accessibilityLabel={`Share ${doc.originalFilename}`}
                accessibilityState={{ busy: working === 'share' }}
                hitSlop={4}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed, anyBusy && !working && styles.dim]}
              >
                {working === 'share' ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <MaterialCommunityIcons name="share-variant-outline" size={19} color={C.primary} />
                )}
              </Pressable>
              <Pressable
                onPress={() => onSave(doc)}
                disabled={anyBusy}
                accessibilityRole="button"
                accessibilityLabel={`Save a copy of ${doc.originalFilename} to your phone`}
                accessibilityState={{ busy: working === 'save' }}
                hitSlop={4}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed, anyBusy && !working && styles.dim]}
              >
                {working === 'save' ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <MaterialCommunityIcons name="tray-arrow-down" size={19} color={C.primary} />
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: 14,
      marginBottom: 12,
      ...Platform.select({
        ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
        android: { elevation: 1 },
      }),
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: C.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: C.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15, flex: 1 },
    countPill: {
      minWidth: 26,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 7,
      backgroundColor: C.bgSurfaceLow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countText: { color: C.textSecondary, fontFamily: FontFamily.bodySemibold, fontSize: 11.5 },

    files: { gap: 8 },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: BorderRadius.md,
      backgroundColor: C.bgSurfaceLow,
      paddingRight: 4,
    },
    fileMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: BorderRadius.md },
    kindTile: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    fileName: { color: C.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13.5, lineHeight: 18 },
    fileMeta: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11.5, marginTop: 2 },
    actionBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.bgCard,
      borderWidth: 1,
      borderColor: C.border,
    },
    pressed: { opacity: 0.7 },
    dim: { opacity: 0.45 },
  });
