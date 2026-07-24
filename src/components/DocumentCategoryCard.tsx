import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors } from '../constants/colors';
import { BorderRadius } from '../constants/theme';
import { EmployeeDocument, downloadAndShareDocument } from '../hooks/useDocuments';

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
  const [openingId, setOpeningId] = useState<number | null>(null);

  const handleOpen = async (doc: EmployeeDocument) => {
    setOpeningId(doc.id);
    try {
      await downloadAndShareDocument(doc);
    } catch {
      Alert.alert('Could not open file', 'Please try again later.');
    } finally {
      setOpeningId(null);
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
          <TouchableOpacity
            key={doc.id}
            style={styles.fileRow}
            onPress={() => handleOpen(doc)}
            disabled={openingId === doc.id}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="file-outline" size={16} color={Colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>{doc.originalFilename}</Text>
              {doc.uploadedAt && (
                <Text style={styles.fileDate}>{format(new Date(doc.uploadedAt), 'dd MMM yyyy')}</Text>
              )}
            </View>
            <MaterialCommunityIcons
              name={openingId === doc.id ? 'loading' : 'tray-arrow-down'}
              size={18}
              color={Colors.primary}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
