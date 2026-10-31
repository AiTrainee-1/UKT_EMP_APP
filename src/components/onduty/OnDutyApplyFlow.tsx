// The On-Duty "Apply" flow: the request form, then the live day (approval, four geo-punches, done). Moved here
// unchanged from app/on-duty/index.tsx on 2026-10-31 so the On-Duty page can offer Apply On-Duty / View Records;
// `header` (the two choices) is drawn at the top of its scroll view. Behaviour is the same as before, except that a
// failed first load of today's status now shows "Could not load" + Try again instead of the request form.
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

import { KeyboardAvoider } from '../../components/KeyboardAvoider';
import { FormScrollView } from '../../components/FormScrollView';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { TextArea } from '../../components/ui/TextArea';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useNow } from '../../components/journey/useNow';
import { JourneyStrip } from './JourneyStrip';
import { OnDutyHero } from './OnDutyHero';
import { OnDutyStepper } from './OnDutyStepper';
import { PunchCapture } from './PunchCapture';
import type { LocationState } from './PunchCapture';
import { TrackingReadiness } from './TrackingReadiness';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius, Spacing } from '../../constants/theme';
import {
  useOnDutySessionStatus, useSubmitOnDutySessionRequest, useCompleteOnDutySession,
  useSubmitOnDutyPunch, OnDutyPunchVerification, PunchSlot,
} from '../../hooks/useGeoAttendance';
import { useApprovalSummary } from '../../hooks/useApproval';
import { pipelineSentence, waitingPhrase, waitingText, workflowOff } from '../../lib/approval';
import { buildFlow } from '../../lib/onDutyFlow';
import type { FlowSlot, FlowStep } from '../../lib/onDutyFlow';
import {
  describePunchError, isPhotoPlanComplete, newPhotoPlan, requiredPhotoCount, withPhoto, withRequired,
} from '../../lib/onDutyPhotos';
import type { PhotoPlan } from '../../lib/onDutyPhotos';
import { TrackingIssueBanner } from '../../components/tracking/TrackingIssueBanner';
import { formatClock } from '../../tracking/format';
import { bannerIssues } from '../../tracking/onboarding';
import { trackingRoutes } from '../../tracking/routes';
import { useSessionJourney, useTrackingHealth } from '../../tracking/useTracking';
import { ApprovalTrail, DecisionBadge } from '../../components/approval/ApprovalTrail';
import { deciderFromApproval, deciderFromStamps } from '../../lib/approvalsDecider';
import { WorkflowOffNote } from '../../components/approval/WorkflowOffNote';
import { LoadError } from '../../components/myrequests/ListStates';

// What an OLDER backend's `status` says about a request that has not been decided. With `approval` the request says
// itself who it waits for (HR's pipeline decides), and this is not used.
const STAGE_LABEL: Record<string, string> = {
  pending_hod: 'Awaiting Department Head approval',
  pending_hr: 'Awaiting HR approval',
  active: 'Active',
  completed: 'Completed',
  rejected: 'Rejected',
};

export function OnDutyApplyFlow({ header }: { header?: React.ReactNode }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const now = useNow();

  // HR decides whether a punch needs one photo or two (the server says so in `requiredPhotos` and in /tracking/state's
  // `punchPhotos`). `forceTwo` is set when the server answered PHOTO2_REQUIRED to a one-photo punch (HR switched mid-capture).
  const [forceTwo, setForceTwo] = useState(false);
  const [photoPlan, setPhotoPlan] = useState<PhotoPlan>(() => newPhotoPlan(1));
  const {
    data: status, isLoading: statusLoading, isError: statusError, isRefetching: statusRefetching, refetch: refetchStatus,
  } = useOnDutySessionStatus();
  // A failed first load must not look like "no session" (the request form): someone already On-Duty would be offered a
  // new request. Show the failure with Try again instead.
  const statusFailed = statusError && !status;
  const submitRequestMutation = useSubmitOnDutySessionRequest();
  const completeMutation = useCompleteOnDutySession();
  const submitPunchMutation = useSubmitOnDutyPunch();
  // Who approves an On-Duty request, and whether HR has switched new ones off. Only a hint that may be a minute old: the
  // server refuses a new request either way and its message is shown (see submitRequest).
  const { data: approvalSummary } = useApprovalSummary();
  const onDutyFlow = approvalSummary?.onDuty;
  // Geo-tracking: the notice the employee must accept before the first request, the photo policy, and whatever is wrong with
  // the recording right now (the red banner).
  const { state: trackingState, snapshot: trackingSnapshot, issues: trackingIssueList } = useTrackingHealth();
  const trackingOn = !!trackingState && trackingState.supported && trackingState.enabled;
  const consentMissing = trackingOn && trackingState.consentRequired;
  const redIssues = bannerIssues(trackingIssueList);
  const requiredPhotos = forceTwo ? 2 : requiredPhotoCount(status?.requiredPhotos, trackingState?.punchPhotos);

  const [destination, setDestination] = useState('');
  const [showNewRequestForm, setShowNewRequestForm] = useState(false);
  const [punchBusy, setPunchBusy] = useState(false);
  // The slot being recorded (the employee picks it; it is never inferred from what came before), null when none is.
  const [punchSlot, setPunchSlot] = useState<PunchSlot | null>(null);
  const [punchLocation, setPunchLocation] = useState<{ latitude: number; longitude: number; accuracy?: number; isMocked: boolean } | null>(null);
  const [locationState, setLocationState] = useState<LocationState>({ status: 'loading' });

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

  // Slot state is the server's answer, not a local guess - it also accounts for punches that arrived from the biometric
  // device or Office Geo Punch, which this screen can't see. Falls back to a plain 1-4 layout only if the status call
  // hasn't landed yet.
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

  const pending = !!session && !showNewRequestForm && (session.status === 'pending_hod' || session.status === 'pending_hr');
  const showRequestForm = !session || showNewRequestForm;
  const ended = !!session && !showNewRequestForm && (session.status === 'completed' || session.status === 'rejected');
  const active = !!session && !showNewRequestForm && session.status === 'active';

  // The whole day as seven steps (src/lib/onDutyFlow.ts).
  const flowSlots: FlowSlot[] = slots.map((s) => ({
    punchNumber: s.punchNumber,
    punchType: s.punchType,
    status: s.status,
    available: s.available,
    verification: s.verification
      ? {
          punchDate: s.verification.punchDate,
          punchTime: s.verification.punchTime,
          status: s.verification.status,
          latitude: s.verification.latitude,
          longitude: s.verification.longitude,
          accuracyM: s.verification.accuracyM,
        }
      : null,
  }));
  const flow = buildFlow({
    session: session
      ? {
          status: session.status,
          destination: session.destination,
          isProvisional: session.isProvisional,
          createdAt: session.createdAt,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          completionReason: session.completionReason,
        }
      : null,
    slots: flowSlots,
    composing: showNewRequestForm,
    approvalWaiting: pending ? (waitingText(session?.approval) ?? STAGE_LABEL[session!.status]) : waitingText(session?.approval),
    photos: requiredPhotos,
    trackingOn,
    trackingProblem: redIssues.length > 0,
  });

  // The route of this session, for the live strip and the "On-Duty Journey" button.
  const { journey } = useSessionJourney(session?.id ?? null, !statusLoading && trackingOn && !!session && !showNewRequestForm);

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
    // quality 0.4: the server shrinks every selfie to 800 px anyway (backend api/image_compress.py), so a lighter upload
    // saves the employee's mobile data without changing what is stored. (expo-image-manipulator is not installed, so
    // the picture cannot be resized on the phone itself.)
    const photoResult = await ImagePicker.launchCameraAsync({ quality: 0.4, allowsEditing: false });
    if (photoResult.canceled || !photoResult.assets?.[0]?.uri) return false;
    const uri = photoResult.assets[0].uri;
    setPhotoPlan((plan) => withPhoto(plan, index, uri));
    return true;
  };

  /** Finds where the employee is (asking for the permission if needed). The punch cannot be confirmed without it. */
  const acquireLocation = async () => {
    setLocationState({ status: 'loading' });
    try {
      let locPerm = await Location.getForegroundPermissionsAsync();
      if (!locPerm.granted) locPerm = await Location.requestForegroundPermissionsAsync();
      if (!locPerm.granted) {
        const message = 'Location access is required to record this punch.';
        setLocationState({ status: 'error', message });
        showToast(message, 'error');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPunchLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        isMocked: (pos as { mocked?: boolean }).mocked ?? false,
      });
      setLocationState({ status: 'ready', accuracy: pos.coords.accuracy ?? undefined });
    } catch (err: any) {
      const message = err?.message ?? 'Could not find your location';
      setLocationState({ status: 'error', message });
      showToast(message, 'error');
    }
  };

  const startPunchCapture = async (slot: PunchSlot) => {
    setPunchSlot(slot);
    setPunchLocation(null);
    setLocationState({ status: 'loading' });
    setPunchBusy(true);
    try {
      // A new capture starts with the photos the server wants right now; the first one is taken at once, then the location
      // (one permission dialog at a time).
      setPhotoPlan(newPhotoPlan(requiredPhotos));
      await capturePhoto(0);
      await acquireLocation();
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to capture photo/location', 'error');
    } finally {
      setPunchBusy(false);
    }
  };

  /** Take or retake one photo ("Photo 1 of 2" / "Photo 2 of 2"). */
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
    setPunchSlot(null);
    setPhotoPlan(newPhotoPlan(requiredPhotos));
    setPunchLocation(null);
    setLocationState({ status: 'loading' });
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

  // The page opens on the step to work on: when the current step changes (and on the first load) it scrolls to it, so the one
  // primary action is on screen even on a short phone with four steps above it.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const place = useRef({ stepper: 0, current: 0 });
  const scrolledFor = useRef<string | null>(null);
  const onCurrentLayout = (y: number) => {
    place.current.current = y;
    const key = flow.current ?? 'none';
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, place.current.stepper + place.current.current - 12), animated: true }), 150);
  };

  const slotOf = (n: number) => slots.find((s) => s.punchNumber === n) as (typeof slots)[number];
  const typeLabel = (type: 'IN' | 'OUT') => (type === 'IN' ? 'Check-In' : 'Check-Out');
  const anyBusy = punchBusy || punchSlot != null || submitPunchMutation.isPending;

  // ── what the current step shows under its title ────────────────────────────────────────────────────────────────────
  const renderBody = (step: FlowStep): React.ReactNode => {
    if (step.key === 'request' && step.state === 'current') {
      return (
        <>
          <Text style={styles.bodyText}>
            Enter where you're going. Your session starts as soon as you submit — you can begin punching right
            away, no waiting for approval. Each punch needs {requiredPhotos === 2 ? 'two photos' : 'a selfie'} and your location.{' '}
            {pipelineSentence(onDutyFlow, 'The whole day is confirmed afterwards.')}
          </Text>
          {trackingOn && (
            <View style={styles.trackingNote}>
              <MaterialCommunityIcons name="map-marker-path" size={16} color={C.badgeBlueText} />
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
              <MaterialCommunityIcons name="shield-check-outline" size={20} color={C.statusRed} />
              <View style={{ flex: 1 }}>
                <Text style={styles.consentGateTitle}>Read and accept the tracking notice first</Text>
                <Text style={styles.consentGateBody}>You need to accept it once before you can start On-Duty.</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={C.statusRed} />
            </TouchableOpacity>
          )}
          {trackingOn && !consentMissing && <TrackingReadiness permission={trackingSnapshot?.health.permission ?? 'unknown'} />}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>DESTINATION / PLACE</Text>
            <TextArea
              placeholder="e.g. ABC Textiles — machine inspection"
              value={destination}
              onChangeText={setDestination}
              minLength={3}
              maxLength={300}
            />
          </View>
          <WorkflowOffNote workflow={onDutyFlow} />
          <Button
            title="Submit for Approval"
            onPress={submitRequest}
            loading={submitRequestMutation.isPending}
            disabled={!destination.trim() || workflowOff(onDutyFlow) || consentMissing}
          />
          {showNewRequestForm && <Button title="Cancel" variant="outline" onPress={() => setShowNewRequestForm(false)} />}
        </>
      );
    }

    if (step.key === 'approval' && session && !showNewRequestForm) {
      if (pending) {
        return (
          <>
            {session.approval ? (
              <ApprovalTrail approval={session.approval} />
            ) : session.status === 'pending_hr' && session.hodReviewedBy ? (
              <Text style={styles.bodyText}>Department Head: approved by {session.hodReviewedBy}</Text>
            ) : null}
            <Text style={styles.hintText}>Your On-Duty session will start automatically once this request is approved.</Text>
            <Button title="Refresh Status" variant="outline" onPress={() => refetchStatus()} />
          </>
        );
      }
      if (active && session.isProvisional) {
        return (
          <Text style={styles.hintText}>
            {waitingPhrase(session.approval)
              ? `Your request is still with ${waitingPhrase(session.approval)}.`
              : 'Your request has not been fully approved yet.'}
            {' '}That does not hold you up — keep punching as normal; the day is confirmed afterwards.
          </Text>
        );
      }
      return null;
    }

    if (step.punchNumber != null) {
      const slot = slotOf(step.punchNumber);
      if (punchSlot && punchSlot.punchNumber === step.punchNumber) {
        return (
          <PunchCapture
            punchNumber={step.punchNumber}
            punchTypeLabel={typeLabel(slot.punchType)}
            plan={photoPlan}
            location={locationState}
            busy={punchBusy}
            submitting={submitPunchMutation.isPending}
            onTakePhoto={retakePhoto}
            onRefreshLocation={acquireLocation}
            onConfirm={submitPunch}
            onCancel={cancelPunch}
          />
        );
      }
      if (step.state === 'current' && step.recordable) {
        return (
          <>
            <Text style={styles.hintText}>
              Takes {requiredPhotos === 2 ? 'two photos' : 'a selfie'} and your location. You can record the open punches in any order.
            </Text>
            <Button
              title={`Record Punch ${step.punchNumber} · ${typeLabel(slot.punchType)}`}
              onPress={() => startPunchCapture(slot)}
              disabled={anyBusy}
              icon={<MaterialCommunityIcons name="camera-outline" size={18} color="#fff" />}
            />
          </>
        );
      }
    }
    return null;
  };

  // ── after the session: how it ended ────────────────────────────────────────────────────────────────────────────────
  const endCard = ended && session ? (
    <View style={[styles.card, { gap: Spacing.sm }]}>
      <View style={styles.endRow}>
        <MaterialCommunityIcons
          name={session.status === 'completed' ? 'check-circle' : 'close-circle'}
          size={26}
          color={session.status === 'completed' ? C.statusGreen : C.statusRed}
        />
        <Text style={styles.endTitle}>
          On-Duty {session.status === 'completed' ? 'session completed' : 'request rejected'}
        </Text>
      </View>
      {/* How a finished session ended and that the route stopped are the "Done" and "Approval & route tracking" steps above. */}
      {session.status === 'rejected' && trackingOn && (
        <Text style={styles.hintText}>Route recording stopped when the request was rejected. What was recorded is kept.</Text>
      )}
      <DecisionBadge
        decider={
          deciderFromApproval(session.approval) ??
          deciderFromStamps({
            status: (session as any).approvalStatus ?? session.status,
            hodBy: session.hodReviewedBy,
            hodAt: (session as any).hodReviewedAt,
            hrBy: session.hrReviewedBy,
            hrAt: (session as any).hrReviewedAt,
          })
        }
      />
      {session.approval ? (
        <ApprovalTrail approval={session.approval} />
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
      {trackingOn && !!journey && (
        <Button
          title="View On-Duty Journey"
          onPress={() => router.push(trackingRoutes.journey(journey.id))}
          icon={<MaterialCommunityIcons name="map-marker-path" size={18} color="#fff" />}
        />
      )}
      <Button title="Submit New On-Duty Request" variant="outline" onPress={() => setShowNewRequestForm(true)} />
      <Button title="Back to Attendance" variant="ghost" onPress={() => router.back()} />
    </View>
  ) : null;

  const subtitle = useMemo(() => {
    if (!session || showNewRequestForm) return 'Your route is recorded and you can start punching straight away.';
    const parts: string[] = [];
    if (session.startedAt) parts.push(`Started ${formatClock(session.startedAt)}`);
    parts.push(`${flow.punchesDone} of 4 geo-punches`);
    return parts.join(' · ');
  }, [session, showNewRequestForm, flow.punchesDone]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoider style={{ flex: 1 }}>
      <FormScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {header}

        {statusLoading ? (
          <View style={{ gap: Spacing.base }}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={4} />
          </View>
        ) : statusFailed ? (
          <LoadError what="your On-Duty for today" onRetry={() => { void refetchStatus(); }} retrying={statusRefetching} />
        ) : (
          <>
            <OnDutyHero
              flow={flow}
              destination={showRequestForm || !session ? null : session.destination}
              subtitle={subtitle}
              outcome={ended && session?.status === 'rejected' ? 'rejected' : ended ? 'completed' : 'running'}
            />

            {(pending || active) && <TrackingIssueBanner issues={redIssues} />}

            {trackingOn && !showRequestForm && !!session && (
              <JourneyStrip
                journey={journey}
                now={now}
                problem={redIssues.length ? redIssues[0].title : null}
                finished={ended}
                onPress={() => (journey ? router.push(trackingRoutes.journey(journey.id)) : router.push(trackingRoutes.journeys))}
              />
            )}

            <View onLayout={(e) => { place.current.stepper = e.nativeEvent.layout.y; }}>
              <OnDutyStepper
                steps={flow.steps}
                renderBody={renderBody}
                onRecordSlot={(n) => startPunchCapture(slotOf(n))}
                disabled={anyBusy}
                onCurrentLayout={onCurrentLayout}
              />
            </View>

            {endCard}

            {active && (
              <Button title="Mark On-Duty as Done" variant="outline" onPress={handleMarkDone} loading={completeMutation.isPending} />
            )}

            {/* Where the route went, and whether it is being recorded properly. */}
            {trackingState?.supported && (
              <View style={styles.shortcuts}>
                <TouchableOpacity
                  style={styles.shortcut}
                  onPress={() => router.push(trackingRoutes.journeys)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="On-Duty Journey"
                >
                  <MaterialCommunityIcons name="map-marker-path" size={20} color={C.primary} />
                  <Text style={styles.shortcutText}>On-Duty Journey</Text>
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
                    color={redIssues.length ? C.statusRed : C.primary}
                  />
                  <Text style={styles.shortcutText}>Tracking health</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </FormScrollView>
      </KeyboardAvoider>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bgLight },
  content: { padding: 16, gap: 14, paddingBottom: 32 },

  card: {
    backgroundColor: C.bgCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: Spacing.base,
  },

  bodyText: { fontSize: 12.5, color: C.textSecondary, lineHeight: 18 },
  hintText: { fontSize: 11.5, color: C.textMuted, lineHeight: 16 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 0.4 },

  endRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  endTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: C.textPrimary },

  trackingNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.badgeBlueBg, borderRadius: BorderRadius.md, padding: 10 },
  trackingNoteText: { flex: 1, fontSize: 11.5, color: C.badgeBlueText, lineHeight: 16 },
  consentGate: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44,
    backgroundColor: C.badgeRedBg, borderWidth: 1, borderColor: C.statusRed, borderRadius: BorderRadius.md, padding: 12,
  },
  consentGateTitle: { fontSize: 13, fontWeight: '800', color: C.badgeRedText },
  consentGateBody: { fontSize: 11.5, color: C.badgeRedText, marginTop: 1 },

  shortcuts: { flexDirection: 'row', gap: 10 },
  shortcut: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48,
    backgroundColor: C.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 12,
  },
  shortcutText: { fontSize: 12.5, fontWeight: '700', color: C.textPrimary },
});
