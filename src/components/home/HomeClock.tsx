import { useEffect, useMemo, useState } from 'react';
import { useAppActive } from '../../lib/motionPrefs';
import { calendarBucket } from '../../lib/homeAttention';

/**
 * The live minute for Home's "Right now" panel (src/components/home/TodayPanel.tsx): a Date that changes on each minute
 * boundary, so only the component that reads it re-renders (Home itself does not: it used to keep a 1-second clock state
 * that re-rendered the tile grid and its animations every second). It sleeps while the app is in the background and
 * corrects itself the moment the app comes back.
 */
export function useMinuteNow(): Date {
  const active = useAppActive();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000) + 50);
    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    };
  }, [active]);

  return now;
}

/**
 * "Now" for Home's date line, greeting and month figures: a Date that changes only when the day or the greeting changes
 * (checked once a minute, and on returning to the app), so Home re-renders a few times a day instead of every second.
 */
export function useCalendarNow(): Date {
  const active = useAppActive();
  const [bucket, setBucket] = useState(() => calendarBucket(new Date()));

  useEffect(() => {
    if (!active) return;
    // Same string = React skips the render.
    setBucket(calendarBucket(new Date()));
    const id = setInterval(() => setBucket(calendarBucket(new Date())), 60_000);
    return () => clearInterval(id);
  }, [active]);

  return useMemo(() => new Date(), [bucket]);
}
