import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useLeaveBalances, useLeaveRequests } from './useLeave';
import { usePermissions } from './useRequests';

// Dashboard endpoint returns workingDays, presentDays, halfShiftDays, lateDays,
// absentDays, leaveDays, leaveBalance and pendingRequests. The attendance
// figures come from the same engine as the Attendance tab and HRMS payroll
// (backend attendance_final.compute_month_records), so the Home card can
// never disagree with the Attendance tab for the same month.
// We supplement leaveBalance from the leave-balances API as a fallback.
export function useDashboard(employeeId: number | null) {
  const dashboard = useQuery({
    queryKey: ['dashboard', employeeId],
    queryFn: async () => {
      const res = await api.get('/dashboard/employee-summary', { params: { employeeId } });
      return res.data as {
        workingDays: number;
        presentDays: number;
        halfShiftDays: number;
        lateDays: number;
        absentDays: number;
        leaveDays: number;
        leaveBalance: number;
        pendingRequests: number;
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
        (permissions.data?.items?.filter((r) => r.status === 'Pending').length ?? 0);

    return {
      workingDays: d.workingDays ?? 0,
      presentDays: d.presentDays ?? 0,
      halfShiftDays: d.halfShiftDays ?? 0,
      lateDays: d.lateDays ?? 0,
      absentDays: d.absentDays ?? 0,
      leaveDays: d.leaveDays ?? 0,
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
