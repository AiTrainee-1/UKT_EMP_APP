import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from '../lib/api';
import { getToken } from '../lib/auth';

// Field names here must match salary_slip_views.py::slip_json exactly — this
// interface previously declared several fields (basicSalary, department,
// advanceRecovered, lateDeductions, status) that don't exist in the actual
// response, so they were silently undefined at runtime (Basic Salary/Total
// Earnings/Total Deductions all rendered as ₹0 instead of the real amounts).
export interface SalarySlip {
  id: number;
  month: number;
  year: number;
  netSalary: number;
  basic: number;
  hra: number;
  allowances: number;
  pfDeduction: number;
  esiDeduction: number;
  advanceDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  employeeName: string;
  employeeCode: string;
  departmentName: string | null;
  // No "status" field exists on the backend — there's no Paid/Generated
  // distinction tracked. emailedAt is the one real, meaningful signal:
  // present once HR has emailed the slip out.
  emailedAt: string | null;
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
