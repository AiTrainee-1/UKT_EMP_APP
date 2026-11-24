import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useSegments } from 'expo-router';

import { syncNow, useOfflineStatus } from '../../offline/engine';
import { checkConnectionNow, useNetworkBanner } from '../../lib/networkStatus';
import { bannerView, isOnline } from '../../lib/networkBanner';
import { useServerStatus } from '../../hooks/useServerStatus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pingServer, useAuth } from '../../hooks/useAuth';
import { useReduceMotion } from '../../lib/motionPrefs';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';

export const OFFLINE_POPUP_TITLE = 'No internet connection';
export const OFFLINE_POPUP_TEXT =
  'No internet connection. Please turn on your network to sync your data. You can keep working: what you do now is saved on your phone and sent automatically when you are back online.';

/** Which sync state to show (pure, so the four states read the same everywhere). */
export type SyncView = 'none' | 'offline-pending' | 'syncing' | 'pending' | 'failed';

export function syncView(s: { online: boolean; pending: number; failed: number; syncing: boolean }): SyncView {
  if (s.syncing) return 'syncing';
  if (!s.online && s.pending + s.failed > 0) return 'offline-pending';
  if (s.failed > 0) return 'failed';
  if (s.pending > 0) return 'pending';
  return 'none';
}

/**
 * The sync strip under the connection bar (signed-in screens only), and the "No internet connection" notice.
 *
 *   Offline + something waiting   "3 saved on your phone · will sync when online"
 *   Syncing                       "Syncing 2 of 3..."
 *   Online + waiting              "3 waiting to sync" + Sync now
 *   Something refused             "1 could not be sent" + Review
 * Tapping the strip opens the Sync page (/sync) with every queued item. The connection bar above it (ServerStatusBanner)
 * keeps saying Offline / Reconnecting / Connected.
 *
 * The notice pops up once each time the phone goes offline while signed in, with Retry (look at the network again and
 * send what waits) and "Continue offline" - the app stays usable, nothing signs the employee out.
 */
export function OfflineSyncBar() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, isLoading } = useAuth();
  const banner = useNetworkBanner();
  const online = isOnline(banner);
  const { pending, failed, syncing, progress } = useOfflineStatus();
  const reduceMotion = useReduceMotion();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const server = useServerStatus();
  // The connection bar above (ServerStatusBanner) already sits under the phone's status bar when it shows; otherwise this
  // strip is the top one and keeps clear of it.
  const connectionBarShown =
    bannerView({
      phase: banner.phase,
      serverOffline: server.offline,
      serverDismissed: server.dismissed,
      signedIn: !!user,
      startingUp: isLoading,
    }) !== 'none';
  const onAuthScreens = segments[0] === '(auth)' || (segments as string[]).length === 0;

  const [popup, setPopup] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const wasOnline = useRef(online);
  useEffect(() => {
    if (wasOnline.current && !online && user && !isLoading) setPopup(true);
    if (online) setPopup(false);
    wasOnline.current = online;
  }, [online, user, isLoading]);

  const retry = async () => {
    setRetrying(true);
    try {
      await checkConnectionNow();
      if (await pingServer()) {
        setPopup(false);
        await syncNow('retry');
      }
    } finally {
      setRetrying(false);
    }
  };

  if (!user || isLoading || onAuthScreens) return null;
  const view = syncView({ online, pending, failed, syncing });

  const text =
    view === 'syncing'
      ? progress
        ? `Syncing ${progress.index} of ${progress.total}...`
        : 'Syncing...'
      : view === 'offline-pending'
        ? `${pending + failed} saved on your phone · will sync when online`
        : view === 'failed'
          ? `${failed} could not be sent${pending ? ` · ${pending} waiting` : ''}`
          : `${pending} waiting to sync`;

  return (
    <>
      {view !== 'none' && (
        <Pressable
          onPress={() => router.push('/sync' as any)}
          style={[styles.bar, view === 'failed' && styles.barFailed, !connectionBarShown && { paddingTop: insets.top + 7 }]}
          accessibilityRole="button"
          accessibilityLabel={`${text}. Open the sync page`}
          testID={`offline-sync-${view}`}
        >
          {view === 'syncing' && !reduceMotion ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.spinner} />
          ) : (
            <MaterialCommunityIcons
              name={view === 'failed' ? 'alert-circle-outline' : view === 'offline-pending' ? 'cloud-off-outline' : 'cloud-upload-outline'}
              size={16}
              color={view === 'failed' ? Colors.badgeRedText : Colors.primary}
            />
          )}
          <Text style={[styles.text, view === 'failed' && { color: Colors.badgeRedText }]} numberOfLines={1}>
            {text}
          </Text>
          {view === 'pending' && online && (
            <TouchableOpacity onPress={() => void syncNow('manual')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.action}>Sync now</Text>
            </TouchableOpacity>
          )}
          {view !== 'pending' && view !== 'syncing' && <Text style={styles.action}>View</Text>}
        </Pressable>
      )}

      <Modal visible={popup} transparent animationType="fade" onRequestClose={() => setPopup(false)}>
        <View style={styles.scrim}>
          <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert">
            <View style={styles.dialogIcon}>
              <MaterialCommunityIcons name="wifi-off" size={28} color={Colors.badgeRedText} />
            </View>
            <Text style={styles.dialogTitle}>{OFFLINE_POPUP_TITLE}</Text>
            <Text style={styles.dialogText}>{OFFLINE_POPUP_TEXT}</Text>
            {pending + failed > 0 && (
              <Text style={styles.dialogNote}>{pending + failed} item(s) are saved on your phone, waiting to be sent.</Text>
            )}
            <TouchableOpacity
              onPress={() => void retry()}
              disabled={retrying}
              style={[styles.primaryBtn, retrying && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Retry the connection"
            >
              {retrying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
              )}
              <Text style={styles.primaryText}>{retrying ? 'Checking...' : 'Reconnect / Retry'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPopup(false)}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Continue offline"
            >
              <Text style={styles.secondaryText}>Continue offline</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 7,
      backgroundColor: Colors.primaryFixed,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Colors.outlineVariant,
    },
    barFailed: { backgroundColor: Colors.badgeRedBg },
    spinner: { width: 16, height: 16, transform: [{ scale: 0.8 }] },
    text: { flex: 1, fontFamily: FontFamily.bodySemibold, fontSize: 12.5, color: Colors.primary },
    action: { fontFamily: FontFamily.bodySemibold, fontSize: 12.5, color: Colors.primary, textDecorationLine: 'underline' },
    scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    dialog: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xxl,
      padding: 22,
      alignItems: 'center',
      gap: 10,
    },
    dialogIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.badgeRedBg,
    },
    dialogTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 18, color: Colors.textPrimary, textAlign: 'center' },
    dialogText: { fontFamily: FontFamily.bodyRegular, fontSize: 14, lineHeight: 20, color: Colors.textSecondary, textAlign: 'center' },
    dialogNote: { fontFamily: FontFamily.bodySemibold, fontSize: 13, color: Colors.statusOrange, textAlign: 'center' },
    primaryBtn: {
      marginTop: 6,
      alignSelf: 'stretch',
      minHeight: 48,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 15 },
    secondaryBtn: { alignSelf: 'stretch', minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: Colors.textSecondary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  });
