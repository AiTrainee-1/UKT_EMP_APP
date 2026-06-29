import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useLeaveBalances, useLeaveRequests } from './useLeave';
import { usePermissions } from './useRequests';

// Dashboard endpoint now returns presentDays, absentDays, leaveBalance, pendingRequests.
// We supplement leaveBalance from the leave-balances API as a fallback.
export function useDashboard(employeeId: number | null) {
  const dashboard = useQuery({
    queryKey: ['dashboard', employeeId],
    queryFn: async () => {
      const res = await api.get('/dashboard/employee-summary', { params: { employeeId } });
      return res.data as {
        presentDays: number;
        absentDays: number;
        leaveBalance: number;
        pendingRequests: number;
        leaveDays?: number;
        recentAttendance?: Array<{ date: string; status: string }>;
        upcomingHolidays?: Array<{ name: string; date: string; type: string }>;
      };
    },
    enabled: !!employeeId,
  });

  // Fallback for leaveBalance in case dashboard returns 0 but leave-balances has data
  const leaveBalances = useLeaveBalances(employeeId);
  const leaveRequests = useLeaveRequests(employeeId);
  const permissions = usePermissions(employeeId);

  const data = useMemo(() => {
    if (!dashboard.data) return null;
    const d = dashboard.data;

    // If dashboard already returns non-zero values, use them; otherwise aggregate
    const leaveBalance = d.leaveBalance > 0
      ? d.leaveBalance
      : (leaveBalances.data?.reduce((sum, b) => sum + (b.remaining ?? 0), 0) ?? 0);

    const pendingRequests = d.pendingRequests > 0
      ? d.pendingRequests
      : (leaveRequests.data?.filter((r) => r.status === 'Pending').length ?? 0) +
        (permissions.data?.filter((r) => r.status === 'Pending').length ?? 0);

    return {
      presentDays: d.presentDays ?? 0,
      absentDays: d.absentDays ?? 0,
      leaveBalance,
      pendingRequests,
      recentAttendance: d.recentAttendance ?? [],
      upcomingHolidays: d.upcomingHolidays ?? [],
    };
  }, [dashboard.data, leaveBalances.data, leaveRequests.data, permissions.data]);

  return {
    data,
    isLoading: dashboard.isLoading,
    isRefetching: dashboard.isRefetching,
    refetch: dashboard.refetch,
  };
}
