import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './useAuth';
import { normalizeApprovalSummary, type ApprovalSummary } from '../lib/approval';

export const APPROVAL_SUMMARY_QUERY_KEY = ['approval-summary'] as const;

async function fetchApprovalSummary(): Promise<ApprovalSummary> {
  const res = await api.get('/approval-summary');
  const summary = normalizeApprovalSummary(res.data);
  // A reply that does not match the contract is an error, not data: it can never reach a screen.
  if (!summary) throw new Error('Unexpected reply from /approval-summary');
  return summary;
}

/**
 * The approval pipelines HR has configured (Approval Workflow Control), keyed by kind of request: who each one goes to,
 * in what order, and whether HR has switched it off. It only explains and hints - it is best-effort and up to a minute
 * old, and the server stays the authority on every submit and every decision. A failure (an older backend has no such
 * endpoint, or the phone is offline) leaves `data` undefined, which every helper in src/lib/approval.ts reads as "no
 * information": the screen behaves as it did before pipelines were configurable. No retry, so an older backend is asked
 * once per screen rather than twice.
 */
export function useApprovalSummary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: APPROVAL_SUMMARY_QUERY_KEY,
    queryFn: fetchApprovalSummary,
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });
}
