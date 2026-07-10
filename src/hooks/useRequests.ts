import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface PermissionRequest {
  id: number;
  type: 'Early Out' | 'Late In' | 'Short Leave';
  date: string;
  time: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedOn: string;
}

export interface PermissionsResult {
  items: PermissionRequest[];
  monthlyUsed: number;
  monthlyLimit: number;
}

export function usePermissions(employeeId: number | null, month?: number, year?: number) {
  return useQuery({
    queryKey: ['permissions', employeeId, month, year],
    queryFn: async (): Promise<PermissionsResult> => {
      const res = await api.get('/permissions', { params: { employeeId, month, year } });
      const raw = res.data;
      const items: PermissionRequest[] = Array.isArray(raw) ? raw : (raw?.items ?? raw?.results ?? []);
      return {
        items,
        monthlyUsed: raw?.monthlyUsed ?? items.filter((r) => r.status !== 'Rejected').length,
        monthlyLimit: raw?.monthlyLimit ?? 3,
      };
    },
    enabled: !!employeeId,
  });
}

export function useSubmitPermission(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      type: string;
      date: string;
      time: string;
      reason: string;
    }) => {
      const res = await api.post('/permissions', { employeeId, ...data });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', employeeId] });
    },
  });
}
