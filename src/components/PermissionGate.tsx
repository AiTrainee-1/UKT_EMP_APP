import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, Linking, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotificationPermission } from '../hooks/useNotifications';
import { Colors } from '../constants/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { BorderRadius } from '../constants/theme';

const ONBOARDED_KEY = 'uktextiles.permissionsOnboarded.v1';

type MissingPerm = 'location' | 'camera';

const PERM_COPY: Record<MissingPerm, { icon: string; label: string; reason: string }> = {
  location: {
    icon: 'map-marker-outline',
    label: 'Location',
    reason: 'to verify attendance punches at your branch and track on-duty visits',
  },
  camera: {
    icon: 'camera-outline',
    label: 'Camera',
    reason: 'to take the verification photos required for on-duty and outside-branch punches',
  },
};

/**
 * Requests Location, Camera, and Notification permission on the very first
 * app launch (like most consumer apps' onboarding), then re-checks Location
 * and Camera on every subsequent launch and app-foreground — since a user
 * can grant a permission once and later revoke it from device Settings,
 * outside the app's own control. If either is missing when checked, a
 * blocking card explains why it's needed and offers to re-request it or
 * jump straight to the device's app-settings screen (the only way to
 * re-grant once the OS has already recorded one real denial, since neither
 * platform shows its native prompt a second time after that).
 *
 * Notification permission is requested here too on first launch, and
 * silently re-attempted on every subsequent check, but does NOT block the
 * app if missing — losing push notifications degrades the experience
 * without breaking any actual feature, unlike Location/Camera which gate
 * real punch-verification flows.
 */
export function PermissionGate() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [missing, setMissing] = useState<MissingPerm[]>([]);
  const [checked, setChecked] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const runningRef = useRef(false);

  const runCheck = useCallback(async (firstRun: boolean) => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      let locGranted: boolean;
      let camGranted: boolean;

      if (firstRun) {
        const locRes = await Location.requestForegroundPermissionsAsync();
        locGranted = locRes.status === 'granted';
        const camRes = await ImagePicker.requestCameraPermissionsAsync();
        camGranted = camRes.status === 'granted';
        await requestNotificationPermission();
        await AsyncStorage.setItem(ONBOARDED_KEY, '1');
      } else {
        const [locStatus, camStatus] = await Promise.all([
          Location.getForegroundPermissionsAsync(),
          ImagePicker.getCameraPermissionsAsync(),
        ]);
        locGranted = locStatus.status === 'granted';
        camGranted = camStatus.status === 'granted';
        requestNotificationPermission(); // best-effort, fire-and-forget
      }

      const gaps: MissingPerm[] = [];
      if (!locGranted) gaps.push('location');
      if (!camGranted) gaps.push('camera');
      setMissing(gaps);
    } finally {
      runningRef.current = false;
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY).then((v) => {
      runCheck(!v);
    });

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runCheck(false);
    });
    return () => sub.remove();
  }, [runCheck]);

  const handleGrant = async () => {
    setRetrying(true);
    try {
      if (missing.includes('location')) await Location.requestForegroundPermissionsAsync();
      if (missing.includes('camera')) await ImagePicker.requestCameraPermissionsAsync();
      await runCheck(false);
    } finally {
      setRetrying(false);
    }
  };

  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  if (!checked || missing.length === 0) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <LinearGradient colors={Colors.gradientPrimary} style={styles.iconWrap}>
          <MaterialCommunityIcons name="shield-alert-outline" size={30} color="#fff" />
        </LinearGradient>

        <Text style={styles.title}>Permission Needed</Text>
        <Text style={styles.body}>
          UKTextiles can't verify your attendance without these permissions. Please enable{' '}
          {missing.length > 1 ? 'them' : 'it'} to continue.
        </Text>

        <View style={styles.permList}>
          {missing.map((m) => (
            <View key={m} style={styles.permRow}>
              <View style={styles.permIconWrap}>
                <MaterialCommunityIcons name={PERM_COPY[m].icon as any} size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permLabel}>{PERM_COPY[m].label}</Text>
                <Text style={styles.permReason}>{PERM_COPY[m].reason}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleGrant} activeOpacity={0.85} disabled={retrying}>
          <Text style={styles.primaryBtnText}>{retrying ? 'Checking…' : 'Grant Permission'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleOpenSettings} activeOpacity={0.7}>
          <MaterialCommunityIcons name="cog-outline" size={15} color={Colors.primary} />
          <Text style={styles.secondaryBtnText}>Open {Platform.OS === 'ios' ? 'Settings' : 'App Settings'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={() => setMissing([])} activeOpacity={0.6}>
          <Text style={styles.skipBtnText}>Continue without — some features won't work</Text>
        </TouchableOpacity>
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
    zIndex: 999,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xxl,
    padding: 22,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 24 },
      android: { elevation: 12 },
    }),
  },
  iconWrap: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '900', marginBottom: 6 },
  body: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },

  permList: { width: '100%', gap: 10, marginBottom: 18 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.bgSurfaceLow,
    borderRadius: BorderRadius.lg,
    padding: 10,
  },
  permIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center', justifyContent: 'center',
  },
  permLabel: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  permReason: { color: Colors.textMuted, fontSize: 11, marginTop: 1, lineHeight: 15 },

  primaryBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  secondaryBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },

  skipBtn: { paddingVertical: 8, marginTop: 2 },
  skipBtnText: { color: Colors.textMuted, fontSize: 11, textDecorationLine: 'underline' },
});
