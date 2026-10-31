// The gate pass that is "open right now", pinned at the top of the Outpass screen (owner, 2026-10-31: "The currently
// opened gate pass should be displayed at the top"), and the clock it shows. Pure, tested in outpassOpen.test.ts.
//
// Open means one of:
//   out      - the employee went out through the gate and has not come back yet (no matter how long ago);
//   ready    - approved, not used yet, and its 60-minute exit window is still running (the exit QR is live).
// An "out" pass always wins over a "ready" one; within a kind the newest wins.

export type OpenPassInput = {
  id: number;
  status: string;
  approvedAt?: string | null;
  expiresAt?: string | null;
  exitedAt?: string | null;
  enteredAt?: string | null;
  expectedReturnAt?: string | null;
  createdAt: string;
};

export type OpenPassKind = 'out' | 'ready';

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function openKind(p: OpenPassInput, nowMs: number): OpenPassKind | null {
  if (p.status !== 'approved') return null;
  if (p.exitedAt && !p.enteredAt) return 'out';
  if (p.exitedAt) return null; // went out and came back: done
  const exp = ms(p.expiresAt);
  return exp != null && exp > nowMs ? 'ready' : null;
}

/** The pass to pin, or null when nothing is open. */
export function pickOpenPass<T extends OpenPassInput>(items: readonly T[], nowMs: number): T | null {
  let best: { item: T; rank: number; at: number } | null = null;
  for (const item of items) {
    const kind = openKind(item, nowMs);
    if (!kind) continue;
    const rank = kind === 'out' ? 2 : 1;
    const at = ms(kind === 'out' ? item.exitedAt : item.approvedAt) ?? ms(item.createdAt) ?? 0;
    if (!best || rank > best.rank || (rank === best.rank && at > best.at)) best = { item, rank, at };
  }
  return best?.item ?? null;
}

export type OpenPassClock =
  | {
      kind: 'out';
      /** Since the employee went out through the gate. */
      elapsedMs: number;
      /** Time left until the expected return (negative once late); null when no return time was given. */
      returnInMs: number | null;
      overdue: boolean;
      /** 0..1 of the way from going out to the expected return (1 once late); null without a return time. */
      progress: number | null;
    }
  | {
      kind: 'ready';
      /** Time left to go out through the gate before the pass expires. */
      exitWindowMs: number;
      /** 0..1 of the 60-minute window already used. */
      progress: number;
    };

const EXIT_WINDOW_MS = 60 * 60 * 1000;

export function openPassClock(p: OpenPassInput, nowMs: number): OpenPassClock | null {
  const kind = openKind(p, nowMs);
  if (kind === 'out') {
    const out = ms(p.exitedAt) ?? nowMs;
    const back = ms(p.expectedReturnAt);
    const elapsedMs = Math.max(0, nowMs - out);
    if (back == null || back <= out) return { kind, elapsedMs, returnInMs: null, overdue: false, progress: null };
    const returnInMs = back - nowMs;
    return {
      kind,
      elapsedMs,
      returnInMs,
      overdue: returnInMs < 0,
      progress: Math.min(1, Math.max(0, elapsedMs / (back - out))),
    };
  }
  if (kind === 'ready') {
    const exp = ms(p.expiresAt) ?? nowMs;
    const exitWindowMs = Math.max(0, exp - nowMs);
    return { kind, exitWindowMs, progress: Math.min(1, Math.max(0, 1 - exitWindowMs / EXIT_WINDOW_MS)) };
  }
  return null;
}

export type OutpassRowLabel = { label: string; variant: 'pending' | 'approved' | 'rejected' | 'onleave' | 'late' };

/**
 * The plain-English badge of a pass in the list, from its status and where it is at the gate (`scanStatus`):
 * Waiting / Not Approved / Ready to use / Out now / Returned / Not used (the 60 minutes ran out) / Approved.
 */
export function outpassRowLabel(p: { status: string; scanStatus?: string | null; exitedAt?: string | null; enteredAt?: string | null }): OutpassRowLabel {
  if (p.status === 'pending') return { label: 'Waiting', variant: 'pending' };
  if (p.status === 'rejected') return { label: 'Not Approved', variant: 'rejected' };
  if (p.status !== 'approved') return { label: p.status, variant: 'pending' };
  switch (p.scanStatus) {
    case 'pending_exit':
      return { label: 'Ready to use', variant: 'onleave' };
    case 'exited':
    case 'pending_return':
    case 'return_expired':
      return { label: 'Out now', variant: 'late' };
    case 'completed':
      return { label: 'Returned', variant: 'approved' };
    case 'expired_unscanned':
      return { label: 'Not used', variant: 'pending' };
    default:
      if (p.enteredAt) return { label: 'Returned', variant: 'approved' };
      if (p.exitedAt) return { label: 'Out now', variant: 'late' };
      return { label: 'Approved', variant: 'approved' };
  }
}

/** "1 h 05 min", "12 min", "45 s" - the length of a stretch of time in plain words. */
export function formatSpan(spanMs: number): string {
  const total = Math.max(0, Math.floor(Math.abs(spanMs) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

/** "mm:ss" (or "h:mm:ss") for a ticking countdown. */
export function formatTicker(spanMs: number): string {
  const total = Math.max(0, Math.floor(Math.abs(spanMs) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
