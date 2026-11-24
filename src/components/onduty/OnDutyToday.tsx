// On-Duty -> Apply On-Duty, redesigned (owner 2026-11-24). One simple page:
//
//   No On-Duty open:  the request form (where are you going?) and, under it, the previous On-Duty requests.
//   One open:         its progress on this page - where, since when, approval, the gate pass with its QR, the four named
//                     punches (Morning Punch, Lunch Out, Lunch In, Night Punch) each recordable on its own in any order -
//                     and "End On-Duty", which shows the whole day before it is closed.
//
// A new On-Duty can only be asked for once the open one is closed: the form is simply not offered while one is open, and
// the server refuses a second one anyway (409, backend geo_attendance_views.on_duty_session_request).
//
// Everything works with no internet: the request, each punch (selfies + GPS kept on the phone) and the end are kept in the
// offline queue and sent in order when the server can be reached (src/offline); what is still on the phone is shown as
// "Saved on phone".
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

import { KeyboardAvoider } from '../KeyboardAvoider';
import { FormScrollView } from '../FormScrollView';
import { Button } from '../ui/Button';
import { Toast } from '../ui/Toast';
import { TextArea } from '../ui/TextArea';
import { SkeletonCard } from '../ui/Skeleton';
import { useNow } from '../journey/useNow';
import { JourneyStrip } from './JourneyStrip';
import { PunchCapture, type LocationState } from './PunchCapture';
import { PunchTiles } from './PunchTiles';
import { EndOnDutySheet } from './EndOnDutySheet';
import { RecentOnDuty } from './RecentOnDuty';
import { TrackingReadiness } from './TrackingReadiness';
import { GatePassCard } from '../outpass/GatePassCard';
import { QueuedOpsList } from '../offline/QueuedOpsList';
import { TrackingIssueBanner } from '../tracking/TrackingIssueBanner';
import { ApprovalTrail } from '../approval/ApprovalTrail';
import { WorkflowOffNote } from '../approval/WorkflowOffNote';
import { LoadError } from '../myrequests/ListStates';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/palettes';
import { BorderRadius, Spacing } from '../../constants/theme';
import { FontFamily } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { useEmployee } from '../../hooks/useEmployee';
import { useOnDutySessionStatus } from '../../hooks/useGeoAttendance';
import { useEndOnDuty, useRecordOnDutyPunch, useRecordOtPunch, useRequestOnDuty } from '../../hooks/useOnDutyActions';
import { otRows, otSummary, overtimeStage } from '../../lib/onDutyOvertime';
import { useApprovalSummary } from '../../hooks/useApproval';
import { pipelineSentence, waitingPhrase, workflowOff } from '../../lib/approval';
import { buildPunchTiles, durationText, type PunchTile } from '../../lib/onDutyPunches';
import {
  describePunchError, isPhotoPlanComplete, newPhotoPlan, requiredPhotoCount, withPhoto, withRequired, type PhotoPlan,
} from '../../lib/onDutyPhotos';
import { isQueued, QUEUED_MESSAGE } from '../../offline/submit';
import { useQueuedOps } from '../../offline/useQueuedOps';
import type { QueuedOp } from '../../offline/types';
import { formatClock } from '../../tracking/format';
import { bannerIssues } from '../../tracking/onboarding';
import { trackingRoutes } from '../../tracking/routes';
import { useSessionJourney, useTrackingHealth } from '../../tracking/useTracking';

const OPEN_STATUSES = ['pending_hod', 'pending_hr', 'active'];

function sameLocalDay(ms: number, now: number): boolean {
  const a = new Date(ms);
  const b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function capturedMs(op: QueuedOp): number {
  const raw = op.meta?.capturedAt;
  const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? op.createdAt : t;
}

export function OnDutyToday({ header, onSeeRecords }: { header?: React.ReactNode; onSeeRecords: () => void }) {
  const { C } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const now = useNow();
  const { user } = useAuth();
  const { data: employee } = useEmployee(user?.employeeId ?? null);

  const statusQuery = useOnDutySessionStatus();
  const status = statusQuery.data;
  const statusFailed = statusQuery.isError && !status;
  const requestMutation = useRequestOnDuty();
  const punchMutation = useRecordOnDutyPunch();
  const otMutation = useRecordOtPunch();
  const endMutation = useEndOnDuty();
  const { data: approvalSummary } = useApprovalSummary();
  const onDutyFlow = approvalSummary?.onDuty;

  const { state: trackingState, snapshot: trackingSnapshot, issues: trackingIssueList } = useTrackingHealth();
  const trackingOn = !!trackingState && trackingState.supported && trackingState.enabled;
  const consentMissing = trackingOn && trackingState.consentRequired;
  const redIssues = bannerIssues(trackingIssueList);

  const [forceTwo, setForceTwo] = useState(false);
  const requiredPhotos = forceTwo ? 2 : requiredPhotoCount(status?.requiredPhotos, trackingState?.punchPhotos);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; visible: boolean }>({
    message: '', type: 'success', visible: false,
  });
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 4000);
  };

  // ── what is open: the server's session, or one still waiting on the phone ───────────────────────────────────────────
  const session = status?.session ?? null;
  const serverOpen = !!session && OPEN_STATUSES.includes(session.status) && !session.employeeEndedAt;
  const queued = useQueuedOps(['onDuty.request', 'onDuty.punch', 'onDuty.end', 'onDuty.otPunch']).filter((op) =>
    sameLocalDay(capturedMs(op), now),
  );
  const queuedRequest = queued.find((op) => op.kind === 'onDuty.request') ?? null;
  const queuedEnd = queued.find((op) => op.kind === 'onDuty.end') ?? null;
  const queuedPunches = queued.filter((op) => op.kind === 'onDuty.punch');
  const queuedOt = queued.filter((op) => op.kind === 'onDuty.otPunch');
  const localOnly = !serverOpen && !!queuedRequest;
  const open = (serverOpen || localOnly) && !queuedEnd;
  const destination = serverOpen ? session!.destination : String(queuedRequest?.meta?.destination ?? '');
  const startedAt = serverOpen ? session!.createdAt ?? session!.startedAt : queuedRequest ? new Date(capturedMs(queuedRequest)).toISOString() : null;

  const tiles: PunchTile[] = buildPunchTiles({
    slots: status?.punchSlots,
    verifications: serverOpen ? status?.punchVerifications : [],
    queued: queuedPunches.map((op) => ({
      punchNumber: Number(op.meta?.punchNumber),
      capturedAt: capturedMs(op),
      failed: op.status === 'failed',
      error: op.lastError,
    })),
    canPunch: open,
  });
  const doneCount = tiles.filter((t) => t.state !== 'open').length;

  // ── overtime: after the four, Complete Duty or Continue Duty (then OT punches) ──────────────────────────────────────
  const [continued, setContinued] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const otList = otRows(
    serverOpen ? status?.otPunches : [],
    queuedOt.map((op) => ({ capturedAt: capturedMs(op), failed: op.status === 'failed', error: op.lastError })),
  );
  const stage = overtimeStage({ allFourIn: doneCount === 4, open, continued, otCount: otList.length });
  const otText = otSummary(serverOpen ? status?.otMinutes : 0);

  const { journey } = useSessionJourney(serverOpen ? session!.id : null, trackingOn && serverOpen);

  // ── request ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const [destinationText, setDestinationText] = useState('');
  const submitRequest = async () => {
    const value = destinationText.trim();
    if (value.length < 3) {
      showToast('Write where you are going (at least 3 letters).', 'error');
      return;
    }
    try {
      const result = await requestMutation.mutateAsync({ destination: value });
      setDestinationText('');
      if (result.queued) {
        showToast(`${QUEUED_MESSAGE} You can record your punches now.`, 'info');
        return;
      }
      const blocked = result.tracking?.decision.blockedBy;
      if (result.tracking?.started) showToast('On-Duty started. Your gate pass is ready and your route is being recorded.', 'success');
      else if (blocked === 'consent' || blocked === 'permission') {
        showToast('On-Duty started, but your route is not being recorded yet. Finish the tracking set-up.', 'info');
        router.push(trackingRoutes.setup(blocked === 'consent' ? 'consent' : 'foreground'));
      } else showToast('On-Duty started. Your gate pass is ready.', 'success');
    } catch (err: any) {
      const data = err?.response?.data;
      const message =
        err?.response?.status === 409 && !data?.code
          ? 'You already have an On-Duty open. End it first, then apply for a new one.'
          : data?.error ?? err?.message ?? 'Could not submit the request.';
      showToast(message, 'error');
      void statusQuery.refetch();
    }
  };

  // ── capture one punch ───────────────────────────────────────────────────────────────────────────────────────────────
  const [captureTile, setCaptureTile] = useState<PunchTile | null>(null);
  // Recording an OT punch (instead of one of the four).
  const [otCapture, setOtCapture] = useState(false);
  const [photoPlan, setPhotoPlan] = useState<PhotoPlan>(() => newPhotoPlan(1));
  const [punchLocation, setPunchLocation] = useState<{ latitude: number; longitude: number; accuracy?: number; isMocked: boolean } | null>(null);
  const [locationState, setLocationState] = useState<LocationState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);

  const capturePhoto = async (index: number): Promise<boolean> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast('Camera permission is required to record this punch.', 'error');
      return false;
    }
    // quality 0.4: the server shrinks every selfie to 800 px anyway (backend api/image_compress.py).
    const res = await ImagePicker.launchCameraAsync({ quality: 0.4, allowsEditing: false });
    if (res.canceled || !res.assets?.[0]?.uri) return false;
    const uri = res.assets[0].uri;
    setPhotoPlan((plan) => withPhoto(plan, index, uri));
    return true;
  };

  const acquireLocation = async () => {
    setLocationState({ status: 'loading' });
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocationState({ status: 'error', message: 'Location access is required to record this punch.' });
        return;
      }
      // GPS works with no internet; a last known fix is used if a fresh one takes too long.
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(
        async () => (await Location.getLastKnownPositionAsync()) ?? Promise.reject(new Error('Could not find your location')),
      );
      setPunchLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        isMocked: (pos as { mocked?: boolean }).mocked ?? false,
      });
      setLocationState({ status: 'ready', accuracy: pos.coords.accuracy ?? undefined });
    } catch (err: any) {
      setLocationState({ status: 'error', message: err?.message ?? 'Could not find your location' });
    }
  };

  const scrollRef = useRef<ScrollViewInstance>(null);
  const captureY = useRef(0);

  const startCapture = async (tile: PunchTile) => {
    setCaptureTile(tile);
    setPunchLocation(null);
    setPhotoPlan(newPhotoPlan(requiredPhotos));
    setBusy(true);
    try {
      await capturePhoto(0);
      await acquireLocation();
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, captureY.current - 12), animated: true }), 200);
    }
  };

  const startOtCapture = async () => {
    setOtCapture(true);
    setCaptureTile(null);
    setPunchLocation(null);
    setPhotoPlan(newPhotoPlan(requiredPhotos));
    setBusy(true);
    try {
      await capturePhoto(0);
      await acquireLocation();
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, captureY.current - 12), animated: true }), 200);
    }
  };

  const cancelCapture = () => {
    setOtCapture(false);
    setCaptureTile(null);
    setPunchLocation(null);
    setPhotoPlan(newPhotoPlan(requiredPhotos));
  };

  const confirmPunch = async () => {
    if ((!captureTile && !otCapture) || !punchLocation || !isPhotoPlanComplete(photoPlan)) return;
    setBusy(true);
    try {
      if (otCapture) {
        const sequence = otList.length + 1;
        const res = await otMutation.mutateAsync({
          ...punchLocation,
          photoUris: photoPlan.uris.filter((u): u is string => !!u),
          sessionId: serverOpen ? session!.id : null,
          sequence,
        });
        showToast(
          isQueued(res) ? `OT punch ${sequence} saved on your phone. It will be sent when you are back online.` : `OT punch ${sequence} recorded.`,
          isQueued(res) ? 'info' : 'success',
        );
        cancelCapture();
        return;
      }
      if (!captureTile) return;
      const wasLastOpen = tiles.filter((t) => t.state === 'open').length === 1;
      const result = await punchMutation.mutateAsync({
        punchNumber: captureTile.punchNumber,
        ...punchLocation,
        photoUris: photoPlan.uris.filter((u): u is string => !!u),
        sessionId: serverOpen ? session!.id : null,
      });
      if (result.queued) showToast(`${captureTile.name} saved on your phone. It will be sent when you are back online.`, 'info');
      else if (result.sessionEnded) showToast('All 4 punches are in. Your On-Duty has ended.', 'success');
      else showToast(`${captureTile.name} recorded.`, 'success');
      cancelCapture();
      // The 4th punch: ask Complete Duty or Continue Duty (overtime). An older server already closed the session.
      if (result.queued ? wasLastOpen : !!result.allPunchesIn && !result.sessionEnded) setChoiceOpen(true);
    } catch (err: any) {
      const e = describePunchError(err);
      if (e.needsSecondPhoto && photoPlan.required === 1) {
        setForceTwo(true);
        setPhotoPlan((plan) => withRequired(plan, 2));
        void queryClient.invalidateQueries({ queryKey: ['on-duty-session-status'] });
        showToast('HR now requires two photos for a punch. Take the second photo, then confirm again.', 'info');
      } else {
        showToast(e.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  // ── end ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const [endOpen, setEndOpen] = useState(false);
  const confirmEnd = async () => {
    try {
      const res = await endMutation.mutateAsync({ sessionId: serverOpen ? session!.id : null, label: destination });
      setEndOpen(false);
      showToast(isQueued(res) ? `${QUEUED_MESSAGE}` : 'On-Duty ended. You can apply for a new one any time.', isQueued(res) ? 'info' : 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? err?.message ?? 'Could not end the On-Duty.', 'error');
    }
  };

  const approvalText = useMemo(() => {
    if (localOnly) return 'Not sent yet: saved on your phone';
    if (!session) return null;
    if (session.isProvisional) {
      const who = waitingPhrase(session.approval);
      return who ? `Waiting for ${who}` : 'Waiting for approval';
    }
    return 'Approved';
  }, [localOnly, session]);

  const gatePass = serverOpen ? status?.gatePass ?? null : null;
  const anyBusy = busy || punchMutation.isPending || otMutation.isPending;

  // ── layout ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoider style={{ flex: 1 }}>
        <FormScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {header}

          {statusQuery.isLoading && !queued.length ? (
            <View style={{ gap: Spacing.base }}>
              <SkeletonCard lines={3} />
              <SkeletonCard lines={4} />
            </View>
          ) : statusFailed && !localOnly ? (
            <LoadError what="your On-Duty for today" onRetry={() => void statusQuery.refetch()} retrying={statusQuery.isRefetching} />
          ) : open ? (
            <>
              {/* where / since when / approval */}
              <View style={styles.hero} accessibilityRole="summary">
                <View style={styles.heroTop}>
                  <View style={styles.liveDot} />
                  <Text style={styles.heroEyebrow}>ON-DUTY IN PROGRESS</Text>
                  <View style={[styles.heroChip, localOnly && { backgroundColor: 'rgba(253,230,138,0.95)' }]}>
                    <Text style={[styles.heroChipText, localOnly && { color: '#92400E' }]}>
                      {localOnly ? 'Saved on phone' : session?.isProvisional ? 'Waiting for approval' : 'Approved'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.heroTitle} numberOfLines={2}>{destination}</Text>
                <Text style={styles.heroLine}>
                  {startedAt ? `Started ${formatClock(startedAt)} · ${durationText(now - Date.parse(startedAt))}` : 'Started today'}
                </Text>
                <View style={styles.progressRow}>
                  {[1, 2, 3, 4].map((n) => (
                    <View key={n} style={[styles.progressSeg, n <= doneCount && styles.progressSegOn]} />
                  ))}
                </View>
                <Text style={styles.heroLine}>{doneCount} of 4 punches · {4 - doneCount} left</Text>
                {localOnly && (
                  <Text style={styles.heroNote}>
                    No internet when you applied. Your On-Duty starts on the server as soon as you are back online; record
                    your punches now, they are kept safely on your phone.
                  </Text>
                )}
              </View>

              <TrackingIssueBanner issues={redIssues} />

              {trackingOn && serverOpen && (
                <JourneyStrip
                  journey={journey}
                  now={now}
                  problem={redIssues.length ? redIssues[0].title : null}
                  finished={false}
                  onPress={() => (journey ? router.push(trackingRoutes.journey(journey.id)) : router.push(trackingRoutes.journeys))}
                />
              )}

              {/* the gate pass of this On-Duty, with its QR */}
              {gatePass ? (
                <View style={{ gap: 6 }}>
                  <Text style={styles.sectionTitle}>Your gate pass</Text>
                  <GatePassCard
                    pass={gatePass}
                    compact
                    onRefresh={() => statusQuery.refetch()}
                    refreshing={statusQuery.isRefetching}
                    person={
                      employee
                        ? {
                            name: employee.name,
                            employeeCode: employee.employeeCode,
                            department: employee.departmentName,
                            designation: employee.designationTitle,
                            photoUrl: employee.photoUrl ?? null,
                          }
                        : null
                    }
                  />
                </View>
              ) : localOnly ? (
                <View style={styles.infoBox}>
                  <MaterialCommunityIcons name="qrcode" size={18} color={C.primary} />
                  <Text style={styles.infoText}>Your gate pass with its QR appears here once the request reaches the server.</Text>
                </View>
              ) : null}

              <PunchTiles tiles={tiles} onSelect={(t) => void startCapture(t)} disabled={anyBusy || !!captureTile || otCapture} />

              {stage === 'choose' && !captureTile && !otCapture && (
                <View style={styles.choiceCard}>
                  <MaterialCommunityIcons name="check-decagram" size={22} color={C.statusGreen} />
                  <Text style={styles.choiceTitle}>All 4 punches are in</Text>
                  <Text style={styles.hint}>Are you done for the day, or still working on-duty (overtime)?</Text>
                  <Button title="Complete Duty" onPress={() => setEndOpen(true)} icon={<MaterialCommunityIcons name="flag-checkered" size={18} color="#fff" />} />
                  <Button
                    title="Continue Duty (overtime)"
                    variant="outline"
                    onPress={() => setContinued(true)}
                    icon={<MaterialCommunityIcons name="clock-plus-outline" size={18} color={C.primary} />}
                  />
                </View>
              )}

              {stage === 'overtime' && (
                <View style={styles.card}>
                  <View style={styles.otHead}>
                    <MaterialCommunityIcons name="clock-plus-outline" size={20} color={C.categoryOnDuty} />
                    <Text style={[styles.sectionTitle, { flex: 1 }]}>Overtime (OT) punches</Text>
                    <Text style={styles.otCount}>{otList.length}</Text>
                  </View>
                  <Text style={styles.hint}>
                    Record a punch for the extra work after your Night Punch. Each needs {requiredPhotos === 2 ? 'two photos' : 'a selfie'}{' '}
                    and your location. OT punches do not change your attendance; they count for your overtime once the
                    On-Duty is approved.
                  </Text>
                  {!!otText && <Text style={styles.otSummary}>OT so far: {otText}</Text>}
                  {otList.map((row) => (
                    <View key={row.key} style={styles.otRow}>
                      <View style={styles.otBadge}>
                        <Text style={styles.otBadgeText}>OT {row.number}</Text>
                      </View>
                      <Text style={styles.otTime}>{row.time ?? '—'}</Text>
                      <Text
                        style={[
                          styles.otState,
                          row.state === 'approved' && { color: C.statusGreen },
                          row.state === 'failed' && { color: C.badgeRedText },
                          row.state === 'saved' && { color: C.badgeYellowText },
                        ]}
                        numberOfLines={2}
                      >
                        {row.label}
                      </Text>
                    </View>
                  ))}
                  <Button
                    title="OT Punch"
                    onPress={() => void startOtCapture()}
                    disabled={anyBusy || otCapture || !!captureTile}
                    icon={<MaterialCommunityIcons name="plus" size={20} color="#fff" />}
                  />
                </View>
              )}

              {(captureTile || otCapture) && (
                <View onLayout={(e) => { captureY.current = e.nativeEvent.layout.y; }} style={styles.captureCard}>
                  <PunchCapture
                    punchNumber={captureTile ? captureTile.punchNumber : otList.length + 1}
                    title={captureTile ? captureTile.name : `OT Punch ${otList.length + 1}`}
                    punchTypeLabel={captureTile ? (captureTile.kind === 'IN' ? 'Check-In' : 'Check-Out') : 'Overtime'}
                    plan={photoPlan}
                    location={locationState}
                    busy={busy}
                    submitting={punchMutation.isPending || otMutation.isPending}
                    onTakePhoto={(i) => {
                      setBusy(true);
                      void capturePhoto(i).finally(() => setBusy(false));
                    }}
                    onRefreshLocation={() => void acquireLocation()}
                    onConfirm={() => void confirmPunch()}
                    onCancel={cancelCapture}
                  />
                </View>
              )}

              <QueuedOpsList kinds={['onDuty.request', 'onDuty.punch', 'onDuty.end', 'onDuty.otPunch']} title="Not sent yet" />

              {serverOpen && session?.approval && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Approval</Text>
                  <ApprovalTrail approval={session.approval} />
                  {session.isProvisional && (
                    <Text style={styles.hint}>This does not hold you up: keep punching as normal; the day is confirmed afterwards.</Text>
                  )}
                </View>
              )}

              <Button
                title={stage === 'none' ? 'End On-Duty' : 'Complete Duty'}
                variant="outline"
                onPress={() => setEndOpen(true)}
                disabled={anyBusy}
                icon={<MaterialCommunityIcons name="flag-checkered" size={18} color={C.primary} />}
              />
              <Text style={styles.endHint}>
                You need to end this On-Duty before you can apply for a new one. If you do not, it ends by itself at the end of
                the day.
              </Text>
            </>
          ) : (
            <>
              {queuedEnd && (
                <View style={styles.infoBox}>
                  <MaterialCommunityIcons name="cloud-upload-outline" size={18} color={C.badgeYellowText} />
                  <Text style={styles.infoText}>
                    You ended your On-Duty with no internet. It is saved on your phone and is closed on the server as soon as
                    you are back online.
                  </Text>
                </View>
              )}

              {!status && statusQuery.fetchStatus === 'paused' && (
                <View style={styles.infoBox}>
                  <MaterialCommunityIcons name="wifi-off" size={18} color={C.badgeRedText} />
                  <Text style={styles.infoText}>
                    You are offline and today's On-Duty could not be loaded. If you already started an On-Duty today, do not
                    apply again: it is still open on the server.
                  </Text>
                </View>
              )}

              {/* the request form: only when nothing is open */}
              <View style={styles.card}>
                <View style={styles.formHead}>
                  <View style={styles.formIcon}>
                    <MaterialCommunityIcons name="briefcase-plus-outline" size={20} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formTitle}>Apply On-Duty</Text>
                    <Text style={styles.formSub}>Official work outside the office today</Text>
                  </View>
                </View>
                <View style={styles.steps}>
                  <Step n={1} text="Write where you are going and submit." />
                  <Step n={2} text="Your gate pass with its QR is ready at once. Show it at the gate." />
                  <Step n={3} text="Record your four punches (Morning, Lunch Out, Lunch In, Night) in any order." />
                  <Step n={4} text="End On-Duty when your work is done." />
                </View>
                <Text style={styles.hint}>
                  Each punch needs {requiredPhotos === 2 ? 'two photos' : 'a selfie'} and your location.{' '}
                  {pipelineSentence(onDutyFlow, 'The whole day is confirmed afterwards.')}
                </Text>

                {consentMissing && (
                  <TouchableOpacity
                    style={styles.consentGate}
                    onPress={() => router.push(trackingRoutes.setup('consent'))}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons name="shield-check-outline" size={20} color={C.statusRed} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.consentTitle}>Read and accept the tracking notice first</Text>
                      <Text style={styles.consentBody}>You need to accept it once before you can start On-Duty.</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={C.statusRed} />
                  </TouchableOpacity>
                )}
                {trackingOn && !consentMissing && <TrackingReadiness permission={trackingSnapshot?.health.permission ?? 'unknown'} />}

                <Text style={styles.fieldLabel}>WHERE ARE YOU GOING?</Text>
                <TextArea
                  placeholder="e.g. ABC Textiles, Tiruppur — machine inspection"
                  value={destinationText}
                  onChangeText={setDestinationText}
                  minLength={3}
                  maxLength={300}
                />
                <WorkflowOffNote workflow={onDutyFlow} />
                <Button
                  title="Start On-Duty"
                  onPress={() => void submitRequest()}
                  loading={requestMutation.isPending}
                  disabled={!destinationText.trim() || workflowOff(onDutyFlow) || consentMissing}
                  icon={<MaterialCommunityIcons name="send" size={18} color="#fff" />}
                />
              </View>

              <QueuedOpsList kinds={['onDuty.request', 'onDuty.punch', 'onDuty.end', 'onDuty.otPunch']} title="Not sent yet" />
              <RecentOnDuty onSeeAll={onSeeRecords} />
            </>
          )}

          {trackingState?.supported && (
            <View style={styles.shortcuts}>
              <TouchableOpacity style={styles.shortcut} onPress={() => router.push(trackingRoutes.journeys)} accessibilityRole="button">
                <MaterialCommunityIcons name="map-marker-path" size={20} color={C.primary} />
                <Text style={styles.shortcutText}>On-Duty Journey</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shortcut} onPress={() => router.push(trackingRoutes.health)} accessibilityRole="button">
                <MaterialCommunityIcons
                  name={redIssues.length ? 'alert-circle' : 'shield-check-outline'}
                  size={20}
                  color={redIssues.length ? C.statusRed : C.primary}
                />
                <Text style={styles.shortcutText}>Tracking health</Text>
              </TouchableOpacity>
            </View>
          )}
        </FormScrollView>
      </KeyboardAvoider>

      <EndOnDutySheet
        visible={endOpen}
        onClose={() => setEndOpen(false)}
        onConfirm={() => void confirmEnd()}
        ending={endMutation.isPending}
        destination={destination}
        startedAt={startedAt}
        approvalText={approvalText}
        tiles={tiles}
        distanceM={journey?.distanceM ?? null}
        otCount={otList.length}
        otText={otText}
        now={now}
      />
      {/* After the 4th punch: Complete Duty, or Continue Duty with OT punches. */}
      <Modal visible={choiceOpen} transparent animationType="fade" onRequestClose={() => setChoiceOpen(false)}>
        <View style={styles.scrim}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <MaterialCommunityIcons name="check-decagram" size={40} color={C.statusGreen} />
            <Text style={styles.dialogTitle}>All 4 punches are in</Text>
            <Text style={styles.dialogText}>
              Are you done for the day? Choose Continue Duty if you are still working on-duty: you can then record OT
              punches for the overtime.
            </Text>
            <Button
              title="Complete Duty"
              onPress={() => {
                setChoiceOpen(false);
                setEndOpen(true);
              }}
              icon={<MaterialCommunityIcons name="flag-checkered" size={18} color="#fff" />}
              style={{ alignSelf: 'stretch' }}
            />
            <Button
              title="Continue Duty (overtime)"
              variant="outline"
              onPress={() => {
                setChoiceOpen(false);
                setContinued(true);
                showToast('OT punches are on. Tap "OT Punch" whenever you need to record one.', 'info');
              }}
              icon={<MaterialCommunityIcons name="clock-plus-outline" size={18} color={C.primary} />}
              style={{ alignSelf: 'stretch' }}
            />
          </View>
        </View>
      </Modal>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.step}>
      <View style={styles.stepNo}>
        <Text style={styles.stepNoText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgLight },
    content: { padding: 16, gap: 14, paddingBottom: 40 },
    card: { backgroundColor: C.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: C.border, padding: Spacing.base, gap: 10 },
    hero: { backgroundColor: C.primary, borderRadius: BorderRadius.xxl, padding: 18, gap: 6 },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
    heroEyebrow: { flex: 1, color: 'rgba(255,255,255,0.8)', fontFamily: FontFamily.bodySemibold, fontSize: 11, letterSpacing: 1 },
    heroChip: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
    heroChipText: { color: '#fff', fontFamily: FontFamily.bodySemibold, fontSize: 11.5 },
    heroTitle: { color: '#fff', fontFamily: FontFamily.displayBold, fontSize: 22, marginTop: 4 },
    heroLine: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
    heroNote: { color: '#FEF3C7', fontSize: 12, lineHeight: 17, marginTop: 4 },
    progressRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
    progressSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
    progressSegOn: { backgroundColor: '#fff' },
    sectionTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 16, color: C.textPrimary },
    captureCard: { backgroundColor: C.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1.5, borderColor: C.primary, padding: 12 },
    infoBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: BorderRadius.lg, backgroundColor: C.primaryFixed },
    infoText: { flex: 1, color: C.textPrimary, fontSize: 12.5, lineHeight: 18 },
    hint: { fontSize: 12, color: C.textMuted, lineHeight: 17 },
    endHint: { fontSize: 11.5, color: C.textMuted, lineHeight: 16, textAlign: 'center', marginTop: -6 },
    formHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    formIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryFixed },
    formTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 17, color: C.textPrimary },
    formSub: { fontSize: 12.5, color: C.textMuted },
    steps: { gap: 8, paddingVertical: 4 },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    stepNo: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryFixed },
    stepNoText: { color: C.primary, fontFamily: FontFamily.bodySemibold, fontSize: 12 },
    stepText: { flex: 1, fontSize: 13, color: C.textSecondary, lineHeight: 19 },
    fieldLabel: { fontSize: 10.5, fontFamily: FontFamily.bodySemibold, color: C.textMuted, letterSpacing: 0.5, marginTop: 4 },
    consentGate: {
      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44,
      backgroundColor: C.badgeRedBg, borderWidth: 1, borderColor: C.statusRed, borderRadius: BorderRadius.md, padding: 12,
    },
    consentTitle: { fontSize: 13, fontFamily: FontFamily.bodySemibold, color: C.badgeRedText },
    consentBody: { fontSize: 11.5, color: C.badgeRedText, marginTop: 1 },
    shortcuts: { flexDirection: 'row', gap: 10 },
    choiceCard: {
      backgroundColor: C.badgeGreenBg,
      borderRadius: BorderRadius.xl,
      padding: Spacing.base,
      gap: 10,
      alignItems: 'stretch',
    },
    choiceTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 16, color: C.textPrimary },
    otHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    otCount: {
      minWidth: 26, textAlign: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full,
      backgroundColor: C.badgeYellowBg, color: C.badgeYellowText, fontFamily: FontFamily.bodySemibold, fontSize: 12.5, overflow: 'hidden',
    },
    otSummary: { fontFamily: FontFamily.bodySemibold, fontSize: 13, color: C.categoryOnDuty },
    otRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border },
    otBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.sm, backgroundColor: C.badgeYellowBg },
    otBadgeText: { fontFamily: FontFamily.bodySemibold, fontSize: 11.5, color: C.badgeYellowText },
    otTime: { width: 72, fontFamily: FontFamily.bodySemibold, fontSize: 14, color: C.textPrimary },
    otState: { flex: 1, fontSize: 12, color: C.textSecondary },
    scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    dialog: { width: '100%', maxWidth: 380, backgroundColor: C.bgCard, borderRadius: BorderRadius.xxl, padding: 22, alignItems: 'center', gap: 12 },
    dialogTitle: { fontFamily: FontFamily.headlineSemibold, fontSize: 18, color: C.textPrimary, textAlign: 'center' },
    dialogText: { fontSize: 14, lineHeight: 20, color: C.textSecondary, textAlign: 'center' },
    shortcut: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48,
      backgroundColor: C.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 12,
    },
    shortcutText: { fontSize: 12.5, fontFamily: FontFamily.bodySemibold, color: C.textPrimary },
  });
