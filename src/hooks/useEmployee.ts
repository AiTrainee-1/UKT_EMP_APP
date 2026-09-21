import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface ReportingManager {
  id: number;
  name: string;
  designationTitle: string | null;
}

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
  branchName?: string | null;
  branchAddress?: string | null;
  branchLat?: number | null;
  branchLng?: number | null;
  hasPassword?: boolean;
  passwordUpdatedAt?: string | null;
  nationality?: string | null;
  workstation?: string | null;
  zone?: string | null;
  staffTier?: string | null;
  reportingManager?: ReportingManager | null;
  isConfirmed?: boolean;
  confirmationDate?: string | null;
}

// Known Employee.status literals mapped to a friendly badge label. `status`
// stays a free-text field on the backend (see api/models.py) so this is
// display-only formatting, not a schema/validation change — any unmapped
// value just falls back to itself, capitalized.
const STATUS_LABELS: Record<string, string> = {
  active: 'Active Duty',
  on_leave: 'On Leave',
  leave: 'On Leave',
  suspended: 'Suspended',
  probation: 'On Probation',
  resigned: 'Resigned',
  terminated: 'Terminated',
};

export function statusLabel(status?: string | null): string {
  if (!status) return 'Active Duty';
  const key = status.toLowerCase().trim();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return status
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
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

// There is deliberately no "upload profile photo" mutation here.
//
// A photo the employee picks in the app is stored on that device only
// (src/hooks/useLocalProfilePhoto.ts). The photo HR uploads in the HRMS
// portal stays the official one — it's what ID cards, HR screens and
// generated documents use — and the app must never overwrite it.
//
// The mutation that used to live here PATCHed `/my/profile`, an endpoint
// that does not exist on the backend (the only `my/*` routes are
// salary-slips, documents, push-token and resignation). Every attempt
// therefore 404'd and surfaced as a generic "Failed to update photo"
// toast — which is why picking a profile photo never appeared to work.
