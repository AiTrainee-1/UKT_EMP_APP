import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from '../lib/api';
import { getToken } from '../lib/auth';

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

/** Downloads the slip PDF to a cache file, then opens the native share sheet
 * (the standard way to persist/export a file from a sandboxed mobile app). */
export async function downloadAndShareSalarySlip(slip: SalarySlip) {
  const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const url = `${baseUrl}/salary-slips/${slip.id}/pdf`;
  const token = await getToken();
  const filename = `salary-slip-${slip.month}-${slip.year}.pdf`;
  const target = new File(Paths.cache, filename);

  const downloaded = await File.downloadFileAsync(url, target, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Salary Slip — ${slip.month}/${slip.year}`,
    });
  }
  return downloaded.uri;
}
