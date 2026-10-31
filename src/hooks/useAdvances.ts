import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './useAuth';
import type { AdvanceStatus, AdvanceType, ScheduleState, WindowInfo } from '../lib/settlement';
import type { ApprovalProgress } from '../lib/approval';

// Salary Advance and Term Loan, employee self-service (backend api/mobile_settlement_views.py):
//   GET  /my/advances/eligibility   window, salary, 60% limit, deduction months, what is already applied, the rules
//   GET  /my/advances               own applications: requested vs approved, schedule, deductions, timeline
//   GET  /my/advances/<id>          one of them
//   POST /my/advances               { advanceType, amount, repaymentMonths?, purpose }
// Responses are camelized by src/lib/api.ts; the request body is snake_cased there (the server reads both).

export interface ScheduleRow {
  month: number;
  year: number;
  /** "Nov 2026" */
  label: string;
  amount: number;
  /** planned = not approved yet (an estimate); deducted = taken from a salary; due = this month or earlier, not yet
   *  deducted (payroll has not run); upcoming = a later month. */
  state: ScheduleState;
  method?: string;
}

export interface TimelineEvent {
  kind: 'applied' | 'approved' | 'rejected' | 'waiting' | 'deducted' | 'closed';
  at: string | null;
  title: string;
  text: string;
  by?: string | null;
  comment?: string | null;
}

export interface MyAdvance {
  id: number;
  advanceType: AdvanceType;
  typeLabel: string;
  status: AdvanceStatus;
  statusLabel: string;
  /** The APPROVED amount once HR approved it (what is paid and deducted); the asked amount while it waits. */
  amount: number;
  requestedAmount: number;
  approvedAmount: number | null;
  approvedLess: boolean;
  purpose: string | null;
  emiAmount: number;
  repaymentMonths: number | null;
  repaymentStartMonth: number | null;
  repaymentStartYear: number | null;
  totalRepaid: number;
  outstanding: number;
  /** Still owed: the outstanding of an approved advance, 0 for anything else. */
  balanceDue: number;
  deductedTotal: number;
  /** "October 2026" or "November 2026 to January 2027" */
  deductionLabel: string;
  schedule: ScheduleRow[];
  scheduleIsEstimate: boolean;
  nextDeduction: ScheduleRow | null;
  timeline: TimelineEvent[];
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  appliedBy: 'hr' | 'employee';
  salaryAtRequest: number | null;
  notes: string | null;
  approval?: ApprovalProgress | null;
}

export interface AdvanceEligibility {
  today: string;
  window: WindowInfo;
  workflowEnabled: boolean;
  workflowMessage: string | null;
  employeeActive: boolean;
  monthlySalary: number | null;
  salaryAdvance: {
    canApply: boolean;
    reason: string | null;
    percent: number;
    limit: number | null;
    deductionMonth: number;
    deductionYear: number;
    deductionLabel: string;
    existing: { id: number; status: AdvanceStatus; amount: number } | null;
  };
  termLoan: {
    canApply: boolean;
    reason: string | null;
    minMonths: number;
    maxMonths: number;
    minAmount: number;
    maxAmount: number;
    firstDeductionMonth: number;
    firstDeductionYear: number;
    firstDeductionLabel: string;
    pending: { id: number; amount: number } | null;
    activeCount: number;
  };
  rules: string[];
  approvalPath: string;
}

export interface ApplyAdvanceInput {
  advanceType: AdvanceType;
  amount: number;
  repaymentMonths?: number;
  purpose: string;
}

export const MY_ADVANCES_KEY = ['my-advances'] as const;
export const ADVANCE_ELIGIBILITY_KEY = ['my-advances', 'eligibility'] as const;

function asList(data: unknown): MyAdvance[] {
  if (Array.isArray(data)) return data as MyAdvance[];
  // A malformed reply is an error, never "no applications".
  throw new Error('Unexpected reply from /my/advances');
}

export function useMyAdvances() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...MY_ADVANCES_KEY, 'list', user?.employeeId ?? null],
    queryFn: async () => asList((await api.get('/my/advances')).data),
    enabled: !!user?.employeeId,
    staleTime: 30_000,
  });
}

export function useAdvanceEligibility() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...ADVANCE_ELIGIBILITY_KEY, user?.employeeId ?? null],
    queryFn: async () => {
      const data = (await api.get('/my/advances/eligibility')).data as AdvanceEligibility;
      if (!data || typeof data !== 'object' || !data.window) throw new Error('Unexpected reply from /my/advances/eligibility');
      return data;
    },
    enabled: !!user?.employeeId,
    staleTime: 30_000,
  });
}

export function useMyAdvance(id: number | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [...MY_ADVANCES_KEY, 'one', id],
    queryFn: async () => (await api.get(`/my/advances/${id}`)).data as MyAdvance,
    enabled: !!user?.employeeId && !!id,
    // Opened from the list: show that row at once (as stale), then refresh it.
    initialData: () =>
      queryClient
        .getQueryData<MyAdvance[]>([...MY_ADVANCES_KEY, 'list', user?.employeeId ?? null])
        ?.find((a) => a.id === id),
    initialDataUpdatedAt: 0,
  });
}

export function useApplyAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyAdvanceInput) => (await api.post('/my/advances', input)).data as MyAdvance,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: MY_ADVANCES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['advances'] });
    },
  });
}
