// Live Tracking: a READ-ONLY status screen. The employee sees whether their location is being monitored and whether it is
// being shared right now, the phone settings that keep tracking working (with fixes), and the rules of when tracking runs.
// Owner's rule (2026-10-31): there is NO way to stop location sharing here. The old "Location Sharing" switch (it called
// stopLiveTracking() on the 45 s ping loop) is gone. Tracking starts and stops by itself: the On-Duty route by the server
// (src/tracking/controller.ts via TrackingBridge), HR's live sharing by LiveLocationTracker (app/_layout.tsx).
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { TrackingHeader } from '../../src/components/tracking/TrackingHeader';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Toast } from '../../src/components/ui/Toast';
import { Reveal } from '../../src/components/Reveal';
import { StatusHero } from '../../src/components/livetracking/StatusHero';
import { OnDutyNowCard } from '../../src/components/livetracking/OnDutyNowCard';
import { StatGrid } from '../../src/components/livetracking/StatGrid';
import { PhoneChecksCard } from '../../src/components/livetracking/PhoneChecksCard';
import { RulesCards } from '../../src/components/livetracking/RulesCards';
import { SectionLabel, TonePill } from '../../src/components/livetracking/parts';
import { useLiveTrackingStatus } from '../../src/hooks/useLiveTrackingStatus';
import { startLiveTracking } from '../../src/hooks/useGeoAttendance';
import { READ_ONLY_NOTE } from '../../src/lib/liveTrackingStatus';
import type { FixAction } from '../../src/lib/liveTrackingStatus';
import { ensureTracking } from '../../src/tracking/actions';
import { requestForegroundLocation } from '../../src/tracking/permissions';
import { openAppSettings, openLocationSettings } from '../../src/tracking/platform/intents';
import { trackingRoutes } from '../../src/tracking/routes';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';

type ToastState = { message: string; type: 'success' | 'error' | 'info'; visible: boolean };

export default function GeoTrackingScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { view, input, loading, serverError, profileError, failed, employee, refresh } = useLiveTrackingStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', visible: false });
  const showToast = (message: string, type: ToastState['type']) => {
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

  // Every action here HELPS tracking work (a permission, GPS, the battery setting). None of them can stop it.
  const fix = async (action: FixAction) => {
    setBusy(true);
    try {
      switch (action) {
        case 'consent':
          router.push(trackingRoutes.setup('consent'));
          break;
        case 'allow_location': {
          // Tied to a real tap: the only reliable way to get Android's dialog to show (see LiveLocationTracker).
          const level = await requestForegroundLocation();
          if (level === 'denied') {
            showToast('Allow Location for UKTextiles in the phone settings.', 'info');
            await openAppSettings();
            break;
          }
          // Same as this screen always did once permission was given: start HR's live sharing if it applies to this person,
          // and let the On-Duty controller re-check (it starts the route only if the server says a track is active).
          const sharing = view.monitor.sources.includes('hr_sharing') || view.monitor.sources.includes('on_duty_legacy');
          if (sharing) startLiveTracking();
          await ensureTracking('permission_changed');
          showToast('Location allowed.', 'success');
          break;
        }
        case 'allow_always':
          router.push(trackingRoutes.setup('background'));
          break;
        case 'location_settings':
          await openLocationSettings();
          break;
        case 'battery':
          router.push(trackingRoutes.setup('battery'));
          break;
        case 'notifications':
          router.push(trackingRoutes.setup('notifications'));
          break;
      }
      await refresh();
    } catch (err: any) {
      showToast(err?.message ?? 'Could not do that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // The route should be recording but the service is not running: ask the controller to make it match the server again (it
  // only ever STARTS here, and only when the server says a track is active). Same as Tracking health's "Restart tracking".
  const restartTracking = async () => {
    setBusy(true);
    try {
      const r = await ensureTracking('manual');
      const blocked = r?.decision.blockedBy;
      if (blocked === 'consent') router.push(trackingRoutes.setup('consent'));
      else if (blocked === 'permission') router.push(trackingRoutes.setup('foreground'));
      else if (blocked === 'foreground') showToast('Keep this screen open and try again.', 'info');
      else showToast(r?.started ? 'Tracking restarted.' : 'Tracking is already running.', r?.started ? 'success' : 'info');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const { monitor, share, checks, stats, session, rules } = view;
  const onWeb = input.platform === 'web';
  const headerTone = share.pulse ? share.tone : monitor.state === 'yes' ? share.tone : 'neutral';
  const headerText = share.pulse ? 'Live' : monitor.state === 'yes' ? 'Monitored' : monitor.state === 'checking' ? 'Checking' : 'Off';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TrackingHeader
        title="Live Tracking"
        subtitle="Your location status (view only)"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home' as unknown as Href))}
        right={
          !loading && !failed ? (
            <View accessible accessibilityLabel={`Status: ${headerText}`}>
              <TonePill tone={headerTone} text={headerText} pulse={share.pulse} />
            </View>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.content}>
          <SkeletonCard lines={5} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
        </View>
      ) : failed ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.errorCard}>
            <MaterialCommunityIcons name="cloud-alert-outline" size={34} color={Colors.statusRed} />
            <Text style={styles.errorTitle}>Could not load your tracking status</Text>
            <Text style={styles.errorBody}>Check your internet connection and try again.</Text>
            <TouchableOpacity style={styles.retry} onPress={onRefresh} activeOpacity={0.85} accessibilityRole="button">
              <MaterialCommunityIcons name="refresh" size={16} color={Colors.onPrimary} />
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
          <SectionLabel>WHEN IS MY LOCATION TRACKED?</SectionLabel>
          <RulesCards sections={rules} />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {(serverError || profileError) && (
            <Reveal index={0}>
              <View style={styles.notice}>
                <MaterialCommunityIcons name="cloud-off-outline" size={16} color={Colors.badgeYellowText} />
                <Text style={styles.noticeText}>
                  {serverError
                    ? 'Could not reach the office just now. Showing what your phone knows. Pull down to try again.'
                    : 'Could not load your profile, so the live-sharing status may be missing. Pull down to try again.'}
                </Text>
              </View>
            </Reveal>
          )}

          <Reveal index={1}>
            <StatusHero monitor={monitor} share={share} employee={employee} />
          </Reveal>

          {!onWeb && (share.blockers.includes('engine') || share.blockers.includes('sharing_not_started') || share.blockers.includes('consent')) && (
            <Reveal index={2} style={styles.actions}>
              {share.blockers.includes('consent') && (
                <ActionButton icon="file-document-check-outline" label="Review the tracking notice" onPress={() => fix('consent')} disabled={busy} />
              )}
              {share.blockers.includes('engine') && (
                <ActionButton icon="restart" label="Restart tracking" onPress={restartTracking} disabled={busy} />
              )}
              {share.blockers.includes('sharing_not_started') && (
                <ActionButton icon="access-point" label="Start live sharing" onPress={() => fix('allow_location')} disabled={busy} />
              )}
            </Reveal>
          )}

          <Reveal index={2}>
            <View style={styles.readOnly} accessible accessibilityLabel={READ_ONLY_NOTE}>
              <MaterialCommunityIcons name="eye-outline" size={16} color={Colors.primary} />
              <Text style={styles.readOnlyText}>{READ_ONLY_NOTE}</Text>
            </View>
          </Reveal>

          {session && (
            <Reveal index={3}>
              <OnDutyNowCard card={session} onOpenJourney={() => router.push(trackingRoutes.journeys)} />
            </Reveal>
          )}

          {stats.length > 0 && (
            <Reveal index={4}>
              <StatGrid tiles={stats} />
            </Reveal>
          )}

          {checks.length > 0 && (
            <Reveal index={5} style={{ gap: 10 }}>
              <SectionLabel>WHAT KEEPS TRACKING WORKING</SectionLabel>
              <PhoneChecksCard
                rows={checks}
                busy={busy}
                onFix={fix}
                onOpenHealth={() => router.push(trackingRoutes.health)}
                onOpenSetup={() => router.push(trackingRoutes.setup())}
              />
              <Text style={styles.small}>These settings help tracking work. None of them switches it off.</Text>
            </Reveal>
          )}

          {onWeb && (
            <View style={styles.notice}>
              <MaterialCommunityIcons name="cellphone" size={16} color={Colors.badgeYellowText} />
              <Text style={styles.noticeText}>
                This is the browser view. Open the UKTextiles phone app to see what your phone is recording and sending.
              </Text>
            </View>
          )}

          <Reveal index={6} style={{ gap: 10 }}>
            <SectionLabel>WHEN IS MY LOCATION TRACKED?</SectionLabel>
            <RulesCards sections={rules} />
          </Reveal>

          <Text style={[styles.small, { textAlign: 'center', marginTop: 4 }]}>Questions about tracking? Ask HR.</Text>
        </ScrollView>
      )}

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </SafeAreaView>
  );
}

/** A fix that gets tracking going again (never one that stops it). */
function ActionButton({ icon, label, onPress, disabled }: { icon: string; label: string; onPress: () => void; disabled: boolean }) {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity
      style={[styles.action, disabled && { opacity: 0.55 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon as any} size={17} color={Colors.onPrimary} />
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bgLight },
    actions: { gap: 8 },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 46,
      backgroundColor: Colors.primary,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 16,
    },
    actionText: { color: Colors.onPrimary, fontSize: 13.5, fontWeight: '800' },
    content: { padding: 16, gap: 14, paddingBottom: 36 },

    readOnly: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: Colors.primaryFixed,
      borderRadius: BorderRadius.lg,
      padding: 12,
    },
    readOnlyText: { flex: 1, color: Colors.onPrimaryContainer, fontSize: 12.5, lineHeight: 18, fontFamily: FontFamily.bodySemibold },

    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: Colors.badgeYellowBg,
      borderRadius: BorderRadius.lg,
      padding: 12,
    },
    noticeText: { flex: 1, color: Colors.badgeYellowText, fontSize: 12, lineHeight: 17 },

    small: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16 },

    errorCard: {
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 20,
    },
    errorTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 15, textAlign: 'center' },
    errorBody: { color: Colors.textSecondary, fontSize: 12.5, textAlign: 'center' },
    retry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      backgroundColor: Colors.primary,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 18,
      marginTop: 6,
    },
    retryText: { color: Colors.onPrimary, fontSize: 13, fontWeight: '800' },
  });
