import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { sendOrQueue, isQueued, type QueuedResult } from '../offline/submit';
import { ensureTracking, startOnDutyTracking } from '../tracking/actions';
import type { EnsureResult } from '../tracking/controller';
import { PUNCH_NAMES, type PunchNumber } from '../lib/onDutyPunches';
import type { OnDutyPunchResult, OnDutySession } from './useGeoAttendance';
import type { OutpassRequestItem } from './useOutpass';

/**
 * The three things the employee does on the On-Duty page (owner 2026-11-24), each sent now or - with no internet - kept
 * on the phone and sent later (src/offline). Every one says when it happened (`capturedAt`), so a punch sent later is
 * recorded at the time it was taken (backend geo_attendance_views: within limits, on the session's own day).
 *
 *  - request: a destination. Starts the session (and its gate pass, and the route recording) at once.
 *  - punch:   one of the four named punches, any order: selfie(s) + GPS.
 *  - end:     "End On-Duty", after the overview.
 */
const KEYS: unknown[][] = [
  ['on-duty-session-status'],
  ['geo-punch-status'],
  ['tracking-state'],
  ['my-journeys'],
  ['on-duty-history'],
  ['outpass-requests'],
  ['my-pending-requests'],
];

function refresh(queryClient: QueryClient) {
  for (const key of KEYS) void queryClient.invalidateQueries({ queryKey: key });
}

export type OnDutyRequestResult =
  | { queued: true; op: QueuedResult['op'] }
  | {
      queued: false;
      sessionId: number;
      session?: OnDutySession;
      gatePass?: OutpassRequestItem | null;
      message?: string;
      tracking: EnsureResult | null;
    };

export function useRequestOnDuty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ destination }: { destination: string }): Promise<OnDutyRequestResult> => {
      const capturedAt = new Date().toISOString();
      const res = await sendOrQueue<any>({
        kind: 'onDuty.request',
        label: `On-Duty · ${destination}`,
        url: '/on-duty-sessions/request',
        body: { destination, capturedAt },
        invalidate: KEYS,
        meta: { destination, capturedAt },
      });
      if (isQueued(res)) return { queued: true, op: res.op };
      // The route is recorded from the moment the request exists: start the collector now (never throws).
      const tracking = await startOnDutyTracking();
      return { queued: false, ...res, tracking };
    },
    onSettled: () => refresh(queryClient),
  });
}

export type OnDutyPunchOutcome = { queued: true; op: QueuedResult['op'] } | ({ queued: false } & OnDutyPunchResult);

export function useRecordOnDutyPunch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      punchNumber: PunchNumber;
      latitude: number;
      longitude: number;
      accuracy?: number;
      isMocked?: boolean;
      photoUris: string[];
      /** The server session it belongs to; null while the request itself still waits on the phone. */
      sessionId: number | null;
    }): Promise<OnDutyPunchOutcome> => {
      const capturedAt = new Date().toISOString();
      const body: Record<string, unknown> = {
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        isMocked: String(!!input.isMocked),
        punchNumber: String(input.punchNumber),
        capturedAt,
        // After the 4th punch the app asks Complete Duty / Continue Duty (overtime): the server keeps the session open.
        autoEnd: 'false',
      };
      if (input.accuracy != null) body.accuracy = String(input.accuracy);
      if (input.sessionId != null) body.sessionId = String(input.sessionId);
      const files = input.photoUris.filter(Boolean).map((uri, i) => ({
        field: i === 0 ? 'photo' : 'photo2',
        uri,
        name: i === 0 ? 'punch.jpg' : 'punch2.jpg',
        type: 'image/jpeg',
      }));
      const res = await sendOrQueue<OnDutyPunchResult>({
        kind: 'onDuty.punch',
        label: `${PUNCH_NAMES[input.punchNumber]} · On-Duty punch`,
        url: '/on-duty-sessions/punch',
        body,
        files,
        invalidate: KEYS,
        meta: { punchNumber: input.punchNumber, capturedAt, sessionId: input.sessionId },
      });
      if (isQueued(res)) return { queued: true, op: res.op };
      // The 4th punch closes the session on the server, which ends the track there: make the phone follow now.
      if (res?.sessionEnded) void ensureTracking('manual');
      return { queued: false, ...res };
    },
    onSettled: () => refresh(queryClient),
  });
}

/** An overtime punch (after the four, once the employee chose Continue Duty): selfie(s) + GPS, never attendance. */
export function useRecordOtPunch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      isMocked?: boolean;
      photoUris: string[];
      sessionId: number | null;
      /** 1, 2, 3 ... for the label only (the server numbers them). */
      sequence: number;
    }) => {
      const capturedAt = new Date().toISOString();
      const body: Record<string, unknown> = {
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        isMocked: String(!!input.isMocked),
        capturedAt,
      };
      if (input.accuracy != null) body.accuracy = String(input.accuracy);
      if (input.sessionId != null) body.sessionId = String(input.sessionId);
      const files = input.photoUris.filter(Boolean).map((uri, i) => ({
        field: i === 0 ? 'photo' : 'photo2',
        uri,
        name: i === 0 ? 'ot-punch.jpg' : 'ot-punch2.jpg',
        type: 'image/jpeg',
      }));
      return sendOrQueue<{ otPunch: unknown; otMinutes: number; message?: string }>({
        kind: 'onDuty.otPunch',
        label: `OT punch ${input.sequence} · On-Duty overtime`,
        url: '/on-duty-sessions/ot-punch',
        body,
        files,
        invalidate: KEYS,
        meta: { capturedAt, sessionId: input.sessionId, sequence: input.sequence },
      });
    },
    onSettled: () => refresh(queryClient),
  });
}

export function useEndOnDuty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, label }: { sessionId: number | null; label?: string }) => {
      const capturedAt = new Date().toISOString();
      const res = await sendOrQueue<OnDutySession & { alreadyEnded?: boolean }>({
        kind: 'onDuty.end',
        label: `End On-Duty${label ? ` · ${label}` : ''}`,
        url: '/on-duty-sessions/complete',
        body: sessionId != null ? { sessionId, capturedAt } : { capturedAt },
        invalidate: KEYS,
        meta: { sessionId, capturedAt },
      });
      // The server ended the track with the session: the collector flushes what is queued and stops. Offline, the
      // recording stops when the server has the "end" (it decides; the phone follows).
      if (!isQueued(res)) void ensureTracking('manual');
      return res;
    },
    onSettled: () => refresh(queryClient),
  });
}
