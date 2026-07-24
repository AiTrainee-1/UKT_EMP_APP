import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

import { Button } from '../../src/components/ui/Button';
import { Toast } from '../../src/components/ui/Toast';
import { TextArea } from '../../src/components/ui/TextArea';
import { Badge } from '../../src/components/ui/Badge';
import { Colors } from '../../src/constants/colors';
import { BorderRadius, Spacing, CardStyle } from '../../src/constants/theme';
import {
  useOnDutySessionStatus, useSubmitOnDutySessionRequest, useCompleteOnDutySession,
  useSubmitOnDutyPunch, useGeoPunchStatus, OnDutyPunchVerification,
} from '../../src/hooks/useGeoAttendance';

const STAGE_LABEL: Record<string, string> = {
  pending_hod: 'Awaiting Department Head approval',
  pending_hr: 'Awaiting HR approval',
  active: 'Active',
  completed: 'Completed',
  rejected: 'Rejected',
};

function statusBadgeVariant(status: string): 'pending' | 'approved' | 'rejected' {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

export default function OnDutyScreen() {
  const { data: status, refetch: refetchStatus } = useOnDutySessionStatus();
  const { data: geoStatus } = useGeoPunchStatus();
  const submitRequestMutation = useSubmitOnDutySessionRequest();
  const completeMutation = useCompleteOnDutySession();
  const submitPunchMutation = useSubmitOnDutyPunch();

  const [destination, setDestination] = useState('');
  const [showNewRequestForm, setShowNewRequestForm] = useState(false);
  const [punchBusy, setPunchBusy] = useState(false);
  const [punchStage, setPunchStage] = useState<'idle' | 'review'>('idle');
  const [punchPhotoUri, setPunchPhotoUri] = useState<string | null>(null);
  const [punchLocation, setPunchLocation] = useState<{ latitude: number; longitude: number; accuracy?: number; isMocked: boolean } | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3500);
  };

  const session = status?.session ?? null;
  const punchVerifications = status?.punchVerifications ?? [];
  const nextPunchNumber = geoStatus?.nextPunchNumber ?? null;
  const nextPunchType = geoStatus?.nextPunchType ?? null;

  const hasPendingVerification = punchVerifications.some((v) => v.status === 'pending');

  const latestByNumber = new Map<number, OnDutyPunchVerification>();
  for (const v of punchVerifications) {
    const existing = latestByNumber.get(v.punchNumber);
    if (!existing || v.id > existing.id) latestByNumber.set(v.punchNumber, v);
  }
  const slots = [1, 2, 3, 4].map((n) => ({
    number: n,
    type: (n % 2 === 1 ? 'IN' : 'OUT') as 'IN' | 'OUT',
    verification: latestByNumber.get(n) ?? null,
  }));

  const submitRequest = async () => {
    if (!destination.trim()) return;
    try {
      await submitRequestMutation.mutateAsync({ destination: destination.trim() });
      showToast('On-Duty request submitted — awaiting approval.', 'success');
      setDestination('');
      setShowNewRequestForm(false);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? err?.message ?? 'Failed to submit request', 'error');
    }
  };

  const startPunchCapture = async () => {
    setPunchBusy(true);
    try {
      const camPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (!camPerm.granted) {
        showToast('Camera permission is required to record this punch.', 'error');
        return;
      }
      const photoResult = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
      if (photoResult.canceled || !photoResult.assets?.[0]?.uri) return;

      let locPerm = await Location.getForegroundPermissionsAsync();
      if (!locPerm.granted) locPerm = await Location.requestForegroundPermissionsAsync();
      if (!locPerm.granted) {
        showToast('Location access is required to record this punch.', 'error');
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPunchPhotoUri(photoResult.assets[0].uri);
      setPunchLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        isMocked: (pos as { mocked?: boolean }).mocked ?? false,
      });
      setPunchStage('review');
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to capture photo/location', 'error');
    } finally {
      setPunchBusy(false);
    }
  };

  const cancelPunch = () => {
    setPunchStage('idle');
    setPunchPhotoUri(null);
    setPunchLocation(null);
  };

  const submitPunch = async () => {
    if (!punchPhotoUri || !punchLocation) return;
    setPunchBusy(true);
    try {
      await submitPunchMutation.mutateAsync({ ...punchLocation, photoUri: punchPhotoUri });
      showToast('Punch submitted — awaiting HR approval.', 'success');
      cancelPunch();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? err?.message ?? 'Failed to submit punch', 'error');
    } finally {
      setPunchBusy(false);
    }
  };

  const handleMarkDone = () => {
    Alert.alert(
      'Mark On-Duty as Done',
      "This ends your On-Duty session now. If you haven't made all of today's punches yet, you can still complete them from the regular Attendance flow. Continue?",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Mark Done',
          style: 'destructive',
          onPress: async () => {
            try {
              await completeMutation.mutateAsync();
              showToast('On-Duty session marked as done.', 'success');
            } catch (err: any) {
              showToast(err?.response?.data?.error ?? err?.message ?? 'Failed to complete session', 'error');
            }
          },
        },
      ],
    );
  };

  const showRequestForm = !session || showNewRequestForm;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={undefined}>

        {showRequestForm ? (
          <View style={[CardStyle.clay, { gap: Spacing.sm }]}>
            <View style={styles.introRow}>
              <MaterialCommunityIcons name="briefcase-outline" size={22} color={Colors.tertiary} />
              <Text style={styles.introTitle}>Request On-Duty</Text>
            </View>
            <Text style={styles.introBody}>
              Enter where you're going. Once your Department Head and HR approve, your On-Duty session starts
              automatically — your regular attendance punches for the rest of the day will then need a selfie and
              GPS verification, reviewed by HR.
            </Text>
            <Text style={styles.reviewLabel}>DESTINATION / PLACE</Text>
            <TextArea
              placeholder="e.g. ABC Textiles — machine inspection"
              value={destination}
              onChangeText={setDestination}
              minLength={3}
              maxLength={300}
            />
            <Button
              title="Submit for Approval"
              onPress={submitRequest}
              loading={submitRequestMutation.isPending}
              disabled={!destination.trim()}
              style={{ marginTop: Spacing.sm }}
            />
            {showNewRequestForm && (
              <Button title="Cancel" variant="outline" onPress={() => setShowNewRequestForm(false)} />
            )}
          </View>
        ) : session && (session.status === 'pending_hod' || session.status === 'pending_hr') ? (
          <View style={[CardStyle.clay, { gap: Spacing.md }]}>
            <View style={[styles.statusBanner, { backgroundColor: Colors.badgePendingBg }]}>
              <MaterialCommunityIcons name="clock-outline" size={18} color={Colors.badgePendingText} />
              <Text style={[styles.statusBannerText, { color: Colors.badgePendingText }]}>
                {STAGE_LABEL[session.status]}
              </Text>
            </View>
            <View style={styles.reviewCell}>
              <Text style={styles.reviewLabel}>Destination</Text>
              <Text style={styles.reviewValue}>{session.destination}</Text>
            </View>
            {session.status === 'pending_hr' && session.hodReviewedBy && (
              <View style={styles.reviewCell}>
                <Text style={styles.reviewLabel}>Department Head</Text>
                <Text style={styles.reviewValue}>Approved by {session.hodReviewedBy}</Text>
              </View>
            )}
            <Text style={styles.hintText}>
              Your On-Duty session will start automatically the moment HR approves this request.
            </Text>
            <Button title="Refresh Status" variant="outline" onPress={() => refetchStatus()} />
          </View>
        ) : session && session.status === 'active' ? (
          <>
            <View style={[CardStyle.clay, { gap: Spacing.sm }]}>
              <View style={[styles.statusBanner, { backgroundColor: Colors.badgeGreenBg }]}>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color={Colors.statusGreen} />
                <Text style={[styles.statusBannerText, { color: Colors.statusGreen }]}>On-Duty session active</Text>
              </View>
              <View style={styles.reviewCell}>
                <Text style={styles.reviewLabel}>Destination</Text>
                <Text style={styles.reviewValue}>{session.destination}</Text>
              </View>
              {session.startedAt && (
                <View style={styles.reviewCell}>
                  <Text style={styles.reviewLabel}>Started</Text>
                  <Text style={styles.reviewValue}>
                    {new Date(session.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
            </View>

            {punchStage === 'review' && punchPhotoUri ? (
              <View style={[CardStyle.clay, { gap: Spacing.md }]}>
                <Text style={styles.reviewLabel}>REVIEW YOUR PUNCH</Text>
                <Image source={{ uri: punchPhotoUri }} style={styles.photoPreview} />
                <View style={styles.reviewGrid}>
                  <View style={styles.reviewCell}>
                    <Text style={styles.reviewLabel}>Punch</Text>
                    <Text style={styles.reviewValue}>
                      #{nextPunchNumber} · {nextPunchType === 'IN' ? 'Check-In' : 'Check-Out'}
                    </Text>
                  </View>
                  <View style={styles.reviewCell}>
                    <Text style={styles.reviewLabel}>Time</Text>
                    <Text style={styles.reviewValue}>
                      {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
                <Text style={styles.hintText}>
                  This punch will be held pending until HR verifies your photo and location.
                </Text>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <Button title="Retake" variant="outline" onPress={startPunchCapture} loading={punchBusy} style={{ flex: 1 }} />
                  <Button title="Submit Punch" onPress={submitPunch} loading={punchBusy} style={{ flex: 1 }} />
                </View>
                <Button title="Cancel" variant="ghost" onPress={cancelPunch} disabled={punchBusy} />
              </View>
            ) : hasPendingVerification ? (
              <View style={[CardStyle.clay, styles.gateCard]}>
                <MaterialCommunityIcons name="timer-sand" size={28} color={Colors.tertiary} style={styles.gateIcon} />
                <Text style={styles.gateTitle}>Punch awaiting HR approval</Text>
                <Text style={styles.gateBody}>You'll be able to submit your next punch once HR reviews this one.</Text>
              </View>
            ) : nextPunchNumber != null ? (
              <View style={[CardStyle.clay, styles.gateCard]}>
                <MaterialCommunityIcons name="camera-outline" size={28} color={Colors.tertiary} style={styles.gateIcon} />
                <Text style={styles.gateTitle}>
                  Punch {nextPunchNumber} · {nextPunchType === 'IN' ? 'Check-In' : 'Check-Out'}
                </Text>
                <Text style={styles.gateBody}>Take a selfie and capture your location to record this punch.</Text>
                <Button title="Make Punch" onPress={startPunchCapture} loading={punchBusy} style={{ marginTop: Spacing.base }} />
              </View>
            ) : (
              <View style={[styles.doneBanner]}>
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={Colors.statusGreen} />
                <Text style={styles.doneBannerText}>
                  All 4 punches for today are recorded. Your session will complete once HR approves your last punch.
                </Text>
              </View>
            )}

            <View style={[CardStyle.clay, { gap: Spacing.sm }]}>
              <Text style={styles.reviewLabel}>TODAY'S PUNCHES</Text>
              {slots.map((slot) => (
                <View key={slot.number} style={styles.slotRow}>
                  <View style={styles.slotLeft}>
                    <Text style={styles.slotNum}>#{slot.number}</Text>
                    <Text style={styles.slotType}>{(slot.verification?.punchType ?? slot.type) === 'IN' ? 'Check-In' : 'Check-Out'}</Text>
                  </View>
                  {slot.verification ? (
                    <View style={styles.slotRight}>
                      <Text style={styles.slotTime}>{slot.verification.punchTime.slice(0, 5)}</Text>
                      <Badge label={slot.verification.status} variant={statusBadgeVariant(slot.verification.status)} />
                    </View>
                  ) : (
                    <Text style={styles.slotPending}>
                      {nextPunchNumber === slot.number ? 'Up next' : 'Not yet'}
                    </Text>
                  )}
                </View>
              ))}
            </View>

            <Button title="Mark On-Duty as Done" variant="outline" onPress={handleMarkDone} loading={completeMutation.isPending} />
          </>
        ) : session ? (
          <View style={[CardStyle.clay, styles.doneCard]}>
            <MaterialCommunityIcons
              name={session.status === 'completed' ? 'check-circle' : 'close-circle'}
              size={40}
              color={session.status === 'completed' ? Colors.statusGreen : Colors.statusRed}
            />
            <Text style={styles.doneTitle}>
              On-Duty {session.status === 'completed' ? 'session completed' : 'request rejected'}
            </Text>
            <Text style={styles.gateBody}>{session.destination}</Text>
            {session.status === 'completed' && session.completionReason && (
              <Text style={styles.hintText}>
                {session.completionReason === 'auto_4th_punch'
                  ? 'Ended automatically after your 4th punch was approved.'
                  : 'Ended manually.'}
              </Text>
            )}
            {session.status === 'rejected' && session.hrReviewComment && (
              <Text style={styles.hintText}>HR: {session.hrReviewComment}</Text>
            )}
            {session.status === 'rejected' && session.hodReviewComment && !session.hrReviewComment && (
              <Text style={styles.hintText}>Department Head: {session.hodReviewComment}</Text>
            )}
            <Button title="Submit New On-Duty Request" variant="outline" onPress={() => setShowNewRequestForm(true)} style={{ marginTop: Spacing.base }} />
            <Button title="Back to Attendance" variant="ghost" onPress={() => router.back()} />
          </View>
        ) : null}
      </ScrollView>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  content: { padding: 16, gap: 16, paddingBottom: 32 },

  introRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  introTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  introBody: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

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

  photoPreview: { width: '100%', aspectRatio: 1.2, borderRadius: BorderRadius.md },

  slotRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant,
  },
  slotLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotNum: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  slotType: { fontSize: 12.5, color: Colors.textSecondary, fontWeight: '600' },
  slotRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotTime: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  slotPending: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
});
