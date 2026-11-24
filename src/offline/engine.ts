/**
 * The offline queue on the phone (owner 2026-11-24): what the employee does while the server cannot be reached is kept
 * here and sent, in order, as soon as it can be - in the app, and in the background where Android allows it
 * (backgroundTask.ts). See queue.ts (storage), classify.ts (what each answer means) and syncCore.ts (one pass).
 *
 *  - Every queued write carries an Idempotency-Key (backend/api/idempotency.py), so a send whose answer was lost and is
 *    sent again is still done once.
 *  - An operation leaves the phone only when the server confirmed it (2xx) or when the employee discards it.
 *  - Operations belong to the employee who made them and are only sent under that employee's sign-in.
 *  - Photos of a queued On-Duty punch are copied into the app's own storage and deleted after the server took them.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import type { QueryClient } from '@tanstack/react-query';

import api from '../lib/api';
import { getEmployeeId, getToken } from '../lib/auth';
import { isNetworkOnline, subscribeNetworkBanner } from '../lib/networkStatus';
import { openOfflineDb } from './db';
import type { SendOutcome } from './classify';
import { newOpId } from './classify';
import { createOfflineQueue, type OfflineQueue } from './queue';
import { runSyncPass } from './syncCore';
import type { NewOp, OpFile, QueuedOp } from './types';

const FILES_FOLDER = 'offline-queue';
/** While the app is open and something waits, look again this often (backoff decides what is actually due). */
const FOREGROUND_TICK_MS = 45_000;

// ── storage ─────────────────────────────────────────────────────────────

let queueInstance: OfflineQueue | null = null;
function queue(): OfflineQueue {
  if (!queueInstance) queueInstance = createOfflineQueue(openOfflineDb());
  return queueInstance;
}

function filesDir(opId: string): Directory {
  return new Directory(Paths.document, FILES_FOLDER, opId);
}

/** Copies the photos of an operation into storage the queue owns (the camera's copy may be cleaned up by Android). */
function persistFiles(opId: string, files: OpFile[]): OpFile[] {
  if (!files.length) return files;
  const dir = filesDir(opId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return files.map((f, i) => {
    const source = new File(f.uri);
    const target = new File(dir, `${i}-${f.name}`);
    if (target.exists) target.delete();
    source.copy(target);
    return { ...f, uri: target.uri };
  });
}

function deleteFiles(op: QueuedOp) {
  if (!op.files.length) return;
  try {
    const dir = filesDir(op.id);
    if (dir.exists) dir.delete();
  } catch {
    /* best effort: a leftover photo is harmless */
  }
}

// ── status (for the status bar and the "waiting to sync" lists) ─────────

export interface OfflineStatus {
  pending: number;
  failed: number;
  syncing: boolean;
  /** "Sending 2 of 5" while a pass runs. */
  progress: { index: number; total: number } | null;
  lastSyncAt: number | null;
  /** Bumped whenever the queue changes, so lists re-read it. */
  version: number;
}

let status: OfflineStatus = { pending: 0, failed: 0, syncing: false, progress: null, lastSyncAt: null, version: 0 };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<OfflineStatus>) {
  status = { ...status, ...patch, version: status.version + 1 };
  listeners.forEach((l) => l());
}

export function getOfflineStatus(): OfflineStatus {
  return status;
}

export function subscribeOfflineStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus, getOfflineStatus);
}

export async function refreshOfflineStatus(): Promise<void> {
  const employeeId = await getEmployeeId().catch(() => null);
  if (!employeeId) {
    if (status.pending || status.failed) setStatus({ pending: 0, failed: 0 });
    return;
  }
  try {
    const counts = await queue().counts(employeeId);
    setStatus(counts);
  } catch {
    /* the database could not be read: keep what we show */
  }
}

// ── reading the queue (screens) ──────────────────────────────────────────

export async function listQueuedOps(): Promise<QueuedOp[]> {
  const employeeId = await getEmployeeId().catch(() => null);
  if (!employeeId) return [];
  try {
    return await queue().list(employeeId);
  } catch {
    return [];
  }
}

export async function retryQueuedOp(id: string): Promise<void> {
  await queue().retryNow(id);
  await refreshOfflineStatus();
  void syncNow('manual');
}

/** Throws away one queued operation (and its photos). Only the employee's explicit choice ever does this. */
export async function discardQueuedOp(id: string): Promise<void> {
  const op = await queue().discard(id);
  if (op) deleteFiles(op);
  await refreshOfflineStatus();
}

// ── adding ────────────────────────────────────────────────────────────

let queryClient: QueryClient | null = null;
export function setOfflineQueryClient(client: QueryClient | null) {
  queryClient = client;
}

/** Keeps an operation on the phone; it is sent as soon as the server can be reached. */
export async function enqueueOp(op: Omit<NewOp, 'employeeId'> & { employeeId?: number }): Promise<QueuedOp> {
  const employeeId = op.employeeId ?? (await getEmployeeId());
  if (!employeeId) throw new Error('Not signed in');
  const id = op.id ?? newOpId();
  const files = persistFiles(id, op.files ?? []);
  const saved = await queue().enqueue({ ...op, id, employeeId, files, idempotencyKey: op.idempotencyKey ?? id });
  await refreshOfflineStatus();
  if (queryClient) void queryClient.invalidateQueries({ queryKey: ['offline-queue'] });
  if (isNetworkOnline()) void syncNow('enqueue');
  return saved;
}

// ── sending ─────────────────────────────────────────────────────────────

function buildBody(op: QueuedOp): { data: unknown; headers: Record<string, string> } {
  const headers: Record<string, string> = { 'Idempotency-Key': op.idempotencyKey };
  if (!op.files.length) return { data: op.body ?? {}, headers };
  const form = new FormData();
  for (const [name, value] of Object.entries(op.body ?? {})) {
    if (value === undefined || value === null) continue;
    form.append(name, String(value));
  }
  for (const f of op.files) form.append(f.field, { uri: f.uri, name: f.name, type: f.type } as any);
  headers['Content-Type'] = 'multipart/form-data';
  return { data: form, headers };
}

/** Sends one operation as the employee would have sent it, with its Idempotency-Key. */
export async function sendOp(op: QueuedOp): Promise<SendOutcome> {
  // A photo the queue kept can only be gone if the app's storage was cleared: say so instead of retrying forever.
  for (const f of op.files) {
    let present = true;
    try {
      present = new File(f.uri).exists;
    } catch {
      present = true; // could not check: let the upload decide
    }
    if (!present) {
      return { status: 410, data: { error: 'The photo of this item is no longer on the phone. Please record it again.' } };
    }
  }
  const { data, headers } = buildBody(op);
  try {
    const res = await api.request({
      method: op.method,
      url: op.url,
      data,
      headers,
      timeout: op.files.length ? 60_000 : 20_000,
    });
    return { status: res.status, data: res.data };
  } catch (err: any) {
    if (err?.response) return { status: err.response.status, data: err.response.data };
    return { noResponse: true };
  }
}

let running: Promise<void> | null = null;
let again = false;
let nextTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * One sync pass now (single flight: a second call while one runs makes it run once more after). Safe to call from
 * anywhere, including the background task: it does nothing without a sign-in or without anything due.
 */
export function syncNow(_reason: string = 'manual'): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await onePass();
      } while (again);
    } finally {
      running = null;
      scheduleNext();
    }
  })();
  return running;
}

async function onePass() {
  const [employeeId, token] = await Promise.all([getEmployeeId().catch(() => null), getToken().catch(() => null)]);
  if (!employeeId || !token) return;
  const q = queue();
  const due = await q.due(employeeId, Date.now()).catch(() => []);
  if (!due.length) {
    await refreshOfflineStatus();
    return;
  }
  setStatus({ syncing: true, progress: { index: 0, total: due.length } });
  const touched = new Set<string>();
  try {
    await runSyncPass({
      queue: q,
      employeeId,
      now: () => Date.now(),
      send: sendOp,
      onSending: (_op, index, total) => setStatus({ progress: { index: index + 1, total } }),
      onDone: (op) => {
        deleteFiles(op);
        for (const key of op.invalidate) touched.add(JSON.stringify(key));
      },
    });
  } finally {
    setStatus({ syncing: false, progress: null, lastSyncAt: Date.now() });
    await refreshOfflineStatus();
    if (queryClient) {
      void queryClient.invalidateQueries({ queryKey: ['offline-queue'] });
      for (const key of touched) void queryClient.invalidateQueries({ queryKey: JSON.parse(key) });
    }
  }
}

function scheduleNext() {
  if (nextTimer) clearTimeout(nextTimer);
  nextTimer = null;
  if (AppState.currentState !== 'active' || status.pending === 0) return;
  nextTimer = setTimeout(() => {
    nextTimer = null;
    if (isNetworkOnline()) void syncNow('timer');
    else scheduleNext();
  }, FOREGROUND_TICK_MS);
}

let started = false;
/** Called once by the root layout: send when the internet comes back, when the app comes to the front, and now. */
export function startOfflineSync(client: QueryClient): () => void {
  setOfflineQueryClient(client);
  if (started) return () => {};
  started = true;
  let wasOnline = isNetworkOnline();
  const unsubscribeNetwork = subscribeNetworkBanner(() => {
    const online = isNetworkOnline();
    if (online && !wasOnline) void syncNow('online');
    wasOnline = online;
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void refreshOfflineStatus();
      if (isNetworkOnline()) void syncNow('foreground');
    }
  });
  void refreshOfflineStatus().then(() => {
    if (isNetworkOnline()) void syncNow('start');
  });
  return () => {
    started = false;
    unsubscribeNetwork();
    appState.remove();
    setOfflineQueryClient(null);
  };
}
