// The Approvals tab's one list per category (owner 2026-11-25): every request of the chosen category together, Pending
// first (what waits for this head, highlighted), then Approved, then Rejected. The Pending / Approved / Rejected tiles are
// counts and quick filters: tap one to see only that status, tap it again to see them all. Pure (no React Native),
// unit-tested in approvalsFeed.test.ts.
//
// The server keeps its three lists (GET /manager/requests?status=pending|approved|rejected, 20 a page, unchanged); the
// phone walks them in that order: every page of Pending (oldest first, the longest wait on top), then Approved and
// Rejected (newest first). A "cursor" says which status and page come next.

import { APPROVAL_STATUSES, type ApprovalStatus, type StatusCounts } from './approvalsHistory.ts';

export type ApprovalFilter = ApprovalStatus | 'all';

export const DEFAULT_FILTER: ApprovalFilter = 'all';

/** Which list page to fetch next. */
export interface FeedCursor {
  status: ApprovalStatus;
  page: number;
}

/** The statuses a filter walks, in order. */
export function feedOrder(filter: ApprovalFilter): readonly ApprovalStatus[] {
  return filter === 'all' ? APPROVAL_STATUSES : [filter];
}

/** Where a filter's list starts: page 1 of its first status. */
export function feedStart(filter: ApprovalFilter): FeedCursor {
  return { status: feedOrder(filter)[0], page: 1 };
}

/** After a page of `cursor.status`: its next page while it has more, else page 1 of the next status, else undefined. */
export function nextFeedCursor(
  cursor: FeedCursor,
  hasMore: boolean,
  order: readonly ApprovalStatus[] = APPROVAL_STATUSES,
): FeedCursor | undefined {
  if (hasMore) return { status: cursor.status, page: cursor.page + 1 };
  const i = order.indexOf(cursor.status);
  const next = i >= 0 ? order[i + 1] : undefined;
  return next ? { status: next, page: 1 } : undefined;
}

/** A tile tapped: that status alone; the tile already chosen, tapped again: everything. */
export function toggleFilter(current: ApprovalFilter, tapped: ApprovalStatus): ApprovalFilter {
  return current === tapped ? 'all' : tapped;
}

/** `?status=` of a link: one of the three statuses, or "all"; null for anything else. */
export function filterFromParam(raw: unknown): ApprovalFilter | null {
  if (raw === 'all') return 'all';
  return typeof raw === 'string' && (APPROVAL_STATUSES as readonly string[]).includes(raw) ? (raw as ApprovalStatus) : null;
}

/** The status a row of the list belongs to: the list it came from (`listStatus`), else the server's `historyStatus`. */
export function rowStatus(item: { listStatus?: unknown; historyStatus?: unknown } | null | undefined): ApprovalStatus {
  for (const v of [item?.listStatus, item?.historyStatus]) {
    if (typeof v === 'string' && (APPROVAL_STATUSES as readonly string[]).includes(v)) return v as ApprovalStatus;
  }
  return 'pending';
}

export type FeedRow<T> =
  | {
      kind: 'header';
      key: string;
      status: ApprovalStatus;
      /** The status's count when known (the server's), else how many rows are loaded. */
      count: number;
      /** Pending only: nothing waits for this head (shown so they see at once there is nothing to do). */
      empty?: boolean;
    }
  | { kind: 'item'; key: string; status: ApprovalStatus; item: T };

/**
 * The rows of the list: the items in status order, each status group led by a header ("Waiting for you · 3",
 * "Approved · 12"). With `headers` false (one status chosen) only the items. In the all-statuses list a Pending header
 * is shown even when nothing waits ("All caught up"), as long as the list has other rows and the Pending count is known
 * to be 0. A request listed twice (a page fetched before and one after it moved from Pending to Approved) is shown once,
 * where it was listed first.
 */
export function feedRows<T extends { id: number }>(
  items: readonly T[],
  opts: {
    headers: boolean;
    counts?: Partial<StatusCounts> | null;
    statusOf?: (item: T) => ApprovalStatus;
  },
): FeedRow<T>[] {
  const statusOf = opts.statusOf ?? ((i: T) => rowStatus(i as any));
  const groups: Record<ApprovalStatus, T[]> = { pending: [], approved: [], rejected: [] };
  const seen = new Set<number>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    groups[statusOf(item)].push(item);
  }
  const rows: FeedRow<T>[] = [];
  for (const status of APPROVAL_STATUSES) {
    const list = groups[status];
    const known = opts.counts?.[status];
    if (opts.headers) {
      if (list.length) {
        rows.push({
          kind: 'header',
          key: `h-${status}`,
          status,
          count: typeof known === 'number' ? Math.max(known, list.length) : list.length,
        });
      } else if (status === 'pending' && known === 0 && items.length > 0) {
        rows.push({ kind: 'header', key: 'h-pending', status, count: 0, empty: true });
      }
    }
    for (const item of list) rows.push({ kind: 'item', key: `${status}-${item.id}`, status, item });
  }
  return rows;
}

/** The words of a group header. */
export function headerTitle(status: ApprovalStatus): string {
  return status === 'pending' ? 'Waiting for your decision' : status === 'approved' ? 'Approved' : 'Rejected';
}

/** The line under the tiles: what the list shows now. */
export function filterCaption(filter: ApprovalFilter): string {
  if (filter === 'all') return 'Showing every request, waiting ones first. Tap a box to filter.';
  return `Showing ${filter} requests only.`;
}
