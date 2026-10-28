import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';
import { FormScrollView } from '../../src/components/FormScrollView';
import { Button } from '../../src/components/ui/Button';
import { Toast } from '../../src/components/ui/Toast';
import { TextArea } from '../../src/components/ui/TextArea';
import { Badge } from '../../src/components/ui/Badge';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { Colors } from '../../src/constants/colors';
import { useTheme, useThemedStyles } from '../../src/theme/ThemeProvider';
import type { Palette } from '../../src/theme/palettes';
import { BorderRadius, Spacing } from '../../src/constants/theme';
import { FontFamily } from '../../src/constants/typography';
import {
  useOnDutySessionStatus, useSubmitOnDutySessionRequest, useCompleteOnDutySession,
  useSubmitOnDutyPunch, OnDutyPunchVerification, PunchSlot,
} from '../../src/hooks/useGeoAttendance';
import { useApprovalSummary } from '../../src/hooks/useApproval';
import { pipelineSentence, waitingPhrase, waitingText, workflowOff } from '../../src/lib/approval';
import {
  captureButtonLabel, describePunchError, isPhotoPlanComplete, newPhotoPlan, nextMissingPhoto, photoLabel,
  requiredPhotoCount, withPhoto, withRequired,
} from '../../src/lib/onDutyPhotos';
import type { PhotoPlan } from '../../src/lib/onDutyPhotos';
import { TrackingIssueBanner } from '../../src/components/tracking/TrackingIssueBanner';
import { bannerIssues } from '../../src/tracking/onboarding';
import { trackingRoutes } from '../../src/tracking/routes';
import { useTrackingHealth } from '../../src/tracking/useTracking';
import { ApprovalTrail } from '../../src/components/approval/ApprovalTrail';
import { WorkflowOffNote } from '../../src/components/approval/WorkflowOffNote';

// What an OLDER backend's `status` says about a request that has not been decided. With `approval` the request says
// itself who it waits for (HR's pipeline decides), and this is not used.
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
  // `Colors` shadows the module import for this component's body, so both
  // the stylesheet and any inline JSX colour follow the active theme.
  const { C: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();

  // HR decides whether a punch needs one photo or two (the server says so in `requiredPhotos` and in /tracking/state's
  // `punchPhotos`). `forceTwo` is set when the server answered PHOTO2_REQUIRED to a one-photo punch (HR switched mid-capture).
  const [forceTwo, setForceTwo] = useState(false);
  const [photoPlan, setPhotoPlan] = useState<PhotoPlan>(() => newPhotoPlan(1));
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useOnDutySessionStatus();
  const submitRequestMutation = useSubmitOnDutySessionRequest();
  const completeMutation = useCompleteOnDutySession();
  const submitPunchMutation = useSubmitOnDutyPunch();
  // Who approves an On-Duty request, and whether HR has switched new ones off. Only a hint that may be a minute old: the
  // server refuses a new request either way and its message is shown (see submitRequest).
  const { data: approvalSummary } = useApprovalSummary();
  const onDutyFlow = approvalSummary?.onDuty;
  // Geo-tracking: the notice the employee must accept before the first request, the photo policy, and whatever is wrong with
  // the recording right now (the red banner).
  const { state: trackingState, issues: trackingIssueList } = useTrackingHealth();
  const trackingOn = !!trackingState && trackingState.supported && trackingState.enabled;
  const consentMissing = trackingOn && trackingState.consentRequired;
  const redIssues = bannerIssues(trackingIssueList);
  const requiredPhotos = forceTwo ? 2 : requiredPhotoCount(status?.requiredPhotos, trackingState?.punchPhotos);

  const [destination, setDestination] = useState('');
  const [showNewRequestForm, setShowNewRequestForm] = useState(false);
  const [punchBusy, setPunchBusy] = useState(false);
  const [punchStage, setPunchStage] = useState<'idle' | 'review'>('idle');
  // Which of the day's four slots this capture is for. The employee picks it;
  // it is never inferred from what came before.
  const [punchSlot, setPunchSlot] = useState<PunchSlot | null>(null);
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

  const latestByNumber = new Map<number, OnDutyPunchVerification>();
  for (const v of punchVerifications) {
    const existing = latestByNumber.get(v.punchNumber);
    if (!existing || v.id > existing.id) latestByNumber.set(v.punchNumber, v);
  }

  // Slot state is the server's answer, not a local guess -it also accounts
  // for punches that arrived from the biometric device or Office Geo Punch,
  // which this screen can't see. Falls back to a plain 1-4 layout only if
  // the status call hasn't landed yet.
  const serverSlots: PunchSlot[] = status?.punchSlots?.length
    ? status.punchSlots
    : ([1, 2, 3, 4] as const).map((n) => ({
        punchNumber: n,
        punchType: (n % 2 === 1 ? 'IN' : 'OUT') as 'IN' | 'OUT',
        status: 'available' as const,
        available: true,
      }));
  const slots = serverSlots.map((slot) => ({
    ...slot,
    verification: latestByNumber.get(slot.punchNumber) ?? null,
  }));
  const openSlots = slots.filter((slot) => slot.available);

  const submitRequest = async () => {
    if (!destination.trim()) return;
    try {
      const result = await submitRequestMutation.mutateAsync({ destination: destination.trim() });
      const blocked = result.tracking?.decision.blockedBy;
      if (result.tracking?.started) {
        showToast('On-Duty started — your route is being recorded, and you can begin punching now.', 'success');
      } else if (blocked === 'consent' || blocked === 'permission') {
        // The request is in; the recording could not start. Send the employee to fix exactly that.
        showToast('On-Duty started, but your route is not being recorded yet. Finish the tracking set-up.', 'info');
        router.push(trackingRoutes.setup(blocked === 'consent' ? 'consent' : 'foreground'));
      } else {
        showToast('On-Duty started — you can begin punching now.', 'success');
      }
      setDestination('');
      setShowNewRequestForm(false);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? err?.message ?? 'Failed to submit request', 'error');
    }
  };

  /** Opens the camera for photo number `index` (0-based) and stores it in the plan. False when nothing was taken. */
  const capturePhoto = async (index: number): Promise<boolean> => {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      showToast('Camera permission is required to record this punch.', 'error');
      return false;
    }
    const photoResult = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (photoResult.canceled || !photoResult.assets?.[0]?.uri) return false;
    const uri = photoResult.assets[0].uri;
    setPhotoPlan((plan) => withPhoto(plan, index, uri));
    return true;
  };

  const startPunchCapture = async (slot: PunchSlot) => {
    setPunchSlot(slot);
    setPunchBusy(true);
    try {
      // A new capture starts with the photos the server wants right now; the first one is taken at once.
      setPhotoPlan(newPhotoPlan(requiredPhotos));
      if (!(await capturePhoto(0))) return;

      let locPerm = await Location.getForegroundPermissionsAsync();
      if (!locPerm.granted) locPerm = await Location.requestForegroundPermissionsAsync();
      if (!locPerm.granted) {
        showToast('Location access is required to record this punch.', 'error');
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
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

  /** Take or retake one photo of the review screen ("Photo 1 of 2" / "Photo 2 of 2"). */
  const retakePhoto = async (index: number) => {
    setPunchBusy(true);
    try {
      await capturePhoto(index);
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to capture photo', 'error');
    } finally {
      setPunchBusy(false);
    }
  };

  const cancelPunch = () => {
    setPunchStage('idle');
    setPunchSlot(null);
    setPhotoPlan(newPhotoPlan(requiredPhotos));
    setPunchLocation(null);
  };

  const submitPunch = async () => {
    if (!isPhotoPlanComplete(photoPlan) || !punchLocation || !punchSlot) return;
    setPunchBusy(true);
    try {
      const result = await submitPunchMutation.mutateAsync({
        ...punchLocation, photoUris: photoPlan.uris.filter((u): u is string => !!u), punchNumber: punchSlot.punchNumber,
      });
      showToast(
        result.sessionEnded
          ? 'Punch submitted. All 4 punches are in — your On-Duty session has ended.'
          : 'Punch submitted — you can record your next punch any time.',
        'success',
      );
      cancelPunch();
    } catch (err: any) {
      const e = describePunchError(err);
      if (e.needsSecondPhoto) {
        // HR switched to two photos while this punch was being taken: keep the photo already taken and ask for the second.
        // (Only if this punch was sent with one; if two were sent and the server still says so, the app is out of date.)
        if (photoPlan.required === 1) {
          setForceTwo(true);
          setPhotoPlan((plan) => withRequired(plan, 2));
          queryClient.invalidateQueries({ queryKey: ['on-duty-session-status'] });
          queryClient.invalidateQueries({ queryKey: ['tracking-state'] });
          showToast('HR now requires two photos for a punch. Take the second photo, then submit again.', 'info');
        } else {
          showToast('Please update the UKTextiles app to the latest version, then try again.', 'error');
        }
      } else {
        showToast(e.message, 'error');
      }
    } finally {
      setPunchBusy(false);
    }
  };

  const handleMarkDone = () => {
    Alert.alert(
      'Mark On-Duty as Done',
      "This ends your On-Duty session now. Any punches you've already recorded stay submitted and will be confirmed by HR as usual. Continue?",
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
      <KeyboardAvoider style={{ flex: 1 }}>
      <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {statusLoading ? (
          <View style={{ gap: Spacing.base }}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={4} />
          </View>
        ) : showRequestForm ? (
          <View style={[styles.card, { gap: Spacing.sm }]}>
            <View style={styles.introRow}>
              <MaterialCommunityIcons name="briefcase-outline" size={22} color={Colors.tertiary} />
              <Text style={styles.introTitle}>Request On-Duty</Text>
            </View>
            <Text style={styles.introBody}>
              Enter where you're going. Your session starts as soon as you submit — you can begin punching right
              away, no waiting for approval. Each punch needs {requiredPhotos === 2 ? 'two photos' : 'a selfie'} and your location.{' '}
              {pipelineSentence(onDutyFlow, 'The whole day is confirmed afterwards.')}
            </Text>
            {trackingOn && (
              <View style={styles.trackingNote}>
                <MaterialCommunityIcons name="map-marker-path" size={16} color={Colors.badgeBlueText} />
                <Text style={styles.trackingNoteText}>
                  Your route is recorded from the moment you submit until you mark On-Duty Done, record all 4 punches, or the day ends.
                </Text>
              </View>
            )}
            {consentMissing && (
              <TouchableOpacity
                style={styles.consentGate}
                onPress={() => router.push(trackingRoutes.setup('consent'))}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="shield-check-outline" size={20} color={Colors.statusRed} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.consentGateTitle}>Read and accept the tracking notice first</Text>
                  <Text style={styles.consentGateBody}>You need to accept it once before you can start On-Duty.</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.statusRed} />
              </TouchableOpacity>
            )}
            <Text style={styles.reviewLabel}>DESTINATION / PLACE</Text>
            <TextArea
              placeholder="e.g. ABC Textiles — machine inspection"
              value={destination}
              onChangeText={setDestination}
              minLength={3}
              maxLength={300}
            />
            <WorkflowOffNote workflow={onDutyFlow} />
            <Button
              title="Submit for Approval"
              onPress={submitRequest}
              loading={submitRequestMutation.isPending}
              disabled={!destination.trim() || workflowOff(onDutyFlow) || consentMissing}
              style={{ marginTop: Spacing.sm }}
            />
            {showNewRequestForm && (
              <Button title="Cancel" variant="outline" onPress={() => setShowNewRequestForm(false)} />
            )}
          </View>
        ) : session && (session.status === 'pending_hod' || session.status === 'pending_hr') ? (
          <>
          <TrackingIssueBanner issues={redIssues} />
          <View style={[styles.card, { gap: Spacing.md }]}>
            <View style={[styles.statusBanner, { backgroundColor: Colors.badgePendingBg }]}>
              <MaterialCommunityIcons name="clock-outline" size={18} color={Colors.badgePendingText} />
              <Text style={[styles.statusBannerText, { color: Colors.badgePendingText }]}>
                {waitingText(session.approval) ?? STAGE_LABEL[session.status]}
              </Text>
            </View>
            <View style={styles.reviewCell}>
              <Text style={styles.reviewLabel}>Destination</Text>
              <Text style={styles.reviewValue}>{session.destination}</Text>
            </View>
            {session.approval ? (
              <ApprovalTrail approval={session.approval} />
            ) : session.status === 'pending_hr' && session.hodReviewedBy && (
              <View style={styles.reviewCell}>
                <Text style={styles.reviewLabel}>Department Head</Text>
                <Text style={styles.reviewValue}>Approved by {session.hodReviewedBy}</Text>
              </View>
            )}
            <Text style={styles.hintText}>
              Your On-Duty session will start automatically once this request is approved.
            </Text>
            <Button title="Refresh Status" variant="outline" onPress={() => refetchStatus()} />
          </View>
          </>
        ) : session && session.status === 'active' ? (
          <>
            <TrackingIssueBanner issues={redIssues} />
            <View style={[styles.card, { gap: Spacing.sm }]}>
              <View style={[styles.statusBanner, { backgroundColor: Colors.badgeGreenBg }]}>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color={Colors.statusGreen} />
                <Text style={[styles.statusBannerText, { color: Colors.statusGreen }]}>On-Duty session active</Text>
              </View>
              {session.isProvisional && (
                <Text style={styles.hintText}>
                  {waitingPhrase(session.approval)
                    ? `Your request is still with ${waitingPhrase(session.approval)}.`
                    : 'Your request has not been fully approved yet.'}
                  {' '}That does not hold you up — keep punching as normal; the day is confirmed afterwards.
                </Text>
              )}
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
              <ApprovalTrail approval={session.approval} />
            </View>

            {punchStage === 'review' && punchSlot ? (
              <View style={[styles.card, { gap: Spacing.md }]}>
                <View style={styles.photoHeaderRow}>
                  <Text style={styles.reviewLabel}>CAMERA & GEO VERIFICATION</Text>
                  {punchLocation?.accuracy != null && (
                    <View style={styles.accuracyPill}>
                      <View style={styles.accuracyDot} />
                      <Text style={styles.accuracyText}>Accuracy ±{Math.round(punchLocation.accuracy)}m</Text>
                    </View>
                  )}
                </View>
                {photoPlan.required === 2 && (
                  <Text style={styles.hintText}>
                    This punch needs two photos. Take both, check them, retake any that is not clear, then submit.
                  </Text>
                )}
                {photoPlan.uris.map((uri, index) => (
                  <View key={index} style={{ gap: Spacing.xs }}>
                    {photoPlan.required === 2 && <Text style={styles.reviewLabel}>{photoLabel(index, 2)}</Text>}
                    {uri ? (
                      <>
                        <View style={styles.photoFrame}>
                          <Image source={{ uri }} style={styles.photoPreview} accessibilityLabel={photoLabel(index, photoPlan.required)} />
                          <View style={[styles.photoCorner, styles.photoCornerTL]} />
                          <View style={[styles.photoCorner, styles.photoCornerTR]} />
                          <View style={[styles.photoCorner, styles.photoCornerBL]} />
                          <View style={[styles.photoCorner, styles.photoCornerBR]} />
                        </View>
                        <Button
                          title={photoPlan.required === 2 ? `Retake ${photoLabel(index, 2)}` : 'Retake'}
                          variant="outline"
                          onPress={() => retakePhoto(index)}
                          loading={punchBusy}
                        />
                      </>
                    ) : (
                      <TouchableOpacity
                        style={styles.photoEmpty}
                        onPress={() => retakePhoto(index)}
                        disabled={punchBusy}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={captureButtonLabel(photoPlan)}
                      >
                        <MaterialCommunityIcons name="camera-plus-outline" size={28} color={Colors.primary} />
                        <Text style={styles.photoEmptyText}>{index === nextMissingPhoto(photoPlan) ? captureButtonLabel(photoPlan) : `Take ${photoLabel(index, photoPlan.required)}`}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <View style={styles.reviewGrid}>
                  <View style={styles.reviewCell}>
                    <Text style={styles.reviewLabel}>Punch</Text>
                    <Text style={styles.reviewValue}>
                      #{punchSlot.punchNumber} · {punchSlot.punchType === 'IN' ? 'Check-In' : 'Check-Out'}
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
                  This punch is held until your On-Duty request is confirmed. You don't have to wait for it —
                  your next punch can go in straight away.
                </Text>
                <Button
                  title="Submit Punch"
                  onPress={submitPunch}
                  loading={punchBusy}
                  disabled={!isPhotoPlanComplete(photoPlan)}
                />
                <Button title="Cancel" variant="ghost" onPress={cancelPunch} disabled={punchBusy} />
              </View>
            ) : openSlots.length === 0 ? (
              <View style={[styles.doneBanner]}>
                <MaterialCommunityIcons name="check-circle-outline" size={16} color={Colors.statusGreen} />
                <Text style={styles.doneBannerText}>
                  All 4 punches for today are in. Your session has ended — HR will confirm your punches.
                </Text>
              </View>
            ) : null}

            {/* Today's punches -each empty slot is its own entry point, so a
                missed punch never blocks a later one, and nothing here waits
                on HR reviewing the punch before it. */}
            <View style={[styles.card, { gap: Spacing.sm }]}>
              <Text style={styles.reviewLabel}>TODAY'S PUNCHES</Text>
              <Text style={styles.hintText}>
                Tap any open slot to record it. You can submit them in any order.
              </Text>
              {slots.map((slot) => {
                const v = slot.verification;
                const isRecordedElsewhere = slot.status === 'recorded' && !v;
                return (
                  <View key={slot.punchNumber} style={styles.slotRow}>
                    <View style={styles.slotLeft}>
                      <Text style={styles.slotNum}>#{slot.punchNumber}</Text>
                      <Text style={styles.slotType}>
                        {slot.punchType === 'IN' ? 'Check-In' : 'Check-Out'}
                      </Text>
                    </View>
                    {v ? (
                      <View style={styles.slotRight}>
                        <Text style={styles.slotTime}>{v.punchTime.slice(0, 5)}</Text>
                        <Badge label={v.status} variant={statusBadgeVariant(v.status)} />
                      </View>
                    ) : isRecordedElsewhere ? (
                      <Text style={styles.slotPending}>Already recorded</Text>
                    ) : (
                      <TouchableOpacity
                        style={styles.addPunchBtn}
                        onPress={() => startPunchCapture(slot)}
                        disabled={punchBusy || punchStage === 'review'}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons name="plus-circle-outline" size={16} color={Colors.primary} />
                        <Text style={styles.addPunchText}>Add my punch</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>

            <Button title="Mark On-Duty as Done" variant="outline" onPress={handleMarkDone} loading={completeMutation.isPending} />
          </>
        ) : session ? (
          <View style={[styles.card, styles.doneCard]}>
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
                  ? 'Ended automatically once all 4 punches were recorded.'
                  : session.completionReason === 'auto_day_end'
                  ? 'Ended automatically at the end of the day.'
                  : 'Ended manually.'}
                {trackingOn ? ' Route recording has stopped.' : ''}
              </Text>
            )}
            {session.status === 'rejected' && trackingOn && (
              <Text style={styles.hintText}>Route recording stopped when the request was rejected. What was recorded is kept.</Text>
            )}
            {session.approval ? (
              <ApprovalTrail approval={session.approval} style={styles.doneTrail} />
            ) : (
              <>
                {session.status === 'rejected' && session.hrReviewComment && (
                  <Text style={styles.hintText}>HR: {session.hrReviewComment}</Text>
                )}
                {session.status === 'rejected' && session.hodReviewComment && !session.hrReviewComment && (
                  <Text style={styles.hintText}>Department Head: {session.hodReviewComment}</Text>
                )}
              </>
            )}
            <Button title="Submit New On-Duty Request" variant="outline" onPress={() => setShowNewRequestForm(true)} style={{ marginTop: Spacing.base }} />
            <Button title="Back to Attendance" variant="ghost" onPress={() => router.back()} />
          </View>
        ) : null}

        {/* Where the route went, and whether it is being recorded properly. */}
        {!statusLoading && trackingState?.supported && (
          <View style={styles.shortcuts}>
            <TouchableOpacity
              style={styles.shortcut}
              onPress={() => router.push(trackingRoutes.journeys)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="My journey"
            >
              <MaterialCommunityIcons name="map-marker-path" size={20} color={Colors.primary} />
              <Text style={styles.shortcutText}>My journey</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shortcut}
              onPress={() => router.push(trackingRoutes.health)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Tracking health"
            >
              <MaterialCommunityIcons
                name={redIssues.length ? 'alert-circle' : 'shield-check-outline'}
                size={20}
                color={redIssues.length ? Colors.statusRed : Colors.primary}
              />
              <Text style={styles.shortcutText}>Tracking health</Text>
            </TouchableOpacity>
          </View>
        )}
      </FormScrollView>
      </KeyboardAvoider>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgLight },
  content: { padding: 16, gap: 16, paddingBottom: 32 },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },

  introRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  introTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 15, color: Colors.textPrimary },
  introBody: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },

  gateCard: { alignItems: 'center' },
  gateIcon: { marginBottom: Spacing.sm },
  gateTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 14, color: Colors.textPrimary, textAlign: 'center', marginBottom: 4 },
  gateBody: { fontSize: 12.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },

  doneCard: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  doneTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 15, color: Colors.textPrimary },
  doneTrail: { alignSelf: 'stretch', marginTop: Spacing.sm },

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

  trackingNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.badgeBlueBg, borderRadius: BorderRadius.md, padding: 10 },
  trackingNoteText: { flex: 1, fontSize: 11.5, color: Colors.badgeBlueText, lineHeight: 16 },
  consentGate: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.badgeRedBg, borderWidth: 1, borderColor: Colors.statusRed, borderRadius: BorderRadius.md, padding: 12,
  },
  consentGateTitle: { fontSize: 13, fontWeight: '800', color: Colors.badgeRedText },
  consentGateBody: { fontSize: 11.5, color: Colors.badgeRedText, marginTop: 1 },
  shortcuts: { flexDirection: 'row', gap: 10 },
  shortcut: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, paddingVertical: 12,
  },
  shortcutText: { fontSize: 12.5, fontWeight: '700', color: Colors.textPrimary },
  photoEmpty: {
    alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 28,
    borderRadius: BorderRadius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.primary, backgroundColor: Colors.bgSurfaceLow,
  },
  photoEmptyText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  addPunchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.bgSurfaceLow, borderRadius: BorderRadius.sm,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  addPunchText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  photoHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accuracyPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.badgeGreenBg, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  accuracyDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.statusGreen },
  accuracyText: { fontSize: 10, fontWeight: '800', color: Colors.statusGreen },
  photoFrame: { position: 'relative' },
  photoPreview: { width: '100%', aspectRatio: 1.2, borderRadius: BorderRadius.md },
  photoCorner: { position: 'absolute', width: 22, height: 22, borderColor: Colors.tertiary },
  photoCornerTL: { top: 8, left: 8, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  photoCornerTR: { top: 8, right: 8, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  photoCornerBL: { bottom: 8, left: 8, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  photoCornerBR: { bottom: 8, right: 8, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },

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
