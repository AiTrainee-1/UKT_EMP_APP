import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { onlineManager } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loginOptionsRequest, type LoginOptions } from './useAuth';
import { normalizeOtpChannel, type OtpChannel } from '../lib/otp';

/** Focus and coming to the front often arrive together: one request for both. */
const RELOAD_GAP_MS = 1500;

/**
 * GET /auth/login-options for the sign-in screens, always fresh: HR switches WhatsApp codes and SMS codes on and off
 * (WhatsApp Control / SMS Control) and the screens must follow at once. So nothing is cached: it is asked again every
 * time the screen comes into view, every time the app comes back to the front (the employee was reading the code in
 * WhatsApp or Messages, or HR changed something meanwhile), when the phone comes back online without an answer yet,
 * and whenever a screen calls `reload` (a code request was refused because its channel was switched off).
 *
 * `options` stays null until the first answer; a later failed reload keeps the last answer. `failed` = the server
 * could not be asked and there is no answer at all (the screens then try a code anyway, as before).
 * `onLoaded(next, previous)` runs after every answer (the sign-in screen uses it to pick its form).
 */
export function useLoginOptions(onLoaded?: (next: LoginOptions, previous: LoginOptions | null) => void) {
  const [options, setOptions] = useState<LoginOptions | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef<LoginOptions | null>(null);
  const callback = useRef(onLoaded);
  callback.current = onLoaded;
  // Answers can arrive out of order: an older answer never replaces a newer one.
  const sent = useRef(0);
  const applied = useRef(0);
  const lastStart = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async (force = true) => {
    const now = Date.now();
    if (!force && now - lastStart.current < RELOAD_GAP_MS) return;
    lastStart.current = now;
    const mine = ++sent.current;
    try {
      const next = await loginOptionsRequest();
      if (!mounted.current || mine < applied.current) return;
      applied.current = mine;
      const previous = latest.current;
      latest.current = next;
      setOptions(next);
      setFailed(false);
      callback.current?.(next, previous);
    } catch {
      if (mounted.current && !latest.current) setFailed(true);
    }
  }, []);

  // The screen came into view (also its first showing).
  useFocusEffect(
    useCallback(() => {
      void reload(false);
    }, [reload]),
  );

  // The app came back to the front.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload(false);
    });
    return () => subscription.remove();
  }, [reload]);

  // Opened without internet: ask once the phone is back online (src/lib/networkStatus.ts feeds TanStack's onlineManager).
  useEffect(
    () =>
      onlineManager.subscribe((online) => {
        if (online && !latest.current) void reload(false);
      }),
    [reload],
  );

  return { options, failed, reload: () => reload(true) };
}

const CHANNEL_KEY = 'uktex.otpChannel';

/**
 * The channel the employee picked last time on this phone ('whatsapp' | 'sms'), so that with both on the main button
 * is the one they use. Only a preference: never the code, never the number. Storage trouble is ignored (no
 * preference = the server's order).
 */
export function useRememberedOtpChannel() {
  const [channel, setChannel] = useState<OtpChannel | null>(null);

  useEffect(() => {
    let alive = true;
    try {
      AsyncStorage.getItem(CHANNEL_KEY)
        .then((value) => {
          if (alive) setChannel((current) => current ?? normalizeOtpChannel(value));
        })
        .catch(() => {});
    } catch {
      // No storage: no preference.
    }
    return () => {
      alive = false;
    };
  }, []);

  const remember = useCallback((next: OtpChannel) => {
    setChannel(next);
    try {
      AsyncStorage.setItem(CHANNEL_KEY, next).catch(() => {});
    } catch {
      // Not saved: the order simply stays the server's next time.
    }
  }, []);

  return { channel, remember };
}
