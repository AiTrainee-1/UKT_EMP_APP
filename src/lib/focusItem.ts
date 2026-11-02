// "Open this screen on THAT request": the shared rules behind `?focus=<id>` (pure functions, no React Native, unit-tested
// in focusItem.test.ts). A notification's View button (src/lib/notificationTarget.ts) opens a list screen with the id of
// the request it is about; the screen then
//   1. finds the row,
//   2. picks the view / tab that contains it (Waiting / This month / Approved / Rejected, or the Approvals status),
//   3. scrolls to it and highlights it briefly,
// and, when the row is not there any more (deleted, too old), shows the page normally with a small note.
// The hook that drives a screen is src/hooks/useFocusItem.ts and the highlight is src/components/focus/FocusFrame.tsx:
// every screen behaves the same because they all go through these three files.

import { rowsForView, scopeToRow, type RequestView, type ViewOptions } from './requestViews.ts';

/** The note a screen shows when the request a link pointed at is not in its list. */
export const FOCUS_MISSING_TEXT = 'That request is no longer in this list';

/** How long the highlight lasts: one pulse (fade in, dip, back, fade out) or, under Reduce Motion, a still ring. */
export const FOCUS_PULSE_MS = 1700;
export const FOCUS_STATIC_MS = 2400;
/** After this the item is no longer "the focused one" (a list re-rendering later must not pulse it again). */
export const FOCUS_HOLD_MS = 2800;
/** Space left above a focused item when the list scrolls to it. */
export const FOCUS_TOP_GAP = 16;
/** How many more pages a paged list may load while looking for the item. */
export const FOCUS_MAX_MORE_PAGES = 5;

// ── route params ────────────────────────────────────────────────────────────

/** A route param as expo-router hands it: a string, or several (`?a=1&a=2`); the first one counts. */
function first(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** `focus=12` -> 12. A positive whole number, else null ("abc", "0", "-3", "1.5", missing). */
export function readFocusId(raw: unknown): number | null {
  const v = first(raw);
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** `date=2026-10-29` -> '2026-10-29' when it is a real calendar day, else null. */
export function readIsoDateParam(raw: unknown): string | null {
  const v = first(raw);
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** `section=resignation` -> 'resignation': one lower-case word (letters, digits, _ and -), else null. */
export function readWordParam(raw: unknown): string | null {
  const v = first(raw);
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(s) ? s : null;
}

/** The number in a row key like "hw-2421" (prefix "hw"), or null for a key of another kind. */
export function idFromKey(key: unknown, prefix: string): number | null {
  if (typeof key !== 'string' || !key.startsWith(`${prefix}-`)) return null;
  return readFocusId(key.slice(prefix.length + 1));
}

/** [year, month 1-12] of an ISO day. */
export function yearMonthOfDay(iso: string): [number, number] {
  return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))];
}

// ── which view holds the row ────────────────────────────────────────────────

/**
 * The view to show a row in: the one on screen when it already holds the row (never switch needlessly), else the first
 * of `order` that does, else null (no view of this screen lists it).
 */
export function chooseFocusView<V>(order: readonly V[], current: V | null | undefined, has: (view: V) => boolean): V | null {
  if (current != null && has(current)) return current;
  return order.find((v) => has(v)) ?? null;
}

/** The order a request screen tries its four views in: the status views first (each row is in exactly one of them),
 *  "This month" last (it only repeats some of them). */
export const REQUEST_FOCUS_ORDER: readonly RequestView[] = ['waiting', 'approved', 'rejected', 'month'];

/** Whether `view` of a request screen lists `row`, by the screen's own rules (requestViews.ts). */
export function requestViewHas<T>(row: T, view: RequestView, opts: ViewOptions<T>): boolean {
  return rowsForView([row], view, opts).length > 0;
}

/**
 * A screen with the month switcher (`opts.scope`): whether `view` lists `row` once the screen shows the row's own month.
 * The screen's `reveal` then switches to that month (monthForRow in requestViews.ts) - first the month, then the view,
 * the scroll and the pulse, as on every other screen. Same as requestViewHas without a switcher.
 */
export function requestViewHasInItsMonth<T>(row: T, view: RequestView, opts: ViewOptions<T>): boolean {
  return requestViewHas(row, view, scopeToRow(row, opts));
}

// ── the next step ───────────────────────────────────────────────────────────

export type FocusStep<T, V> =
  /** The list is not there yet: wait for it. */
  | { kind: 'wait' }
  /** Found: show it in `view` (null = the screen has no views, or keep the one on screen). */
  | { kind: 'found'; row: T; view: V | null }
  /** Not among the rows loaded so far: load the next page and look again. */
  | { kind: 'more' }
  /** Not in this view's list (a screen whose views are separate lists, like Approvals): open `view` and look there. */
  | { kind: 'switch'; view: V }
  /** Not anywhere: show the page normally with the "no longer in this list" note. */
  | { kind: 'missing' };

export interface FocusPlanInput<T, V> {
  id: number;
  /** Every row the screen has loaded; undefined while the list is still loading. */
  rows: readonly T[] | undefined;
  idOf: (row: T) => unknown;
  /** The screen's views, in the order to try them. Leave out for a screen with one list. */
  views?: readonly V[];
  current?: V | null;
  /**
   * Classify mode: the rows are the screen's WHOLE list and this says which views show a row (Leave, Permission, ...).
   * Leave it out for seek mode: `rows` are the CURRENT view's list only, and the other views are opened one by one
   * (Approvals: Pending, Approved and Rejected are separate server lists).
   */
  has?: (row: T, view: V) => boolean;
  /** Seek mode: the views already searched. */
  tried?: readonly V[];
  /** A paged list with more pages on the server. */
  hasMore?: boolean;
  /** How many extra pages were already loaded for this search (of this view). */
  moreTried?: number;
  maxMore?: number;
}

/** What to do next to bring the request `id` on screen. */
export function planFocus<T, V>(input: FocusPlanInput<T, V>): FocusStep<T, V> {
  const { id, rows, idOf, views, current = null, has, tried = [], hasMore = false, moreTried = 0 } = input;
  const maxMore = input.maxMore ?? FOCUS_MAX_MORE_PAGES;
  if (rows === undefined) return { kind: 'wait' };

  const row = rows.find((r) => Number(idOf(r)) === id);
  if (row !== undefined) {
    if (!views || views.length === 0) return { kind: 'found', row, view: null };
    if (!has) return { kind: 'found', row, view: current };
    const view = chooseFocusView(views, current, (v) => has(row, v));
    // A row no view lists (a status this screen does not sort) is as good as gone from the screen.
    return view == null ? { kind: 'missing' } : { kind: 'found', row, view };
  }

  if (hasMore && moreTried < maxMore) return { kind: 'more' };
  if (views && !has) {
    const next = views.find((v) => v !== current && !tried.includes(v));
    if (next !== undefined) return { kind: 'switch', view: next };
  }
  return { kind: 'missing' };
}

/** The position of the item with this id in a FlatList's data (rows of month headings and items), or -1. */
export function indexOfItem<R>(data: readonly R[], match: (row: R) => boolean): number {
  return data.findIndex(match);
}
