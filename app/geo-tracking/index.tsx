import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { useAuth } from '../../src/hooks/useAuth';
import { useEmployee } from '../../src/hooks/useEmployee';
import {
  startLiveTracking,
  isLiveTrackingActive,
  onLiveTrackingTick,
} from '../../src/hooks/useGeoAttendance';
import { Button } from '../../src/components/ui/Button';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing, CardStyle } from '../../src/constants/theme';

function timeAgo(d: Date | null): string {
  if (!d) return 'never';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ago`;
}

export default function GeoTrackingScreen() {
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { user } = useAuth();
  const { data: emp, isLoading, refetch } = useEmployee(user?.employeeId ?? null);
  const enabled = !!emp?.locationTrackingEnabled;

  const [permStatus, setPermStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [active, setActive] = useState(isLiveTrackingActive());
  const [lastTick, setLastTick] = useState<{ ok: boolean; at: Date } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [, forceTick] = useState(0);

  // Re-check current permission (non-prompting) whenever this screen becomes
  // visible again, e.g. after the employee grants it from the OS Settings
  // app and comes back.
  useEffect(() => {
    const check = () => {
      refetch();
      Location.getForegroundPermissionsAsync().then((p) => setPermStatus(p.granted ? 'granted' : 'denied'));
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live "Xs ago" label — re-render every 5s while tracking is active.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    onLiveTrackingTick((ok, at) => {
      setLastTick({ ok, at });
      setActive(isLiveTrackingActive());
    });
    return () => onLiveTrackingTick(null);
  }, []);

  const handleEnable = async () => {
    setRequesting(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      setPermStatus(perm.granted ? 'granted' : 'denied');
      if (perm.granted) {
        startLiveTracking();
        setActive(true);
      }
    } finally {
      setRequesting(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.content}>
          <SkeletonCard lines={3} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!enabled ? (
          <EmptyState
            icon="crosshairs-gps"
            title="Not enabled for your account"
            subtitle="HR hasn't turned on live location tracking for you. If your role requires it (e.g. driver, field visits), ask HR to enable it from your profile."
          />
        ) : (
          <>
            <View style={[CardStyle.clay, styles.statusCard]}>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: active ? Colors.statusGreen : permStatus === 'denied' ? Colors.statusRed : Colors.textMuted },
                  ]}
                />
                <Text style={styles.statusTitle}>
                  {active ? 'Live tracking active' : permStatus === 'denied' ? 'Location access needed' : 'Not sharing yet'}
                </Text>
              </View>
              <Text style={styles.statusBody}>
                {active
                  ? `HR can see your current location on the Geo Attendance dashboard. Last update: ${timeAgo(lastTick?.at ?? null)}.`
                  : "HR has enabled live tracking for your account, but it only runs while you've granted location access and this app is open."}
              </Text>
              {lastTick && !lastTick.ok && (
                <Text style={styles.warnText}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={12} color={Colors.statusRed} /> Last update
                  attempt failed — will retry automatically.
                </Text>
              )}
            </View>

            {!active && (
              <View style={[CardStyle.clay, styles.enableCard]}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={32} color={Colors.primary} style={{ alignSelf: 'center', marginBottom: Spacing.sm }} />
                <Text style={styles.enableTitle}>
                  {permStatus === 'denied' ? 'Location access was denied' : 'Turn on location sharing'}
                </Text>
                <Text style={styles.enableBody}>
                  {permStatus === 'denied'
                    ? 'You previously denied location access. Enable it from your phone Settings → Apps → UKTextiles → Permissions → Location, then come back here.'
                    : "We'll ask for location permission — this only shares your location while the app is open, never in the background, and only because HR turned this on for your account."}
                </Text>
                {permStatus !== 'denied' && (
                  <Button
                    title={requesting ? 'Requesting…' : 'Enable Location Sharing'}
                    onPress={handleEnable}
                    loading={requesting}
                    style={{ marginTop: Spacing.base }}
                    icon={<MaterialCommunityIcons name="crosshairs-gps" size={16} color="#fff" />}
                  />
                )}
              </View>
            )}

            <View style={styles.infoBlock}>
              <MaterialCommunityIcons name="information-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.infoText}>
                Location sharing automatically stops if HR turns off tracking for your account, and never runs unless
                this app is open on your phone.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  content: { padding: 16, gap: 16 },

  statusCard: {},
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  statusBody: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
  warnText: { fontSize: 11, color: Colors.statusRed, marginTop: 8 },

  enableCard: { alignItems: 'stretch' },
  enableTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 4 },
  enableBody: { fontSize: 12.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },

  infoBlock: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    ...Platform.select({ default: {} }),
  },
  infoText: { flex: 1, fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
});
