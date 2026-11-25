import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import api from '../lib/api';
import { accountStatusOf, type AccountStatus } from '../lib/inactiveAccount';

export const ACCOUNT_STATUS_KEY = ['account-status'] as const;

/**
 * Whether the signed-in employee's HRMS account is active (owner 2026-11-25), from GET /auth/me's additive
 * `accountStatus` (null on an older server that does not say). Asked as soon as someone is signed in - so straight after
 * signing in and at every app start - then every minute, and every 10 seconds while the account is inactive (so an
 * account HR makes active again is let in at once). `fresh` is true only for an answer the server gave since this
 * employee was signed in here: a copy kept on the phone from an earlier run never blocks the app on its own.
 */
export function useAccountStatus(employeeId: number | null): { status: AccountStatus | null; fresh: boolean } {
  const since = useRef(Date.now());
  const lastEmployee = useRef<number | null>(employeeId);
  if (lastEmployee.current !== employeeId) {
    lastEmployee.current = employeeId;
    since.current = Date.now();
  }

  const query = useQuery({
    queryKey: [...ACCOUNT_STATUS_KEY, employeeId],
    queryFn: async (): Promise<AccountStatus | null> => accountStatusOf((await api.get('/auth/me')).data),
    enabled: !!employeeId,
    staleTime: 10_000,
    refetchInterval: (q) => (q.state.data === 'inactive' ? 10_000 : 60_000),
    retry: 1,
  });

  // The first answer of this run must come from the server, even when a kept copy looks recent.
  useEffect(() => {
    if (employeeId) void query.refetch();
    // once per signed-in employee
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  return {
    status: query.data ?? null,
    fresh: !!employeeId && query.dataUpdatedAt >= since.current,
  };
}
