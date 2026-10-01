/**
 * Whether the server has been answering, as seen by the shared axios instance (src/lib/api.ts).
 *
 * A tiny store rather than React state because the thing that learns about it (an axios
 * interceptor) lives outside React. `useServerStatus` (src/hooks/useServerStatus.ts) reads it.
 *
 *  - Requests that get no answer, or a 502/503/504, mark the server offline.
 *  - Any successful response marks it online again.
 *  - Dismissing the banner hides it for this outage only: it comes back for the next one.
 */

export interface ServerStatus {
  offline: boolean;
  /** The employee closed the "Can't reach the server" banner for the current outage. */
  dismissed: boolean;
}

let status: ServerStatus = { offline: false, dismissed: false };
const listeners = new Set<() => void>();

function update(next: ServerStatus) {
  if (next.offline === status.offline && next.dismissed === status.dismissed) return;
  status = next;
  listeners.forEach((listener) => listener());
}

export function getServerStatus(): ServerStatus {
  return status;
}

export function subscribeServerStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markServerOffline() {
  // Already offline: keep whatever the employee chose about the banner. A fresh outage starts undismissed.
  update({ offline: true, dismissed: status.offline ? status.dismissed : false });
}

export function markServerOnline() {
  update({ offline: false, dismissed: false });
}

export function dismissServerBanner() {
  if (!status.offline) return;
  update({ offline: true, dismissed: true });
}
