import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface Employee {
  id: number;
  employeeCode: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  fatherName: string;
  motherName: string;
  employmentType: string;
  joinDate: string;
  department: string;
  designation: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  pfNumber: string;
  esiNumber: string;
  uanNumber: string;
  address: string;
  status: string;
  photo?: string;
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
