// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TOUR_SEEN_KEY,
  buildTour,
  cardTop,
  spotlightRect,
  tabRect,
  tourProgress,
  visibleTabs,
} from './appTour.ts'

test('the seen key moved past the short v1 tour, so everyone gets the full tour once', () => {
  assert.equal(TOUR_SEEN_KEY, 'uktextiles.homeTourSeen.v2')
  assert.notEqual(TOUR_SEEN_KEY, 'uktextiles.homeTourSeen.v1')
})

test('a staff Department Head sees every step, welcome first and done last', () => {
  const steps = buildTour({ isManager: true, employmentType: 'staff' })
  const keys = steps.map((s) => s.key)
  assert.equal(keys[0], 'welcome')
  assert.equal(keys[keys.length - 1], 'done')
  for (const k of ['menu', 'bell', 'avatar', 'profileCard', 'attendance', 'today', 'punch', 'actions', 'insights',
    'tabAttendance', 'tabShift', 'tabApprovals', 'tabProfile', 'onDuty', 'outpass', 'requests', 'pay', 'help']) {
    assert.ok(keys.includes(k), k)
  }
  assert.equal(new Set(keys).size, keys.length)
  const requests = steps.find((s) => s.key === 'requests')!
  assert.deepEqual(requests.features!.map((f) => f.title), ['Leave', 'Permission', 'Missing Punch', 'Casual Leave'])
  const pay = steps.find((s) => s.key === 'pay')!
  assert.equal(pay.title, 'Salary & Compensation')
  assert.ok(pay.features!.some((f) => f.title === 'Compensation'))
})

test('Approvals only for a Department Head', () => {
  const keys = buildTour({ isManager: false, employmentType: 'staff' }).map((s) => s.key)
  assert.ok(!keys.includes('tabApprovals'))
})

test('a production employee is never promised Leave, Permission, Casual Leave or Compensation', () => {
  const steps = buildTour({ isManager: false, employmentType: 'production' })
  const requests = steps.find((s) => s.key === 'requests')!
  assert.equal(requests.title, 'Missing Punch')
  assert.deepEqual(requests.features!.map((f) => f.title), ['Missing Punch'])
  const pay = steps.find((s) => s.key === 'pay')!
  assert.equal(pay.title, 'Salary & Advances')
  assert.ok(!pay.features!.some((f) => f.title === 'Compensation'))
  const text = JSON.stringify(steps)
  assert.ok(!text.includes('Casual Leave days'))
})

test('while the profile loads: staff-only rows show (the older rule), Compensation waits for "staff"', () => {
  const steps = buildTour({ isManager: false, employmentType: undefined })
  assert.equal(steps.find((s) => s.key === 'requests')!.features!.length, 4)
  assert.equal(steps.find((s) => s.key === 'pay')!.title, 'Salary & Advances')
})

test('anchored steps point at Home; illustrated steps carry features and say where to find them', () => {
  for (const s of buildTour({ isManager: true, employmentType: 'staff' })) {
    if (s.features) {
      assert.equal(s.anchor, undefined, s.key)
      assert.ok(s.where, s.key)
    }
    assert.ok(s.title && s.body && s.icon, s.key)
  }
})

test('tab buttons share the bar equally; Approvals only for a head', () => {
  assert.deepEqual(visibleTabs(false), ['home', 'attendance', 'shift', 'profile'])
  assert.deepEqual(visibleTabs(true), ['home', 'attendance', 'shift', 'approvals', 'profile'])
  const content = { x: 0, y: 0, width: 400, height: 700 }
  assert.deepEqual(tabRect(content, 'attendance', false, 62), { x: 100, y: 700, width: 100, height: 62 })
  assert.deepEqual(tabRect(content, 'profile', true, 62), { x: 320, y: 700, width: 80, height: 62 })
  assert.equal(tabRect(content, 'approvals', false, 62), null)
  assert.equal(tabRect({ ...content, width: 0 }, 'home', false, 62), null)
})

test('spotlight: padded and kept on the screen', () => {
  const screen = { width: 400, height: 800 }
  assert.deepEqual(spotlightRect({ x: 20, y: 100, width: 100, height: 40 }, 8, screen), { x: 12, y: 92, width: 116, height: 56 })
  assert.deepEqual(spotlightRect({ x: 0, y: 0, width: 400, height: 20 }, 8, screen), { x: 4, y: 4, width: 392, height: 24 })
})

test('card: below when it fits, above when there is more room, always on screen', () => {
  const screen = { top: 40, bottom: 780 }
  // near the top: below
  assert.deepEqual(cardTop({ x: 0, y: 60, width: 50, height: 40 }, 200, screen), { top: 114, side: 'below' })
  // near the bottom (the tab bar): above
  assert.deepEqual(cardTop({ x: 0, y: 700, width: 50, height: 60 }, 200, screen), { top: 486, side: 'above' })
  // a tall element with no room either side: kept inside the screen
  const tall = cardTop({ x: 0, y: 100, width: 50, height: 600 }, 300, screen)
  assert.ok(tall.top >= 40 && tall.top + 300 <= 780)
})

test('progress', () => {
  assert.deepEqual(tourProgress(0, 4), { label: 'Step 1 of 4', ratio: 0.25 })
  assert.deepEqual(tourProgress(3, 4), { label: 'Step 4 of 4', ratio: 1 })
  assert.deepEqual(tourProgress(9, 4), { label: 'Step 4 of 4', ratio: 1 })
  assert.deepEqual(tourProgress(0, 0), { label: 'Step 1 of 1', ratio: 1 })
})
