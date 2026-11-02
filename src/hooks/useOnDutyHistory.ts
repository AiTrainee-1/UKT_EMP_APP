import { useInfiniteQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type { ApprovalProgress } from '../lib/approval';
import type { RequestView } from '../lib/requestViews';

/** One On-Duty request in the employee's history (GET /on-duty-sessions/mine, backend/api/mobile_requests_views.py). */
export interface OnDutyHistoryItem {
  id: number;
  destination: string;
  branchName: string | null;
  /** The India date the request was sent (the day it was for). */
  date: string | null;
  /** What the employee sees elsewhere: a request still with an approver reads "active" / "completed". */
  status: 'pending_hod' | 'pending_hr' | 'active' | 'completed' | 'rejected';
  /** The true approval state: what the four views sort by. */
  approvalStatus: 'pending_hod' | 'pending_hr' | 'active' | 'completed' | 'rejected';
  isProvisional: boolean;
  employeeEndedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completionReason: 'manual' | 'auto_4th_punch' | 'auto_day_end' | null;
  createdAt: string | null;
  hodReviewedBy: string | null;
  hodReviewComment: string | null;
  hrReviewedBy: string | null;
  hrReviewComment: string | null;
  punches: { punchNumber: number; punchType: 'IN' | 'OUT'; punchDate: string; punchTime: string; status: 'pending' | 'approved' | 'rejected'; isMocked: boolean }[];
  punchCount: number;
  journey: { id: number; status: 'active' | 'ended'; distanceM: number; startedAt: string | null; endedAt: string | null } | null;
  approval?: ApprovalProgress | null;
}

export interface OnDutyHistoryPage {
  items: OnDutyHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  /** Over ALL of the employee's requests (or all of the asked month's), not only the loaded pages. */
  counts: Record<RequestView, number>;
  /** 'YYYY-MM' when the server applied ?month= (an older server ignores it: null). */
  month: string | null;
}

const PAGE_SIZE = 50;

/**
 * The employee's own On-Duty requests, newest first, 50 at a time ("Show older" loads the next page). `poll` refreshes
 * every minute (only while the records are on screen: a waiting request changes on its own).
 *
 * `month` ('YYYY-MM', the month switcher, 2026-11-02): only that month's requests, with the counts over that month (the
 * server echoes `month` when it applied the filter). Its own cache entry under the same ['on-duty-history', employeeId]
 * prefix, so anything that refreshes the history refreshes it too.
 */
export function useOnDutyHistory(
  employeeId: number | null,
  { poll = false, month }: { poll?: boolean; month?: string } = {},
) {
  return useInfiniteQuery({
    queryKey: month ? ['on-duty-history', employeeId, { month }] : ['on-duty-history', employeeId],
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<OnDutyHistoryPage> => {
      const res = await api.get('/on-duty-sessions/mine', {
        params: { page: pageParam, pageSize: PAGE_SIZE, ...(month ? { month } : {}) },
      });
      const d = res.data ?? {};
      return {
        items: Array.isArray(d.items) ? d.items : [],
        total: Number(d.total ?? 0),
        page: Number(d.page ?? pageParam),
        pageSize: Number(d.pageSize ?? PAGE_SIZE),
        hasMore: !!d.hasMore,
        counts: {
          waiting: Number(d.counts?.waiting ?? 0),
          month: Number(d.counts?.month ?? 0),
          approved: Number(d.counts?.approved ?? 0),
          rejected: Number(d.counts?.rejected ?? 0),
        },
        month: typeof d.month === 'string' ? d.month : null,
      };
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: !!employeeId,
    refetchInterval: poll ? 60_000 : false,
  });
}
