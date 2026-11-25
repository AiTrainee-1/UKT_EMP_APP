import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SHOW_KEY = 'uktextiles.homeSalaryShown.v1';

/**
 * Home's salary eye: amounts are HIDDEN by default (Home is opened at the gate and on the shop floor, in front of
 * others), the eye shows them and the phone remembers the choice. Shared (owner 2026-11-25): the Last salary card and
 * My Insights follow the same eye, so tapping it on either one shows or hides the amounts on both.
 */
let shown = false;
let loaded = false;
const listeners = new Set<(v: boolean) => void>();

function publish(v: boolean) {
  shown = v;
  listeners.forEach((l) => l(v));
}

export function useSalaryShown(): [boolean, () => void] {
  const [value, setValue] = useState(shown);

  useEffect(() => {
    listeners.add(setValue);
    setValue(shown);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(SHOW_KEY)
        .then((v) => publish(v === '1'))
        .catch(() => { /* stays hidden */ });
    }
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !shown;
    publish(next);
    AsyncStorage.setItem(SHOW_KEY, next ? '1' : '0').catch(() => { /* only a preference */ });
  }, []);

  return [value, toggle];
}
