import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import api from '../lib/api';
import { getToken } from '../lib/auth';
import { isMediaExpired, mediaCacheFileName, messageKind, type MediaMessageLike } from '../lib/chatMedia';

/**
 * The phone's own copies of chat GIFs and voice messages (owner 2026-11-25).
 *
 * The server serves a file only to members of the channel, with the employee's sign-in, so the app downloads it once
 * (with that sign-in) into the app's cache folder and shows / plays that copy. Once the message has expired the copy
 * is deleted too: an expired GIF or voice message is no longer viewable in the chat. An employee who wants to keep one
 * saves it (a GIF to the phone's photos, a voice message through the share sheet) while it is still there, and then
 * views their saved copy outside the app.
 */

const DIR_NAME = 'chat-media';
/** Copies older than the longest expiry HR can choose are always stale. */
const STALE_AFTER_MS = 91 * 86_400_000;

type MediaMessage = MediaMessageLike & { id: number };

function cacheDir(): Directory {
  return new Directory(Paths.cache, DIR_NAME);
}

function cacheFile(m: MediaMessage): File {
  return new File(cacheDir(), mediaCacheFileName(m.id, messageKind(m), m.media?.mime));
}

/** The server address of a message's file (`media.url` is the same path; the base already ends in /api). */
export function mediaDownloadUrl(id: number): string {
  const base = String(api.defaults.baseURL ?? '').replace(/\/+$/, '');
  return `${base}/chat/messages/${id}/media`;
}

const inflight = new Map<number, Promise<string>>();

export class MediaExpiredError extends Error {
  constructor() {
    super('This has expired and is no longer available.');
    this.name = 'MediaExpiredError';
  }
}

/** The local file:// address of a message's file, downloading it first when the phone has no copy yet. */
export async function ensureLocalMedia(m: MediaMessage): Promise<string> {
  const file = cacheFile(m);
  try {
    if (file.exists && file.size > 0) return file.uri;
  } catch {
    // unreadable: download again below
  }
  const running = inflight.get(m.id);
  if (running) return running;

  const job = (async () => {
    const dir = cacheDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const token = await getToken();
    try {
      const out = await File.downloadFileAsync(mediaDownloadUrl(m.id), file, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        idempotent: true,
      });
      if (!out.exists || !out.size) throw new Error('The file came back empty.');
      return out.uri;
    } catch (err) {
      try {
        if (file.exists) file.delete();
      } catch {
        // nothing more to tidy
      }
      const text = String((err as { message?: unknown })?.message ?? '');
      if (/\b410\b/.test(text)) throw new MediaExpiredError();
      throw err;
    }
  })().finally(() => inflight.delete(m.id));
  inflight.set(m.id, job);
  return job;
}

/**
 * After sending: keep the file the phone already has (the recording / the picked GIF) as that message's copy, so the
 * sender's own bubble needs no download. `move` for a recording (it was only a temporary file), copy for a GIF.
 */
export function adoptLocalMedia(m: MediaMessage, localUri: string, how: 'move' | 'copy'): void {
  try {
    const dir = cacheDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const target = cacheFile(m);
    if (target.exists) return;
    const source = new File(localUri);
    if (!source.exists) return;
    if (how === 'move') source.moveSync(target);
    else source.copySync(target);
  } catch {
    // the bubble downloads it instead
  }
}

/** Deletes the phone's copy of one message's file (it expired). */
export function dropLocalMedia(m: MediaMessage): void {
  try {
    const file = cacheFile(m);
    if (file.exists) file.delete();
  } catch {
    // already gone
  }
}

/**
 * Deletes the phone's copies of every expired message in `messages`, and any copy older than the longest expiry HR
 * can set (a message that scrolled out of reach long ago). Cheap; called when the chat opens and after each poll.
 */
export function pruneLocalMedia(messages: readonly MediaMessage[], now: Date): void {
  for (const m of messages) {
    if (messageKind(m) !== 'text' && isMediaExpired(m, now)) dropLocalMedia(m);
  }
}

export function pruneStaleLocalMedia(now: Date): void {
  try {
    const dir = cacheDir();
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      const modified = entry.modificationTime ?? 0;
      if (modified && now.getTime() - modified > STALE_AFTER_MS) entry.delete();
    }
  } catch {
    // housekeeping only
  }
}

export type LocalMediaStatus = 'loading' | 'ready' | 'error' | 'expired';

/**
 * The local copy of a GIF / voice message for a bubble: downloads it while the message is still available, and
 * deletes it (status "expired") once it is not.
 */
export function useLocalMedia(m: MediaMessage, now: Date): { uri: string | null; status: LocalMediaStatus; retry: () => void } {
  const expired = isMediaExpired(m, now);
  const [state, setState] = useState<{ uri: string | null; status: LocalMediaStatus }>(() => ({
    uri: null,
    status: expired ? 'expired' : 'loading',
  }));
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);

  const mime = m.media?.mime ?? null;
  useEffect(() => {
    if (expired) {
      dropLocalMedia(m);
      setState({ uri: null, status: 'expired' });
      return;
    }
    setState((s) => (s.status === 'ready' && s.uri ? s : { uri: null, status: 'loading' }));
    ensureLocalMedia(m)
      .then((uri) => {
        if (alive.current) setState({ uri, status: 'ready' });
      })
      .catch((err) => {
        if (!alive.current) return;
        setState({ uri: null, status: err instanceof MediaExpiredError ? 'expired' : 'error' });
      });
  }, [m.id, mime, expired, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

export type SaveMediaOutcome = 'saved' | 'shared' | 'cancelled' | 'unavailable';

/** A GIF to the phone's photos (write-only permission); the share sheet when that is refused or not possible. */
export async function saveGifToPhone(uri: string): Promise<SaveMediaOutcome> {
  if (Platform.OS !== 'web') {
    try {
      const MediaLibrary = await import('expo-media-library');
      const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (permission.granted) {
        await MediaLibrary.Asset.create(uri);
        return 'saved';
      }
    } catch {
      // no media library on this build, or the save failed: offer the share sheet instead
    }
  }
  return shareFile(uri, 'image/gif', 'Save this GIF', 'com.compuserve.gif');
}

/** A voice message through the share sheet (Save to Files, Drive, WhatsApp ...). */
export function shareVoiceMessage(uri: string, mime: string | null | undefined): Promise<SaveMediaOutcome> {
  return shareFile(uri, mime || 'audio/mp4', 'Save this voice message', 'public.mpeg-4-audio');
}

async function shareFile(uri: string, mimeType: string, dialogTitle: string, UTI: string): Promise<SaveMediaOutcome> {
  try {
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI });
    return 'shared';
  } catch {
    return 'cancelled';
  }
}
