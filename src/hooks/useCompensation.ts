import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './useAuth';
import { normalizeCompensation, type EmployeeCompensation } from '../lib/compensation';
import { normalizeHod, type HodAssignment } from '../lib/hodAssignment';

export type { EmployeeCompensation } from '../lib/compensation';
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
