import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { sendOrQueue } from '../offline/submit';
import { useAuth } from './useAuth';
import { normalizeCompensation, type EmployeeCompensation } from '../lib/compensation';
import { normalizeMyClaims, type ClaimBody, type MyClaim, type UseBody } from '../lib/compensationClaims';
import { normalizeHod, type HodAssignment } from '../lib/hodAssignment';

export type { EmployeeCompensation } from '../lib/compensation';
export type { MyClaim } from '../lib/compensationClaims';
export type { HodAssignment } from '../lib/hodAssignment';

/**
 * GET /employee/compensation: everything compensation for the signed-in employee, detected by the system or assigned by
 * HR, the balance in shifts, the next-day late-in allowance and the "ask HR" wording. Staff only: a production employee
 * gets `isStaff: false` and a message instead.
 *
 * A reply that does not match the contract (an older backend has no such route, a proxy answered with a page) is an ERROR,
 * not data: the screen shows a Retry state, and nothing malformed can reach it.
 */
export function useEmployeeCompensation() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['employee-compensation', user?.employeeId ?? null],
    queryFn: async (): Promise<EmployeeCompensation> => {
      const res = await api.get('/employee/compensation');
      const data = normalizeCompensation(res.data);
      if (!data) throw new Error('Unexpected reply from /employee/compensation');
      return data;
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

/**
 * GET /employee/hod: the employee's assigned Department Head (name, phone, photo, designation, department, branch, email),
 * the kinds of request that head can approve, and the HR contact. For every employee type.
 */
export function useEmployeeHod() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['employee-hod', user?.employeeId ?? null],
    queryFn: async (): Promise<HodAssignment> => {
      const res = await api.get('/employee/hod');
      const data = normalizeHod(res.data);
      if (!data) throw new Error('Unexpected reply from /employee/hod');
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}

// ── self-claims (2026-11-19; only used when GET /employee/compensation says `canClaim`) ─────────────────────────────

const MY_CLAIMS_KEY = 'employee-compensation-claims';

/** After a claim, a use-balance request or a withdrawal: the page, the year, My claims and the waiting-requests list. */
function invalidateCompensation(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['employee-compensation'] });
  void queryClient.invalidateQueries({ queryKey: ['compensation-history'] });
  void queryClient.invalidateQueries({ queryKey: [MY_CLAIMS_KEY] });
  void queryClient.invalidateQueries({ queryKey: ['my-pending-requests'] });
}

/**
 * GET /employee/compensation/claims: the employee's own claims of every kind (raised by them or by HR), newest first.
 * Asked only when the server supports self-claims (`enabled` = canClaim known). A reply that is not a list is an ERROR.
 */
export function useMyCompensationClaims(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [MY_CLAIMS_KEY, user?.employeeId ?? null],
    queryFn: async (): Promise<MyClaim[]> => {
      const res = await api.get('/employee/compensation/claims');
      const data = normalizeMyClaims(res.data);
      if (!data) throw new Error('Unexpected reply from /employee/compensation/claims');
      return data;
    },
    enabled: !!user && enabled,
    staleTime: 30_000,
  });
}

/** POST /employee/compensation/claims: claim an item (Sunday / holiday work, OT allowance, OT credit, birthday credit). It
 *  goes to the employee's Department Head. Refusals are plain sentences in `error` (claimErrorMessage). */
export function useSubmitCompensationClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ClaimBody) => {
      return sendOrQueue<any>({
        kind: 'compensation.claim',
        label: `Compensation claim · ${String((body as any).date ?? '')}`,
        url: '/employee/compensation/claims',
        body: body as unknown as Record<string, unknown>,
        invalidate: [['employee-compensation'], ['compensation-history'], [MY_CLAIMS_KEY], ['my-pending-requests']],
        meta: { ...(body as unknown as Record<string, unknown>) },
      });
    },
    onSuccess: () => invalidateCompensation(queryClient),
  });
}

/** POST /employee/compensation/use: ask to use part of the balance for a day off (to the Department Head). */
export function useUseCompensationBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UseBody) => {
      return sendOrQueue<any>({
        kind: 'compensation.use',
        label: `Use compensation balance · ${String((body as any).date ?? '')}`,
        url: '/employee/compensation/use',
        body: body as unknown as Record<string, unknown>,
        invalidate: [['employee-compensation'], ['compensation-history'], [MY_CLAIMS_KEY], ['my-pending-requests']],
        meta: { ...(body as unknown as Record<string, unknown>) },
      });
    },
    onSuccess: () => invalidateCompensation(queryClient),
  });
}

/** DELETE /employee/compensation/claims/<id>: withdraw one of the employee's own claims that still waits. A refusal (it
 *  was decided meanwhile) refreshes the lists too, so the screen shows where it stands now. */
export function useWithdrawCompensationClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/employee/compensation/claims/${id}`);
      return res.data;
    },
    onSettled: () => invalidateCompensation(queryClient),
  });
}
