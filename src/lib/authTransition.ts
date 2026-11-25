// The full-screen moments around signing in and out (owner 2026-11-25), drawn by src/components/transitions/
// AuthTransitionOverlay.tsx at the app root so they outlive the screen that started them. Pure: no React Native, tested
// in authTransition.test.ts.
//
// Sign-in (password or one-time code, finishSignIn in app/(auth)/login.tsx): a portal opens from the sign-in button and
// covers the screen; only THEN does the app sign in and go to Home (behind the cover, so the screen change is never seen
// half-way). Light ribbons orbit the logo, specks burst out of it and "Welcome back, <first name>" rises in letter by
// letter (and is spoken, if the employee keeps "Voice greeting on sign-in" on - src/lib/voiceGreeting.ts); then it all
// flies at the camera and Home shows through.
// Sign-out (only the employee's own, confirmed logout - src/hooks/useSignOut.ts): a little person walks out of the front
// door of a small house and the door swings shut behind them, the light from inside narrowing to nothing, then the porch
// light and the window go dark. Once the scene covers the screen the usual sign-out runs behind it (app/_layout.tsx
// logoutTo, unchanged: it leaves for the Login screen and clears up in its own order), and the scene fades onto Login.

import { createOverlayStore } from './overlayStore.ts';

export interface Point {
  x: number;
  y: number;
}

export type AuthTransitionRequest =
  | {
      kind: 'sign-in';
      /** Where the portal opens from (the centre of the sign-in button, in window coordinates); null = low centre. */
      origin: Point | null;
      /** The first name to greet ("Welcome back, Surya"), or null for a plain "Welcome back". */
      name: string | null;
      /** Called once, when the screen is covered: sign in and go to Home here. */
      onCovered: () => void;
    }
  | {
      kind: 'sign-out';
      /** Called once, when the scene covers the screen: sign out here. */
      onCovered: () => void;
    };

export const authTransitions = createOverlayStore<AuthTransitionRequest, void>(undefined);

/** The phases of a transition, in milliseconds. */
export interface Timeline {
  /** The cover comes in (the portal opens / the house scene appears). The app changes screens when it ends. */
  enterMs: number;
  /** Held while the app changes screens behind it. */
  holdMs: number;
  /** The cover goes, showing the new screen. */
  exitMs: number;
}

export function totalMs(t: Timeline): number {
  return t.enterMs + t.holdMs + t.exitMs;
}

/** Sign-in: about 2.4 s, unhurried (owner 2026-11-25: "slower, more immersive"); with Reduce Motion a plain fade, shorter. */
export function signInTimeline(reduceMotion: boolean): Timeline {
  return reduceMotion ? { enterMs: 220, holdMs: 820, exitMs: 300 } : { enterMs: 560, holdMs: 1240, exitMs: 560 };
}

/** Sign-out: about 2.3 s for the walk out and the door closing; with Reduce Motion a still scene, a little shorter. */
export function signOutTimeline(reduceMotion: boolean): Timeline {
  return reduceMotion ? { enterMs: 220, holdMs: 1300, exitMs: 300 } : { enterMs: 300, holdMs: 1650, exitMs: 350 };
}

/**
 * If the overlay never says the screen is covered (it is not mounted, or it failed), go on anyway after this. Always
 * later than the moment the overlay covers the screen (so it never cuts the animation short) and earlier than its end.
 */
export const SIGN_IN_FALLBACK_MS = 1500;
export const SIGN_OUT_FALLBACK_MS = 1000;

// ── sign-in: the welcome words ──────────────────────────────────────────────

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'smt', 'shri', 'sri', 'thiru', 'tmt', 'kum']);
/** Longer first names are cut here (the greeting is one line on a small phone). */
export const GREETING_NAME_MAX = 16;

/**
 * The first name to greet, from the name the server has on record: "SURYA MATHIVANAN" -> "Surya", "M. Surya" -> "Surya",
 * "Mr. ravi kumar" -> "Ravi". Initials and titles are skipped; all-caps or all-lower names get a capital first letter.
 * Null when there is nothing usable (then the greeting is a plain "Welcome back").
 */
export function greetingName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const words = fullName.match(/[\p{L}\p{M}'’-]+/gu) ?? [];
  const word = words.find((w) => w.replace(/['’-]/g, '').length >= 2 && !HONORIFICS.has(w.toLowerCase()));
  if (!word) return null;
  const cased = word === word.toUpperCase() || word === word.toLowerCase()
    ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    : word;
  return cased.slice(0, GREETING_NAME_MAX);
}

/** What the sign-in transition says: the line shown first, the name under it, and the whole sentence (read aloud). */
export function welcomeWords(name: string | null): { title: string; name: string | null; sentence: string } {
  return name
    ? { title: 'Welcome back,', name, sentence: `Welcome back, ${name}` }
    : { title: 'Welcome back', name: null, sentence: 'Welcome back' };
}

/** When the welcome words rise in, letter by letter, counted from the start of the transition. */
export const WELCOME_REVEAL = {
  startMs: 560,
  letterStaggerMs: 28,
  letterMs: 340,
  /** The name starts this long after the first line. */
  nameDelayMs: 240,
  nameStaggerMs: 45,
  /** All the name's letters have started within this (a long name staggers faster). */
  nameSpreadMaxMs: 300,
  nameLetterMs: 420,
} as const;

/** The gap between two letters of the name. */
export function nameStaggerMs(letters: number): number {
  if (letters <= 1) return 0;
  return Math.min(WELCOME_REVEAL.nameStaggerMs, WELCOME_REVEAL.nameSpreadMaxMs / (letters - 1));
}

/** When the last letter of the welcome words has landed, from the start of the transition. */
export function welcomeRevealEndMs(title: string, name: string | null): number {
  const r = WELCOME_REVEAL;
  const titleEnd = r.startMs + Math.max(0, title.length - 1) * r.letterStaggerMs + r.letterMs;
  if (!name) return titleEnd;
  const nameEnd = r.startMs + r.nameDelayMs + (name.length - 1) * nameStaggerMs(name.length) + r.nameLetterMs;
  return Math.max(titleEnd, nameEnd);
}

// ── sign-out: the walk out of the house ─────────────────────────────────────

/** The steps of the sign-out scene, counted from its start. */
export interface FarewellBeats {
  /** The person starts walking out of the doorway... */
  walkStartMs: number;
  /** ...and walks for this long, off along the path. */
  walkMs: number;
  /** The door starts to swing shut (the person is clear of the doorway by then)... */
  doorCloseStartMs: number;
  /** ...and is shut after this long (the "click": a little bounce). */
  doorCloseMs: number;
  /** The porch light and the window go dark. */
  lightsOffMs: number;
}

export function farewellBeats(reduceMotion: boolean): FarewellBeats {
  // Reduce Motion: nobody walks; the closed door fades in over the open one, then the lights fade.
  return reduceMotion
    ? { walkStartMs: 0, walkMs: 0, doorCloseStartMs: 420, doorCloseMs: 480, lightsOffMs: 1050 }
    : { walkStartMs: 240, walkMs: 1560, doorCloseStartMs: 760, doorCloseMs: 440, lightsOffMs: 1420 };
}

// ── playing them ────────────────────────────────────────────────────────────

/** `fn` wrapped to run exactly once: when called, or after `fallbackMs` whatever happens. */
function once(fn: () => void, fallbackMs: number): () => void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    fn();
  };
  const timer = setTimeout(run, fallbackMs);
  return run;
}

/**
 * Plays the sign-in transition and calls `onCovered` exactly once: when the screen is covered, or after
 * SIGN_IN_FALLBACK_MS whatever happens, so a sign-in can never get stuck behind an animation. `name` is the employee's
 * name as the server has it (the greeting uses the first name).
 */
export function playSignIn(
  origin: Point | null,
  onCovered: () => void,
  options: { name?: string | null; fallbackMs?: number } = {},
): void {
  const { name = null, fallbackMs = SIGN_IN_FALLBACK_MS } = options;
  void authTransitions.open({ kind: 'sign-in', origin, name: greetingName(name), onCovered: once(onCovered, fallbackMs) });
}

/**
 * Plays the "leaving home" scene and calls `onCovered` (the sign-out) exactly once: when the scene covers the screen, or
 * after SIGN_OUT_FALLBACK_MS whatever happens.
 */
export function playSignOut(onCovered: () => void, fallbackMs = SIGN_OUT_FALLBACK_MS): void {
  void authTransitions.open({ kind: 'sign-out', onCovered: once(onCovered, fallbackMs) });
}
