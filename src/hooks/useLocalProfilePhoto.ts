import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The employee's profile photo as chosen on THIS device.
 *
 * Deliberately never sent to the server. The photo HR uploads in the HRMS
 * portal stays the official one — it's what appears on ID cards, HR screens
 * and generated documents — while this is a personal, device-local override
 * the employee picks for themselves. Two consequences, both intentional:
 *
 *   - Setting a photo here never alters anything in the portal.
 *   - Once set it keeps winning over the portal photo *on this device*, even
 *     if HR later replaces the portal copy. Clearing it falls back to the
 *     portal photo again.
 *
 * Stored as a base64 data URI rather than the image picker's `file://` URI:
 * that URI points into the app's cache directory, which the OS may purge at
 * any time, so the photo would silently vanish. Keyed per employee so a
 * shared device never shows one person's photo to the next person to log in.
 *
 * Shared by every screen that shows the photo (owner 2026-11-25: the Home header shows it too): the value is read from
 * the phone once per employee and kept here, and a change on Profile reaches the Home header at once.
 */
const keyFor = (employeeId: number) => `profilePhoto:${employeeId}`;

type Entry = { photo: string | null; loaded: boolean };
const cache = new Map<number, Entry>();
const listeners = new Set<() => void>();
const reading = new Set<number>();

function publish(employeeId: number, photo: string | null) {
  cache.set(employeeId, { photo, loaded: true });
  listeners.forEach((l) => l());
}

function ensureRead(employeeId: number) {
  if (cache.get(employeeId)?.loaded || reading.has(employeeId)) return;
  reading.add(employeeId);
  AsyncStorage.getItem(keyFor(employeeId))
    .then((stored) => publish(employeeId, stored))
    .catch(() => publish(employeeId, null))
    .finally(() => reading.delete(employeeId));
}

export function useLocalProfilePhoto(employeeId: number | null) {
  const read = () => (employeeId == null ? { photo: null, loaded: true } : cache.get(employeeId) ?? { photo: null, loaded: false });
  const [entry, setEntry] = useState<Entry>(read);

  useEffect(() => {
    const sync = () => setEntry(read());
    listeners.add(sync);
    sync();
    if (employeeId != null) ensureRead(employeeId);
    return () => {
      listeners.delete(sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const savePhoto = useCallback(
    async (dataUri: string) => {
      if (employeeId == null) return;
      await AsyncStorage.setItem(keyFor(employeeId), dataUri);
      publish(employeeId, dataUri);
    },
    [employeeId],
  );

  const clearPhoto = useCallback(async () => {
    if (employeeId == null) return;
    await AsyncStorage.removeItem(keyFor(employeeId));
    publish(employeeId, null);
  }, [employeeId]);

  return { photo: entry.photo, savePhoto, clearPhoto, isLoading: !entry.loaded };
}
