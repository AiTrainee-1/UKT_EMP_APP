// Run with `npm test`. The "location is off" popup's wording and the check for expo-location's "location is off" errors.
import assert from 'node:assert/strict'
import test from 'node:test'

import { LOCATION_OFF_TITLE, isLocationOffError, locationOffCopy } from './locationOff.ts'

test('each feature explains why it needs the location', () => {
  assert.equal(locationOffCopy('punch').title, LOCATION_OFF_TITLE)
  assert.match(locationOffCopy('punch').body, /branch/)
  assert.match(locationOffCopy('on_duty').body, /On-Duty punch/)
  assert.match(locationOffCopy('tracking').body, /route/)
  assert.match(locationOffCopy().body, /location/)
})

test("expo-location's Android errors for location switched off are recognised", () => {
  assert.equal(isLocationOffError({ code: 'ERR_CURRENT_LOCATION_IS_UNAVAILABLE', message: 'x' }), true)
  assert.equal(isLocationOffError({ code: 'ERR_LOCATION_SETTINGS_UNSATISFIED' }), true)
  assert.equal(
    isLocationOffError(new Error('Current location is unavailable. Make sure that location services are enabled')),
    true,
  )
  assert.equal(isLocationOffError(new Error('Location request failed due to unsatisfied device settings')), true)
})

test("iOS's 'Location services are disabled' is recognised", () => {
  assert.equal(isLocationOffError(new Error('Location services are disabled')), true)
})

test('other failures are not', () => {
  assert.equal(isLocationOffError(new Error('Not authorized to use location services')), false)
  assert.equal(isLocationOffError(new Error('Network Error')), false)
  assert.equal(isLocationOffError({ code: 'ERR_LOCATION_UNAUTHORIZED' }), false)
  assert.equal(isLocationOffError(null), false)
  assert.equal(isLocationOffError('Location services are disabled'), false)
})
