import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { Button } from '../../src/components/ui/Button';
import { Toast } from '../../src/components/ui/Toast';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { BorderRadius, Spacing, CardStyle } from '../../src/constants/theme';
import {
  useGeoPunchStatus, useGeoPunchPrecheck, useGeoPunch, GeoPunchPrecheckResult,
} from '../../src/hooks/useGeoAttendance';

type Step = 'permission' | 'locate' | 'review' | 'done';

const STEPS: Step[] = ['permission', 'locate', 'review'];

function StepDots({ labels, current }: { labels: string[]; current: number }) {
  return (
    <View style={dotStyles.row}>
      {labels.map((label, i) => (
        <React.Fragment key={label}>
          <View style={[dotStyles.dot, i < current ? dotStyles.dotDone : i === current ? dotStyles.dotActive : dotStyles.dotUpcoming]}>
            {i < current ? (
              <MaterialCommunityIcons name="check" size={12} color="#fff" />
            ) : (
              <Text style={[dotStyles.dotNum, i === current && { color: '#fff' }]}>{i + 1}</Text>
            )}
          </View>
          {i < labels.length - 1 && <View style={[dotStyles.line, i < current && dotStyles.lineDone]} />}
        </React.Fragment>
      ))}
    </View>
  );
}

export default function GeoPunchScreen() {
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useGeoPunchStatus();
  const precheckMutation = useGeoPunchPrecheck();
  const punchMutation = useGeoPunch();

  const [step, setStep] = useState<Step>('permission');
  const [permStatus, setPermStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [busy, setBusy] = useState(false);
  const [location, setLocationState] = useState<{ latitude: number; longitude: number; accuracy?: number; isMocked: boolean } | null>(null);
  const [precheck, setPrecheck] = useState<GeoPunchPrecheckResult | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3500);
  };

  const nextNum = status?.nextPunchNumber ?? null;
  const nextType = status?.nextPunchType ?? null;
  const onDutySession = status?.onDutySession ?? null;
  const onDutyBlocking = onDutySession != null && (onDutySession.status === 'pending_hod' || onDutySession.status === 'pending_hr' || onDutySession.status === 'active');

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((p) => setPermStatus(p.granted ? 'granted' : 'unknown'));
  }, []);

  const requestPermission = async () => {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      setPermStatus(perm.granted ? 'granted' : 'denied');
      if (perm.granted) {
        setStep('locate');
      } else {
        showToast('Location access is required to continue.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const captureLocation = async () => {
    setBusy(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const loc = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        isMocked: (pos as { mocked?: boolean }).mocked ?? false,
      };
      setLocationState(loc);
      const result = await precheckMutation.mutateAsync({ latitude: loc.latitude, longitude: loc.longitude });
      setPrecheck(result);
      setStep('review');
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to get your location', 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitPunch = async () => {
    if (!location) return;
    setBusy(true);
    try {
      const result = await punchMutation.mutateAsync(location);
      if (result.status === 'rejected') {
        showToast(result.message ?? 'You are outside the allowed company radius.', 'error');
        return;
      }
      showToast(
        result.status === 'accepted'
          ? `${result.punchType === 'IN' ? 'Checked in' : 'Checked out'} successfully`
          : 'This punch was already recorded.',
        'success',
      );
      setStep('done');
      refetchStatus();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? err?.message ?? 'Failed to punch', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('permission');
    setLocationState(null);
    setPrecheck(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {statusLoading ? (
          <View style={{ gap: Spacing.base }}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={4} />
          </View>
        ) : onDutyBlocking ? (
          <View style={[CardStyle.clay, styles.gateCard]}>
            <MaterialCommunityIcons name="briefcase-outline" size={32} color={Colors.tertiary} style={styles.gateIcon} />
            <Text style={styles.gateTitle}>You have an On-Duty session in progress</Text>
            <Text style={styles.gateBody}>
              {onDutySession?.status === 'active'
                ? "Your punches for today go through the On-Duty page — Office Geo Punch is disabled while your session is active."
                : "Your On-Duty request is awaiting approval. Office Geo Punch is disabled until it's resolved."}
            </Text>
            <Button title="Go to On-Duty" onPress={() => router.push('/on-duty')} style={{ marginTop: Spacing.base }} />
          </View>
        ) : nextNum == null ? (
          <View style={[styles.doneBanner]}>
            <MaterialCommunityIcons name="check-circle-outline" size={16} color={Colors.statusGreen} />
            <Text style={styles.doneBannerText}>
              All 4 punches for today are already recorded — there's no punch slot left to attach a new request to.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.stepHeader}>
              <Text style={styles.introText}>
                Next: <Text style={styles.introBold}>Punch {nextNum} · {nextType === 'IN' ? 'Check-In' : 'Check-Out'}</Text>
              </Text>
              {step !== 'permission' && (
                <TouchableOpacity onPress={reset} style={styles.changeBtn}>
                  <MaterialCommunityIcons name="chevron-left" size={16} color={Colors.textMuted} />
                  <Text style={styles.changeBtnText}>Start Over</Text>
                </TouchableOpacity>
              )}
            </View>
            <StepDots labels={['Permission', 'Location', 'Review']} current={STEPS.indexOf(step === 'done' ? 'review' : step)} />

            {step === 'permission' && (
              <View style={[CardStyle.clay, styles.gateCard]}>
                <MaterialCommunityIcons name="crosshairs-gps" size={32} color={Colors.primary} style={styles.gateIcon} />
                <Text style={styles.gateTitle}>Allow location access</Text>
                <Text style={styles.gateBody}>We need your current location to verify you're inside your branch's allowed radius.</Text>
                <Button title="Allow Location Access" onPress={requestPermission} loading={busy} style={{ marginTop: Spacing.base }} />
              </View>
            )}

            {step === 'locate' && (
              <View style={[CardStyle.clay, styles.gateCard]}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={32} color={Colors.primary} style={styles.gateIcon} />
                <Text style={styles.gateTitle}>Capture your current location</Text>
                <Text style={styles.gateBody}>We'll check whether you're inside the allowed company radius before you punch.</Text>
                <Button title="Capture Location" onPress={captureLocation} loading={busy} style={{ marginTop: Spacing.base }} />
              </View>
            )}

            {step === 'review' && precheck && (
              <View style={[CardStyle.clay, { gap: Spacing.md }]}>
                <View style={[styles.statusBanner, { backgroundColor: precheck.insideRadius ? Colors.badgeGreenBg : Colors.badgeRedBg }]}>
                  <MaterialCommunityIcons
                    name={precheck.insideRadius ? 'check-circle-outline' : 'close-circle-outline'}
                    size={18} color={precheck.insideRadius ? Colors.statusGreen : Colors.statusRed}
                  />
                  <Text style={[styles.statusBannerText, { color: precheck.insideRadius ? Colors.statusGreen : Colors.statusRed }]}>
                    {precheck.message}
                  </Text>
                </View>

                <View style={styles.reviewGrid}>
                  <View style={styles.reviewCell}>
                    <Text style={styles.reviewLabel}>Branch</Text>
                    <Text style={styles.reviewValue}>{precheck.branchName}</Text>
                  </View>
                  <View style={styles.reviewCell}>
                    <Text style={styles.reviewLabel}>Distance</Text>
                    <Text style={styles.reviewValue}>{precheck.distanceM}m (allowed {precheck.radiusM}m)</Text>
                  </View>
                  <View style={styles.reviewCell}>
                    <Text style={styles.reviewLabel}>Punch</Text>
                    <Text style={styles.reviewValue}>#{precheck.nextPunchNumber} · {precheck.nextPunchType === 'IN' ? 'Check-In' : 'Check-Out'}</Text>
                  </View>
                  <View style={styles.reviewCell}>
                    <Text style={styles.reviewLabel}>Time</Text>
                    <Text style={styles.reviewValue}>{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                </View>

                {precheck.insideRadius ? (
                  <Button
                    title={precheck.nextPunchType === 'OUT' ? 'Punch Out' : 'Punch In'}
                    onPress={submitPunch}
                    loading={busy}
                    icon={<MaterialCommunityIcons name="crosshairs-gps" size={16} color="#fff" />}
                  />
                ) : (
                  <>
                    <Text style={styles.hintText}>
                      Move within range to punch, or submit an On-Duty request if you're working off-site.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                      <Button title="Re-check" variant="outline" onPress={captureLocation} style={{ flex: 1 }} />
                      <Button title="Go On-Duty" onPress={() => router.push('/on-duty')} style={{ flex: 1 }} />
                    </View>
                  </>
                )}
              </View>
            )}

            {step === 'done' && (
              <View style={[CardStyle.clay, styles.doneCard]}>
                <MaterialCommunityIcons name="check-circle" size={40} color={Colors.statusGreen} />
                <Text style={styles.doneTitle}>Punch recorded</Text>
                <Button title="Back to Attendance" variant="outline" onPress={() => router.back()} style={{ marginTop: Spacing.base }} />
              </View>
            )}

            {step === 'permission' && (
              <TouchableOpacity style={styles.onDutyLink} onPress={() => router.push('/on-duty')} activeOpacity={0.75}>
                <MaterialCommunityIcons name="briefcase-outline" size={16} color={Colors.tertiary} />
                <Text style={styles.onDutyLinkText}>Working off-site instead? Submit an On-Duty request</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.tertiary} />
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  content: { padding: 16, gap: 16, paddingBottom: 32 },

  introText: { fontSize: 13, color: Colors.textSecondary },
  introBold: { fontWeight: '800', color: Colors.textPrimary },

  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  changeBtn: { flexDirection: 'row', alignItems: 'center' },
  changeBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },

  gateCard: { alignItems: 'center' },
  gateIcon: { marginBottom: Spacing.sm },
  gateTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 4 },
  gateBody: { fontSize: 12.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },

  doneCard: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  doneTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },

  doneBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.badgeGreenBg, borderRadius: BorderRadius.md, padding: Spacing.base,
  },
  doneBannerText: { fontSize: 12, color: Colors.statusGreen, fontWeight: '600', flex: 1, lineHeight: 17 },

  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: BorderRadius.md, padding: Spacing.base },
  statusBannerText: { fontSize: 12.5, fontWeight: '700', flex: 1 },

  reviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  reviewCell: { flexBasis: '47%', flexGrow: 1, backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.sm, padding: Spacing.sm },
  reviewLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  reviewValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginTop: 2 },

  hintText: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16 },

  onDutyLink: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.badgeYellowBg, borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  onDutyLinkText: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.tertiary },
});

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: Colors.statusGreen },
  dotActive: { backgroundColor: Colors.primary },
  dotUpcoming: { backgroundColor: Colors.bgSurfaceMid },
  dotNum: { fontSize: 10, fontWeight: '800', color: Colors.textMuted },
  line: { width: 16, height: 2, backgroundColor: Colors.outlineVariant, marginHorizontal: 2, borderRadius: 1 },
  lineDone: { backgroundColor: Colors.statusGreen },
});
