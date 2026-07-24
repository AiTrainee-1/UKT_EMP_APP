import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface Employee {
  id: number;
  employeeCode: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup?: string | null;
  emergencyContact?: string | null;
  fatherName: string;
  motherName: string;
  employmentType: 'staff' | 'production' | string;
  role?: string;
  joinDate: string;
  departmentName: string;
  designationTitle: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  pfNumber: string;
  esiNumber: string;
  uanNumber: string;
  address: string;
  status: string;
  photoUrl?: string | null;
  locationTrackingEnabled?: boolean;
}

export function useEmployee(employeeId: number | null) {
  return useQuery({
    queryKey: ['employee', employeeId],
    queryFn: async () => {
      const res = await api.get(`/employees/${employeeId}`);
      return res.data as Employee;
    },
    enabled: !!employeeId,
  });
}

export function useUpdateProfilePhoto(employeeId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (localUri: string) => {
      const form = new FormData();
      const filename = localUri.split('/').pop() || 'photo.jpg';
      const ext = filename.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      form.append('photo', { uri: localUri, name: filename, type: mime } as any);

      const res = await api.patch('/my/profile', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as Employee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
    },
  });
}
