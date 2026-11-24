import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';

import { QueuedOpsList } from '../../src/components/offline/QueuedOpsList';
import { refreshOfflineStatus, syncNow, useOfflineStatus } from '../../src/offline/engine';
import { checkConnectionNow, useNetworkBanner } from '../../src/lib/networkStatus';
import { isOnline } from '../../src/lib/networkBanner';
import { pingServer } from '../../src/hooks/useAuth';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

/**
 * Sync: the connection state (Online / Offline / Syncing / Pending sync) and everything that is saved on this phone and
 * not yet sent (src/offline), with "Sync now". Opened from the sync strip under the connection bar and from the menu.
 */
export default function SyncScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const online = isOnline(useNetworkBanner());
  const { pending, failed, syncing, progress, lastSyncAt } = useOfflineStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);

  const state: { label: string; text: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; bg: string } =
    syncing
      ? {
          label: 'Syncing',
          text: progress ? `Sending ${progress.index} of ${progress.total} to the server...` : 'Sending to the server...',
          icon: 'sync',
          color: Colors.primary,
          bg: Colors.primaryFixed,
        }
      : !online
        ? {
            label: 'Offline',
            text: 'No internet connection. Please turn on your network to sync your data. You can keep working meanwhile.',
            icon: 'wifi-off',
            color: Colors.badgeRedText,
            bg: Colors.badgeRedBg,
          }
        : pending + failed > 0
          ? {
              label: 'Pending sync',
              text: failed
                ? `${failed} item(s) could not be sent. Check the reason below, then try again or delete.`
                : `${pending} item(s) waiting to be sent. They go out automatically, or tap Sync now.`,
              icon: 'cloud-upload-outline',
              color: Colors.badgeYellowText,
              bg: Colors.badgeYellowBg,
            }
          : {
              label: 'Online',
              text: 'Everything you did is on the server. Nothing is waiting on this phone.',
              icon: 'cloud-check-outline',
              color: Colors.badgeGreenText,
              bg: Colors.badgeGreenBg,
            };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await checkConnectionNow();
      await refreshOfflineStatus();
    } finally {
      setRefreshing(false);
    }
  };

  const sync = async () => {
    setChecking(true);
    try {
      await checkConnectionNow();
      if (await pingServer()) await syncNow('manual');
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Sync</Text>
          <Text style={styles.headerSubtitle}>What is saved on this phone</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <View style={[styles.stateCard, { backgroundColor: state.bg }]} accessibilityRole="summary">
          <MaterialCommunityIcons name={state.icon} size={26} color={state.color} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.stateLabel, { color: state.color }]}>{state.label}</Text>
            <Text style={styles.stateText}>{state.text}</Text>
            {!!lastSyncAt && <Text style={styles.lastSync}>Last sync {format(lastSyncAt, 'd MMM, h:mm a')}</Text>}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => void sync()}
          disabled={syncing || checking}
          style={[styles.syncBtn, (syncing || checking) && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={online ? 'Sync now' : 'Reconnect and sync'}
        >
          {syncing || checking ? <ActivityIndicator color="#fff" size="small" /> : <MaterialCommunityIcons name="sync" size={18} color="#fff" />}
          <Text style={styles.syncText}>{online ? 'Sync now' : 'Reconnect / Retry'}</Text>
        </TouchableOpacity>

        <QueuedOpsList
          title="Waiting on this phone"
          style={{ marginTop: 18 }}
          emptyText="Nothing is waiting. Everything you did has reached the server."
        />

        <View style={styles.info}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
          <Text style={styles.infoText}>
            With no internet you can still apply for leave, permission, casual leave, a missing punch, a gate pass, a
            compensation claim, ask HR, and record your On-Duty punches. They are kept safely on this phone and sent
            automatically, in order, when the internet is back - even if the app is closed (Android sends them when it
            can). Each item is sent only once, and it is removed from the phone only after the server has it.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bgLight },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: Colors.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
    headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 17 },
    headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },
    content: { padding: 16, paddingBottom: 40 },
    stateCard: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: BorderRadius.xl, alignItems: 'flex-start' },
    stateLabel: { fontFamily: FontFamily.headlineSemibold, fontSize: 16 },
    stateText: { fontFamily: FontFamily.bodyRegular, fontSize: 13, lineHeight: 19, color: Colors.textPrimary, marginTop: 2 },
    lastSync: { fontFamily: FontFamily.bodyRegular, fontSize: 11.5, color: Colors.textMuted, marginTop: 6 },
    syncBtn: {
      marginTop: 12,
      minHeight: 48,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    syncText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 15 },
    info: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 20,
      padding: 12,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.primaryFixed,
    },
    infoText: { flex: 1, color: Colors.textPrimary, fontSize: 12.5, lineHeight: 18 },
  });
