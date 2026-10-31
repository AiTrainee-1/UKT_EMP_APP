import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPushError, describePushSetup, getPushSetup, setPushSetup, subscribePushSetup } from './pushStatus.ts'

test('a build without Firebase is recognised from what Android / Expo say', () => {
  for (const message of [
    'Default FirebaseApp is not initialized in this process net.uktex.employee. Make sure to call FirebaseApp.initializeApp(Context) first.',
    'Fetching the token failed: Make sure FCM credentials are set up',
    'Error: google-services.json is missing',
    'MISMATCHED SENDER ID',
  ]) {
    assert.equal(classifyPushError(new Error(message)), 'fcm_missing', message)
  }
  assert.equal(classifyPushError('FirebaseApp is not initialized'), 'fcm_missing')
})

test('any other error is a plain failure', () => {
  for (const other of [new Error('Network request failed'), 'timeout', null, undefined, 5]) {
    assert.equal(classifyPushError(other), 'failed', String(other))
  }
})

test('the person is told what is wrong, and what to press, only when something is', () => {
  for (const quiet of ['unknown', 'ok', 'expo_go', 'no_project'] as const) {
    assert.equal(describePushSetup({ state: quiet }), null, quiet)
  }
  const blocked = describePushSetup({ state: 'permission_denied' })!
  assert.equal(blocked.action, 'settings')
  assert.match(blocked.body, /lock screen/)
  const fcm = describePushSetup({ state: 'fcm_missing' })!
  assert.equal(fcm.action, 'retry')
  assert.match(fcm.body, /still appear here in the app/)
  assert.equal(describePushSetup({ state: 'server_error' })!.actionLabel, 'Try again')
  assert.equal(describePushSetup({ state: 'failed' })!.action, 'retry')
})

test('the setup state is shared and listeners hear every change', () => {
  const heard: string[] = []
  const stop = subscribePushSetup(() => heard.push(getPushSetup().state))
  setPushSetup({ state: 'permission_denied' })
  setPushSetup({ state: 'ok' })
  stop()
  setPushSetup({ state: 'failed' })
  assert.deepEqual(heard, ['permission_denied', 'ok'])
  assert.equal(getPushSetup().state, 'failed')
})
