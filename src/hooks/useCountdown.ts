import { useCallback, useEffect, useState } from 'react';

/** Counts down once a second from `start(n)`. `seconds` is 0 when idle or finished. */
export function useCountdown() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const start = useCallback((from: number) => setSeconds(Math.max(0, Math.floor(from))), []);
  return { seconds, start };
}
