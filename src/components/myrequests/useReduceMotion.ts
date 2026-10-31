import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The phone's "Reduce motion" setting: looping pulses stop when it is on (entrances use src/components/Reveal.tsx). */
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
