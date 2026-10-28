import { useCallback, useEffect, useRef, useState } from 'react';
import { positiveSeconds, secondsLeft } from '../lib/otp';

/**
 * Counts down once a second from `start(n)`. `seconds` is 0 when idle or finished.
 *
 * It works from a clock deadline rather than counting ticks, so the time the employee spends in the SMS app reading
 * the code (while this screen's timers are paused) is not lost: on coming back the number is right again.
 */
export function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  const deadline = useRef(0);
  const running = seconds > 0;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds(secondsLeft(deadline.current, Date.now())), 1000);
    return () => clearInterval(t);
  }, [running]);

  const start = useCallback((from: number) => {
    const n = positiveSeconds(from);
    deadline.current = Date.now() + n * 1000;
    setSeconds(n);
  }, []);
  return { seconds, start };
}
