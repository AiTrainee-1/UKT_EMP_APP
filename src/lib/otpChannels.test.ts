// Run with `npm test`. WhatsApp codes and SMS codes are switched on separately by HR (WhatsApp Control / SMS Control):
// which ways a code can go for each screen (GET /auth/login-options `otpChannels` + `channels`, or an older server's one
// `otpChannel`), which one the main button uses, what goes into POST /auth/otp/request, the "Send by SMS instead"
// offer, a channel switched off meanwhile (400 channel_unavailable) and which sign-in form shows after a reload.
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  OTP_CHANNELS,
  channelChoices,
  channelName,
  channelUnavailable,
  chooseButtonLabel,
  chooseHint,
  codeLengthFor,
  describeOtpRequestError,
  fallbackChannels,
  fallbackOffer,
  nextLoginMode,
  normalizeChannelList,
  otpCopy,
  preferredChannel,
  purposeCodes,
  requestChannel,
  singleChannel,
  unknownCodes,
  type CodeOptionsSource,
} from './otp.ts'

/** GET /auth/login-options from a server with independent channels (both on for sign-in, SMS only for a reset). */
const NEW_SERVER: CodeOptionsSource = {
  otpLogin: true,
  otpReset: true,
  otpActivate: false,
  passwordLogin: true,
  otpChannel: 'whatsapp',
  codeLength: 6,
  otpChannels: { login: ['whatsapp', 'sms'], reset: ['sms'], activate: [] },
  channels: { whatsapp: { name: 'WhatsApp', codeLength: 6 }, sms: { name: 'SMS', codeLength: 4 } },
} as CodeOptionsSource

// ---------------------------------------------------------------------------
// Reading the sign-in options
// ---------------------------------------------------------------------------

test('normalizeChannelList keeps known channels once, in the server order', () => {
  assert.deepEqual(normalizeChannelList(['whatsapp', 'sms']), ['whatsapp', 'sms'])
  assert.deepEqual(normalizeChannelList(['SMS', ' whatsapp ', 'sms', 'email', 7, null]), ['sms', 'whatsapp'])
  assert.deepEqual(normalizeChannelList('whatsapp'), [])
  assert.deepEqual(normalizeChannelList(undefined), [])
  assert.deepEqual(OTP_CHANNELS, ['whatsapp', 'sms'])
  assert.equal(channelName('whatsapp'), 'WhatsApp')
  assert.equal(channelName('sms'), 'SMS')
})

test('a new server: each purpose has its own list; an empty list means no code for it', () => {
  const login = purposeCodes(NEW_SERVER, 'login')
  assert.deepEqual(login, {
    available: true,
    channels: ['whatsapp', 'sms'],
    choosable: true,
    lengths: { whatsapp: 6, sms: 4 },
    neutralLength: 6,
  })
  const reset = purposeCodes(NEW_SERVER, 'reset')
  assert.equal(reset.available, true)
  assert.deepEqual(reset.channels, ['sms'])
  const activate = purposeCodes(NEW_SERVER, 'activate')
  assert.equal(activate.available, false)
  assert.deepEqual(activate.channels, [])
  assert.equal(activate.choosable, true)
})

test('only WhatsApp on, only SMS on, neither: either one alone is enough', () => {
  const only = (list: string[]) =>
    purposeCodes({ ...NEW_SERVER, otpChannels: { login: list, reset: list, activate: list } } as CodeOptionsSource, 'login')
  assert.deepEqual(only(['whatsapp']).channels, ['whatsapp'])
  assert.equal(only(['whatsapp']).available, true)
  assert.deepEqual(only(['sms']).channels, ['sms'])
  assert.equal(only(['sms']).available, true)
  assert.equal(only([]).available, false)
  // A list the app cannot use (a channel it does not know) is no code at all, never a guess.
  assert.equal(only(['email']).available, false)
})

test('the list wins over the old purpose switch (they agree on a real server, the list is the truth)', () => {
  const codes = purposeCodes({ ...NEW_SERVER, otpLogin: true, otpChannels: { login: [] } } as CodeOptionsSource, 'login')
  assert.equal(codes.available, false)
})

test('each channel has its own length: from `channels`, else the channel default', () => {
  const codes = purposeCodes(
    { otpChannels: { login: ['whatsapp', 'sms'] }, channels: { whatsapp: { codeLength: 8 }, sms: { codeLength: 'x' } } },
    'login',
  )
  assert.deepEqual(codes.lengths, { whatsapp: 8, sms: 4 })
  assert.equal(codeLengthFor(codes, 'whatsapp'), 8)
  assert.equal(codeLengthFor(codes, 'sms'), 4)
  assert.equal(codeLengthFor(codes, null), 6)
})

test('an older server (one otpChannel for everything): its purpose switch and its one channel, nothing to choose', () => {
  const old = { otpLogin: true, otpReset: false, otpActivate: true, passwordLogin: true, otpChannel: 'sms', codeLength: 4 }
  const login = purposeCodes(old, 'login')
  assert.deepEqual(login, {
    available: true,
    channels: ['sms'],
    choosable: false,
    lengths: { whatsapp: 6, sms: 4 },
    neutralLength: 4,
  })
  assert.equal(purposeCodes(old, 'reset').available, false)
  assert.deepEqual(purposeCodes(old, 'reset').channels, [])
  assert.equal(purposeCodes({ ...old, otpChannel: 'sms', codeLength: 5 }, 'login').lengths.sms, 5)
})

test('a server from before the SMS channel (no channel at all): a code, neutral words, 6 digits', () => {
  const codes = purposeCodes({ otpLogin: true, otpReset: true, otpActivate: true, passwordLogin: true }, 'reset')
  assert.equal(codes.available, true)
  assert.deepEqual(codes.channels, [])
  assert.equal(codes.choosable, false)
  assert.equal(codes.neutralLength, 6)
  assert.equal(singleChannel(codes), null)
})

test('no answer yet / none at all: purposeCodes(null) offers nothing; unknownCodes offers a neutral code', () => {
  assert.equal(purposeCodes(null, 'login').available, false)
  assert.equal(purposeCodes(undefined, 'activate').available, false)
  const unknown = unknownCodes()
  assert.equal(unknown.available, true)
  assert.deepEqual(unknown.channels, [])
  assert.equal(unknown.choosable, false)
  assert.equal(codeLengthFor(unknown, null), 6)
  assert.equal(requestChannel(unknown, 'sms'), undefined)
})

// ---------------------------------------------------------------------------
// Picking a channel
// ---------------------------------------------------------------------------

test('singleChannel names the one way on offer, and nothing with two (the employee picks)', () => {
  assert.equal(singleChannel(purposeCodes(NEW_SERVER, 'reset')), 'sms')
  assert.equal(singleChannel(purposeCodes(NEW_SERVER, 'login')), null)
  // With two the screen wording stays neutral (it names neither).
  const copy = otpCopy(singleChannel(purposeCodes(NEW_SERVER, 'login')))
  assert.equal(copy.channelName, '')
  assert.equal(copy.loginSwitchLink, 'Sign in with a code')
})

test('the main button is the channel picked last time, while it is still on offer; else the server first', () => {
  assert.equal(preferredChannel(['whatsapp', 'sms'], 'sms'), 'sms')
  assert.equal(preferredChannel(['whatsapp', 'sms'], 'SMS'), 'sms')
  assert.equal(preferredChannel(['whatsapp', 'sms'], null), 'whatsapp')
  assert.equal(preferredChannel(['whatsapp', 'sms'], 'carrier-pigeon'), 'whatsapp')
  assert.equal(preferredChannel(['whatsapp'], 'sms'), 'whatsapp')
  assert.equal(preferredChannel([], 'sms'), null)
  assert.deepEqual(channelChoices(['whatsapp', 'sms'], 'sms'), ['sms', 'whatsapp'])
  assert.deepEqual(channelChoices(['whatsapp', 'sms'], undefined), ['whatsapp', 'sms'])
  assert.deepEqual(channelChoices(['sms'], 'whatsapp'), ['sms'])
  assert.deepEqual(channelChoices([], 'sms'), [])
})

test('choosing: "Send code by WhatsApp" / "Send code by SMS", and a hint naming both with their digits', () => {
  assert.equal(chooseButtonLabel('whatsapp'), 'Send code by WhatsApp')
  assert.equal(chooseButtonLabel('sms'), 'Send code by SMS')
  assert.equal(
    chooseHint(purposeCodes(NEW_SERVER, 'login')),
    'Choose how to get your code: WhatsApp (6 digits) or SMS (4 digits). It goes to the mobile number registered with HR.',
  )
})

test('the request names the channel only to a server that takes one, and only a known channel', () => {
  const login = purposeCodes(NEW_SERVER, 'login')
  assert.equal(requestChannel(login, 'sms'), 'sms')
  assert.equal(requestChannel(login, 'whatsapp'), 'whatsapp')
  assert.equal(requestChannel(login, null), undefined)
  // An old client-style server ignores `channel`: never send it one.
  const old = purposeCodes({ otpLogin: true, otpChannel: 'whatsapp' }, 'login')
  assert.equal(requestChannel(old, 'whatsapp'), undefined)
})

// ---------------------------------------------------------------------------
// After a code went out
// ---------------------------------------------------------------------------

test('"Send by SMS instead": the answer\'s otherChannels without the one used, limited to what is still on offer', () => {
  assert.deepEqual(fallbackChannels(['sms'], 'whatsapp'), ['sms'])
  assert.deepEqual(fallbackChannels(['whatsapp', 'sms'], 'whatsapp'), ['sms'])
  assert.deepEqual(fallbackChannels([], 'whatsapp'), [])
  assert.deepEqual(fallbackChannels(undefined, 'whatsapp'), [])
  assert.deepEqual(fallbackChannels(['sms'], 'whatsapp', ['whatsapp']), [])
  assert.deepEqual(fallbackChannels(['sms'], 'whatsapp', ['whatsapp', 'sms']), ['sms'])
  assert.deepEqual(fallbackOffer('sms'), { prefix: "Didn't get it? ", action: 'Send by SMS instead' })
  assert.deepEqual(fallbackOffer('whatsapp'), { prefix: "Didn't get it? ", action: 'Send by WhatsApp instead' })
})

// ---------------------------------------------------------------------------
// A channel switched off meanwhile
// ---------------------------------------------------------------------------

const http = (status: number, data?: unknown) => ({ response: { status, data } })

test('400 channel_unavailable: the server sentence and what is still on offer (axios error or plain object)', () => {
  const sentence = 'Codes by SMS are switched off. Use WhatsApp instead.'
  assert.deepEqual(
    channelUnavailable(http(400, { code: 'channel_unavailable', availableChannels: ['whatsapp'], message: sentence })),
    { available: ['whatsapp'], message: sentence },
  )
  assert.deepEqual(
    channelUnavailable({ status: 400, data: { code: 'channel_unavailable', availableChannels: [], error: sentence } }),
    { available: [], message: sentence },
  )
  // The snake_case spelling (an error body is not camelised by the API client) is read too.
  assert.deepEqual(channelUnavailable(http(400, { code: 'channel_unavailable', available_channels: ['sms'] }))?.available, ['sms'])
})

test('channel_unavailable without a sentence gets a plain one; anything else is not channel_unavailable', () => {
  assert.equal(
    channelUnavailable(http(400, { code: 'channel_unavailable', availableChannels: ['whatsapp', 'sms'] }))?.message,
    'That way of sending codes is not available right now. Use WhatsApp or SMS instead.',
  )
  assert.equal(channelUnavailable(http(400, { code: 'channel_unavailable' }))?.message, 'Codes cannot be sent right now.')
  assert.equal(channelUnavailable(http(400, { error: 'No mobile number is registered.' })), null)
  assert.equal(channelUnavailable(http(403, { code: 'channel_unavailable' })), null)
  assert.equal(channelUnavailable(http(400, '<html>')), null)
  assert.equal(channelUnavailable({ message: 'Network Error' }), null)
  assert.equal(channelUnavailable(undefined), null)
  // The general sorter still treats it as a refusal with the server's sentence.
  const p = describeOtpRequestError(http(400, { code: 'channel_unavailable', error: 'Switched off.' }), 'x')
  assert.equal(p.kind, 'rejected')
  assert.equal(p.message, 'Switched off.')
})

// ---------------------------------------------------------------------------
// The sign-in form after the options (re)load
// ---------------------------------------------------------------------------

test('first load: the code form when codes work, else the password', () => {
  assert.equal(nextLoginMode('password', null, true, true), 'otp')
  assert.equal(nextLoginMode('password', null, false, true), 'password')
})

test('a reload keeps the form the employee chose', () => {
  assert.equal(nextLoginMode('password', true, true, true), 'password')
  assert.equal(nextLoginMode('otp', true, true, true), 'otp')
})

test('a reload follows HR: codes off -> password; codes back on -> code form; password sign-in off -> code form', () => {
  assert.equal(nextLoginMode('otp', true, false, true), 'password')
  assert.equal(nextLoginMode('password', false, true, true), 'otp')
  assert.equal(nextLoginMode('password', true, true, false), 'otp')
  // No code and password "off" cannot happen on the server (nobody is locked out); the password form still shows.
  assert.equal(nextLoginMode('otp', true, false, false), 'password')
})

// ---------------------------------------------------------------------------
// The screens follow the switches (source checks: the screens need a phone to run)
// ---------------------------------------------------------------------------

const strip = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

test('every code screen reads login-options through the refreshing hook, never once on mount', () => {
  for (const screen of ['../../app/(auth)/login.tsx', '../../app/(auth)/forgot-password.tsx', '../../app/(auth)/set-password.tsx']) {
    const source = strip(screen)
    assert.match(source, /useLoginOptions\(/, screen)
    assert.doesNotMatch(source, /loginOptionsRequest\(/, screen)
    assert.match(source, /onChannelsChanged=\{/, screen)
    assert.doesNotMatch(source, /otpChannel\b/, screen)
  }
})

test('the hook asks again when the screen gains focus, the app comes to the front and the phone is back online', () => {
  const hook = strip('../hooks/useLoginOptions.ts')
  assert.match(hook, /useFocusEffect\(/)
  assert.match(hook, /AppState\.addEventListener\('change'/)
  assert.match(hook, /state === 'active'/)
  assert.match(hook, /onlineManager\.subscribe\(/)
  // Nothing cached: no query cache, no stale time.
  assert.doesNotMatch(hook, /useQuery|staleTime/)
})

test('OtpFlow sends the picked channel, reloads the options on channel_unavailable and never stores the code', () => {
  const flow = strip('../components/auth/OtpFlow.tsx')
  assert.match(flow, /requestOtp\(.*requestChannel\(codes, via\)\)/)
  assert.match(flow, /channelUnavailable\(err\)/)
  assert.match(flow, /onChannelsChanged\?\.\(\)/)
  assert.match(flow, /maxLength=\{length\}/)
  assert.doesNotMatch(flow, /console\.|AsyncStorage|SecureStore/)
})
