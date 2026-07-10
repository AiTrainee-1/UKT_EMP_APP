import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface ResignationStatus {
  id: number;
  status: 'pending' | 'dept_approved' | 'approved' | 'rejected';
  reason: string;
  lastWorkingDate: string | null;
  deptHeadStatus: 'approved' | 'rejected' | null;
  hrComment: string | null;
  rejectedBy: 'dept_head' | 'hr' | null;
  surveyQ1Answer: string | null;
  surveyQ2Answer: string | null;
  surveyQ3Answer: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface SubmitResignationPayload {
  reason: string;
  last_working_date?: string | null;
  survey_q1_answer?: string;
  survey_q2_answer?: string;
  survey_q3_answer?: string;
}

export function useMyResignation(employeeId: number | null) {
  return useQuery({
    queryKey: ['my-resignation'],
    queryFn: async (): Promise<ResignationStatus | null> => {
      try {
        const res = await api.get('/my/resignation');
        return res.data ?? null;
      } catch (e: any) {
        // 404 means no resignation on record — not an error
        if (e?.response?.status === 404) return null;
        throw e;
      }
    },
    enabled: !!employeeId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useSubmitResignation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SubmitResignationPayload) => {
      const res = await api.post('/my/resignation', payload);
      return res.data as ResignationStatus;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-resignation'] });
    },
  });
}
