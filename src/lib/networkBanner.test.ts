// Run with `npm test`. The connection banner: offline -> "Reconnecting..." -> "Connected" -> hidden, and how it sits
// with the older "Can't reach the server" notice.
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BANNER_TEXT,
  INITIAL_NETWORK_BANNER,
  bannerView,
  isOnline,
  networkOnline,
  reduceNetworkBanner,
  type NetworkBannerEvent,
  type NetworkBannerState,
} from './networkBanner.ts'

const run = (events: NetworkBannerEvent[], from: NetworkBannerState = INITIAL_NETWORK_BANNER) =>
  events.reduce(reduceNetworkBanner, from)

const offline: NetworkBannerEvent = { type: 'network', isConnected: false, isInternetReachable: false }
const online: NetworkBannerEvent = { type: 'network', isConnected: true, isInternetReachable: true }

test('not known yet counts as online and shows nothing', () => {
  assert.equal(networkOnline(INITIAL_NETWORK_BANNER), null)
  assert.equal(isOnline(INITIAL_NETWORK_BANNER), true)
  assert.equal(INITIAL_NETWORK_BANNER.phase, 'hidden')
})

test('starting online shows nothing', () => {
  const s = run([online])
  assert.equal(s.phase, 'hidden')
  assert.equal(isOnline(s), true)
})

test('starting offline shows the offline banner', () => {
  const s = run([offline])
  assert.equal(s.phase, 'offline')
  assert.equal(isOnline(s), false)
})

test('full cycle: offline -> reconnecting -> connected -> hidden', () => {
  let s = run([online, offline])
  assert.equal(s.phase, 'offline')
  s = reduceNetworkBanner(s, online)
  assert.equal(s.phase, 'reconnecting')
  s = reduceNetworkBanner(s, { type: 'recheck-done', ok: true })
  assert.equal(s.phase, 'connected')
  s = reduceNetworkBanner(s, { type: 'connected-shown' })
  assert.equal(s.phase, 'hidden')
})

test('a failed re-check hides the network banner (the server notice takes over)', () => {
  const s = run([offline, online, { type: 'recheck-done', ok: false }])
  assert.equal(s.phase, 'hidden')
  assert.equal(bannerView({ phase: s.phase, serverOffline: true, serverDismissed: false, signedIn: true, startingUp: false }), 'server-down')
})

test('losing the internet again while reconnecting goes back to offline and ignores the stale re-check', () => {
  let s = run([offline, online])
  assert.equal(s.phase, 'reconnecting')
  s = reduceNetworkBanner(s, offline)
  assert.equal(s.phase, 'offline')
  s = reduceNetworkBanner(s, { type: 'recheck-done', ok: true })
  assert.equal(s.phase, 'offline')
  s = reduceNetworkBanner(s, { type: 'connected-shown' })
  assert.equal(s.phase, 'offline')
})

test('losing the internet while "Connected" is up shows offline at once', () => {
  const s = run([offline, online, { type: 'recheck-done', ok: true }, offline])
  assert.equal(s.phase, 'offline')
})

test('connected without confirmed internet (Android) counts as offline', () => {
  const s = run([{ type: 'network', isConnected: true, isInternetReachable: false }])
  assert.equal(s.phase, 'offline')
})

test('an answer from our server overrides a wrong "no internet" until the phone reports a change', () => {
  let s = run([{ type: 'network', isConnected: true, isInternetReachable: false }])
  assert.equal(s.phase, 'offline')
  s = reduceNetworkBanner(s, { type: 'server-answered' })
  assert.equal(isOnline(s), true)
  assert.equal(s.phase, 'reconnecting')
  // a real change from the phone resets the override
  s = reduceNetworkBanner(s, offline)
  assert.equal(s.phase, 'offline')
})

test('a late server answer never overrides "no network at all"', () => {
  const s = run([online, offline, { type: 'server-answered' }])
  assert.equal(isOnline(s), false)
  assert.equal(s.phase, 'offline')
})

test('a server answer while online changes nothing', () => {
  const s0 = run([online])
  const s1 = reduceNetworkBanner(s0, { type: 'server-answered' })
  assert.equal(s1.phase, 'hidden')
  assert.equal(reduceNetworkBanner(s1, { type: 'server-answered' }), s1)
})

test('repeated identical network events are ignored', () => {
  const s = run([offline])
  assert.equal(reduceNetworkBanner(s, offline), s)
})

test('re-check results outside reconnecting are ignored', () => {
  const s = run([online])
  assert.equal(reduceNetworkBanner(s, { type: 'recheck-done', ok: true }), s)
  assert.equal(reduceNetworkBanner(s, { type: 'connected-shown' }), s)
})

test('missing fields from the phone count as unknown', () => {
  const s = run([{ type: 'network', isConnected: undefined, isInternetReachable: undefined }])
  assert.equal(networkOnline(s), null)
  assert.equal(s.phase, 'hidden')
  // connected but reachability unknown: online
  assert.equal(networkOnline(run([{ type: 'network', isConnected: true }])), true)
})

test('banner view: network phases win, then the server notice for a signed-in employee', () => {
  const base = { serverOffline: false, serverDismissed: false, signedIn: true, startingUp: false }
  assert.equal(bannerView({ ...base, phase: 'offline' }), 'offline')
  assert.equal(bannerView({ ...base, phase: 'offline', signedIn: false }), 'offline') // also on the login screen
  assert.equal(bannerView({ ...base, phase: 'offline', serverOffline: true }), 'offline')
  assert.equal(bannerView({ ...base, phase: 'reconnecting', signedIn: false }), 'reconnecting')
  assert.equal(bannerView({ ...base, phase: 'connected' }), 'connected')
  assert.equal(bannerView({ ...base, phase: 'hidden' }), 'none')
  assert.equal(bannerView({ ...base, phase: 'hidden', serverOffline: true }), 'server-down')
  assert.equal(bannerView({ ...base, phase: 'hidden', serverOffline: true, serverDismissed: true }), 'none')
  assert.equal(bannerView({ ...base, phase: 'hidden', serverOffline: true, signedIn: false }), 'none')
  // the startup screen stays clean
  assert.equal(bannerView({ ...base, phase: 'offline', startingUp: true }), 'none')
})

test("the owner's wording", () => {
  assert.equal(BANNER_TEXT.offline, 'No internet connection. Please turn on your internet.')
  assert.equal(BANNER_TEXT.reconnecting, 'Reconnecting...')
  assert.equal(BANNER_TEXT.connected, 'Connected')
  assert.equal(BANNER_TEXT['server-down'], "Can't reach the server")
})
