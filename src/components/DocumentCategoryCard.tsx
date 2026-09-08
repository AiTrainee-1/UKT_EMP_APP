import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, Image, SafeAreaView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors } from '../constants/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius } from '../constants/theme';
import { EmployeeDocument, viewDocument, downloadDocument, isImageFile } from '../hooks/useDocuments';

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

interface Props {
  categoryLabel: string;
  category: string;
  files: EmployeeDocument[];
}

export function DocumentCategoryCard({ categoryLabel, category, files }: Props) {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const handleView = async (doc: EmployeeDocument) => {
    setBusyId(doc.id);
    try {
      const uri = await viewDocument(doc);
      if (isImageFile(doc.originalFilename)) setPreviewUri(uri);
    } catch {
      Alert.alert('Could not open file', 'Please try again later.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (doc: EmployeeDocument) => {
    setBusyId(doc.id);
    try {
      await downloadDocument(doc);
      Alert.alert('Downloaded', `${doc.originalFilename} has been saved.`);
    } catch {
      Alert.alert('Could not download file', 'Please try again later.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons
            name={(CATEGORY_ICONS[category] ?? 'folder-outline') as any}
            size={18}
            color={Colors.primary}
          />
        </View>
        <Text style={styles.title}>{categoryLabel}</Text>
      </View>

      <View style={styles.files}>
        {files.map((doc) => (
          <View key={doc.id} style={styles.fileRow}>
            <MaterialCommunityIcons name="file-outline" size={16} color={Colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>{doc.originalFilename}</Text>
              {doc.uploadedAt && (
                <Text style={styles.fileDate}>{format(new Date(doc.uploadedAt), 'dd MMM yyyy')}</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.fileActionBtn}
              onPress={() => handleView(doc)}
              disabled={busyId === doc.id}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="eye-outline" size={18} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fileActionBtn}
              onPress={() => handleDownload(doc)}
              disabled={busyId === doc.id}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="tray-arrow-down" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <SafeAreaView style={styles.previewBackdrop}>
          <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewUri(null)}>
            <MaterialCommunityIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {previewUri && (
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700', flex: 1 },
  files: { gap: 4 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgSurfaceLow,
  },
  fileName: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  fileDate: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  fileActionBtn: { padding: 4, marginLeft: 4 },

  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  previewCloseBtn: { position: 'absolute', top: 16, right: 16, zIndex: 1, padding: 8 },
  previewImage: { width: '100%', height: '80%' },
});
