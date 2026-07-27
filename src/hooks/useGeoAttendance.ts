import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import api from '../lib/api';

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
 * verification now happens per-punch (see OnDutyPunchVerification below).
 * Two-stage HOD->HR chain; approval flips status to "active" (started_at
 * stamped), and the session ends in "completed" either automatically (4th
 * punch approved) or manually (employee taps Done). */
export interface OnDutySession {
  id: number;
  destination: string;
  branchId: number | null;
  branchName: string | null;
  status: 'pending_hod' | 'pending_hr' | 'active' | 'completed' | 'rejected';
  hodReviewedBy: string | null;
  hodReviewComment: string | null;
  hodReviewedAt: string | null;
  hrReviewedBy: string | null;
  hrReviewComment: string | null;
  hrReviewedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  completionReason: 'manual' | 'auto_4th_punch' | null;
  createdAt: string | null;
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
  status: 'pending' | 'approved' | 'rejected';
  hrReviewedBy: string | null;
  hrReviewComment: string | null;
  hrReviewedAt: string | null;
  createdAt: string | null;
}

export interface GeoPunchStatus {
  date: string;
  punches: { punchTime: string; punchType: 'IN' | 'OUT'; source: string; sourceLabel: string }[];
  onDutySession: OnDutySession | null;
  nextPunchNumber: number | null;
  nextPunchType: 'IN' | 'OUT' | null;
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

/** Step 1 of the On-Duty flow: just a destination, no photos — starts the
 * Department Head -> HR approval chain. The session auto-activates the
 * moment HR approves it. */
export function useSubmitOnDutySessionRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { destination: string }) =>
      (await api.post('/on-duty-sessions/request', body)).data as { status: string; sessionId: number },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['on-duty-session-status'] });
      queryClient.invalidateQueries({ queryKey: ['geo-punch-status'] });
    },
  });
}

/** Employee-only manual "Mark as Done" — ends an active session early. If
 * they don't tap this, the session auto-completes when their 4th punch of
 * the day is approved by HR. */
export function useCompleteOnDutySession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post('/on-duty-sessions/complete')).data as OnDutySession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['on-duty-session-status'] });
      queryClient.invalidateQueries({ queryKey: ['geo-punch-status'] });
    },
  });
}

export interface OnDutyPunchResult {
  status: 'pending_hr_approval';
  verificationId: number;
  punchNumber: number | null;
  punchType: 'IN' | 'OUT' | null;
}

/** Captures one of the day's regular attendance punches while a session is
 * active — selfie + GPS, held pending until HR approves it. Reuses the SAME
 * 4-punch-per-day slot the biometric/Office Geo Punch pipelines use; this is
 * not a separate on-duty punch counter. */
export function useSubmitOnDutyPunch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      isMocked?: boolean;
      photoUri: string;
    }) => {
      const form = new FormData();
      form.append('latitude', String(body.latitude));
      form.append('longitude', String(body.longitude));
      if (body.accuracy != null) form.append('accuracy', String(body.accuracy));
      form.append('isMocked', String(!!body.isMocked));
      form.append('photo', { uri: body.photoUri, name: 'punch.jpg', type: 'image/jpeg' } as any);
      const res = await api.post('/on-duty-sessions/punch', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as OnDutyPunchResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['on-duty-session-status'] });
      queryClient.invalidateQueries({ queryKey: ['geo-punch-status'] });
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
