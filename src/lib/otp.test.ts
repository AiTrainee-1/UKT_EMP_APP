// Run with `npm test`. The one-time-code screens' rules: which channel the wording names (SMS / WhatsApp / neutral for an
// older server), the code field, the "code sent" notice, the clock-based countdown and the way a refused request is
// sorted into what to show.
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CODE_EXPIRED_NOTICE,
  OTP_LENGTH_BY_CHANNEL,
  askAgainLabel,
  codeLabel,
  describeOtpRequestError,
  enterCodeMessage,
  haveCodeNotice,
  isCompleteOtp,
  minutesPhrase,
  normalizeOtpChannel,
  otpCopy,
  otpDigits,
  otpHelpLine,
  otpLength,
  positiveSeconds,
  resendLabel,
  resolveOtpChannel,
  secondsLeft,
  sentNotice,
  sentNoticeText,
} from './otp.ts'

const MASK = '••••••1234'

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

test('normalizeOtpChannel accepts sms / whatsapp in any case and nothing else', () => {
  assert.equal(normalizeOtpChannel('sms'), 'sms')
  assert.equal(normalizeOtpChannel(' SMS '), 'sms')
  assert.equal(normalizeOtpChannel('whatsapp'), 'whatsapp')
  assert.equal(normalizeOtpChannel('WhatsApp'), 'whatsapp')
  for (const bad of ['', 'email', 'telegram', undefined, null, 5, {}, ['sms']]) assert.equal(normalizeOtpChannel(bad), null)
})

test('resolveOtpChannel: what the request named wins, then the sign-in options, else unknown', () => {
  assert.equal(resolveOtpChannel('sms', 'whatsapp'), 'sms')
  assert.equal(resolveOtpChannel('whatsapp', 'sms'), 'whatsapp')
  assert.equal(resolveOtpChannel(undefined, 'sms'), 'sms')
  assert.equal(resolveOtpChannel('nonsense', 'whatsapp'), 'whatsapp')
  assert.equal(resolveOtpChannel(undefined, undefined), null)
  assert.equal(resolveOtpChannel(null, ''), null)
})

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

test('SMS wording names SMS and never WhatsApp', () => {
  const c = otpCopy('sms')
  assert.equal(c.channelName, 'SMS')
  assert.equal(c.icon, 'message-text-outline')
  assert.equal(c.askButton, 'Send code by SMS')
  assert.equal(c.askHint, 'We will send a 4-digit code by SMS to the mobile number registered with HR.')
  assert.equal(c.loginSwitchLink, 'Sign in with an SMS code')
  assert.equal(c.resetPill, 'RESET WITH SMS')
  assert.equal(c.activateStepTitle, 'Verify your mobile number')
  for (const text of Object.values(c)) assert.doesNotMatch(String(text), /whatsapp/i)
})

test('WhatsApp wording is exactly what the app said before the SMS channel existed', () => {
  const c = otpCopy('whatsapp')
  assert.equal(c.channelName, 'WhatsApp')
  assert.equal(c.icon, 'whatsapp')
  assert.equal(c.askButton, 'Send code on WhatsApp')
  assert.equal(c.askHint, 'We will send a 6-digit code on WhatsApp to the number registered with HR.')
  assert.equal(c.loginSwitchLink, 'Sign in with a WhatsApp code')
  assert.equal(c.resetPill, 'RESET WITH WHATSAPP')
  assert.equal(
    c.resetIntro,
    'Enter your employee code and we will WhatsApp you a code. Enter it here to choose a new password.',
  )
  assert.equal(
    c.resetUnavailable,
    'Resetting with WhatsApp is not available right now. Please ask HR to reset your password, or set one up if you have never had one.',
  )
  assert.equal(c.activateIntro, 'Confirm your WhatsApp number, then choose your password.')
  assert.equal(c.activateStepTitle, 'Verify your WhatsApp number')
  assert.equal(c.activateFootnote, 'The code goes to the WhatsApp number HR has registered for you.')
  for (const text of Object.values(c)) assert.doesNotMatch(String(text), /\bsms\b/i)
})

test('a missing or unknown channel (an older server) gets neutral wording that names neither', () => {
  for (const raw of [undefined, null, '', 'carrier-pigeon']) {
    const c = otpCopy(raw)
    assert.equal(c.channelName, '')
    assert.equal(c.askButton, 'Send code')
    assert.equal(c.loginSwitchLink, 'Sign in with a code')
    assert.equal(c.resetPill, 'RESET WITH A CODE')
    for (const text of Object.values(c)) assert.doesNotMatch(String(text), /whatsapp|\bsms\b/i)
  }
})

test('the hint names the digits the server says (codeLength), else what the channel implies', () => {
  assert.equal(otpCopy('sms', 4).askHint, 'We will send a 4-digit code by SMS to the mobile number registered with HR.')
  assert.equal(otpCopy('sms').askHint, otpCopy('sms', 4).askHint)
  assert.equal(
    otpCopy('whatsapp', 6).askHint,
    'We will send a 6-digit code on WhatsApp to the number registered with HR.',
  )
  assert.equal(otpCopy('whatsapp').askHint, otpCopy('whatsapp', 6).askHint)
  // the server's number wins over the channel's
  assert.equal(otpCopy('sms', 6).askHint, 'We will send a 6-digit code by SMS to the mobile number registered with HR.')
  assert.equal(otpCopy(undefined).askHint, 'We will send a 6-digit code to the mobile number registered with HR.')
  assert.equal(otpCopy(undefined, 4).askHint, 'We will send a 4-digit code to the mobile number registered with HR.')
})

test('every channel offers the same set of strings', () => {
  const keys = Object.keys(otpCopy('sms')).sort()
  assert.deepEqual(Object.keys(otpCopy('whatsapp')).sort(), keys)
  assert.deepEqual(Object.keys(otpCopy(undefined)).sort(), keys)
})

// ---------------------------------------------------------------------------
// The code field
// ---------------------------------------------------------------------------

test('otpLength: the server codeLength first, else the channel (sms 4, whatsapp 6), else 6', () => {
  assert.deepEqual(OTP_LENGTH_BY_CHANNEL, { sms: 4, whatsapp: 6 })
  assert.equal(otpLength(4, 'sms'), 4)
  assert.equal(otpLength(6, 'whatsapp'), 6)
  assert.equal(otpLength('4', 'sms'), 4)
  // an older server sends no codeLength: the channel decides
  assert.equal(otpLength(undefined, 'sms'), 4)
  assert.equal(otpLength(undefined, 'whatsapp'), 6)
  assert.equal(otpLength(null, 'SMS'), 4)
  // nothing known: the length codes had before the SMS channel
  assert.equal(otpLength(undefined, undefined), 6)
  assert.equal(otpLength(undefined, 'carrier-pigeon'), 6)
  // a nonsense number is ignored, never trusted
  for (const bad of [0, 1, 3, 9, 100, -4, 4.5, NaN, Infinity, '', 'abc', {}, [], true]) {
    assert.equal(otpLength(bad, 'sms'), 4, String(bad))
    assert.equal(otpLength(bad, 'whatsapp'), 6, String(bad))
    assert.equal(otpLength(bad, undefined), 6, String(bad))
  }
  // the server's number wins over the channel's
  assert.equal(otpLength(6, 'sms'), 6)
  assert.equal(otpLength(4, 'whatsapp'), 4)
})

test('the field label and the "enter the code" sentence carry the length', () => {
  assert.equal(codeLabel(4), '4-digit code')
  assert.equal(codeLabel(6), '6-digit code')
  assert.equal(enterCodeMessage(4), 'Enter the 4-digit code.')
  assert.equal(enterCodeMessage(6), 'Enter the 6-digit code.')
})

test('otpDigits and isCompleteOtp follow the length: four by SMS, six on WhatsApp', () => {
  const sms = otpLength(undefined, 'sms')
  assert.equal(otpDigits('4829', sms), '4829')
  assert.equal(otpDigits('48 29', sms), '4829')
  assert.equal(otpDigits('482913', sms), '4829') // a pasted six-digit text is cut to four
  assert.equal(otpDigits('code: 4829', sms), '4829')
  assert.equal(isCompleteOtp('4829', sms), true)
  assert.equal(isCompleteOtp('0000', sms), true)
  assert.equal(isCompleteOtp('482', sms), false)
  assert.equal(isCompleteOtp('48291', sms), false)
  assert.equal(isCompleteOtp('482913', sms), false)
  assert.equal(isCompleteOtp('48a9', sms), false)
  const wa = otpLength(undefined, 'whatsapp')
  assert.equal(otpDigits('482913', wa), '482913')
  assert.equal(isCompleteOtp('482913', wa), true)
  assert.equal(isCompleteOtp('4829', wa), false)
})

test('otpDigits keeps digits only, at most six', () => {
  assert.equal(otpDigits('123456'), '123456')
  assert.equal(otpDigits('123 456'), '123456')
  assert.equal(otpDigits('123-456'), '123456')
  assert.equal(otpDigits('12ab34'), '1234')
  assert.equal(otpDigits('1234567890'), '123456')
  assert.equal(otpDigits('code: 482910'), '482910')
  assert.equal(otpDigits(''), '')
  assert.equal(otpDigits('abc'), '')
  assert.equal(otpDigits(undefined as unknown as string), '')
})

test('isCompleteOtp is exactly six digits', () => {
  assert.equal(isCompleteOtp('123456'), true)
  assert.equal(isCompleteOtp('000000'), true)
  assert.equal(isCompleteOtp('12345'), false)
  assert.equal(isCompleteOtp('1234567'), false)
  assert.equal(isCompleteOtp('12345a'), false)
  assert.equal(isCompleteOtp(''), false)
})

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

test('positiveSeconds: whole positive seconds, 0 for anything unusable, capped', () => {
  assert.equal(positiveSeconds(60), 60)
  assert.equal(positiveSeconds('42'), 42)
  assert.equal(positiveSeconds(4.2), 5)
  assert.equal(positiveSeconds(99999), 3600)
  for (const bad of [0, -5, NaN, Infinity, '', 'soon', null, undefined, {}, true]) assert.equal(positiveSeconds(bad), 0)
})

test('secondsLeft counts a clock deadline, so time spent in another app still counts', () => {
  const start = 1_000_000
  const deadline = start + 60_000
  assert.equal(secondsLeft(deadline, start), 60)
  assert.equal(secondsLeft(deadline, start + 1), 60)
  assert.equal(secondsLeft(deadline, start + 45_000), 15)
  assert.equal(secondsLeft(deadline, start + 59_001), 1)
  assert.equal(secondsLeft(deadline, start + 60_000), 0)
  // back from the SMS app long after it ran out
  assert.equal(secondsLeft(deadline, start + 600_000), 0)
  assert.equal(secondsLeft(NaN, start), 0)
  assert.equal(secondsLeft(deadline, NaN), 0)
})

test('minutesPhrase rounds to whole minutes and says "1 minute" in the singular', () => {
  assert.equal(minutesPhrase(300), '5 minutes')
  assert.equal(minutesPhrase(600), '10 minutes')
  assert.equal(minutesPhrase(120), '2 minutes')
  assert.equal(minutesPhrase(60), '1 minute')
  assert.equal(minutesPhrase(20), '1 minute')
})

test('resend and ask-again labels show the wait only while it runs', () => {
  assert.equal(resendLabel(42), 'Resend code in 42s')
  assert.equal(resendLabel(0), 'Resend code')
  assert.equal(askAgainLabel('Send code by SMS', 30), 'Send code again in 30s')
  assert.equal(askAgainLabel('Send code by SMS', 0), 'Send code by SMS')
})

// ---------------------------------------------------------------------------
// "Code sent" notice
// ---------------------------------------------------------------------------

test('sentNotice names the channel the server reported, the masked number and the expiry', () => {
  assert.equal(sentNoticeText(sentNotice('sms', MASK, 300)), `Code sent by SMS to ${MASK}. It expires in 5 minutes.`)
  assert.equal(
    sentNoticeText(sentNotice('whatsapp', MASK, 300)),
    `Code sent to WhatsApp number ${MASK}. It expires in 5 minutes.`,
  )
  assert.equal(sentNoticeText(sentNotice(undefined, MASK, 300)), `Code sent to ${MASK}. It expires in 5 minutes.`)
  const parts = sentNotice('sms', MASK, 600)
  assert.equal(parts.masked, MASK)
  assert.equal(parts.lead, 'Code sent by SMS to ')
  assert.equal(parts.tail, '. It expires in 10 minutes.')
})

test('sentNotice leaves out whatever the server did not send', () => {
  assert.equal(sentNoticeText(sentNotice('sms', '', 300)), 'Code sent by SMS. It expires in 5 minutes.')
  assert.equal(sentNoticeText(sentNotice('sms', MASK, undefined)), `Code sent by SMS to ${MASK}.`)
  assert.equal(sentNoticeText(sentNotice('whatsapp', undefined, 0)), 'Code sent on WhatsApp.')
  assert.equal(sentNoticeText(sentNotice(undefined, undefined, undefined)), 'Code sent.')
  assert.equal(sentNoticeText(sentNotice('sms', MASK, 60)), `Code sent by SMS to ${MASK}. It expires in 1 minute.`)
})

test('haveCodeNotice and the expired notice are plain sentences', () => {
  assert.equal(haveCodeNotice('sms'), 'Enter the 4-digit code we sent you by SMS.')
  assert.equal(haveCodeNotice('sms', 4), 'Enter the 4-digit code we sent you by SMS.')
  assert.equal(haveCodeNotice('whatsapp'), 'Enter the 6-digit code we sent you on WhatsApp.')
  assert.equal(haveCodeNotice('whatsapp', 6), 'Enter the 6-digit code we sent you on WhatsApp.')
  assert.equal(haveCodeNotice(undefined), 'Enter the 6-digit code we sent you.')
  assert.equal(CODE_EXPIRED_NOTICE, 'This code has expired. Please ask for a new one.')
})

test('otpHelpLine: sign-in can use the password, a reset or an activation needs HR', () => {
  assert.equal(otpHelpLine('login', true), 'You can sign in with your password instead, or contact HR:')
  assert.equal(otpHelpLine('login', false), 'Please contact HR for help:')
  assert.equal(otpHelpLine('reset', false), 'HR can reset your password for you:')
  assert.equal(otpHelpLine('activate', false), 'HR can help you activate your account:')
})

// ---------------------------------------------------------------------------
// A refused "send me a code"
// ---------------------------------------------------------------------------

const FALLBACK = 'Could not send the code. Please try again.'
const http = (status: number, data?: unknown, headers?: unknown) => ({ response: { status, data, headers } })

test('no answer from the server is a network problem for the software-support contact', () => {
  const p = describeOtpRequestError({ message: 'Network Error' }, FALLBACK)
  assert.equal(p.kind, 'network')
  assert.equal(p.serverDown, true)
  assert.equal(p.offerHr, false)
  assert.equal(p.message, 'Could not reach the server. Check your connection and try again.')
})

test('429 with retryAfterSeconds is a cooldown: the server sentence and how long to wait', () => {
  const sentence = 'Please wait 42 seconds before asking for another code.'
  const p = describeOtpRequestError(http(429, { error: sentence, retryAfterSeconds: 42 }), FALLBACK)
  assert.equal(p.kind, 'cooldown')
  assert.equal(p.waitSeconds, 42)
  assert.equal(p.message, sentence)
  assert.equal(p.serverDown, false)
  assert.equal(p.offerHr, false)
  assert.equal(describeOtpRequestError(http(429, { error: sentence, retryAfterSeconds: '30' }), FALLBACK).waitSeconds, 30)
})

test('429 with no wait (too many codes this hour) points to the password / HR', () => {
  const sentence = 'Too many codes requested. Please try again in an hour, or contact HR.'
  const p = describeOtpRequestError(http(429, { error: sentence }), FALLBACK)
  assert.equal(p.kind, 'limit')
  assert.equal(p.waitSeconds, 0)
  assert.equal(p.message, sentence)
  assert.equal(p.offerHr, true)
})

test('429 from the per-IP throttle: a plain sentence, and the Retry-After header as the wait', () => {
  const body = { detail: 'Request was throttled. Expected available in 54 seconds.' }
  const p = describeOtpRequestError(http(429, body, { 'retry-after': '54' }), FALLBACK)
  assert.equal(p.kind, 'cooldown')
  assert.equal(p.waitSeconds, 54)
  assert.equal(p.message, 'Too many requests. Please wait a moment and try again.')
  const viaGet = describeOtpRequestError(http(429, body, { get: (n: string) => (n === 'retry-after' ? '20' : undefined) }), FALLBACK)
  assert.equal(viaGet.waitSeconds, 20)
  const noHeader = describeOtpRequestError(http(429, body), FALLBACK)
  assert.equal(noHeader.kind, 'limit')
  assert.equal(noHeader.message, 'Too many requests. Please wait a moment and try again.')
})

test('502 (the SMS could not be sent) shows the server sentence and offers the password / HR, not the software-support contact', () => {
  const sentence = "We couldn't send the code by SMS. Please try again in a moment or contact HR."
  const p = describeOtpRequestError(http(502, { error: sentence }), FALLBACK)
  assert.equal(p.kind, 'send_failed')
  assert.equal(p.message, sentence)
  assert.equal(p.serverDown, false)
  assert.equal(p.offerHr, true)
})

test('503 (SMS temporarily unavailable) shows the server sentence and offers the password / HR', () => {
  const sentence = 'SMS is temporarily unavailable. Please use your password or contact HR.'
  const p = describeOtpRequestError(http(503, { error: sentence }), FALLBACK)
  assert.equal(p.kind, 'unavailable')
  assert.equal(p.message, sentence)
  assert.equal(p.serverDown, false)
  assert.equal(p.offerHr, true)
})

test('403 (turned off) shows the server sentence and offers the password / HR', () => {
  const sentence = 'SMS OTP is turned off. Please use your password or contact HR.'
  const p = describeOtpRequestError(http(403, { error: sentence }), FALLBACK)
  assert.equal(p.kind, 'turned_off')
  assert.equal(p.message, sentence)
  assert.equal(p.offerHr, true)
})

test('a 5xx without the server’s own sentence (gateway page, crash) is a server problem with the fixed fallback', () => {
  for (const data of ['<html>Bad gateway</html>', '', undefined, { detail: 'boom' }, { message: 'Application failed to respond' }]) {
    for (const status of [500, 502, 503, 504]) {
      const p = describeOtpRequestError(http(status, data), FALLBACK)
      assert.equal(p.kind, 'server')
      assert.equal(p.serverDown, true)
      assert.equal(p.offerHr, false)
      assert.equal(p.message, FALLBACK)
    }
  }
})

test('other refusals (unknown code, no mobile number, already has a password) show the server sentence and offer HR', () => {
  for (const [status, sentence] of [
    [404, 'You are not registered. Please contact HR.'],
    [400, 'No mobile number is registered for this employee. Please contact HR.'],
    [409, 'This account already has a password. Please sign in, or use Forgot password.'],
  ] as const) {
    const p = describeOtpRequestError(http(status, { error: sentence }), FALLBACK)
    assert.equal(p.kind, 'rejected')
    assert.equal(p.message, sentence)
    assert.equal(p.offerHr, true)
    assert.equal(p.serverDown, false)
  }
  assert.equal(describeOtpRequestError(http(400, {}), FALLBACK).message, FALLBACK)
  assert.equal(describeOtpRequestError(undefined, FALLBACK).kind, 'network')
})
