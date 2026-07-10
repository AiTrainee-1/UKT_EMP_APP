import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface IdCardCompany {
  name?: string;
  address?: string;
  logo?: string | null;
  signature?: string | null;
}

export interface IdCardTemplate {
  primaryColor: string;
  secondaryColor: string;
  textColor?: string;
  fontFamily?: string;
  backgroundStyle?: string;
  logoPosition?: string;
  cornerStyle?: string;
  showQrOnBack: boolean;
  footerText?: string;
}

export interface IdCardData {
  id: number;
  code: string;
  name: string;
  designation: string;
  department: string;
  employmentType: 'staff' | 'production' | string;
  photoUrl: string | null;
  bloodGroup?: string | null;
  dateOfBirth?: string | null;
  emergencyContact?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  joinDate: string;
  status?: string;
  company?: IdCardCompany;
  template?: IdCardTemplate;
}

const DEFAULT_TEMPLATE: IdCardTemplate = {
  primaryColor: '#006496',
  secondaryColor: '#4FB8F0',
  textColor: '#0f172a',
  showQrOnBack: true,
};

export function useIdCard(employeeId: number | null) {
  return useQuery({
    queryKey: ['idcard', employeeId],
    queryFn: async (): Promise<IdCardData> => {
      const res = await api.get('/idcard', { params: { employeeId } });
      const d = res.data ?? {};
      return {
        id: d.id,
        code: d.code ?? d.employeeCode,
        name: d.name,
        designation: d.designation,
        department: d.department,
        employmentType: d.employmentType ?? 'staff',
        photoUrl: d.photoUrl ?? null,
        bloodGroup: d.bloodGroup,
        dateOfBirth: d.dateOfBirth,
        emergencyContact: d.emergencyContact,
        address: d.address,
        phone: d.phone,
        email: d.email,
        joinDate: d.joinDate,
        status: d.status,
        company: d.company,
        template: { ...DEFAULT_TEMPLATE, ...(d.template ?? {}) },
      };
    },
    enabled: !!employeeId,
  });
}

/** Template/branding fallback — GET /idcard-settings is open to any authenticated user. */
export function useIdCardSettings() {
  return useQuery({
    queryKey: ['idcard-settings'],
    queryFn: async (): Promise<{ company?: IdCardCompany; template?: IdCardTemplate } | null> => {
      try {
        const res = await api.get('/idcard-settings');
        return res.data ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
  });
}
