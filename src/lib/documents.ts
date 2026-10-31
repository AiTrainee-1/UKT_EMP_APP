/**
 * Pure helpers for "My Documents" (no React, no file system) so they are tested with `npm test`.
 */

export interface DocumentLike {
  id: number;
  category: string;
  categoryLabel: string;
  originalFilename: string;
  uploadedAt: string | null;
}

export type FileKind = 'pdf' | 'image' | 'word' | 'sheet' | 'other';

export function extensionOf(filename: string | null | undefined): string {
  const name = (filename ?? '').trim();
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function fileKind(filename: string | null | undefined): FileKind {
  const ext = extensionOf(filename);
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif'].includes(ext)) return 'image';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'word';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheet';
  return 'other';
}

/** Images the app can show itself (React Native's Image decodes these on both platforms). */
export function isPreviewableImage(filename: string | null | undefined): boolean {
  return ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extensionOf(filename));
}

export function mimeTypeFor(filename: string | null | undefined): string {
  switch (extensionOf(filename)) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'heic': return 'image/heic';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls': return 'application/vnd.ms-excel';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv': return 'text/csv';
    case 'txt': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

/** What the file is, in words, for the row and for screen readers. */
export function kindLabel(kind: FileKind): string {
  switch (kind) {
    case 'pdf': return 'PDF';
    case 'image': return 'Photo';
    case 'word': return 'Word file';
    case 'sheet': return 'Spreadsheet';
    default: return 'File';
  }
}

/**
 * A file name that is safe to use on the phone: no folder separators or characters Android /
 * iOS reject, no leading dots, not too long, and it keeps its extension. HR types these names,
 * so they can contain anything.
 */
export function safeFileName(name: string | null | undefined, fallback = 'document'): string {
  const raw = (name ?? '').normalize('NFC');
  const ext = extensionOf(raw);
  const base = ext ? raw.slice(0, raw.length - ext.length - 1) : raw;
  const cleanBase = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s_]+/, '')
    .trim()
    .slice(0, 80)
    .trim();
  const cleanExt = ext.replace(/[^a-z0-9]/g, '').slice(0, 8);
  const finalBase = cleanBase || fallback;
  return cleanExt ? `${finalBase}.${cleanExt}` : finalBase;
}

/**
 * The name of the temporary copy used for opening a document. It starts with the document id,
 * so two documents called "scan.pdf" never overwrite each other.
 */
export function cacheFileName(doc: Pick<DocumentLike, 'id' | 'originalFilename'>): string {
  return `doc-${doc.id}-${safeFileName(doc.originalFilename)}`;
}

export interface CategoryGroup<T extends DocumentLike> {
  category: string;
  categoryLabel: string;
  files: T[];
}

function time(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Groups by category (in the order HR's categories first appear), newest file first in each. */
export function groupByCategory<T extends DocumentLike>(docs: readonly T[] | null | undefined): CategoryGroup<T>[] {
  const groups = new Map<string, CategoryGroup<T>>();
  for (const doc of docs ?? []) {
    const key = doc.category || 'other';
    if (!groups.has(key)) {
      groups.set(key, { category: key, categoryLabel: doc.categoryLabel || 'Other', files: [] });
    }
    groups.get(key)!.files.push(doc);
  }
  for (const g of groups.values()) {
    g.files.sort((a, b) => time(b.uploadedAt) - time(a.uploadedAt) || b.id - a.id);
  }
  return [...groups.values()];
}

/**
 * The filter chip that should be shown as selected. A category that no longer exists (HR
 * removed its last file and the list refreshed) falls back to "All" instead of leaving an
 * empty screen with no chip to clear it.
 */
export function resolveActiveCategory(active: string | null, groups: readonly { category: string }[]): string | null {
  if (!active) return null;
  return groups.some((g) => g.category === active) ? active : null;
}

/** The newest upload date across all documents (for "Last updated" in the summary). */
export function latestUpload(docs: readonly DocumentLike[] | null | undefined): string | null {
  let best: string | null = null;
  let bestT = 0;
  for (const d of docs ?? []) {
    const t = time(d.uploadedAt);
    if (t > bestT) {
      bestT = t;
      best = d.uploadedAt;
    }
  }
  return best;
}

/**
 * A readable folder name from a folder the employee picked (an Android "content://" address
 * like ".../tree/primary%3ADownload" or a plain path), for "Saved to Download".
 */
export function folderLabel(uri: string | null | undefined): string {
  if (!uri) return 'the folder you chose';
  let s = uri;
  try {
    s = decodeURIComponent(uri);
  } catch {
    /* keep the raw text */
  }
  s = s.replace(/\/+$/, '');
  const afterColon = s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s;
  const last = afterColon.split('/').filter(Boolean).pop();
  if (!last || /^(primary|tree|document)$/i.test(last)) return 'your phone storage';
  return last;
}

/** Thrown by the app itself when the phone has no app that can show a file and cannot share it. */
export const NO_VIEWER = 'NO_VIEWER';

/**
 * Plain-English title and message for a failed open / save / share. The file library reports
 * an HTTP failure as an error whose message includes the status code.
 */
export function describeFileError(err: unknown): { title: string; message: string } {
  const text = String((err as { message?: unknown })?.message ?? err ?? '');
  if (text.includes(NO_VIEWER)) {
    return {
      title: 'No app to open this file',
      message: 'This phone has no app that can open this type of file. Install a PDF or file viewer (for example Google Drive) and try again, or use Save.',
    };
  }
  if (/\b404\b/.test(text)) {
    return { title: 'File not found', message: 'This document is no longer on the server. Pull down to refresh the list.' };
  }
  if (/\b(401|403)\b/.test(text)) {
    return { title: 'Not allowed', message: 'You no longer have access to this file. Please contact HR.' };
  }
  if (/space|storage|ENOSPC/i.test(text)) {
    return { title: 'Not enough space', message: 'Your phone is out of storage space. Free up some space and try again.' };
  }
  return { title: 'Couldn’t get the file', message: 'Check your internet connection and try again.' };
}

/** "12 Mar 2026" — written out so tests do not need a date library. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
