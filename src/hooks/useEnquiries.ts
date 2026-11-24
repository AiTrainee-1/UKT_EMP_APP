import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import api from '../lib/api';
import { sendOrQueue } from '../offline/submit';
import { useAuth } from './useAuth';

/**
 * Enquiries (owner 2026-11-24, replaced "Ask HR"): a question / concern to HR, handled on the HR portal's Enquiries page
 * as a to-do list. backend/api/enquiry_views.py:
 *   GET  /my/enquiries   my enquiries, newest first (status pending | on_hold | done, HR's reply, the history)
 *   POST /my/enquiries   {category, subject, message}
 * Every status change / reply from HR comes as a push notification (type "enquiry") that opens the enquiry here.
 */
export type EnquiryStatus = 'pending' | 'on_hold' | 'done';

export interface Enquiry {
  id: number;
  category: string;
  categoryLabel: string;
  subject: string;
  message: string;
  status: EnquiryStatus | string;
  statusLabel: string;
  hrReply: string | null;
  handledBy: string | null;
  handledAt: string | null;
  doneAt: string | null;
  history: { at: string; by: string; status: string; reply: string | null }[];
  createdAt: string | null;
}

export const ENQUIRY_CATEGORIES: { key: string; label: string; hint: string; icon: string }[] = [
  { key: 'general', label: 'General question', hint: 'Anything for HR', icon: 'help-circle-outline' },
  { key: 'salary', label: 'Salary & deductions', hint: 'Pay, PF / ESI, Form 16 ...', icon: 'cash-multiple' },
  { key: 'attendance', label: 'Attendance & shift', hint: 'A wrong day, punch or shift', icon: 'calendar-clock' },
  { key: 'leave', label: 'Leave & holidays', hint: 'Balances, holidays, rules', icon: 'umbrella-outline' },
  { key: 'documents', label: 'Documents & letters', hint: 'Certificates, letters, ID', icon: 'file-document-outline' },
  { key: 'other', label: 'Something else', hint: 'Any other concern', icon: 'dots-horizontal-circle-outline' },
];

export const ENQUIRY_STATUS: Record<string, { label: string; employeeText: string }> = {
  pending: { label: 'Pending', employeeText: 'Waiting for HR' },
  on_hold: { label: 'On Hold', employeeText: 'HR put it on hold' },
  done: { label: 'Done', employeeText: 'Resolved by HR' },
};

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 200;
export const MESSAGE_MAX = 2000;

export function enquiryProblem(subject: string, message: string): string | null {
  const s = subject.trim();
  if (s.length < SUBJECT_MIN) return `Write a subject (at least ${SUBJECT_MIN} characters).`;
  if (s.length > SUBJECT_MAX) return `The subject can be at most ${SUBJECT_MAX} characters.`;
  if (message.length > MESSAGE_MAX) return `The details can be at most ${MESSAGE_MAX} characters.`;
  return null;
}

export function useMyEnquiries() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['enquiries', user?.employeeId ?? null],
    enabled: !!user?.employeeId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Enquiry[]> => {
      const res = await api.get('/my/enquiries');
      return Array.isArray(res.data) ? (res.data as Enquiry[]) : [];
    },
  });
}

export function useRaiseEnquiry() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const employeeId = user?.employeeId ?? null;
  return useMutation({
    mutationFn: async (input: { category: string; subject: string; message: string }) =>
      sendOrQueue<Enquiry>({
        kind: 'enquiry.submit',
        label: `Enquiry · ${input.subject.trim()}`,
        url: '/my/enquiries',
        body: { category: input.category, subject: input.subject.trim(), message: input.message.trim() },
        invalidate: [['enquiries', employeeId]],
        meta: { category: input.category, subject: input.subject.trim() },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['enquiries', employeeId] });
    },
  });
}
