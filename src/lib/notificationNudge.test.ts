// Run with `npm test`. When the "Turn on notifications" popup shows, and what its button does.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NOTIFICATION_NUDGE_COOLDOWN_MS,
  NOTIFICATION_NUDGE_KEY,
  NOTIFICATION_REASONS,
  accessFromAndroidResult,
  accessFromExpo,
  createHoldSet,
  notificationButtonAction,
  parseShownAt,
  shouldOfferNotifications,
} from './notificationNudge.ts'

const OFF = { granted: false, canAskAgain: true }
const ON = { granted: true, canAskAgain: true }
const NOW = 1_800_000_000_000
const DAY = NOTIFICATION_NUDGE_COOLDOWN_MS

test('the cool-down is one day and the key is versioned', () => {
  assert.equal(DAY, 86_400_000)
  assert.match(NOTIFICATION_NUDGE_KEY, /\.v\d+$/)
})

test('shown when notifications are off and it was never shown', () => {
  assert.equal(shouldOfferNotifications(OFF, null, NOW), true)
})

test('never shown when notifications are on, or when the phone cannot say', () => {
  assert.equal(shouldOfferNotifications(ON, null, NOW), false)
  assert.equal(shouldOfferNotifications(null, null, NOW), false)
})

test('at most once a day after it was shown or put off', () => {
  assert.equal(shouldOfferNotifications(OFF, NOW - 1000, NOW), false)
  assert.equal(shouldOfferNotifications(OFF, NOW - DAY + 1, NOW), false)
  assert.equal(shouldOfferNotifications(OFF, NOW - DAY, NOW), true)
  assert.equal(shouldOfferNotifications(OFF, NOW - 3 * DAY, NOW), true)
})

test('a "last shown" in the future (clock moved back) does not hold it off for days', () => {
  assert.equal(shouldOfferNotifications(OFF, NOW + 5 * DAY, NOW), true)
  assert.equal(shouldOfferNotifications(OFF, NOW + 30_000, NOW), false)
})

test('the stored time is read safely', () => {
  assert.equal(parseShownAt(null), null)
  assert.equal(parseShownAt(''), null)
  assert.equal(parseShownAt('abc'), null)
  assert.equal(parseShownAt('-5'), null)
  assert.equal(parseShownAt(String(NOW)), NOW)
})

test('the button asks while the phone still can, else opens settings', () => {
  assert.equal(notificationButtonAction(OFF), 'ask')
  assert.equal(notificationButtonAction({ granted: false, canAskAgain: false }), 'settings')
})

test("expo-notifications' answers, Android and iOS", () => {
  assert.deepEqual(accessFromExpo({ granted: true, status: 'granted', canAskAgain: true }), ON)
  assert.deepEqual(accessFromExpo({ granted: false, status: 'denied', canAskAgain: false }), { granted: false, canAskAgain: false })
  assert.deepEqual(accessFromExpo({ granted: false, status: 'undetermined', canAskAgain: true }), OFF)
  // iOS provisional counts as on
  assert.deepEqual(accessFromExpo({ granted: false, status: 'undetermined', canAskAgain: true, iosStatus: 3 }), ON)
  assert.equal(accessFromExpo({ granted: false, status: 'denied', iosStatus: 1 }).granted, false)
  // canAskAgain missing: assume the phone can still ask
  assert.equal(accessFromExpo({ status: 'denied' }).canAskAgain, true)
  // no status at all: the granted flag decides
  assert.equal(accessFromExpo({ granted: true }).granted, true)
})

test('Android 13+: permission given but notifications switched off in settings = off, settings only', () => {
  assert.deepEqual(accessFromExpo({ granted: true, status: 'denied', canAskAgain: true }), { granted: false, canAskAgain: false })
})

test("React Native's Android answers (Expo Go)", () => {
  assert.deepEqual(accessFromAndroidResult('granted'), ON)
  assert.deepEqual(accessFromAndroidResult('denied'), OFF)
  assert.deepEqual(accessFromAndroidResult('never_ask_again'), { granted: false, canAskAgain: false })
})

test('the popup says what notifications are for', () => {
  const text = NOTIFICATION_REASONS.map((r) => r.text).join(' ')
  assert.match(text, /Approvals/)
  assert.match(text, /requests/)
  assert.match(text, /enquiries/)
  assert.match(text, /gate pass/)
})

test('holds: held while any is on, listeners told only on a change', () => {
  const holds = createHoldSet()
  let calls = 0
  const off = holds.subscribe(() => { calls += 1 })
  assert.equal(holds.held(), false)
  holds.set('tour', true)
  holds.set('tour', true)
  holds.set('gate', true)
  assert.equal(holds.held(), true)
  holds.set('tour', false)
  assert.equal(holds.held(), true)
  holds.set('gate', false)
  assert.equal(holds.held(), false)
  assert.equal(calls, 4)
  off()
  holds.set('tour', true)
  assert.equal(calls, 4)
})
