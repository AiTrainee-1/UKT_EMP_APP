// Run with `npm test`. The sign-in / sign-out transitions' timing, the welcome words, and that a sign-in or sign-out can
// never get stuck behind its animation or run twice (src/lib/authTransition.ts).
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GREETING_NAME_MAX,
  SIGN_IN_FALLBACK_MS,
  SIGN_OUT_FALLBACK_MS,
  authTransitions,
  farewellBeats,
  greetingName,
  nameStaggerMs,
  playSignIn,
  playSignOut,
  signInTimeline,
  signOutTimeline,
  totalMs,
  welcomeRevealEndMs,
  welcomeWords,
} from './authTransition.ts'

test('sign-in takes about 2 - 2.4 s, unhurried; Reduce Motion is shorter', () => {
  const full = totalMs(signInTimeline(false))
  assert.ok(full >= 2000 && full <= 2400, `sign-in ${full} ms`)
  assert.ok(totalMs(signInTimeline(true)) < full)
})

test('sign-out takes about 2 - 2.5 s; Reduce Motion is a little shorter but still there', () => {
  const full = totalMs(signOutTimeline(false))
  assert.ok(full >= 2000 && full <= 2500, `sign-out ${full} ms`)
  const calm = totalMs(signOutTimeline(true))
  assert.ok(calm >= 1200 && calm <= full, `reduce motion ${calm} ms`)
})

test('the fallback never cuts the cover short, and still comes before the animation is over', () => {
  for (const reduce of [false, true]) {
    // the overlay signs in / out when its cover is complete; the fallback is clearly later than that
    assert.ok(SIGN_IN_FALLBACK_MS >= signInTimeline(reduce).enterMs + 400, `sign-in fallback, reduce ${reduce}`)
    assert.ok(SIGN_OUT_FALLBACK_MS >= signOutTimeline(reduce).enterMs + 400, `sign-out fallback, reduce ${reduce}`)
  }
  assert.ok(SIGN_IN_FALLBACK_MS < totalMs(signInTimeline(false)))
  assert.ok(SIGN_OUT_FALLBACK_MS < totalMs(signOutTimeline(false)))
})

test('the first name to greet', () => {
  assert.equal(greetingName('SURYA MATHIVANAN'), 'Surya')
  assert.equal(greetingName('surya'), 'Surya')
  assert.equal(greetingName('M. Surya'), 'Surya')
  assert.equal(greetingName('S.Surya Prakash'), 'Surya')
  assert.equal(greetingName('Mr. ravi kumar'), 'Ravi')
  assert.equal(greetingName('  Dr Anitha  '), 'Anitha')
  assert.equal(greetingName("O'NEIL JONES"), "O'neil")
  assert.equal(greetingName("O'Neil Jones"), "O'Neil")
  assert.equal(greetingName('McArthur'), 'McArthur') // mixed case is kept as written
  assert.equal(greetingName('கார்த்திக் ராஜா'), 'கார்த்திக்') // Tamil script stays whole
  assert.equal(greetingName('A'), null)
  assert.equal(greetingName('  '), null)
  assert.equal(greetingName(null), null)
  assert.equal(greetingName(undefined), null)
  assert.equal(greetingName('Venkatasubramanianathan')?.length, GREETING_NAME_MAX)
})

test('the welcome words, with and without a name', () => {
  assert.deepEqual(welcomeWords('Surya'), { title: 'Welcome back,', name: 'Surya', sentence: 'Welcome back, Surya' })
  assert.deepEqual(welcomeWords(null), { title: 'Welcome back', name: null, sentence: 'Welcome back' })
})

test('the welcome words have all landed well before the cover flies away, even for a long name', () => {
  const t = signInTimeline(false)
  const exitAt = t.enterMs + t.holdMs
  for (const name of [null, 'Surya', 'Venkatasubraman']) {
    const words = welcomeWords(name)
    const end = welcomeRevealEndMs(words.title, words.name)
    assert.ok(end <= exitAt - 250, `${name}: words land at ${end} ms, exit at ${exitAt} ms`)
    // and they begin once the screen is covered, not while the portal is still opening
    assert.ok(end > t.enterMs)
  }
  // a long name staggers faster, so it does not take longer to appear
  assert.ok(nameStaggerMs(16) < nameStaggerMs(5))
  assert.equal(nameStaggerMs(1), 0)
})

test('the walk out: the door shuts after the person is out, and the lights go off before the scene fades', () => {
  for (const reduce of [false, true]) {
    const b = farewellBeats(reduce)
    const t = signOutTimeline(reduce)
    const exitAt = t.enterMs + t.holdMs
    assert.ok(b.doorCloseStartMs >= b.walkStartMs, `reduce ${reduce}`)
    // shut (and, with motion, the click's little bounce of 240 ms) before the lights go
    const settle = reduce ? 0 : 240
    assert.ok(b.doorCloseStartMs + b.doorCloseMs + settle <= b.lightsOffMs + 40, `reduce ${reduce}`)
    // the lights are out before the scene starts to fade
    assert.ok(b.lightsOffMs + 400 <= exitAt + 120, `reduce ${reduce}`)
  }
  const b = farewellBeats(false)
  // a good part of the walk is done when the door starts to move (the person is clear of the doorway)
  assert.ok((b.doorCloseStartMs - b.walkStartMs) / b.walkMs >= 0.3)
  // Reduce Motion: nobody walks
  assert.equal(farewellBeats(true).walkMs, 0)
})

test('the overlay covering the screen signs in once, and carries the first name', () => {
  let calls = 0
  playSignIn({ x: 10, y: 20 }, () => calls++, { name: 'SURYA MATHIVANAN', fallbackMs: 50 })
  const open = authTransitions.get()
  assert.equal(open?.request.kind, 'sign-in')
  if (open?.request.kind === 'sign-in') {
    assert.deepEqual(open.request.origin, { x: 10, y: 20 })
    assert.equal(open.request.name, 'Surya')
    open.request.onCovered()
    open.request.onCovered()
  }
  assert.equal(calls, 1)
  authTransitions.dismiss()
})

test('no name: a plain "Welcome back"', () => {
  playSignIn(null, () => {}, { fallbackMs: 10 })
  const open = authTransitions.get()
  assert.equal(open?.request.kind === 'sign-in' && open.request.name, null)
  authTransitions.dismiss()
})

test('the overlay covering the screen first, then the fallback: still only one sign-in', async () => {
  let calls = 0
  playSignIn(null, () => calls++, { fallbackMs: 20 })
  const open = authTransitions.get()
  if (open?.request.kind === 'sign-in') open.request.onCovered()
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(calls, 1)
  authTransitions.dismiss()
})

test('without the overlay, the sign-in still happens after the fallback time, once', async () => {
  let calls = 0
  playSignIn(null, () => calls++, { fallbackMs: 20 })
  authTransitions.dismiss()
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(calls, 1)
  const open = authTransitions.get()
  assert.equal(open, null)
})

test('the scene opens the sign-out overlay and signs out once, when it covers the screen', () => {
  let calls = 0
  playSignOut(() => calls++, 50)
  const open = authTransitions.get()
  assert.equal(open?.request.kind, 'sign-out')
  if (open?.request.kind === 'sign-out') {
    open.request.onCovered()
    open.request.onCovered()
  }
  assert.equal(calls, 1)
  authTransitions.answer()
  assert.equal(authTransitions.get(), null)
})

test('without the overlay, the sign-out still happens after the fallback time, once', async () => {
  let calls = 0
  playSignOut(() => calls++, 20)
  authTransitions.dismiss()
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(calls, 1)
})

test('a sign-out that replaces a sign-in still on screen: each runs exactly once', async () => {
  let signIns = 0
  let signOuts = 0
  playSignIn(null, () => signIns++, { fallbackMs: 20 })
  playSignOut(() => signOuts++, 20)
  assert.equal(authTransitions.get()?.request.kind, 'sign-out')
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(signIns, 1)
  assert.equal(signOuts, 1)
  authTransitions.dismiss()
})
