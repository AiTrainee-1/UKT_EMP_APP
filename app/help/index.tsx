import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format, isValid, parseISO } from 'date-fns';

import { SupportContactCard } from '../../src/components/support/SupportContactCard';
import { useSupportContact } from '../../src/hooks/useSupportContact';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

/**
 * Help & Support: who to contact, for signed-in employees. The details are the ones HR keeps in the HR
 * portal (Settings -> HR Contact), saved on the phone so they are still here when the server is not.
 */
export default function HelpScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { contact, refetch } = useSupportContact();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const updatedAt = contact?.updatedAt ? parseISO(contact.updatedAt) : null;
  const note = contact?.configured ? contact.note : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Help & Support</Text>
          <Text style={styles.headerSubtitle}>Who to contact, and when</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <Text style={styles.intro}>
          Pick the contact that fits your problem. Both are kept up to date by HR.
        </Text>

        <SupportContactCard
          situation="hr"
          description="Cannot sign in, password or code problems, account questions, problems with the app, or questions about your own details."
          showNote={false}
        />
        <SupportContactCard
          situation="server"
          style={styles.second}
          description="The server or system is not working, cannot be reached, or the app keeps showing errors."
          showNote={false}
        />

        {!!note && (
          <View style={styles.noteBox}>
            <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
            <Text style={styles.noteText}>{note}</Text>
          </View>
        )}

        {!!updatedAt && isValid(updatedAt) && (
          <Text style={styles.updated}>Details last updated {format(updatedAt, 'dd MMM yyyy')}</Text>
        )}
      </ScrollView>
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
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bgSurfaceLow,
  },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 17 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },

  content: { padding: 16, paddingBottom: 32 },
  intro: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  second: { marginTop: 12 },

  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.lg,
    padding: 12,
    marginTop: 14,
  },
  noteText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },
  updated: { color: Colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 16 },
});
