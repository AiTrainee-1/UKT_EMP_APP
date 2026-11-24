// One pass of the offline sync (pure apart from what is injected; tested in syncCore.test.ts).
//
// Oldest first, one at a time: an On-Duty request is sent before the punches made under it. A retryable answer (no
// internet, server down) STOPS the pass: the rest would fail the same way and the order must be kept. A refusal marks
// that one failed and goes on with the next (one bad item never blocks the others). A 401 stops everything (the API
// client signs out). Only a 2xx removes an operation from the phone.
import { classifySend, nextTryDelayMs, type SendOutcome } from './classify.ts';
import type { OfflineQueue } from './queue.ts';
import type { QueuedOp } from './types.ts';

export interface SyncDeps {
  queue: OfflineQueue;
  employeeId: number;
  send(op: QueuedOp): Promise<SendOutcome>;
  now(): number;
  /** Called after the server took an operation (refresh screens, delete its files). */
  onDone?(op: QueuedOp, data: unknown): void | Promise<void>;
  /** Called when an operation is refused for good. */
  onFailed?(op: QueuedOp, message: string): void | Promise<void>;
  /** Called per operation before it is sent (progress for the status bar). */
  onSending?(op: QueuedOp, index: number, total: number): void;
}

export interface SyncResult {
  sent: number;
  failed: number;
  /** Why the pass stopped early ('retry' = no connection / server down, 'auth' = signed out), or null when it ran out. */
  stoppedBy: 'retry' | 'auth' | null;
  remaining: number;
}

export async function runSyncPass(deps: SyncDeps): Promise<SyncResult> {
  const due = await deps.queue.due(deps.employeeId, deps.now());
  let sent = 0;
  let failed = 0;
  let stoppedBy: SyncResult['stoppedBy'] = null;

  for (let i = 0; i < due.length; i++) {
    const op = due[i];
    deps.onSending?.(op, i, due.length);
    let outcome: SendOutcome;
    try {
      outcome = await deps.send(op);
    } catch {
      outcome = { noResponse: true };
    }
    const verdict = classifySend(outcome, op.attempts);
    if (verdict.kind === 'done') {
      await deps.queue.markDone(op.id);
      sent++;
      try {
        await deps.onDone?.(op, outcome.data);
      } catch {
        /* refreshing the screens must never undo a successful send */
      }
      continue;
    }
    if (verdict.kind === 'failed') {
      await deps.queue.markFailed(op.id, verdict.message, deps.now());
      failed++;
      try {
        await deps.onFailed?.(op, verdict.message);
      } catch {
        /* best effort */
      }
      continue;
    }
    if (verdict.kind === 'auth') {
      stoppedBy = 'auth';
      break;
    }
    const now = deps.now();
    await deps.queue.markRetry(op.id, verdict.reason, now, now + nextTryDelayMs(op.attempts + 1));
    stoppedBy = 'retry';
    break;
  }

  const counts = await deps.queue.counts(deps.employeeId);
  return { sent, failed, stoppedBy, remaining: counts.pending };
}
