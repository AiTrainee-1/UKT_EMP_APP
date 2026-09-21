import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export type FamilyRelation = 'spouse' | 'child' | 'father' | 'mother' | 'sibling' | 'other';

export const RELATION_LABEL: Record<FamilyRelation, string> = {
  spouse: 'Spouse',
  child: 'Child',
  father: 'Father',
  mother: 'Mother',
  sibling: 'Sibling',
  other: 'Other',
};

export interface FamilyDependent {
  id: number;
  name: string;
  relation: FamilyRelation;
  dateOfBirth: string | null;
  isInsuranceNominee: boolean;
  coveredUnderHealthScheme: boolean;
}

export function useFamily(employeeId: number | null) {
  return useQuery({
    queryKey: ['family', employeeId],
    queryFn: async (): Promise<FamilyDependent[]> => {
      const res = await api.get('/my/family');
      return res.data?.dependents ?? [];
    },
    enabled: !!employeeId,
  });
}
