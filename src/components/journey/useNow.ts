import { useEffect, useState } from 'react';

/** The current time, refreshed every `everyMs` so "running for 1 h 12 min" and "last position 2 min ago" keep moving. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
