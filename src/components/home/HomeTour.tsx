import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Platform, type ScrollViewInstance, type ViewInstance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Coachmark, type CoachmarkAnchor } from '../ui/Coachmark';
import { holdNotificationPopup } from '../../hooks/useNotificationPermission';
import { useReduceMotion } from '../../lib/motionPrefs';
import { TOUR_SEEN_KEY, buildTour, tabRect, type TourAnchorKey, type TourStep } from '../../lib/appTour';

/*
 * Runs the app tour on Home (owner 2026-11-25): once after sign-in for everybody who has not seen THIS tour (the seen
 * key is versioned, src/lib/appTour.ts), and again whenever Profile -> "Replay app tour" asks for it.
 *
 * For a step about something on Home it scrolls the element into view, measures it on the screen and hands that box to
 * the spotlight; the punch slider and the tab bar sit outside Home's scroll view, so their boxes are worked out from
 * Home's own screen area (the bar starts where the screen's content ends).
 */

// ── "Replay app tour" from another screen ─────────────────────────────────

let pendingReplay = false;
const replayListeners = new Set<() => void>();

/** Ask Home to run the tour again (Profile's "Replay app tour"); Home starts it as soon as it is on screen. */
export function requestAppTourReplay() {
  pendingReplay = true;
  replayListeners.forEach((l) => l());
}

// The pinned SlideToPunch track (src/components/SlideToPunch.tsx: THUMB 50 + PAD 6 x 2, Spacing.base sides,
// Spacing.sm under it) and the tab bar's button row (app/(tabs)/_layout.tsx: TAB_BAR_CONTENT_HEIGHT).
const PUNCH_TRACK_H = 62;
const PUNCH_SIDE = 16;
const PUNCH_BOTTOM = 8;
const TAB_ROW_H = Platform.OS === 'ios' ? 58 : 62;
const SCROLL_SETTLE_MS = 380;
const SCROLL_TOP_GAP = 120;

const IN_SCROLL: readonly TourAnchorKey[] = ['menu', 'bell', 'avatar', 'profileCard', 'attendance', 'today', 'actions', 'insights'];
const TOP_BAR: readonly TourAnchorKey[] = ['menu', 'bell', 'avatar'];

type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void; measureLayout?: any };

/** A measure that never answers (a view detached by a re-render or a reload) must not hold the tour: after this the step
 *  shows its card centred instead (2026-11-25: the dimmed overlay stayed up with no card and swallowed every tap). */
const MEASURE_TIMEOUT_MS = 700;

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), MEASURE_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

function inWindow(node: Measurable | null | undefined): Promise<CoachmarkAnchor | null> {
  return withTimeout(inWindowRaw(node), null);
}

function inWindowRaw(node: Measurable | null | undefined): Promise<CoachmarkAnchor | null> {
  return new Promise((resolve) => {
    if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
    try {
      // An element that drew nothing (an empty panel) gets the centred card instead of a hairline spotlight.
      node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
    } catch {
      resolve(null);
    }
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function HomeTour({
  ready,
  anchors,
  scrollRef,
  rootRef,
  isManager,
  employmentType,
}: {
  /** Home has loaded (the tour waits for the cards it points at). */
  ready: boolean;
  anchors: Partial<Record<TourAnchorKey, RefObject<ViewInstance | null>>>;
  scrollRef: RefObject<ScrollViewInstance | null>;
  /** Home's whole screen area (above the tab bar). */
  rootRef: RefObject<ViewInstance | null>;
  isManager: boolean;
  employmentType?: string | null;
}) {
  const reduce = useReduceMotion();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<CoachmarkAnchor | null>(null);
  const [placed, setPlaced] = useState(false);
  const audience = useRef({ isManager, employmentType });
  audience.current = { isManager, employmentType };

  const start = useCallback(() => {
    // The steps are fixed when the tour starts: a manager profile that loads meanwhile must not shift them.
    setSteps(buildTour(audience.current));
    setIndex(0);
    setAnchor(null);
    setPlaced(false);
    scrollRef.current?.scrollTo({ y: 0, animated: !reduce });
  }, [reduce, scrollRef]);

  // First time after sign-in (per tour version).
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    AsyncStorage.getItem(TOUR_SEEN_KEY)
      .then((seen) => {
        if (alive && !seen && !pendingReplay) {
          // the tour is about to start: the notification popup must not flash up first
          holdNotificationPopup('home-tour-soon', true);
          setTimeout(() => {
            holdNotificationPopup('home-tour-soon', false);
            if (alive) start();
          }, 700);
        }
      })
      .catch(() => { /* no tour rather than a broken one */ });
    return () => {
      alive = false;
      holdNotificationPopup('home-tour-soon', false);
    };
  }, [ready, start]);

  // Replays asked for by Profile (also one asked before Home was on screen).
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      if (!pendingReplay) return;
      pendingReplay = false;
      setTimeout(start, 450); // let the tab switch finish first
    };
    replayListeners.add(run);
    run();
    return () => {
      replayListeners.delete(run);
    };
  }, [ready, start]);

  const step = steps?.[index] ?? null;

  // The "Turn on notifications" popup waits while the tour runs (owner 2026-11-25): one thing at a time.
  const touring = steps != null;
  useEffect(() => {
    holdNotificationPopup('home-tour', touring);
  }, [touring]);
  useEffect(() => () => holdNotificationPopup('home-tour', false), []);

  // Bring the step's element on screen and measure it.
  useEffect(() => {
    if (!step) return;
    let alive = true;
    setPlaced(false);
    (async () => {
      const key = step.anchor;
      let box: CoachmarkAnchor | null = null;
      if (key && IN_SCROLL.includes(key)) {
        const node = anchors[key]?.current as unknown as Measurable | null;
        const sv = scrollRef.current;
        if (TOP_BAR.includes(key)) {
          sv?.scrollTo({ y: 0, animated: !reduce });
        } else if (node && sv) {
          const inner = sv.getInnerViewRef?.();
          const y = await withTimeout(
            new Promise<number | null>((resolve) => {
              try {
                node.measureLayout(inner, (_x: number, top: number) => resolve(top), () => resolve(null));
              } catch {
                resolve(null);
              }
            }),
            null,
          );
          if (y != null) sv.scrollTo({ y: Math.max(0, y - SCROLL_TOP_GAP), animated: !reduce });
        }
        await wait(reduce ? 60 : SCROLL_SETTLE_MS);
        box = await inWindow(node);
      } else if (key) {
        const root = await inWindow(rootRef.current as unknown as Measurable);
        if (root) {
          if (key === 'punch') {
            box = {
              x: root.x + PUNCH_SIDE,
              y: root.y + root.height - PUNCH_BOTTOM - PUNCH_TRACK_H,
              width: root.width - PUNCH_SIDE * 2,
              height: PUNCH_TRACK_H,
            };
          } else {
            box = tabRect(root, key.slice(4), audience.current.isManager, TAB_ROW_H);
          }
        }
      }
      if (!alive) return;
      setAnchor(box);
      setPlaced(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reduce]);

  const end = useCallback(() => {
    setSteps(null);
    setAnchor(null);
    AsyncStorage.setItem(TOUR_SEEN_KEY, '1').catch(() => {});
    scrollRef.current?.scrollTo({ y: 0, animated: !reduce });
  }, [reduce, scrollRef]);

  const total = steps?.length ?? 0;
  const next = useCallback(() => {
    if (index >= total - 1) end();
    else setIndex((i) => i + 1);
  }, [index, total, end]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const features = useMemo(() => step?.features?.map(({ icon, title, text }) => ({ icon, title, text })), [step]);

  if (!step) return null;
  return (
    <Coachmark
      visible
      title={step.title}
      body={step.body}
      icon={step.icon}
      tone={step.tone}
      features={features}
      where={step.where}
      index={index}
      total={total}
      anchor={step.anchor ? anchor : null}
      ready={placed}
      onNext={next}
      onBack={back}
      onSkip={end}
    />
  );
}
