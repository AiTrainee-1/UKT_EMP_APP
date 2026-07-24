import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from '../lib/api';
import { getToken } from '../lib/auth';

export interface EmployeeDocument {
  id: number;
  employeeId: number;
  category: string;
  categoryLabel: string;
  originalFilename: string;
  uploadedBy: string | null;
  uploadedAt: string | null;
  fileUrl: string;
}

/** GET /my/documents — self-scoped for employee tokens. */
export function useDocuments() {
  return useQuery({
    queryKey: ['my-documents'],
    queryFn: async () => {
      const res = await api.get('/my/documents');
      return res.data as EmployeeDocument[];
    },
  });
}

function mimeTypeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

/** Downloads a document (image or PDF) to a cache file, then opens the
 * native share sheet — same pattern as downloadAndShareSalarySlip. The
 * request carries the Bearer token manually since this bypasses the axios
 * instance; the endpoint is authenticated (owner employee or HR only). */
export async function downloadAndShareDocument(doc: EmployeeDocument) {
  const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const url = `${baseUrl}/employee-documents/${doc.id}/file`;
  const token = await getToken();
  const target = new File(Paths.cache, doc.originalFilename);

  const downloaded = await File.downloadFileAsync(url, target, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: mimeTypeFor(doc.originalFilename),
      dialogTitle: doc.originalFilename,
    });
  }
  return downloaded.uri;
}
