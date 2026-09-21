import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, AppState, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { useAuth } from '../../src/hooks/useAuth';
import { useEmployee } from '../../src/hooks/useEmployee';
import {
  startLiveTracking,
  stopLiveTracking,
  isLiveTrackingActive,
  onLiveTrackingTick,
} from '../../src/hooks/useGeoAttendance';
import { Avatar } from '../../src/components/ui/Avatar';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily, TabularNums } from '../../src/constants/typography';

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

  const handleToggle = (value: boolean) => {
    if (value) {
      handleEnable();
    } else {
      stopLiveTracking();
      setActive(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Live Tracking</Text>
          <Text style={styles.headerSubtitle}>Field Visibility for HR</Text>
        </View>
        {enabled && (
          <View style={styles.hrPill}>
            <View style={styles.hrPillDot} />
            <Text style={styles.hrPillText}>HR Active</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.content}>
          <SkeletonCard lines={3} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!enabled ? (
            <EmptyState
              icon="crosshairs-gps"
              title="Not enabled for your account"
              subtitle="HR hasn't turned on live location tracking for you. If your role requires it (e.g. driver, field visits), ask HR to enable it from your profile."
            />
          ) : (
            <>
              {/* ─── Identity chip ─── */}
              <View style={styles.idCard}>
                <Avatar uri={emp?.photoUrl} name={emp?.name ?? user?.name} size={38} borderColor={Colors.border} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.idName}>{emp?.name ?? user?.name}</Text>
                  <Text style={styles.idMeta}>{emp?.employeeCode} • {emp?.departmentName ?? emp?.designationTitle}</Text>
                </View>
              </View>

              {/* ─── Beacon visual ─── */}
              <View style={styles.beaconCard}>
                <View style={styles.beaconHeaderRow}>
                  <MaterialCommunityIcons name="crosshairs-gps" size={16} color={Colors.primary} />
                  <Text style={styles.beaconTitle}>GPS Location Beacon</Text>
                </View>
                <View style={styles.radarWrap}>
                  <View style={[styles.pulseTag, styles.pulseTagLeft]}>
                    <View style={[styles.hrPillDot, { backgroundColor: active ? Colors.statusGreen : Colors.textMuted }]} />
                    <Text style={styles.pulseTagText}>{active ? 'Broadcasting' : 'Idle'}</Text>
                  </View>
                  <View style={styles.radarRingOuter}>
                    <View style={styles.radarRingMid}>
                      <View style={[styles.radarCore, { backgroundColor: active ? Colors.primary : Colors.textMuted }]}>
                        <MaterialCommunityIcons name="navigation" size={20} color="#fff" />
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* ─── Stats ─── */}
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <View style={styles.statTopRow}>
                    <Text style={styles.statLabel}>Last Signal Ping</Text>
                    <MaterialCommunityIcons name="access-point" size={14} color={active ? Colors.statusGreen : Colors.textMuted} />
                  </View>
                  <Text style={[styles.statValue, TabularNums]}>{active ? timeAgo(lastTick?.at ?? null) : '—'}</Text>
                </View>
                <View style={styles.statCard}>
                  <View style={styles.statTopRow}>
                    <Text style={styles.statLabel}>Runs While</Text>
                    <MaterialCommunityIcons name="cellphone" size={14} color={Colors.textMuted} />
                  </View>
                  <Text style={styles.statValue}>App Open</Text>
                </View>
              </View>

              {lastTick && !lastTick.ok && (
                <View style={styles.warnRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={13} color={Colors.statusRed} />
                  <Text style={styles.warnText}>Last update attempt failed — will retry automatically.</Text>
                </View>
              )}

              {/* ─── Location sharing toggle ─── */}
              <View style={styles.toggleCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Location Sharing</Text>
                  <Text style={styles.toggleSubtitle}>Visible to HR on the Geo Attendance dashboard</Text>
                </View>
                {permStatus === 'denied' ? (
                  <Text style={styles.deniedHint}>Denied</Text>
                ) : (
                  <Switch
                    value={active}
                    onValueChange={handleToggle}
                    disabled={requesting}
                    trackColor={{ false: Colors.outlineVariant, true: Colors.primary }}
                    thumbColor="#fff"
                  />
                )}
              </View>

              {permStatus === 'denied' && (
                <View style={[styles.card, styles.enableCard]}>
                  <Text style={styles.enableTitle}>Location access was denied</Text>
                  <Text style={styles.enableBody}>
                    Enable it from your phone Settings → Apps → UKTextiles → Permissions → Location, then come back here.
                  </Text>
                </View>
              )}

              <Text style={styles.sectionLabel}>PRIVACY SAFEGUARDS</Text>
              <View style={styles.cardsWrap}>
                <View style={styles.infoCard}>
                  <View style={styles.infoIcon}>
                    <MaterialCommunityIcons name="cellphone-off" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoTitle}>Stops When App Closes</Text>
                    <Text style={styles.infoText}>Sharing never runs in the background — only while UKTextiles is open on your phone.</Text>
                  </View>
                </View>
                <View style={styles.infoCard}>
                  <View style={styles.infoIcon}>
                    <MaterialCommunityIcons name="shield-off-outline" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoTitle}>Stops When HR Disables It</Text>
                    <Text style={styles.infoText}>Sharing automatically stops the moment HR turns off tracking for your account.</Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
}) as object;

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgSurfaceLow },
  headerTitle: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 18 },
  headerSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 1 },
  hrPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.badgeGreenBg, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 5 },
  hrPillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.statusGreen },
  hrPillText: { color: Colors.statusGreen, fontSize: 10.5, fontWeight: '800' },

  content: { padding: 16, gap: 14, paddingBottom: 32 },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    ...cardShadow,
  },

  idCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.primaryFixed,
    borderRadius: BorderRadius.xl,
    padding: 12,
  },
  idName: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  idMeta: { color: Colors.textSecondary, fontSize: 11.5, marginTop: 2 },

  beaconCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16,
    ...cardShadow,
  },
  beaconHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  beaconTitle: { color: Colors.textPrimary, fontFamily: FontFamily.headlineSemibold, fontSize: 14 },
  radarWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, position: 'relative' },
  pulseTag: {
    position: 'absolute', top: 0, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4,
  },
  pulseTagLeft: { left: 0 },
  pulseTagText: { color: Colors.textPrimary, fontSize: 10.5, fontWeight: '700' },
  radarRingOuter: { width: 150, height: 150, borderRadius: 75, backgroundColor: Colors.badgeBlueBg, alignItems: 'center', justifyContent: 'center' },
  radarRingMid: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  radarCore: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },

  statsGrid: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12,
    gap: 6,
    ...cardShadow,
  },
  statTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statLabel: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700' },
  statValue: { color: Colors.textPrimary, fontFamily: FontFamily.displayBold, fontSize: 16 },

  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6 },
  warnText: { color: Colors.statusRed, fontSize: 11 },

  toggleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    ...cardShadow,
  },
  toggleTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 14 },
  toggleSubtitle: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  deniedHint: { color: Colors.statusRed, fontSize: 11.5, fontWeight: '700' },

  enableCard: { alignItems: 'stretch' },
  enableTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 14, color: Colors.textPrimary, textAlign: 'center', marginBottom: 4 },
  enableBody: { fontSize: 12.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 4, marginBottom: -4 },
  cardsWrap: { gap: 10 },
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
    ...cardShadow,
  },
  infoIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.badgeBlueBg, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bodySemibold, fontSize: 13 },
  infoText: { color: Colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
});
