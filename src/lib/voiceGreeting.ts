// "Voice greeting on sign-in" (owner 2026-11-25): while the sign-in transition plays, the phone says "Welcome back,
// Surya" in Indian English when it has that voice, in a friendly tone. On by default; a switch in Profile > Settings
// turns it off, saved on the phone. It never holds up the sign-in: everything here is fire-and-forget, a greeting that
// cannot start in time is skipped, and it stops when the app goes to the background
// (src/components/transitions/voiceGreetingSpeaker.ts does the speaking). Pure: no React Native, tested in
// voiceGreeting.test.ts.

/** Where the switch is saved (AsyncStorage). */
export const VOICE_GREETING_KEY = 'uktextiles.voiceGreeting';

/** The saved value -> on/off. Nothing saved (or anything unknown) is ON: the greeting is on by default. */
export function readVoiceGreeting(raw: string | null | undefined): boolean {
  return raw !== '0';
}

export function writeVoiceGreeting(on: boolean): string {
  return on ? '1' : '0';
}

/** A friendly tone: a touch slower and a touch higher than the phone's default voice. */
export const GREETING_RATE = 0.95;
export const GREETING_PITCH = 1.06;
/** The greeting starts about when the welcome words rise in (src/lib/authTransition.ts WELCOME_REVEAL)... */
export const GREETING_SPEAK_AT_MS = 480;
/** ...and is skipped if the phone was not ready to speak by this time (a late "Welcome back" over Home would be odd). */
export const GREETING_LATE_MS = 2000;

/** The parts of an expo-speech `Voice` that matter here. */
export interface VoiceInfo {
  identifier: string;
  language: string;
  name?: string;
  quality?: string;
}

/** The language (and, when there is a good one, the exact voice) to greet with. */
export interface GreetingVoice {
  language: string;
  voice?: string;
}

/** "en_IN" / "EN-in" -> "en-in". */
function lang(code: string): string {
  return code.replace(/_/g, '-').toLowerCase();
}

/** Higher is better: an enhanced voice, one installed on the phone (an Android "-network" voice needs data and lags). */
function score(v: VoiceInfo): number {
  const id = `${v.identifier} ${v.name ?? ''}`.toLowerCase();
  let s = 0;
  if (v.quality === 'Enhanced') s += 2;
  if (id.includes('local')) s += 1;
  if (id.includes('network')) s -= 3;
  return s;
}

/**
 * Indian English when the phone has it (its best installed voice, if one stands out), else British, else American,
 * else any English. With no voice list at all (some phones cannot list them), ask for Indian English and let the phone
 * pick. Null when the phone has voices but no English one: then the greeting is skipped.
 */
export function pickGreetingVoice(voices: readonly VoiceInfo[]): GreetingVoice | null {
  if (voices.length === 0) return { language: 'en-IN' };
  for (const want of ['en-in', 'en-gb', 'en-us']) {
    const matches = voices.filter((v) => lang(v.language) === want);
    if (matches.length === 0) continue;
    const best = [...matches].sort((a, b) => score(b) - score(a))[0];
    const language = best.language.replace(/_/g, '-');
    // a named voice only when it is a good one; otherwise the phone's own default for that language
    return score(best) > 0 ? { language, voice: best.identifier } : { language };
  }
  const english = voices.find((v) => lang(v.language).startsWith('en'));
  return english ? { language: english.language.replace(/_/g, '-') } : null;
}

// ── the switch, remembered on the phone ─────────────────────────────────────

/** Where it is saved: AsyncStorage in the app, a plain object in the tests. */
export interface PrefStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface VoiceGreetingPref {
  /** On or off now (on until the saved value has been read). */
  get(): boolean;
  /** Reads the saved value once; later calls give the same answer. Never fails (a storage error counts as on). */
  load(): Promise<boolean>;
  /** Turns it on or off now, and saves it (a failed save is ignored: it is still changed for this session). */
  set(on: boolean): void;
  subscribe(listener: () => void): () => void;
}

export function createVoiceGreetingPref(storage: PrefStorage): VoiceGreetingPref {
  let value = true;
  let changedHere = false;
  let loading: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    get: () => value,
    load() {
      if (!loading) {
        loading = storage
          .getItem(VOICE_GREETING_KEY)
          .then((raw) => {
            // a change made while it was being read wins
            if (!changedHere) {
              const saved = readVoiceGreeting(raw);
              if (saved !== value) {
                value = saved;
                emit();
              }
            }
            return value;
          })
          .catch(() => value);
      }
      return loading;
    },
    set(on) {
      changedHere = true;
      if (on !== value) {
        value = on;
        emit();
      }
      storage.setItem(VOICE_GREETING_KEY, writeVoiceGreeting(on)).catch(() => {});
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** `promise`, or `fallback` if it has not settled within `ms` (or fails). */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
