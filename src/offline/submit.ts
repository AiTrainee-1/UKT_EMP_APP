/**
 * Send now, or keep it on the phone (owner 2026-11-24: "users should be able to complete all their tasks offline").
 *
 * Every form that may be used offline sends through `submitOrQueue`. Online, the request goes to the server at once, with
 * an Idempotency-Key; if no answer comes back (the signal dropped mid-way) or the server is down, the SAME operation, with
 * the SAME key, is kept in the offline queue - so if the first send did reach the server, the queued one only gets its
 * answer back and nothing is created twice (backend/api/idempotency.py). Offline, it goes straight to the queue.
 *
 * A refusal from the server (400 "reason is required", 409 "already decided" ...) is NOT queued: it is thrown as usual so
 * the screen shows it right away, exactly as before.
 */
import api from '../lib/api';
import { isNetworkOnline } from '../lib/networkStatus';
import { newOpId } from './classify';
import { enqueueOp } from './engine';
import type { OpFile, OpKind, OpMethod, QueuedOp } from './types';

export interface QueueSpec {
  kind: OpKind;
  /** What the employee reads in the "waiting to sync" lists. */
  label: string;
  method?: OpMethod;
  url: string;
  body?: Record<string, unknown> | null;
  files?: OpFile[];
  /** React Query keys to refresh once the server has it. */
  invalidate?: unknown[][];
  meta?: Record<string, unknown>;
}

export type Submitted<T> = { queued: false; data: T } | { queued: true; op: QueuedOp };

/** The marker a mutation returns when its operation was kept on the phone. */
export interface QueuedResult {
  __queued: true;
  op: QueuedOp;
}

export function isQueued(value: unknown): value is QueuedResult {
  return typeof value === 'object' && value !== null && (value as { __queued?: unknown }).__queued === true;
}

/** The sentence a screen shows when something was saved on the phone instead of sent. */
export const QUEUED_MESSAGE =
  'No internet right now, so this is saved on your phone. It will be sent automatically as soon as you are back online.';

function noAnswer(err: any): boolean {
  if (!err) return false;
  if (!err.response) return true; // offline, DNS, timeout, connection dropped
  const status = err.response.status;
  return status === 502 || status === 503 || status === 504;
}

export function formFor(body: Record<string, unknown> | null | undefined, files: OpFile[]): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(body ?? {})) {
    if (value === undefined || value === null) continue;
    form.append(name, String(value));
  }
  for (const f of files) form.append(f.field, { uri: f.uri, name: f.name, type: f.type } as any);
  return form;
}

export async function submitOrQueue<T = unknown>(spec: QueueSpec): Promise<Submitted<T>> {
  const id = newOpId();
  const method = spec.method ?? 'POST';
  const files = spec.files ?? [];
  const queue = async () => ({
    queued: true as const,
    op: await enqueueOp({ ...spec, method, files, id, idempotencyKey: id }),
  });

  if (!isNetworkOnline()) return queue();
  try {
    const res = await api.request({
      method,
      url: spec.url,
      data: files.length ? formFor(spec.body, files) : spec.body ?? {},
      headers: {
        'Idempotency-Key': id,
        ...(files.length ? { 'Content-Type': 'multipart/form-data' } : {}),
      },
      timeout: files.length ? 60_000 : 20_000,
    });
    return { queued: false, data: res.data as T };
  } catch (err) {
    if (noAnswer(err)) return queue();
    throw err;
  }
}

/** For a mutationFn: the server's answer, or the queued marker. */
export async function sendOrQueue<T = unknown>(spec: QueueSpec): Promise<T | QueuedResult> {
  const result = await submitOrQueue<T>(spec);
  return result.queued ? { __queued: true, op: result.op } : result.data;
}
