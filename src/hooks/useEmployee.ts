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
