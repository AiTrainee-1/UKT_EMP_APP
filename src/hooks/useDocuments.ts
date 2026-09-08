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

export function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'png' || ext === 'jpg' || ext === 'jpeg';
}

async function fetchToFile(doc: EmployeeDocument, dir: typeof Paths.cache) {
  const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const url = `${baseUrl}/employee-documents/${doc.id}/file`;
  const token = await getToken();
  const target = new File(dir, doc.originalFilename);
  return File.downloadFileAsync(url, target, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

/** "View" — downloads to a cache file. For images the caller shows an
 * in-app preview modal; for everything else (PDFs etc., no in-app viewer
 * installed) it opens the native share/Quick-Look sheet instead. */
export async function viewDocument(doc: EmployeeDocument): Promise<string> {
  const downloaded = await fetchToFile(doc, Paths.cache);
  if (!isImageFile(doc.originalFilename)) {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(downloaded.uri, {
        mimeType: mimeTypeFor(doc.originalFilename),
        dialogTitle: doc.originalFilename,
      });
    }
  }
  return downloaded.uri;
}

/** "Download" — saves to the app's persistent document directory (survives
 * across launches, unlike the cache dir View uses) without opening any
 * share sheet. */
export async function downloadDocument(doc: EmployeeDocument): Promise<string> {
  const downloaded = await fetchToFile(doc, Paths.document);
  return downloaded.uri;
}
