import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { sendOrQueue, isQueued, QUEUED_MESSAGE } from '../offline/submit';
import { useAuth } from './useAuth';

/**
 * Withdraw one of my own requests that is still waiting for an answer (owner 2026-11-24): Leave, Permission and Casual
 * Leave only (Compensation claims have their own withdraw). POST /my/requests/<module>/<id>/withdraw
 * (backend/api/mobile_withdraw_views.py): the server refuses (409 not_pending) once the request was fully decided.
 */
export type WithdrawModule = 'leave' | 'permission' | 'casual_leave';

const WHAT: Record<WithdrawModule, string> = {
  leave: 'leave request',
  permission: 'permission request',
  casual_leave: 'casual leave request',
};

/** Whether a request in this state may be withdrawn: still waiting at any step (not approved, rejected or withdrawn). */
export function canWithdraw(status: unknown): boolean {
  return typeof status === 'string' && status.trim().toLowerCase() === 'pending';
}

export function useWithdrawRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  return useMutation({
    mutationFn: async (input: { module: WithdrawModule; id: number; label?: string }) =>
      sendOrQueue<{ withdrawn: boolean; message?: string }>({
        kind: 'request.withdraw',
        label: `Withdraw ${input.label ?? WHAT[input.module]}`,
        url: `/my/requests/${input.module}/${input.id}/withdraw`,
        body: {},
        invalidate: [
          ['leave-requests', employeeId],
          ['leave-balances', employeeId],
          ['permissions', employeeId],
          ['employee-shift-stats'],
          ['casual-leaves', employeeId],
          ['casual-leave-eligibility', employeeId],
          ['casual-leave-history', employeeId],
          ['my-pending-requests'],
        ],
        meta: { module: input.module, requestId: input.id },
      }),
    onSettled: () => {
      for (const key of [
        ['leave-requests', employeeId],
        ['leave-balances', employeeId],
        ['permissions', employeeId],
        ['employee-shift-stats'],
        ['casual-leaves', employeeId],
        ['casual-leave-eligibility', employeeId],
        ['casual-leave-history', employeeId],
        ['my-pending-requests'],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** The server's sentence for a refused withdraw, or a plain one. */
export function withdrawErrorMessage(err: any): string {
  const data = err?.response?.data;
  if (data && typeof data.error === 'string' && data.error.trim()) return data.error;
  if (!err?.response) return 'Could not reach the server. Please try again.';
  return 'This request could not be withdrawn. Please try again.';
}

/**
 * "Withdraw this request?" -> withdraw -> tell the employee what happened. Returns a function the cards call with the
 * request. `onDone` lets a screen close its sheet.
 */
export function useConfirmWithdraw(onDone?: (message: string) => void) {
  const withdraw = useWithdrawRequest();
  const ask = useCallback(
    (module: WithdrawModule, id: number, label?: string) => {
      const what = label ?? WHAT[module];
      Alert.alert(
        'Withdraw this request?',
        `Your ${what} will be taken back and nobody will be asked to decide it. You can apply again later.`,
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Withdraw',
            style: 'destructive',
            onPress: () => {
              withdraw.mutate(
                { module, id, label: what },
                {
                  onSuccess: (result) => {
                    const message = isQueued(result)
                      ? `${QUEUED_MESSAGE}`
                      : (result as { message?: string })?.message ?? `Your ${what} was withdrawn.`;
                    if (onDone) onDone(message);
                    else Alert.alert('Withdrawn', message);
                  },
                  onError: (err) => Alert.alert('Could not withdraw', withdrawErrorMessage(err)),
                },
              );
            },
          },
        ],
      );
    },
    [withdraw, onDone],
  );
  return { ask, isPending: withdraw.isPending };
}
