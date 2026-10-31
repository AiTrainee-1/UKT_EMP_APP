import React, { useEffect, useMemo, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { format } from 'date-fns';
import { useAppActive } from '../../lib/motionPrefs';
import { calendarBucket } from '../../lib/homeAttention';

/**
 * The live "hh:mm a" in Home's shift pill, in its own component so that only this Text re-renders when the minute
 * changes (it used to be a 1-second state on the whole Home screen, which re-rendered the tile grid and its animations
 * every second). It wakes on each minute boundary, sleeps while the app is in the background, and corrects itself the
 * moment the app comes back.
 */
export function HomeClock({ style }: { style?: StyleProp<TextStyle> }) {
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

  const text = format(now, 'hh:mm a');
  return (
    <Text style={style} accessibilityLabel={`Time now ${format(now, 'h:mm a')}`}>
      {text}
    </Text>
  );
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
