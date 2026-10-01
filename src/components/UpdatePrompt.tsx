import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSegments } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { APP_VERSION } from '../lib/appVersion';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius } from '../constants/theme';
import { FontFamily } from '../constants/typography';

/**
 * "New Version Available" popup, shown over every screen (the login page included) whenever HR has
 * published a newer build than the one that is running. It works like the Location permission
 * popup: it stays until the employee does something about it.
 *
 * "Download and Install" opens the APK link HR published; the phone downloads it and the employee
 * taps it to install. A required update has no way to dismiss it. An optional one can be put off
 * with "Later", which only lasts until the app is next opened.
 */
export function UpdatePrompt() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { data } = useAppUpdate();
  const segments = useSegments();
  const [postponed, setPostponed] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const latest = data?.latest;
  if (!data?.updateAvailable || !latest) return null;
  // Not over the startup animation: the prompt appears as soon as the app has moved on to its first screen.
  // (The root route has no segments; the typed-routes tuple type just doesn't admit an empty one.)
  if ((segments as string[]).length === 0) return null;
  if (!latest.mandatory && postponed === latest.version) return null;

  const download = async () => {
    setOpening(true);
    try {
      await Linking.openURL(latest.downloadUrl);
    } catch {
      Alert.alert('Could not open the download', 'Please check your internet connection and try again, or ask HR for the new app.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={styles.overlay} accessibilityViewIsModal testID="update-prompt">
      <View style={styles.card}>
        <LinearGradient colors={Colors.gradientPrimary} style={styles.iconWrap}>
          <MaterialCommunityIcons name="cellphone-arrow-down" size={30} color="#fff" />
        </LinearGradient>

        <Text style={styles.title}>New Version Available</Text>
        <Text style={styles.body}>A new version of the mobile application is available.</Text>

        <View style={styles.versionPill}>
          <Text style={styles.versionText}>Version: {latest.version}</Text>
        </View>
        <Text style={styles.current}>You are using version {APP_VERSION}</Text>

        {latest.releaseNotes.trim() !== '' && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>What's new</Text>
            <ScrollView style={styles.notesScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              <Text style={styles.notesText}>{latest.releaseNotes.trim()}</Text>
            </ScrollView>
          </View>
        )}

        <TouchableOpacity style={styles.primaryBtn} onPress={download} activeOpacity={0.85} disabled={opening}>
          <MaterialCommunityIcons name="download" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>{opening ? 'Opening…' : 'Download and Install'}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          When the download finishes, open the file and tap Install. If Android asks, allow installing from this source.
        </Text>

        {!latest.mandatory && (
          <TouchableOpacity style={styles.laterBtn} onPress={() => setPostponed(latest.version)} activeOpacity={0.6}>
            <Text style={styles.laterText}>Later</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    // Above the permission popup: an update is worth doing first.
    zIndex: 1000,
    elevation: 1000,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    padding: 22,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 15 },
      android: { elevation: 12 },
    }),
  },
  iconWrap: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  title: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 19, marginBottom: 6, textAlign: 'center' },
  body: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 14 },

  versionPill: {
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  versionText: { color: Colors.primary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  current: { color: Colors.textMuted, fontSize: 11, marginTop: 6, marginBottom: 14 },

  notesBox: {
    width: '100%',
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.lg,
    padding: 12,
    marginBottom: 16,
  },
  notesLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, marginBottom: 4 },
  notesScroll: { maxHeight: 120 },
  notesText: { color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },

  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  hint: { color: Colors.textMuted, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 10 },

  laterBtn: { paddingVertical: 10, marginTop: 4 },
  laterText: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600', textDecorationLine: 'underline' },
});
