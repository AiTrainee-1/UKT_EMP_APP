import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, AppState, Linking, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { holdNotificationPopup } from '../hooks/useNotificationPermission';
import { useReduceMotion } from '../lib/motionPrefs';
import { percent } from '../lib/mangaShapes';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palettes';
import { FontFamily } from '../constants/typography';
import {
  IconBurst,
  MangaButton,
  MangaFrame,
  MangaLink,
  MangaPanel,
  Mascot,
  SpeechBubble,
  makeMangaStyles,
  mascotHeight,
  useMangaMotion,
} from './manga';

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
 * Requests Location and Camera permission on the very first
 * app launch (like most consumer apps' onboarding), then re-checks Location
 * and Camera on every subsequent launch and app-foreground — since a user
 * can grant a permission once and later revoke it from device Settings,
 * outside the app's own control. If either is missing when checked, a
 * blocking card explains why it's needed and offers to re-request it or
 * jump straight to the device's app-settings screen (the only way to
 * re-grant once the OS has already recorded one real denial, since neither
 * platform shows its native prompt a second time after that).
 *
 * Notifications are no longer asked for here (owner 2026-11-25): the "Turn on notifications" popup
 * (src/components/notifications/NotificationPermissionPopup.tsx) asks, on a tap, once the first-run dialogs and this
 * card are out of the way (holdNotificationPopup). Losing push notifications degrades the experience without breaking
 * any actual feature, unlike Location/Camera which gate real punch-verification flows.
 *
 * Only while someone is signed in and past the sign-in screens (2026-11-25, keyboard bug on Redmi / Infinix): this used
 * to ask on the Login screen and to re-request notifications on EVERY return to the foreground. Each request opens a
 * system dialog, which sends the app to the background and back, which asked again - and every dialog closed the
 * keyboard, so people could not type their code or password. Phones whose secure password keyboard briefly pauses the
 * app (MIUI, XOS) set the loop off just by tapping the password field.
 *
 * The card (owner 2026-11-25) has the app-update popup's manga look (src/components/manga).
 */
export function PermissionGate() {
  const { user } = useAuth();
  const segments = useSegments() as string[];
  const onAuthScreens = segments.length === 0 || segments[0] === '(auth)';
  const active = !!user && !onAuthScreens;
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
        // Notifications: the "Turn on notifications" popup asks once these dialogs are done (see above).
        await AsyncStorage.setItem(ONBOARDED_KEY, '1');
      } else {
        const [locStatus, camStatus] = await Promise.all([
          Location.getForegroundPermissionsAsync(),
          ImagePicker.getCameraPermissionsAsync(),
        ]);
        locGranted = locStatus.status === 'granted';
        camGranted = camStatus.status === 'granted';
        // Notifications are never requested here: a request opens a system dialog (see above).
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
    if (!active) return;
    AsyncStorage.getItem(ONBOARDED_KEY)
      .then((v) => {
        runCheck(!v);
      })
      .catch(() => {
        runCheck(false);
      });

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runCheck(false);
    });
    return () => sub.remove();
  }, [runCheck, active]);

  // The notification popup waits until the first check (with its first-run dialogs) is done, and while this card shows.
  const visible = active && checked && missing.length > 0;
  const holding = active && (!checked || visible);
  useEffect(() => {
    holdNotificationPopup('permission-gate', holding);
  }, [holding]);
  useEffect(() => () => holdNotificationPopup('permission-gate', false), []);

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
    // Linking.openSettings() only exists on iOS/Android — calling it on web
    // throws "Linking.default.openSettings is not a function" and crashes
    // the whole app, since there's no OS settings screen to deep-link to.
    if (Platform.OS === 'web') return;
    Linking.openSettings();
  };

  if (!visible) return null;

  return (
    <GateCard
      missing={missing}
      retrying={retrying}
      onGrant={() => { void handleGrant(); }}
      onOpenSettings={handleOpenSettings}
      onSkip={() => setMissing([])}
    />
  );
}

// ── the card ────────────────────────────────────────────────────────────────

const PANEL_H = 160;
const MASCOT_W = 96;
const MASCOT_LEFT = 20;

function GateCard({
  missing,
  retrying,
  onGrant,
  onOpenSettings,
  onSkip,
}: {
  missing: MissingPerm[];
  retrying: boolean;
  onGrant: () => void;
  onOpenSettings: () => void;
  onSkip: () => void;
}) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const manga = useThemedStyles(makeMangaStyles);
  const reduce = useReduceMotion();
  const motion = useMangaMotion({ reduce });
  // The mascot's face (60, 58 in its 120 x 150 drawing): where the focus lines point.
  const face = { x: MASCOT_LEFT + MASCOT_W / 2, y: PANEL_H + 6 - mascotHeight(MASCOT_W) + (58 * MASCOT_W) / 120 };

  return (
    <View style={styles.overlay} accessibilityViewIsModal testID="permission-gate">
      <Animated.View style={[StyleSheet.absoluteFill, manga.backdrop, motion.backdropStyle]} />
      <Animated.View style={[styles.cardWrap, motion.cardStyle]}>
        <MangaFrame shadowColor={C.primary}>
          <MangaPanel
            height={PANEL_H}
            paper={C.primaryFixed}
            dots={C.primary}
            clear={{ cx: '25%', cy: percent(face.y, PANEL_H), r: '45%' }}
            focus={face}
            spin={motion.spin}
          >
            <Animated.View style={[styles.mascot, motion.mascotStyle]}>
              <Mascot size={MASCOT_W} wave={motion.wave} blink={motion.blink} decorative />
            </Animated.View>

            <SpeechBubble style={styles.bubble} animatedStyle={motion.bubbleStyle}>
              <Text style={manga.bubbleText}>Just one quick thing!</Text>
            </SpeechBubble>

            <View style={styles.bursts}>
              {missing.map((m) => (
                <IconBurst
                  key={m}
                  icon={PERM_COPY[m].icon}
                  size={60}
                  color={C.badgeRedBg}
                  face={C.bgCard}
                  ink={C.textPrimary}
                  iconColor={C.statusRed}
                  points={10}
                />
              ))}
            </View>
          </MangaPanel>

          <View style={styles.body}>
            <Text style={manga.title} accessibilityRole="header">Permission Needed</Text>
            <Text style={manga.sub}>
              UKTextiles can't verify your attendance without these permissions. Please enable{' '}
              {missing.length > 1 ? 'them' : 'it'} to continue.
            </Text>

            <View style={styles.permList}>
              {missing.map((m) => (
                <View key={m} style={styles.permRow}>
                  <View style={styles.permIconWrap}>
                    <MaterialCommunityIcons name={PERM_COPY[m].icon as any} size={18} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.permLabel}>{PERM_COPY[m].label}</Text>
                    <Text style={styles.permReason}>{PERM_COPY[m].reason}</Text>
                  </View>
                </View>
              ))}
            </View>

            <MangaButton
              label={retrying ? 'Checking…' : 'Grant Permission'}
              icon="shield-check-outline"
              onPress={onGrant}
              disabled={retrying}
              busy={retrying}
              style={styles.btnWrap}
              testID="permission-gate-grant"
            />
            {Platform.OS !== 'web' && (
              <MangaButton
                variant="secondary"
                size="sm"
                label={`Open ${Platform.OS === 'ios' ? 'Settings' : 'App Settings'}`}
                icon="cog-outline"
                onPress={onOpenSettings}
                style={styles.btnWrapSecondary}
                testID="permission-gate-settings"
              />
            )}
            <MangaLink label="Continue without — some features won't work" onPress={onSkip} testID="permission-gate-skip" />
          </View>
        </MangaFrame>
      </Animated.View>
    </View>
  );
}

const makeStyles = (C: Palette) => {
  const ink = C.textPrimary;
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
      zIndex: 999,
      elevation: 999,
    },
    cardWrap: { width: '100%', maxWidth: 380 },
    mascot: { position: 'absolute', left: MASCOT_LEFT, bottom: -6 },
    bubble: { position: 'absolute', top: 14, right: 14, maxWidth: 150 },
    bursts: { position: 'absolute', right: 14, bottom: 8, flexDirection: 'row', gap: 4 },

    body: { padding: 18, paddingTop: 16 },
    permList: { gap: 10, marginTop: 14 },
    permRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.bgSurfaceLow,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: ink,
      padding: 10,
    },
    permIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: ink,
      backgroundColor: C.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    permLabel: { color: C.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 13.5 },
    permReason: { color: C.textMuted, fontFamily: FontFamily.bodyRegular, fontSize: 11.5, marginTop: 1, lineHeight: 15 },

    btnWrap: { marginTop: 16, marginRight: 4, marginBottom: 4 },
    btnWrapSecondary: { marginTop: 10, marginRight: 3, marginBottom: 3 },
  });
};
