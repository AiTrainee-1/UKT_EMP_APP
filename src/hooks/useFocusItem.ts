// The React side of "open this screen on THAT request" (`?focus=<id>`, see src/lib/focusItem.ts for the rules and
// src/components/focus/FocusFrame.tsx for the highlight). Every list screen uses the same two hooks, so they all behave
// alike:
//
//   const focusRequest = useFocusParam();                 // reads ?focus= once, then clears it from the route
//   const focus = useFocusItem({ request: focusRequest, rows, idOf, views, refresh, scrollRef | list, ... });
//   ...
//   <FocusFrame {...focus.frame(row.id)}> <TheCard /> </FocusFrame>
//   {focus.missing && <FocusMissingNote onDismiss={focus.dismissMissing} />}
//
// useFocusItem refreshes the list first (the notification is about a change the cached list may not have yet), then finds
// the row, switches the screen to the view that holds it, scrolls to it and highlights it once.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { FlatList, ScrollViewInstance } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';

import { FOCUS_HOLD_MS, FOCUS_TOP_GAP, planFocus, readFocusId } from '../lib/focusItem';
import { useReduceMotion } from '../lib/motionPrefs';

/** One request a link made: its value and a number that is new each time (the same link opened twice is two requests). */
export interface RouteRequest<T> {
  value: T;
  nonce: number;
}

let nonceSeq = 0;

/**
 * Reads the route param `name` (parsed by `parse`) as a one-off request, then removes it from the route: opening the same
 * link again later (the same notification's View twice) must count as a new request, and a screen that stays mounted (a
 * tab) must not act on an old param again. Null until the route carries one.
 */
export function useRouteRequest<T>(name: string, parse: (raw: unknown) => T | null): RouteRequest<T> | null {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const navigation = useNavigation();
  const raw = params[name];
  const key = raw === undefined ? undefined : Array.isArray(raw) ? raw.join(',') : String(raw);
  const [request, setRequest] = useState<RouteRequest<T> | null>(null);
  const parseRef = useRef(parse);
  parseRef.current = parse;

  useEffect(() => {
    if (key === undefined || key === '') return;
    const value = parseRef.current(raw);
    try {
      (navigation as unknown as { setParams?: (p: Record<string, undefined>) => void }).setParams?.({ [name]: undefined });
    } catch {
      // not inside a navigator (a test render): nothing to clear
    }
    if (value != null) setRequest({ value, nonce: ++nonceSeq });
    // only when the param itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return request;
}

/** `?focus=<id>`: the request a link wants this screen to show. */
export function useFocusParam(): RouteRequest<number> | null {
  return useRouteRequest('focus', readFocusId);
}

export interface FocusViews<T, V> {
  /** The views in the order to try them (src/lib/focusItem.ts REQUEST_FOCUS_ORDER for the request screens). */
  order: readonly V[];
  /** The view on screen now. */
  current: V;
  set: (view: V) => void;
  /**
   * Which views show a row, when `rows` is the screen's whole list (classify mode). Leave out when each view is its own
   * server list and `rows` holds only the current one's (seek mode: the views are opened one by one).
   */
  has?: (row: T, view: V) => boolean;
}

export interface UseFocusItemOptions<T, V> {
  request: RouteRequest<number> | null;
  /** Every row loaded (classify mode) or the current view's rows (seek mode); undefined while still loading. */
  rows: readonly T[] | undefined;
  idOf: (row: T) => number;
  views?: FocusViews<T, V>;
  /** Anything else the screen must change to show the row (the year it is in, a section). Called once, when found. */
  reveal?: (row: T) => void;
  /** Re-asks the server for the list. Called when a request arrives and after a view switch (seek mode). */
  refresh?: () => unknown;
  /** A paged list: more pages on the server, and how to load the next one. */
  more?: { has: boolean; load: () => unknown };
  /** The list is being fetched: wait, the rows may be about to change. */
  fetching?: boolean;
  /** False to hold off (the list is not the one to look in yet, e.g. a search is still settling). */
  ready?: boolean;
  /** The item cannot be on this screen at all (e.g. its Approvals category is switched off for this head). */
  unavailable?: boolean;
  /** A FlatList screen: the list and where an item with this id is in its data (-1 when it is not). */
  list?: { ref: RefObject<FlatList<any> | null>; indexOf: (id: number) => number };
  /** A ScrollView screen: the FocusFrame around the item scrolls it into view itself. */
  scrollRef?: RefObject<ScrollViewInstance | null>;
}

export interface FocusFrameState {
  active: boolean;
  /** New for every highlight, so the same item can be highlighted again by a later link. */
  pulseKey: number;
  scrollRef?: RefObject<ScrollViewInstance | null>;
}

export interface FocusItemState {
  /** The item being highlighted now, or null. */
  activeId: number | null;
  /** The request's item was not found: show FocusMissingNote. */
  missing: boolean;
  dismissMissing: () => void;
  /** Props for the FocusFrame around the item with this id. */
  frame: (id: number) => FocusFrameState;
  /** Give it to the FlatList (scrollToIndex needs it for an item outside the rendered window). */
  onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => void;
}

interface Run<V> {
  nonce: number;
  id: number;
  tried: V[];
  more: number;
  busy: boolean;
  done: boolean;
  /**
   * The list on screen is asked again before it is searched: when the request arrives (the notification is about a change
   * the cached list may not have yet) and, in seek mode, after each switch to another view's list. Done from the look
   * effect once `ready`, so it is the list of the view (and category) the screen is now on that is refreshed.
   */
  refreshPending: boolean;
}

/** Requests already brought on screen (or found missing): a screen mounted again later must not act on them twice. */
const finished = new Set<number>();

export function useFocusItem<T, V = string>(o: UseFocusItemOptions<T, V>): FocusItemState {
  const reduceMotion = useReduceMotion();
  const latest = useRef(o);
  latest.current = o;
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;

  const [active, setActive] = useState<{ id: number; key: number } | null>(null);
  const [missing, setMissing] = useState(false);
  const [tick, setTick] = useState(0);
  const run = useRef<Run<V> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollFailures = useRef(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  const dismissMissing = useCallback(() => setMissing(false), []);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  /** Runs `job` (a refresh, the next page) with the search paused until it settles, then looks again. */
  const pauseFor = (r: Run<V>, job: () => unknown) => {
    r.busy = true;
    Promise.resolve()
      .then(job)
      .catch(() => {
        // a failed refresh still looks in what is there
      })
      .finally(() => {
        if (run.current !== r) return;
        r.busy = false;
        bump();
      });
  };

  const nonce = o.request?.nonce ?? null;
  const requestedId = o.request?.value ?? null;

  // A new request: forget the last one; the look effect below refreshes the list, then looks.
  useEffect(() => {
    if (nonce == null || requestedId == null || finished.has(nonce)) return;
    run.current = { nonce, id: requestedId, tried: [], more: 0, busy: false, done: false, refreshPending: true };
    scrollFailures.current = 0;
    setMissing(false);
    setActive(null);
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const current = o.views?.current;

  const scrollListTo = (id: number) => {
    const attempt = (n: number) => {
      const cur = latest.current;
      const list = cur.list?.ref.current;
      const index = cur.list ? cur.list.indexOf(id) : -1;
      if (!list || index < 0) {
        // the switched view has not rendered yet
        if (n < 4) later(() => attempt(n + 1), 200);
        return;
      }
      try {
        list.scrollToIndex({ index, animated: !reduceRef.current, viewPosition: 0, viewOffset: FOCUS_TOP_GAP });
      } catch {
        // an index the list does not have (any more): leave the list where it is
      }
    };
    later(() => attempt(0), 260);
  };

  // Look whenever anything it depends on changes.
  const fetching = !!o.fetching;
  const ready = o.ready !== false;
  useEffect(() => {
    const r = run.current;
    if (!r || r.done || r.busy) return;
    const cur = latest.current;
    if (cur.unavailable) {
      r.done = true;
      finished.add(r.nonce);
      setMissing(true);
      return;
    }
    if (!ready) return;
    if (r.refreshPending) {
      r.refreshPending = false;
      pauseFor(r, () => latest.current.refresh?.());
      return;
    }
    if (fetching) return;
    const step = planFocus<T, V>({
      id: r.id,
      rows: cur.rows,
      idOf: cur.idOf,
      views: cur.views?.order,
      current: cur.views?.current ?? null,
      has: cur.views?.has,
      tried: r.tried,
      hasMore: !!cur.more?.has,
      moreTried: r.more,
    });
    switch (step.kind) {
      case 'wait':
        return;
      case 'found':
        r.done = true;
        finished.add(r.nonce);
        cur.reveal?.(step.row);
        if (step.view != null && cur.views && step.view !== cur.views.current) cur.views.set(step.view);
        setActive({ id: r.id, key: r.nonce });
        if (cur.list) scrollListTo(r.id);
        return;
      case 'more':
        r.more += 1;
        pauseFor(r, () => latest.current.more?.load());
        return;
      case 'switch':
        if (!cur.views) return;
        r.tried.push(cur.views.current);
        r.more = 0;
        r.refreshPending = true;
        cur.views.set(step.view);
        return;
      case 'missing':
        r.done = true;
        finished.add(r.nonce);
        setMissing(true);
        return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, o.rows, current, fetching, ready, o.more?.has, o.unavailable]);

  // The highlight is a moment, not a state: a list that re-renders later must not pulse the item again.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(null), FOCUS_HOLD_MS);
    return () => clearTimeout(t);
  }, [active]);

  const onScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    const list = latest.current.list?.ref.current;
    if (!list || scrollFailures.current >= 3) return;
    scrollFailures.current += 1;
    // Jump near it (the rows there get rendered), then aim again.
    list.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: false });
    later(() => {
      try {
        list.scrollToIndex({ index: info.index, animated: !reduceRef.current, viewPosition: 0, viewOffset: FOCUS_TOP_GAP });
      } catch {
        // gone meanwhile
      }
    }, 180);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollRef = o.scrollRef;
  return {
    activeId: active?.id ?? null,
    missing,
    dismissMissing,
    frame: (id: number) => ({ active: active?.id === id, pulseKey: active?.key ?? 0, scrollRef }),
    onScrollToIndexFailed,
  };
}
