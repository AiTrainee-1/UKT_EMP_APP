// Run with `npm test`. "Voice greeting on sign-in": the switch (on by default, saved on the phone) and the voice it
// picks (src/lib/voiceGreeting.ts).
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GREETING_LATE_MS,
  GREETING_SPEAK_AT_MS,
  VOICE_GREETING_KEY,
  createVoiceGreetingPref,
  pickGreetingVoice,
  readVoiceGreeting,
  withTimeout,
  writeVoiceGreeting,
  type PrefStorage,
} from './voiceGreeting.ts'
import { WELCOME_REVEAL, signInTimeline, totalMs } from './authTransition.ts'

function memoryStorage(initial: Record<string, string> = {}, opts: { failGet?: boolean; failSet?: boolean; slowGetMs?: number } = {}) {
  const data = { ...initial }
  const storage: PrefStorage = {
    async getItem(key) {
      if (opts.slowGetMs) await new Promise((r) => setTimeout(r, opts.slowGetMs))
      if (opts.failGet) throw new Error('storage broken')
      return data[key] ?? null
    },
    async setItem(key, value) {
      if (opts.failSet) throw new Error('storage full')
      data[key] = value
    },
  }
  return { storage, data }
}

test('on by default; only a saved "off" turns it off', () => {
  assert.equal(readVoiceGreeting(null), true)
  assert.equal(readVoiceGreeting(undefined), true)
  assert.equal(readVoiceGreeting('1'), true)
  assert.equal(readVoiceGreeting('garbage'), true)
  assert.equal(readVoiceGreeting('0'), false)
  assert.equal(readVoiceGreeting(writeVoiceGreeting(false)), false)
  assert.equal(readVoiceGreeting(writeVoiceGreeting(true)), true)
})

test('the switch: read once from the phone, changed and saved', async () => {
  const { storage, data } = memoryStorage({ [VOICE_GREETING_KEY]: '0' })
  const pref = createVoiceGreetingPref(storage)
  assert.equal(pref.get(), true) // not read yet: on
  let changes = 0
  const stop = pref.subscribe(() => changes++)
  assert.equal(await pref.load(), false)
  assert.equal(pref.get(), false)
  assert.equal(changes, 1)
  pref.set(true)
  assert.equal(pref.get(), true)
  assert.equal(changes, 2)
  await Promise.resolve()
  assert.equal(data[VOICE_GREETING_KEY], '1')
  pref.set(true) // no change, no news
  assert.equal(changes, 2)
  stop()
  pref.set(false)
  assert.equal(changes, 2)
})

test('a change made while the saved value is still being read wins', async () => {
  const { storage } = memoryStorage({ [VOICE_GREETING_KEY]: '1' }, { slowGetMs: 10 })
  const pref = createVoiceGreetingPref(storage)
  const loading = pref.load()
  pref.set(false)
  assert.equal(await loading, false)
  assert.equal(pref.get(), false)
})

test('a broken storage never breaks it: on by default, and changes still apply for this session', async () => {
  const { storage } = memoryStorage({}, { failGet: true, failSet: true })
  const pref = createVoiceGreetingPref(storage)
  assert.equal(await pref.load(), true)
  pref.set(false)
  assert.equal(pref.get(), false)
})

test('Indian English first, the best installed voice', () => {
  const voices = [
    { identifier: 'en-us-x-sfg-local', language: 'en-US' },
    { identifier: 'en-in-x-ene-network', language: 'en-IN' },
    { identifier: 'en-in-x-ena-local', language: 'en-IN' },
    { identifier: 'hi-in-x-hia-local', language: 'hi-IN' },
  ]
  assert.deepEqual(pickGreetingVoice(voices), { language: 'en-IN', voice: 'en-in-x-ena-local' })
})

test('iOS-style voices: an enhanced one is chosen by name; otherwise the phone picks for the language', () => {
  assert.deepEqual(
    pickGreetingVoice([
      { identifier: 'com.apple.voice.compact.en-IN.Rishi', language: 'en-IN', quality: 'Default' },
      { identifier: 'com.apple.voice.enhanced.en-IN.Isha', language: 'en-IN', quality: 'Enhanced' },
    ]),
    { language: 'en-IN', voice: 'com.apple.voice.enhanced.en-IN.Isha' },
  )
  assert.deepEqual(pickGreetingVoice([{ identifier: 'com.apple.voice.compact.en-IN.Rishi', language: 'en-IN', quality: 'Default' }]), {
    language: 'en-IN',
  })
  // only a voice that needs the internet: no named voice
  assert.deepEqual(pickGreetingVoice([{ identifier: 'en-in-x-ene-network', language: 'en_IN' }]), { language: 'en-IN' })
})

test('no Indian English: British, then American, then any English; no English at all: no greeting', () => {
  assert.equal(pickGreetingVoice([{ identifier: 'a', language: 'en-US' }, { identifier: 'b', language: 'en-GB' }])?.language, 'en-GB')
  assert.equal(pickGreetingVoice([{ identifier: 'a', language: 'en-US' }, { identifier: 'b', language: 'ta-IN' }])?.language, 'en-US')
  assert.equal(pickGreetingVoice([{ identifier: 'a', language: 'en-AU' }])?.language, 'en-AU')
  assert.equal(pickGreetingVoice([{ identifier: 'a', language: 'ta-IN' }, { identifier: 'b', language: 'hi-IN' }]), null)
})

test('a phone that cannot list its voices still gets Indian English', () => {
  assert.deepEqual(pickGreetingVoice([]), { language: 'en-IN' })
})

test('the greeting is timed with the words on screen and never outlasts the transition by much', () => {
  assert.ok(GREETING_SPEAK_AT_MS <= WELCOME_REVEAL.startMs)
  assert.ok(GREETING_LATE_MS <= totalMs(signInTimeline(false)))
})

test('withTimeout: the answer, or the fallback when it is late or fails', async () => {
  assert.equal(await withTimeout(Promise.resolve(1), 50, 0), 1)
  assert.equal(await withTimeout(new Promise<number>((r) => setTimeout(() => r(1), 40)), 5, 0), 0)
  assert.equal(await withTimeout(Promise.reject(new Error('x')), 50, 7), 7)
})
