// What one send of a queued operation means (pure, tested in classify.test.ts).
//
// The rule that keeps data safe: an operation leaves the phone ONLY on a 2xx. Everything else either waits for another
// try (no internet, timeout, server down or busy, a write still being processed) or stays on the phone marked failed with
// the server's own sentence, until the employee retries or discards it. A 500 is retried a few times (it may be a
// passing fault) and then marked failed so one bad item never loops forever.
import type { SendVerdict } from './types.ts';

export const MAX_SERVER_ERROR_TRIES = 5;

export interface SendOutcome {
  /** HTTP status, when the server answered. */
  status?: number;
  /** The answer's body (any shape). */
  data?: unknown;
  /** True when no answer came back at all (offline, DNS, timeout, cancelled by the network). */
  noResponse?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The server's own sentence for a refusal, or a plain fallback. */
export function serverMessage(data: unknown, status?: number): string {
  if (isObject(data)) {
    for (const key of ['error', 'message', 'detail']) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  if (typeof data === 'string' && data.trim() && data.length < 300 && !data.trim().startsWith('<')) return data.trim();
  return status ? `The server could not accept this (error ${status}).` : 'The server could not accept this.';
}

export function classifySend(outcome: SendOutcome, attemptsSoFar = 0): SendVerdict {
  const { status, data } = outcome;
  if (outcome.noResponse || status === undefined || status === 0) return { kind: 'retry', reason: 'No internet connection' };
  if (status >= 200 && status < 300) return { kind: 'done' };
  if (status === 401) return { kind: 'auth' };
  if (status === 408 || status === 425 || status === 429) return { kind: 'retry', reason: 'The server is busy' };
  if (status === 409 && isObject(data) && data.code === 'request_in_progress') {
    return { kind: 'retry', reason: 'Still being processed' };
  }
  if (status === 502 || status === 503 || status === 504) return { kind: 'retry', reason: 'The server is not reachable' };
  if (status >= 500) {
    return attemptsSoFar + 1 >= MAX_SERVER_ERROR_TRIES
      ? { kind: 'failed', message: serverMessage(data, status) }
      : { kind: 'retry', reason: 'Server error' };
  }
  // A captive Wi-Fi page / proxy answering 403 or 404 with HTML is not our server's refusal: try again later.
  if ((status === 403 || status === 404) && !isObject(data)) return { kind: 'retry', reason: 'Unexpected answer' };
  return { kind: 'failed', message: serverMessage(data, status) };
}

/** When to try a retryable operation again: 30 s, 1, 2, 4 ... minutes, at most 15. */
export function nextTryDelayMs(attempts: number): number {
  const base = 30_000 * 2 ** Math.max(0, attempts - 1);
  return Math.min(base, 15 * 60_000);
}

/** A random id for an operation / its Idempotency-Key (no native module needed). */
export function newOpId(now = Date.now(), random: () => number = Math.random): string {
  let tail = '';
  for (let i = 0; i < 16; i++) tail += Math.floor(random() * 36).toString(36);
  return `op-${now.toString(36)}-${tail}`;
}
