import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from '../lib/api';
import { getToken } from '../lib/auth';
import {
  normalizeInsights,
  normalizePeriod,
  slipPdfFileName,
  slipPeriodLabel,
  type SalaryInsights,
  type SalaryPeriod,
} from '../lib/salaryInsights';
import { useAuth } from './useAuth';

export type { SalaryInsights, SalaryPeriod } from '../lib/salaryInsights';

// Field names here must match salary_slip_views.py::slip_json exactly — this
// interface previously declared several fields (basicSalary, department,
// advanceRecovered, lateDeductions, status) that don't exist in the actual
// response, so they were silently undefined at runtime (Basic Salary/Total
// Earnings/Total Deductions all rendered as ₹0 instead of the real amounts).
export interface SalarySlip {
  id: number;
  month: number;
  year: number;
  /** A production slip's pay period (null for a monthly staff slip) and its pay cycle (weekly | biweekly | monthly). */
  weekNumber?: number | null;
  payCycle?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  slipNumber?: string | null;
  netSalary: number;
  basic: number;
  hra: number;
  allowances: number;
  incentives?: number;
  bonuses?: number;
  otAmount?: number;
  grossSalary?: number;
  pfDeduction: number;
  esiDeduction: number;
  tdsDeduction?: number;
  tdsPercent?: number | null;
  advanceDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  paidLeaveDays?: number;
  unpaidLeaveDays?: number;
  lateDays: number;
  employeeName: string;
  employeeCode: string;
  departmentName: string | null;
  designationTitle?: string | null;
  employmentType?: string | null;
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
      // The bare list (no `page` sent). Anything else is an error, never "no slips": a failed load must not read as
      // "payroll not generated".
      if (!Array.isArray(res.data)) throw new Error('Unexpected reply from /my/salary-slips');
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
    enabled: id != null && Number.isFinite(id) && id > 0,
  });
}

/**
 * GET /my/salary-insights?year=: allocated vs earned vs payable for every pay period of the year, and the year's totals.
 * Every figure is what payroll stored (backend/api/mobile_pay.py). `year` null = the server's default (the latest year
 * with slips). A reply that is not the contract is an ERROR (Retry), never an empty year.
 */
export function useSalaryInsights(year: number | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['salary-insights', user?.employeeId ?? null, year],
    queryFn: async (): Promise<SalaryInsights> => {
      const res = await api.get('/my/salary-insights', { params: year ? { year } : undefined });
      const data = normalizeInsights(res.data);
      if (!data) throw new Error('Unexpected reply from /my/salary-insights');
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}

/** GET /my/salary-slips/<id>/breakdown: one slip as a waterfall, every line explained. */
export function useSalaryBreakdown(id: number | null) {
  return useQuery({
    queryKey: ['salary-breakdown', id],
    queryFn: async (): Promise<SalaryPeriod> => {
      const res = await api.get(`/my/salary-slips/${id}/breakdown`);
      const data = normalizePeriod(res.data);
      if (!data) throw new Error('Unexpected reply from the salary breakdown');
      return data;
    },
    enabled: id != null && Number.isFinite(id) && id > 0,
    staleTime: 60_000,
  });
}

/** Downloads the slip PDF to a cache file, then opens the native share sheet
 * (the standard way to persist/export a file from a sandboxed mobile app).
 * The file is named after the slip number, so two weekly slips of one month never collide, and a second download of
 * the same slip overwrites the first (`idempotent`) instead of failing with "DestinationAlreadyExists". */
export async function downloadAndShareSalarySlip(slip: SalarySlip) {
  const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const url = `${baseUrl}/salary-slips/${slip.id}/pdf`;
  const token = await getToken();
  const target = new File(Paths.cache, slipPdfFileName(slip));

  const downloaded = await File.downloadFileAsync(url, target, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    idempotent: true,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Salary Slip — ${slipPeriodLabel(slip)}`,
    });
  }
  return downloaded.uri;
}
