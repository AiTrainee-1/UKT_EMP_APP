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
 */
const keyFor = (employeeId: number) => `profilePhoto:${employeeId}`;

export function useLocalProfilePhoto(employeeId: number | null) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (employeeId == null) {
        setPhoto(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const stored = await AsyncStorage.getItem(keyFor(employeeId));
        if (!cancelled) setPhoto(stored);
      } catch {
        if (!cancelled) setPhoto(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const savePhoto = useCallback(
    async (dataUri: string) => {
      if (employeeId == null) return;
      await AsyncStorage.setItem(keyFor(employeeId), dataUri);
      setPhoto(dataUri);
    },
    [employeeId],
  );

  const clearPhoto = useCallback(async () => {
    if (employeeId == null) return;
    await AsyncStorage.removeItem(keyFor(employeeId));
    setPhoto(null);
  }, [employeeId]);

  return { photo, savePhoto, clearPhoto, isLoading };
}
