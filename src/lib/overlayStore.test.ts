// Run with `npm test`. The one-popup-at-a-time store behind the logout confirmation, the "location is off" popup and the
// sign-in / sign-out transitions (src/lib/overlayStore.ts).
import assert from 'node:assert/strict'
import test from 'node:test'

import { createOverlayStore } from './overlayStore.ts'

test('open shows the request and waits for the answer', async () => {
  const store = createOverlayStore<string, boolean>(false)
  let calls = 0
  const off = store.subscribe(() => calls++)
  assert.equal(store.get(), null)
  const waiting = store.open('punch')
  assert.equal(store.get()?.request, 'punch')
  store.answer(true)
  assert.equal(store.get(), null)
  assert.equal(await waiting, true)
  assert.equal(calls, 2)
  off()
  void store.open('again')
  assert.equal(calls, 2, 'an unsubscribed listener is not called')
  store.dismiss()
})

test('get returns the same object until something changes', () => {
  const store = createOverlayStore<string, boolean>(false)
  void store.open('a')
  const first = store.get()
  assert.equal(store.get(), first)
  store.update('b')
  assert.notEqual(store.get(), first)
  assert.equal(store.get()?.id, first?.id, 'an update keeps the id')
  assert.equal(store.get()?.request, 'b')
  store.dismiss()
})

test('opening again answers the open one with the dismissed answer and gets a new id', async () => {
  const store = createOverlayStore<string, boolean>(false)
  const one = store.open('one')
  const firstId = store.get()?.id
  const two = store.open('two')
  assert.equal(await one, false)
  assert.notEqual(store.get()?.id, firstId)
  store.answer(true)
  assert.equal(await two, true)
})

test('answer / update / dismiss do nothing when closed', () => {
  const store = createOverlayStore<string, boolean>(false)
  let calls = 0
  store.subscribe(() => calls++)
  store.answer(true)
  store.update('x')
  store.dismiss()
  assert.equal(calls, 0)
  assert.equal(store.get(), null)
})
