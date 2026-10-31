import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';

/**
 * True when the phone's "Reduce motion" / "Remove animations" setting is on. Screens use it to
 * skip decorative movement (the ID-card flip becomes an instant swap, the hero stops drifting),
 * the same rule src/components/Reveal.tsx follows for entrance animations.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduce(v); })
      .catch(() => { /* older platforms: assume motion is fine */ });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/** True while the app is on screen (not in the background or behind the app switcher). */
export function useAppActive(): boolean {
  const [state, setState] = useState<AppStateStatus>(() => (AppState.currentState ?? 'active') as AppStateStatus);
  useEffect(() => {
    const sub = AppState.addEventListener('change', setState);
    return () => sub.remove();
  }, []);
  // 'unknown' at start-up (iOS) counts as active: the screen is being shown.
  return state === 'active' || state === 'unknown';
}
