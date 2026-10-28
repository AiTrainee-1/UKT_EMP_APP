import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Device from 'expo-device';

import { TrackingHeader } from '../../src/components/tracking/TrackingHeader';
import { Button } from '../../src/components/ui/Button';
import { Toast } from '../../src/components/ui/Toast';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';
import { ensureTracking } from '../../src/tracking/actions';
import { detectOem, oemGuide } from '../../src/tracking/oem';
import { SETUP_ORDER, isReadyToTrack, nextSetupStep } from '../../src/tracking/onboarding';
import type { SetupStepId } from '../../src/tracking/onboarding';
import { APP_LABEL, APP_PACKAGE, launchFirstAvailable, openAppSettings, openBatteryOptimisation } from '../../src/tracking/platform/intents';
import { requestBackgroundLocation, requestForegroundLocation, requestNotifications } from '../../src/tracking/permissions';
import { useAcceptConsent, useTrackingSetup } from '../../src/tracking/useTracking';
import { trackingRoutes } from '../../src/tracking/routes';

const STEP_META: Record<SetupStepId, { icon: string; short: string }> = {
  consent: { icon: 'shield-check-outline', short: 'Notice' },
  foreground: { icon: 'map-marker-outline', short: 'Location' },
  background: { icon: 'map-marker-radius-outline', short: 'All the time' },
  notifications: { icon: 'bell-outline', short: 'Alerts' },
  battery: { icon: 'battery-heart-variant', short: 'Battery' },
};

const isStepId = (v: unknown): v is SetupStepId => typeof v === 'string' && (SETUP_ORDER as string[]).includes(v);

const FALLBACK_NOTICE =
  'While you are On-Duty, UKTextiles records where you are (your route, where you stop and for how long) and the state of your phone ' +
  '(battery, internet, whether location is on). Recording starts when you submit an On-Duty request and ends when you mark it Done, ' +
  'when all 4 punches are in, at the end of the day, or if the request is rejected. HR can see this to verify your on-duty visit. ' +
  'Nothing is recorded when you are not On-Duty.';

export default function TrackingSetupScreen() {
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ step?: string }>();

  const { state, steps, isLoading, skip, reload, setPermission } = useTrackingSetup();
  const accept = useAcceptConsent();
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<SetupStepId | null>(isStepId(params.step) ? params.step : null);
  const [hint, setHint] = useState<string | null>(null);
  const [toast, setToast] = useState({ message: '', type: 'success' as 'success' | 'error' | 'info', visible: false });
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3500);
  };

  const applicable = steps.filter((s) => s.status !== 'not_applicable');
  const next = nextSetupStep(steps);
  const current: SetupStepId | null = focus ?? next;
  const currentStatus = steps.find((s) => s.id === current)?.status;

  // A step the employee jumped to (a deep link, a tap on the stepper) hands over to the next one once it is done.
  useEffect(() => {
    if (focus && currentStatus === 'done') setFocus(null);
  }, [focus, currentStatus]);

  // Everything the engine needs is in place: if a track is already active (consent / permission was all that held it back), start it.
  const ready = isReadyToTrack(steps);
  useEffect(() => {
    if (ready && !isLoading) void ensureTracking('permission_changed');
  }, [ready, isLoading]);

  const oem = useMemo(() => detectOem(Device.brand, Device.manufacturer), []);
  const guide = useMemo(() => oemGuide(oem, APP_PACKAGE, APP_LABEL), [oem]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setHint(null);
    try {
      await fn();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? err?.message ?? 'Something went wrong. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onAccept = () =>
    run(async () => {
      await accept.mutateAsync(state?.noticeVersion ?? 1);
      showToast('Thank you. Your notice acceptance is recorded.', 'success');
    });

  const onForeground = () =>
    run(async () => {
      const level = await requestForegroundLocation();
      setPermission(level);
      if (level === 'denied') setHint('Location is blocked. Open Settings > Permissions > Location and choose "Allow only while using the app".');
      await reload();
    });

  const onBackground = () =>
    run(async () => {
      const level = await requestBackgroundLocation();
      setPermission(level);
      if (level !== 'always') setHint('On the next screen choose "Allow all the time", then come back here.');
      await reload();
    });

  const onNotifications = () =>
    run(async () => {
      const ok = await requestNotifications();
      if (!ok) setHint('Notifications are blocked. Open Settings > Notifications and switch them on for this app.');
      await reload();
    });

  const onBattery = () =>
    run(async () => {
      await openBatteryOptimisation();
      await reload();
    });

  const renderStepBody = (id: SetupStepId) => {
    switch (id) {
      case 'consent':
        return (
          <>
            <Text style={styles.cardTitle}>Before you start: how your route is recorded</Text>
            <View style={styles.noticeBox}>
              <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                <Text style={styles.noticeText}>{state?.noticeText?.trim() || FALLBACK_NOTICE}</Text>
              </ScrollView>
            </View>
            <Text style={styles.small}>Notice version {state?.noticeVersion ?? 1}. Your acceptance is saved with the date and this phone.</Text>
            <Button title="I understand and accept" onPress={onAccept} loading={busy || accept.isPending} />
          </>
        );
      case 'foreground':
        return (
          <>
            <Text style={styles.cardTitle}>Allow location</Text>
            <Text style={styles.body}>
              UKTextiles needs your phone's location to record your route while you are On-Duty. Choose "While using the app" (or
              "Precise" if asked).
            </Text>
            <Button title="Allow location" onPress={onForeground} loading={busy} />
            <TouchableOpacity onPress={() => openAppSettings()} style={styles.linkBtn} accessibilityRole="link">
              <Text style={styles.link}>Location is blocked? Open Settings</Text>
            </TouchableOpacity>
          </>
        );
      case 'background':
        return (
          <>
            <Text style={styles.cardTitle}>Keep tracking when the screen is off</Text>
            <Text style={styles.body}>
              Your phone puts apps to sleep when the screen is off or you switch to another app. To record the whole route, location must be
              allowed all the time.
            </Text>
            <View style={styles.stepsBox}>
              <Text style={styles.stepLine}>1. Tap "Open permission screen" below.</Text>
              <Text style={styles.stepLine}>2. Open "Permissions" then "Location" if the phone asks.</Text>
              <Text style={styles.stepLine}>3. Choose "Allow all the time".</Text>
              <Text style={styles.stepLine}>4. Come back to this app.</Text>
            </View>
            <Text style={styles.small}>
              Only used while an On-Duty request is active. Outside On-Duty nothing is recorded, even with this setting on.
            </Text>
            <Button title="Open permission screen" onPress={onBackground} loading={busy} />
            <Button title="Skip for now" variant="ghost" onPress={() => skip('background')} disabled={busy} />
          </>
        );
      case 'notifications':
        return (
          <>
            <Text style={styles.cardTitle}>Show the "recording" notice</Text>
            <Text style={styles.body}>
              While your route is recorded your phone shows a notice: "UKTextiles is recording your on-duty route". Android hides it unless
              notifications are allowed. Tracking still runs without it, but you will not see that it is on.
            </Text>
            <Button title="Allow notifications" onPress={onNotifications} loading={busy} />
            <Button title="Skip for now" variant="ghost" onPress={() => skip('notifications')} disabled={busy} />
          </>
        );
      case 'battery':
        return (
          <>
            <Text style={styles.cardTitle}>Let the app run in the background</Text>
            <Text style={styles.body}>{guide.intro}</Text>
            <Button title="Allow background activity" onPress={onBattery} loading={busy} />
            <View style={styles.oemBox}>
              <Text style={styles.oemTitle}>{guide.name}</Text>
              {guide.steps.map((s, i) => (
                <Text key={i} style={styles.stepLine}>{i + 1}. {s}</Text>
              ))}
              <Button
                title={guide.key === 'other' ? 'Open App info' : `Open ${guide.name.split(' / ')[0]} settings`}
                variant="outline"
                onPress={() => run(async () => void (await launchFirstAvailable(guide.intents)))}
                disabled={busy}
                style={{ marginTop: Spacing.sm }}
              />
            </View>
            <Button title="I have done this" variant="ghost" onPress={() => skip('battery')} disabled={busy} />
          </>
        );
    }
  };

  const allDone = current == null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TrackingHeader title="On-Duty tracking" subtitle="Set up once, takes a minute" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {isLoading ? (
          <SkeletonCard lines={4} />
        ) : Platform.OS === 'web' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tracking runs on the phone app</Text>
            <Text style={styles.body}>Open UKTextiles on your Android phone to set up On-Duty tracking. You can still accept the notice here.</Text>
            {steps[0]?.status === 'todo' ? renderStepBody('consent') : <Text style={styles.body}>Notice already accepted.</Text>}
          </View>
        ) : state && !state.supported ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Not available yet</Text>
            <Text style={styles.body}>This server does not have On-Duty tracking turned on. Nothing is recorded.</Text>
          </View>
        ) : (
          <>
            <View style={styles.stepper}>
              {applicable.map((s) => {
                const active = s.id === current;
                const done = s.status === 'done';
                const skipped = s.status === 'skipped';
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setFocus(s.id)}
                    style={[styles.chip, active && styles.chipActive, done && styles.chipDone]}
                    accessibilityRole="button"
                    accessibilityLabel={`${STEP_META[s.id].short}: ${done ? 'done' : skipped ? 'skipped' : 'to do'}`}
                  >
                    <MaterialCommunityIcons
                      name={(done ? 'check-circle' : STEP_META[s.id].icon) as any}
                      size={16}
                      color={done ? Colors.statusGreen : active ? Colors.primary : Colors.textMuted}
                    />
                    <Text style={[styles.chipText, active && { color: Colors.primary }]}>{STEP_META[s.id].short}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {allDone ? (
              <View style={[styles.card, { alignItems: 'center' }]}>
                <MaterialCommunityIcons name="check-circle" size={46} color={Colors.statusGreen} />
                <Text style={styles.cardTitle}>You are all set</Text>
                <Text style={[styles.body, { textAlign: 'center' }]}>
                  Your route is recorded only while an On-Duty request is active. You can check how tracking is doing at any time.
                </Text>
                <Button title="Back to On-Duty" onPress={() => (router.canGoBack() ? router.back() : router.replace('/on-duty'))} style={{ alignSelf: 'stretch' }} />
                <Button title="Open tracking health" variant="outline" onPress={() => router.push(trackingRoutes.health)} style={{ alignSelf: 'stretch' }} />
              </View>
            ) : (
              <View style={styles.card}>
                {current && renderStepBody(current)}
                {!!hint && (
                  <View style={styles.hintBox}>
                    <MaterialCommunityIcons name="information-outline" size={16} color={Colors.badgeBlueText} />
                    <Text style={styles.hintText}>{hint}</Text>
                  </View>
                )}
              </View>
            )}
            {!allDone && ready && (
              <Text style={styles.small}>
                Tracking can already run: only the extras above are left. Skipping them is fine, but the route may have gaps on some phones.
              </Text>
            )}
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
    content: { padding: 16, gap: 14, paddingBottom: 32 },
    card: {
      backgroundColor: Colors.bgCard,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: Spacing.base,
      gap: Spacing.sm,
    },
    cardTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 16, color: Colors.textPrimary },
    body: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
    small: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16 },
    noticeBox: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 12 },
    noticeText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 19 },
    stepsBox: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 12, gap: 4 },
    stepLine: { fontSize: 12.5, color: Colors.textPrimary, lineHeight: 18 },
    oemBox: { backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.md, padding: 12, gap: 4 },
    oemTitle: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
    linkBtn: { alignSelf: 'center', paddingVertical: 6 },
    link: { color: Colors.primary, fontSize: 12.5, fontWeight: '700' },
    hintBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.badgeBlueBg, borderRadius: BorderRadius.md, padding: 10 },
    hintText: { flex: 1, fontSize: 12, color: Colors.badgeBlueText, lineHeight: 17 },
    stepper: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.bgCard,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryFixed },
    chipDone: { borderColor: Colors.statusGreen },
    chipText: { fontSize: 11.5, fontWeight: '700', color: Colors.textSecondary },
  });
