import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface SalarySlip {
  id: number;
  month: number;
  year: number;
  netSalary: number;
  status: 'Generated' | 'Paid';
  basicSalary: number;
  hra: number;
  allowances: number;
  pfDeduction: number;
  esiDeduction: number;
  advanceRecovered: number;
  lateDeductions: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  employeeName: string;
  employeeCode: string;
  department: string;
}

export function useSalarySlips() {
  return useQuery({
    queryKey: ['salary-slips'],
    queryFn: async () => {
      const res = await api.get('/my/salary-slips');
      return res.data as SalarySlip[];
    },
  });
}

export function useSalarySlip(id: number | null) {
  return useQuery({
    queryKey: ['salary-slip', id],
    queryFn: async () => {
      const res = await api.get(`/salary-slips/${id}`);
      return res.data as SalarySlip;
    },
    enabled: !!id,
  });
}
