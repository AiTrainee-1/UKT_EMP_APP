// The employee endpoints of the geo-tracking API, through the app's axios client (src/lib/api.ts): the bearer token is added,
// JSON request bodies are decamelized (device_id, recorded_at, ...) and responses camelized. Never throws for the batch: a
// failure is classified (classifyBatchError) so the syncer decides what to do.
import api from '../lib/api';
import type { BatchBody, SendResult } from './sync.ts';
import { classifyBatchError } from './sync.ts';
import { UNSUPPORTED_STATE, normalizeBatchResponse, normalizeTrackingState } from './normalize.ts';
import { normalizeJourneyDetail, normalizeJourneyList } from './journeyModel.ts';
import type { JourneyDetail, JourneyListItem } from './journeyModel.ts';
import type { TrackingServerState } from './types.ts';

/** GET /tracking/state. A server that has no such route (404) is "tracking not supported"; any other failure throws. */
export async function fetchTrackingState(): Promise<TrackingServerState> {
  try {
    const res = await api.get('/tracking/state');
    return normalizeTrackingState(res.data);
  } catch (err: any) {
    if (err?.response?.status === 404) return UNSUPPORTED_STATE;
    throw err;
  }
}

/** POST /tracking/consent: the employee saw and accepted the notice of this version, on this device. */
export async function postConsent(deviceId: string, noticeVersion: number): Promise<void> {
  await api.post('/tracking/consent', { deviceId, noticeVersion });
}

/** POST /tracking/batch. The body is camelCase here and snake_case on the wire (the interceptor); the server reads both. */
export async function postBatch(body: BatchBody): Promise<SendResult> {
  try {
    const res = await api.post('/tracking/batch', body, { timeout: 25_000 });
    return { kind: 'ok', data: normalizeBatchResponse(res.data) };
  } catch (err) {
    return classifyBatchError(err);
  }
}

export interface JourneyListParams {
  from?: string;
  to?: string;
  /** The server caps a page at 200 (default 25). */
  pageSize?: number;
}

export async function fetchMyJourneys(params: JourneyListParams = {}): Promise<{ results: JourneyListItem[]; total: number }> {
  const res = await api.get('/tracking/my-journeys', { params });
  return normalizeJourneyList(res.data);
}

export async function fetchJourney(id: number): Promise<JourneyDetail | null> {
  const res = await api.get(`/tracking/journeys/${id}`);
  return normalizeJourneyDetail(res.data);
}
