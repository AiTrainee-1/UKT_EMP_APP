import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from '../lib/api';
import { getToken } from '../lib/auth';
import {
  NO_VIEWER,
  cacheFileName,
  folderLabel,
  isPreviewableImage,
  mimeTypeFor,
  safeFileName,
} from '../lib/documents';

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

/** GET /my/documents — self-scoped for employee tokens. Errors stay errors (the screen shows "Try again"). */
export function useDocuments() {
  return useQuery({
    queryKey: ['my-documents'],
    queryFn: async () => {
      const res = await api.get('/my/documents');
      return (Array.isArray(res.data) ? res.data : []) as EmployeeDocument[];
    },
  });
}

/**
 * Temporary copies live in their own folder inside the app's cache, so they can all be removed
 * in one go when the employee leaves the screen. PAN / Aadhaar / passbook scans should not sit
 * on the phone longer than needed.
 */
const CACHE_FOLDER = 'uktex-documents';

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, CACHE_FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Deletes every temporary document copy. Safe to call any time (does nothing if there are none). */
export function clearDocumentCache(): void {
  try {
    const dir = new Directory(Paths.cache, CACHE_FOLDER);
    if (dir.exists) dir.delete();
  } catch {
    /* best effort: the OS also clears the cache when space runs low */
  }
}

/**
 * Earlier app versions kept "View" copies in the cache root under the plain file name. Remove
 * those for the documents we know about (cache only; nothing the employee saved themselves).
 */
export function removeLegacyCacheCopies(docs: readonly EmployeeDocument[] | null | undefined): void {
  for (const doc of docs ?? []) {
    try {
      if (!doc.originalFilename || /[\\/]/.test(doc.originalFilename)) continue;
      const old = new File(Paths.cache, doc.originalFilename);
      if (old.exists) old.delete();
    } catch {
      /* best effort */
    }
  }
}

/**
 * Downloads the file into the temporary folder, under a name that starts with the document id
 * (so two "scan.pdf" files never collide). Re-opening the same document reuses the copy; a
 * failed download leaves nothing half-written behind. Fixes the old "Could not open file" on the
 * second tap, which came from the download refusing to overwrite an existing file.
 */
async function fetchToCache(doc: EmployeeDocument): Promise<File> {
  const target = new File(cacheDir(), cacheFileName(doc));
  try {
    if (target.exists && (target.size ?? 0) > 0) return target;
  } catch {
    /* fall through and download again */
  }
  const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const url = `${baseUrl}/employee-documents/${doc.id}/file`;
  const token = await getToken();
  try {
    return await File.downloadFileAsync(url, target, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      idempotent: true,
    });
  } catch (err) {
    try {
      if (target.exists) target.delete();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function shareOptions(doc: EmployeeDocument, dialogTitle: string): Sharing.SharingOptions {
  // On iOS a mimeType can rename the file ("x.pdf.jpeg"); the cached copy already has the right extension.
  return Platform.OS === 'android'
    ? { mimeType: mimeTypeFor(doc.originalFilename), dialogTitle }
    : { dialogTitle };
}

export type OpenResult =
  | { type: 'image'; uri: string }
  /** Handed to the phone's viewer (Quick Look on iPhone, a PDF / file app on Android). */
  | { type: 'opened' }
  /** No viewer could be started; the share sheet was shown instead. */
  | { type: 'shared' };

/**
 * "Open": photos open in the app's own zoomable viewer; PDFs and other files open in the
 * phone's viewer. Only when no viewer exists does it fall back to the share sheet.
 */
export async function openDocument(doc: EmployeeDocument): Promise<OpenResult> {
  const file = await fetchToCache(doc);
  if (isPreviewableImage(doc.originalFilename)) return { type: 'image', uri: file.uri };

  const mimeType = mimeTypeFor(doc.originalFilename);
  try {
    // `preview` needs the current native file-system module; an older build simply skips this.
    if (typeof file.preview === 'function' && (await file.canPreview({ mimeType }))) {
      await file.preview({ title: doc.originalFilename, mimeType });
      return { type: 'opened' };
    }
  } catch {
    /* fall back to the share sheet */
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, shareOptions(doc, doc.originalFilename));
    return { type: 'shared' };
  }
  throw new Error(NO_VIEWER);
}

/** "Share": the phone's share sheet (WhatsApp, email, Drive …). */
export async function shareDocument(doc: EmployeeDocument): Promise<void> {
  const file = await fetchToCache(doc);
  if (!(await Sharing.isAvailableAsync())) throw new Error(NO_VIEWER);
  await Sharing.shareAsync(file.uri, shareOptions(doc, `Share ${doc.originalFilename}`));
}

export type SaveResult =
  /** Written into a folder the employee picked (Android). */
  | { type: 'saved'; folder: string; fileName: string }
  /** The share sheet was shown so the employee could choose "Save to Files" / a folder (iPhone). */
  | { type: 'shared' }
  | { type: 'cancelled' };

/**
 * "Save to phone": a copy the employee can find later, outside the app.
 * Android: the system folder picker (e.g. Download), then the file is written there.
 * iPhone (and Android if the picker is unavailable): the share sheet, which has "Save to Files".
 * The old version saved into the app's private folder, where nobody could ever find it.
 */
export async function saveDocumentCopy(doc: EmployeeDocument): Promise<SaveResult> {
  const file = await fetchToCache(doc);

  if (Platform.OS === 'android') {
    let dir: Directory | null = null;
    try {
      dir = await Directory.pickDirectoryAsync();
    } catch (err) {
      // Closing the picker rejects; treat anything that is not clearly "unavailable" as a cancel.
      const msg = String((err as { message?: unknown })?.message ?? '');
      if (!/not (available|supported)|unavailable/i.test(msg)) return { type: 'cancelled' };
    }
    if (dir) {
      const fileName = safeFileName(doc.originalFilename);
      const out = dir.createFile(fileName, mimeTypeFor(doc.originalFilename));
      const bytes = await file.bytes();
      await out.write(bytes);
      return { type: 'saved', folder: folderLabel(dir.uri), fileName: out.name || fileName };
    }
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error(NO_VIEWER);
  await Sharing.shareAsync(file.uri, shareOptions(doc, `Save ${doc.originalFilename}`));
  return { type: 'shared' };
}
