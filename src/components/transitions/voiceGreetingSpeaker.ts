import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, AppState, type NativeEventSubscription } from 'react-native';

import {
  GREETING_LATE_MS,
  GREETING_PITCH,
  GREETING_RATE,
  createVoiceGreetingPref,
  pickGreetingVoice,
  withTimeout,
  type GreetingVoice,
} from '../../lib/voiceGreeting';

/**
 * Speaks the sign-in greeting (owner 2026-11-25; the rules are in src/lib/voiceGreeting.ts). Everything here is
 * fire-and-forget and swallows its own errors: the sign-in never waits for it.
 */

/** The "Voice greeting on sign-in" switch (Profile > Settings), saved on the phone. */
export const voiceGreetingPref = createVoiceGreetingPref(AsyncStorage);
// read it early, so it is known by the time anyone signs in
void voiceGreetingPref.load();

type SpeechModule = typeof import('expo-speech');
let speechModule: SpeechModule | null | undefined;
/**
 * expo-speech, loaded the first time it is needed. A development build made before it was added has no native side:
 * then there is simply no greeting (a missing module must never break signing in).
 */
function speech(): SpeechModule | null {
  if (speechModule === undefined) {
    try {
      speechModule = require('expo-speech') as SpeechModule;
    } catch {
      speechModule = null;
    }
  }
  return speechModule;
}

let voice: Promise<GreetingVoice | null> | null = null;
/** The voice to greet with, looked up once (some phones are slow to list their voices: then Indian English, unchosen). */
function greetingVoice(Speech: SpeechModule): Promise<GreetingVoice | null> {
  if (!voice) {
    voice = withTimeout(Speech.getAvailableVoicesAsync(), 800, []).then(pickGreetingVoice, () => ({ language: 'en-IN' }));
  }
  return voice;
}

let session = 0;
let speaking = false;
let backgroundSub: NativeEventSubscription | null = null;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

function settle() {
  speaking = false;
  backgroundSub?.remove();
  backgroundSub = null;
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = null;
}

/**
 * Says `sentence` (e.g. "Welcome back, Surya") about `delayMs` from now, if the switch is on. Skipped when a screen
 * reader is on (it reads the words on the screen instead), when the app is not in front, or when the phone was not
 * ready to speak within GREETING_LATE_MS. Stops by itself if the app goes to the background.
 */
export function speakGreeting(sentence: string, delayMs = 0): void {
  const id = ++session;
  const startedAt = Date.now();
  void (async () => {
    try {
      const on = await withTimeout(voiceGreetingPref.load(), 400, voiceGreetingPref.get());
      if (!on || id !== session) return;
      const reader = await withTimeout(AccessibilityInfo.isScreenReaderEnabled(), 300, false);
      if (reader || id !== session) return;
      const Speech = speech();
      if (!Speech) return;
      const chosen = await greetingVoice(Speech);
      if (!chosen || id !== session) return;
      const wait = delayMs - (Date.now() - startedAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (id !== session || Date.now() - startedAt > GREETING_LATE_MS) return;
      if (AppState.currentState !== 'active') return;

      settle();
      speaking = true;
      // stop talking when the app goes to the background (or the app switcher)
      backgroundSub = AppState.addEventListener('change', (state) => {
        if (state !== 'active') stopGreeting();
      });
      // in case the phone never says it finished
      safetyTimer = setTimeout(settle, 8000);
      Speech.speak(sentence, {
        language: chosen.language,
        voice: chosen.voice,
        rate: GREETING_RATE,
        pitch: GREETING_PITCH,
        onDone: settle,
        onStopped: settle,
        onError: settle,
      });
    } catch {
      settle();
    }
  })();
}

/** Stops a greeting that is waiting or talking (the app went to the background, or the employee is signing out). */
export function stopGreeting(): void {
  session += 1;
  if (!speaking) return;
  settle();
  try {
    void speech()?.stop().catch(() => {});
  } catch {
    // nothing to stop
  }
}
