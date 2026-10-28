import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { TrackingHeader } from '../../src/components/tracking/TrackingHeader';
import { Button } from '../../src/components/ui/Button';
import { Toast } from '../../src/components/ui/Toast';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';
import { ensureTracking } from '../../src/tracking/actions';
import { formatAgo, formatDateTime } from '../../src/tracking/format';
import type { IssueFix, TrackingIssue } from '../../src/tracking/onboarding';
import { openAppSettings, openLocationSettings } from '../../src/tracking/platform/intents';
import { requestForegroundLocation, requestNotifications } from '../../src/tracking/permissions';
import { getRuntime } from '../../src/tracking/runtime';
import { useTrackingHealth } from '../../src/tracking/useTracking';
import type { PermissionLevel } from '../../src/tracking/types';
import { trackingRoutes } from '../../src/tracking/routes';

const PERMISSION_TEXT: Record<PermissionLevel, string> = {
  always: 'Allowed all the time',
  while_using: 'Only while using the app',
  denied: 'Not allowed',
  unknown: 'Unknown',
};

const NETWORK_TEXT = { wifi: 'Wi-Fi', cell: 'Mobile data', none: 'Offline', unknown: 'Unknown' } as const;

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const yesNo = (v: boolean | null, yes: string, no: string, unknown = 'Unknown') => (v == null ? unknown : v ? yes : no);

export default function TrackingHealthScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { state, snapshot, issues, trackActive, refresh } = useTrackingHealth(3000);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' as 'success' | 'error' | 'info', visible: false });
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3500);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const fix = async (action: IssueFix) => {
    setBusy(true);
    try {
      switch (action) {
        case 'consent':
          router.push(trackingRoutes.setup('consent'));
          break;
        case 'permission':
          if ((await requestForegroundLocation()) === 'denied') await openAppSettings();
          else router.push(trackingRoutes.setup('background'));
          break;
        case 'location_services':
          await openLocationSettings();
          break;
        case 'battery':
          router.push(trackingRoutes.setup('battery'));
          break;
        case 'notifications':
          if (!(await requestNotifications())) await openAppSettings();
          break;
        case 'restart': {
          const r = await ensureTracking('manual');
          const blocked = r?.decision.blockedBy;
          if (blocked === 'consent') router.push(trackingRoutes.setup('consent'));
          else if (blocked === 'permission') router.push(trackingRoutes.setup('foreground'));
          else if (blocked === 'foreground') showToast('Keep this screen open and try again.', 'info');
          else showToast(r?.started ? 'Tracking restarted.' : 'Tracking is already running.', r?.started ? 'success' : 'info');
          break;
        }
        case 'sync': {
          const out = await getRuntime().syncer.syncNow('manual');
          showToast(out.status === 'synced' ? 'Uploaded.' : `Upload: ${out.status.replace(/_/g, ' ')}`, out.status === 'synced' ? 'success' : 'info');
          break;
        }
      }
      await refresh();
    } catch (err: any) {
      showToast(err?.message ?? 'Could not do that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const errors = issues.filter((i) => i.severity === 'error');
  const onWeb = Platform.OS === 'web';
  const heroTone: Tone = onWeb || !trackActive ? 'neutral' : errors.length ? 'bad' : issues.length ? 'warn' : 'good';
  const heroText = onWeb
    ? 'This is the server view. Open the phone app to see the live tracking health.'
    : !trackActive
    ? 'Not on duty: nothing is being recorded.'
    : errors.length
      ? 'Your route is not being recorded.'
      : issues.length
        ? 'Tracking is on, but something may stop it.'
        : 'Tracking is healthy.';
  const heroIcon = heroTone === 'good' ? 'shield-check' : heroTone === 'bad' ? 'alert-circle' : heroTone === 'warn' ? 'alert' : 'map-marker-off-outline';
  const toneColor = (t: Tone) => (t === 'good' ? Colors.statusGreen : t === 'bad' ? Colors.statusRed : t === 'warn' ? Colors.statusOrange : Colors.textMuted);

  // A browser has no phone to read: those rows say so instead of waiting for a reading that never comes.
  const checking = Platform.OS === 'web' ? 'Phone app only' : 'Checking...';
  const h = snapshot?.health;
  const eng = snapshot?.engine;
  const queued = snapshot ? snapshot.queuedPoints + snapshot.queuedEvents : 0;

  const rows: { label: string; value: string; tone: Tone }[] = [
    {
      label: 'Active track',
      value: state?.track ? `Track #${state.track.id}${state.track.sessionId ? ` · On-Duty #${state.track.sessionId}` : ''}` : 'None',
      tone: state?.track ? 'good' : 'neutral',
    },
    {
      label: 'Location permission',
      value: h ? PERMISSION_TEXT[h.permission] : checking,
      tone: !h ? 'neutral' : h.permission === 'always' ? 'good' : h.permission === 'while_using' ? 'warn' : h.permission === 'denied' ? 'bad' : 'neutral',
    },
    {
      label: 'Phone location',
      value: h ? yesNo(h.locationEnabled, 'On', 'Off') : checking,
      tone: h?.locationEnabled === false ? 'bad' : h?.locationEnabled ? 'good' : 'neutral',
    },
    {
      label: 'Battery optimisation',
      value: h ? yesNo(h.batteryOptimised, 'Optimised (may stop the app)', 'Unrestricted', Platform.OS === 'android' ? 'Unknown' : 'Not applicable') : checking,
      tone: h?.batteryOptimised ? 'warn' : h?.batteryOptimised === false ? 'good' : 'neutral',
    },
    {
      label: 'Battery',
      value: !h ? checking : h.batteryPct != null ? `${h.batteryPct}%${h.charging ? ' · charging' : ''}${h.powerSave ? ' · battery saver on' : ''}` : 'Unknown',
      tone: h?.powerSave ? 'warn' : 'neutral',
    },
    {
      label: 'Internet',
      value: h ? NETWORK_TEXT[h.network] : checking,
      tone: h?.network === 'none' ? 'warn' : h && h.network !== 'unknown' ? 'good' : 'neutral',
    },
    {
      label: 'Notifications',
      value: snapshot ? yesNo(snapshot.notificationsGranted, 'Allowed', 'Off') : checking,
      tone: snapshot?.notificationsGranted === false ? 'warn' : snapshot?.notificationsGranted ? 'good' : 'neutral',
    },
    {
      label: 'Tracking service',
      value: eng ? (eng.running ? `Running${eng.mode ? ` (${eng.mode === 'still' ? 'saving battery' : 'full accuracy'})` : ''}` : 'Stopped') : checking,
      tone: !eng ? 'neutral' : eng.running ? 'good' : trackActive ? 'bad' : 'neutral',
    },
    {
      label: 'Waiting to upload',
      value: snapshot ? `${snapshot.queuedPoints} locations, ${snapshot.queuedEvents} events${snapshot.droppedPoints ? ` · ${snapshot.droppedPoints} dropped (phone was offline too long)` : ''}` : checking,
      tone: queued > 300 ? 'warn' : 'neutral',
    },
    { label: 'Last location recorded', value: snapshot ? formatAgo(snapshot.lastPointAt) : checking, tone: 'neutral' },
    {
      label: 'Last upload',
      value: snapshot ? `${formatAgo(snapshot.sync.lastOkAt)}${snapshot.sync.lastError ? ` · last error: ${snapshot.sync.lastError.replace(/_/g, ' ')}` : ''}` : checking,
      tone: snapshot?.sync.lastError ? 'warn' : 'neutral',
    },
  ];

  const issueColor = (i: TrackingIssue) => (i.severity === 'error' ? Colors.statusRed : Colors.statusOrange);
  const fixLabel: Record<Exclude<IssueFix, null>, string> = {
    consent: 'Review notice',
    permission: 'Fix permission',
    location_services: 'Open location settings',
    battery: 'Fix battery settings',
    notifications: 'Allow notifications',
    restart: 'Restart tracking',
    sync: 'Upload now',
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TrackingHeader title="Tracking health" subtitle="Is your route being recorded?" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!state ? (
          <SkeletonCard lines={4} />
        ) : !state.supported ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Not available yet</Text>
            <Text style={styles.body}>This server does not have On-Duty tracking turned on.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.hero, { borderColor: toneColor(heroTone) }]}>
              <MaterialCommunityIcons name={heroIcon as any} size={30} color={toneColor(heroTone)} />
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>{heroText}</Text>
                {state.track?.startedAt ? <Text style={styles.small}>Started {formatDateTime(state.track.startedAt)}</Text> : null}
              </View>
            </View>

            {issues.map((i) => (
              <View key={i.id} style={[styles.issue, { borderLeftColor: issueColor(i) }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.issueTitle}>{i.title}</Text>
                  <Text style={styles.body}>{i.message}</Text>
                </View>
                {i.fix && (
                  <Button title={fixLabel[i.fix]} variant="outline" onPress={() => fix(i.fix)} disabled={busy} style={{ alignSelf: 'center' }} />
                )}
              </View>
            ))}

            <View style={styles.card}>
              {rows.map((r, idx) => (
                <View key={r.label} style={[styles.row, idx > 0 && styles.rowBorder]}>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  <View style={styles.rowValueWrap}>
                    <View style={[styles.dot, { backgroundColor: toneColor(r.tone) }]} />
                    <Text style={styles.rowValue}>{r.value}</Text>
                  </View>
                </View>
              ))}
            </View>

            {Platform.OS !== 'web' && (
              <View style={{ gap: Spacing.sm }}>
                {trackActive && <Button title="Restart tracking" variant="outline" onPress={() => fix('restart')} disabled={busy} />}
                {queued > 0 && <Button title="Upload now" variant="outline" onPress={() => fix('sync')} disabled={busy} />}
                <Button title="Run set-up again" variant="ghost" onPress={() => router.push(trackingRoutes.setup())} />
              </View>
            )}
            <Text style={styles.small}>
              Tracking only records while an On-Duty request is active. Your route is saved on the phone first and uploaded when there is
              internet, so a dead signal does not lose it.
            </Text>
          </>
        )}
      </ScrollView>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bgLight },
    content: { padding: 16, gap: 12, paddingBottom: 32 },
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: Spacing.base,
    },
    cardTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 15, color: Colors.textPrimary, marginBottom: 4 },
    body: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
    small: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16 },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1.5,
      padding: Spacing.base,
    },
    heroTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 15, color: Colors.textPrimary },
    issue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      borderLeftWidth: 4,
      padding: 12,
    },
    issueTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
    rowBorder: { borderTopWidth: 1, borderTopColor: Colors.outlineVariant },
    rowLabel: { fontSize: 12.5, color: Colors.textMuted, flexShrink: 0, maxWidth: '40%' },
    rowValueWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, flex: 1, justifyContent: 'flex-end' },
    rowValue: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right', flexShrink: 1 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  });
