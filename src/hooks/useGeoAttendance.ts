import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import api from '../lib/api';
import type { ApprovalProgress } from '../lib/approval';
import { punchFormEntries } from '../lib/onDutyPhotos';
import { ensureTracking, startOnDutyTracking } from '../tracking/actions';
import type { EnsureResult } from '../tracking/controller';

export interface GeoPunchPrecheckResult {
  insideRadius: boolean;
  distanceM: number;
  radiusM: number;
  branchName: string;
  nextPunchNumber: number | null;
  nextPunchType: 'IN' | 'OUT' | null;
  activeOnDutySession: boolean;
  message: string;
}

export interface GeoPunchResult {
  status: 'accepted' | 'already_recorded' | 'rejected';
  punchNumber: number | null;
  punchType: 'IN' | 'OUT' | null;
  distanceM: number;
  radiusM?: number;
  message?: string;
  date?: string;
  time?: string;
}

/** The destination-request gate — no photos/GPS at this stage, that
 * verification happens per-punch (see OnDutyPunchVerification below).
 *
 * The employee does NOT wait for the approval pipeline HR configured
 * (`approval`). The backend reports `status: "active"` to this app the
 * moment the request is submitted, so the session is punchable straight
 * away; `approvalStatus` carries the real HRMS state for display only.
 * Nothing captured counts as attendance until the request's final approval,
 * at which point every punch under it is accepted together — and if it is
 * rejected, they are all voided.
 *
 * The session ends the same day, one of three ways: the employee taps Done,
 * all 4 punches are in (closed at capture, not at approval), or the
 * server's end-of-day job closes it (23:50 IST by default; HR sets the time).
 * A rejection also ends it. The route is recorded (src/tracking) from the moment
 * the request is submitted until the session ends. */
export interface OnDutySession {
  id: number;
  destination: string;
  branchId: number | null;
  branchName: string | null;
  /** Presented status. A submitted-but-unapproved session reads "active"
   *  here so the app lets the employee get on with their day. */
  status: 'pending_hod' | 'pending_hr' | 'active' | 'completed' | 'rejected';
  /** The true HRMS status behind `status` — show it, never gate on it. */
  approvalStatus: 'pending_hod' | 'pending_hr' | 'active' | 'completed' | 'rejected';
  /** Being worked, but HR/HOD hasn't decided yet. */
  isProvisional: boolean;
  employeeEndedAt: string | null;
  hodReviewedBy: string | null;
  hodReviewComment: string | null;
  hodReviewedAt: string | null;
  hrReviewedBy: string | null;
  hrReviewComment: string | null;
  hrReviewedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  completionReason: 'manual' | 'auto_4th_punch' | 'auto_day_end' | null;
  createdAt: string | null;
  /** Who the request waits for and how far it has got in HR's approval pipeline - unlike `status`, which the app
   *  presents as "active". Absent on an older backend. */
  approval?: ApprovalProgress | null;
}

/** One of the day's (up to 4) attendance punches, captured with a selfie +
 * GPS while a session is active — held pending until HR approves it, then
 * written as a real punch via the shared ingestion path. */
export interface OnDutyPunchVerification {
  id: number;
  sessionId: number;
  punchDate: string;
  punchTime: string;
  punchType: 'IN' | 'OUT';
  punchNumber: number;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  isMocked: boolean;
  hasPhoto: boolean;
  /** The second photo (when HR requires two per punch). Absent on an older backend. */
  hasPhoto2?: boolean;
  status: 'pending' | 'approved' | 'rejected';
  hrReviewedBy: string | null;
  hrReviewComment: string | null;
  hrReviewedAt: string | null;
  createdAt: string | null;
}

/** One of the day's four punch slots. The employee picks which one they're
 *  submitting, so a missed punch never blocks the ones after it — slot 4 can
 *  be filled while slot 3 is still empty. Type is fixed by slot parity
 *  (IN/OUT/IN/OUT), so filling a gap later can't invert the day. */
export interface PunchSlot {
  punchNumber: 1 | 2 | 3 | 4;
  punchType: 'IN' | 'OUT';
  status: 'available' | 'pending' | 'approved' | 'recorded';
  available: boolean;
}

export interface GeoPunchStatus {
  date: string;
  punches: { punchTime: string; punchType: 'IN' | 'OUT'; source: string; sourceLabel: string }[];
  onDutySession: OnDutySession | null;
  nextPunchNumber: number | null;
  nextPunchType: 'IN' | 'OUT' | null;
  punchSlots: PunchSlot[];
}

export function useGeoPunchStatus(enabled = true) {
  return useQuery({
    queryKey: ['geo-punch-status'],
    queryFn: async () => (await api.get('/attendance/geo-punch/status')).data as GeoPunchStatus,
    refetchInterval: 30000,
    enabled,
  });
}

/** Whether today's attendance might still be incomplete because biometric
 * hasn't synced yet — true only once a non-biometric punch (Geo/On-Duty/HR
 * Entry) already exists today AND no device has synced since midnight. */
export function useAttendanceSyncStatus() {
  return useQuery({
    queryKey: ['attendance-sync-status'],
    queryFn: async () => (await api.get('/attendance/sync-status')).data as { pendingSync: boolean },
    refetchInterval: 60000,
  });
}

/** Read-only "am I inside the geofence right now?" check — no punch is
 * written, safe to call repeatedly as location updates. */
export function useGeoPunchPrecheck() {
  return useMutation({
    mutationFn: async (params: { latitude: number; longitude: number }) =>
      (await api.get('/attendance/geo-punch/precheck', { params })).data as GeoPunchPrecheckResult,
  });
}

/** Office Geo Punch: the actual punch. Inside the fence it writes
 * immediately; outside it, the backend hard-rejects — no approval flow.
 * Also hard-blocked (409) while an On-Duty session is active. */
export function useGeoPunch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { latitude: number; longitude: number; accuracy?: number; isMocked?: boolean }) =>
      (await api.post('/attendance/geo-punch', body)).data as GeoPunchResult,
    onSuccess: (result) => {
      if (result.status === 'accepted') {
        queryClient.invalidateQueries({ queryKey: ['geo-punch-status'] });
        queryClient.invalidateQueries({ queryKey: ['attendance'] });
      }
    },
  });
}

export interface OnDutySessionStatusResult {
  session: OnDutySession | null;
  punchVerifications: OnDutyPunchVerification[];
  punchSlots: PunchSlot[];
  /** How many photos a punch needs now (HR's Geo-tracking rules): 1 or 2. Absent on an older backend, which means 1. */
  requiredPhotos?: number;
}

/** The employee's current/most recent On-Duty session (pending/active, or
 * today's completed/rejected one) plus its punch verifications — powers the
 * dedicated On-Duty page. Polled fairly frequently so HOD/HR approvals and
 * punch-verification decisions show up without a manual refresh. */
export function useOnDutySessionStatus() {
  return useQuery({
    queryKey: ['on-duty-session-status'],
    queryFn: async () => (await api.get('/on-duty-sessions/status')).data as OnDutySessionStatusResult,
    refetchInterval: 15000,
  });
}

/** Step 1 of the On-Duty flow: just a destination, no photos. Starts the
 * approval pipeline HR configured AND opens the session immediately —
 * the employee can punch straight away rather than waiting on approval.
 * Answers 403 `workflow_disabled` (with a user-ready `error`) while HR has
 * switched On-Duty requests off. */
export function useSubmitOnDutySessionRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { destination: string }) => {
      const data = (await api.post('/on-duty-sessions/request', body)).data as {
        status: string; sessionId: number; isProvisional: boolean; canPunch: boolean; message: string;
      };
      // The route is recorded from the moment the request exists (before any approval): start the collector now. It never
      // throws and never fails the request; `tracking.decision.blockedBy` says why it could not start (consent, location
      // permission, the app not on screen), and the screen sends the employee to the set-up for that.
      const tracking: EnsureResult | null = await startOnDutyTracking();
      return { ...data, tracking };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['on-duty-session-status'] });
      queryClient.invalidateQueries({ queryKey: ['geo-punch-status'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-state'] });
      queryClient.invalidateQueries({ queryKey: ['my-journeys'] }); // the new journey appears in "On-Duty Journey"
    },
  });
}

/** Employee-only manual "Mark as Done" — ends the session early. If they
 * don't tap it, the session closes on its own: at the 4th punch, or at the
 * end-of-day time (23:50 IST by default), whichever comes first. The tracking
 * stops with it (the server says so, the app follows). Ending the day does not decide the
 * request — a still-unapproved session stays in HR's queue. */
export function useCompleteOnDutySession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post('/on-duty-sessions/complete')).data as OnDutySession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['on-duty-session-status'] });
      queryClient.invalidateQueries({ queryKey: ['geo-punch-status'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-state'] });
      queryClient.invalidateQueries({ queryKey: ['my-journeys'] });
      // The server ended the track with the session. Make the phone follow now instead of at the next background tick:
      // the collector flushes what is queued and stops (the "recording" notification goes away).
      void ensureTracking('manual');
    },
  });
}

export interface OnDutyPunchResult {
  status: 'pending_hr_approval';
  verificationId: number;
  punchNumber: number | null;
  punchType: 'IN' | 'OUT' | null;
  /** True when this punch filled the day's last slot and the server closed
   *  the session there and then. */
  sessionEnded: boolean;
  punchSlots: PunchSlot[];
}

/** Captures one of the day's regular attendance punches — selfie + GPS,
 * held pending until HR approves the On-Duty request it belongs to. Reuses
 * the SAME 4-punch-per-day slots the biometric/Office Geo Punch pipelines
 * use; this is not a separate on-duty punch counter.
 *
 * `punchNumber` says which slot this is. It can be submitted in any order,
 * and submitting one never waits on the previous one being reviewed. */
export function useSubmitOnDutyPunch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      isMocked?: boolean;
      /** One local photo URI, or two when HR requires two per punch (sent as `photo` and `photo2`). */
      photoUris: string[];
      punchNumber?: number;
    }) => {
      const form = new FormData();
      for (const entry of punchFormEntries(body)) form.append(entry.name, entry.value as any);
      const res = await api.post('/on-duty-sessions/punch', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as OnDutyPunchResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['on-duty-session-status'] });
      queryClient.invalidateQueries({ queryKey: ['geo-punch-status'] });
      queryClient.invalidateQueries({ queryKey: ['my-journeys'] }); // the journey's punch count
      // The 4th punch closes the session on the server, which ends the track there: look again soon.
      if (result?.sessionEnded) {
        queryClient.invalidateQueries({ queryKey: ['tracking-state'] });
        void ensureTracking('manual');
      }
    },
  });
}

/** Fire-and-forget location ping for live tracking. */
async function sendLiveLocationPing(body: { latitude: number; longitude: number; accuracy?: number; isMocked?: boolean }) {
  return api.post('/live-location/ping', body);
}

// ── Live tracking loop — module-level, not tied to any one screen's mount ──
// so it keeps running (while the app itself is open — foreground only, no
// background task) no matter which screen the employee navigates to after
// starting it. Two entry points:
//  - the dedicated Live Tracking screen (app/geo-tracking) calls
//    requestForegroundPermissionsAsync() itself, tied to a real button tap
//    (the only reliable way to get the OS permission dialog to actually
//    appear), then calls startLiveTracking() directly.
//  - _layout.tsx's LiveLocationTracker auto-resumes it on next app open
//    (or whenever HR's toggle flips true, OR an On-Duty session becomes
//    active) WITHOUT prompting, by checking getForegroundPermissionsAsync()
//    (non-prompting) first — if permission was already granted in an
//    earlier session, tracking just resumes silently; if not, it waits for
//    the employee to visit that screen.
let pingInterval: ReturnType<typeof setInterval> | null = null;
let stopped = false;
const PING_INTERVAL_MS = 45_000;

export type LiveTrackingTickListener = (ok: boolean, at: Date) => void;
let tickListener: LiveTrackingTickListener | null = null;

export function isLiveTrackingActive(): boolean {
  return pingInterval != null;
}

export function onLiveTrackingTick(listener: LiveTrackingTickListener | null) {
  tickListener = listener;
}

async function pingOnce() {
  if (stopped) return;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await sendLiveLocationPing({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
      isMocked: (pos as { mocked?: boolean }).mocked ?? false,
    });
    tickListener?.(true, new Date());
  } catch (err: any) {
    tickListener?.(false, new Date());
    // HR turned tracking off server-side mid-session (and there's no active
    // On-Duty session either) — stop instead of retrying a call that will
    // just keep 403ing.
    if (err?.response?.status === 403) stopLiveTracking();
  }
}

export function startLiveTracking() {
  if (pingInterval) return; // already running
  stopped = false;
  pingOnce();
  pingInterval = setInterval(pingOnce, PING_INTERVAL_MS);
}

export function stopLiveTracking() {
  stopped = true;
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}
