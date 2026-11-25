// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  barsForMessage,
  expiryLabel,
  formatDuration,
  gifPickProblem,
  isMediaExpired,
  isMediaMessage,
  mediaCacheFileName,
  messageKind,
  meteringToLevel,
  previewText,
  resampleBars,
  seekPosition,
  uploadErrorMessage,
  waveformForUpload,
  GIF_MAX_BYTES,
  GIF_TEXT,
  VOICE_TEXT,
  WAVEFORM_UPLOAD_BARS,
  type ChatMediaInfo,
} from './chatMedia.ts'

const NOW = new Date(2026, 10, 25, 10, 0)

function media(over: Partial<ChatMediaInfo> = {}): ChatMediaInfo {
  return {
    url: '/api/chat/messages/9/media',
    mime: 'image/gif',
    size: 1000,
    durationMs: null,
    width: 200,
    height: 150,
    waveform: null,
    expiresAt: new Date(2026, 11, 2, 10, 0).toISOString(),
    expired: false,
    ...over,
  }
}

test('a message kind: anything unknown is plain text (older servers send none)', () => {
  assert.equal(messageKind({ kind: 'gif' }), 'gif')
  assert.equal(messageKind({ kind: 'voice' }), 'voice')
  assert.equal(messageKind({ kind: 'sticker' }), 'text')
  assert.equal(messageKind({}), 'text')
  assert.equal(messageKind(null), 'text')
  assert.equal(isMediaMessage({ id: 1, kind: 'voice' }), true)
  assert.equal(isMediaMessage({ id: 1 }), false)
})

test('expired: the server said so, there is no link, or the time has passed on this phone', () => {
  assert.equal(isMediaExpired({ id: 9, kind: 'gif', media: media() }, NOW), false)
  assert.equal(isMediaExpired({ id: 9, kind: 'gif', media: media({ expired: true, url: null }) }, NOW), true)
  assert.equal(isMediaExpired({ id: 9, kind: 'gif', media: media({ url: null }) }, NOW), true)
  assert.equal(isMediaExpired({ id: 9, kind: 'gif', media: null }, NOW), true)
  const past = media({ expiresAt: new Date(2026, 10, 25, 9, 59).toISOString() })
  assert.equal(isMediaExpired({ id: 9, kind: 'voice', media: past }, NOW), true)
  assert.equal(isMediaExpired({ id: 9, kind: 'text', media: null }, NOW), false) // a text message never expires
})

test('lengths read like a clock', () => {
  assert.equal(formatDuration(0), '0:00')
  assert.equal(formatDuration(7_400), '0:07')
  assert.equal(formatDuration(65_000), '1:05')
  assert.equal(formatDuration(120_000), '2:00')
  assert.equal(formatDuration(null), '0:00')
  assert.equal(formatDuration(-5), '0:00')
})

test('expiry labels count calendar days', () => {
  assert.equal(expiryLabel(new Date(2026, 10, 25, 22, 0).toISOString(), NOW), 'Expires today')
  assert.equal(expiryLabel(new Date(2026, 10, 26, 1, 0).toISOString(), NOW), 'Expires tomorrow')
  assert.equal(expiryLabel(new Date(2026, 11, 2, 10, 0).toISOString(), NOW), 'Expires in 7 days')
  assert.equal(expiryLabel(new Date(2026, 10, 25, 9, 0).toISOString(), NOW), null)
  assert.equal(expiryLabel(null, NOW), null)
  assert.equal(expiryLabel('not a date', NOW), null)
})

test('a quote of a GIF or voice message says what it is', () => {
  assert.equal(previewText({ kind: 'voice', text: VOICE_TEXT, media: media({ durationMs: 12_000 }) }), `${VOICE_TEXT} (0:12)`)
  assert.equal(previewText({ kind: 'voice', text: VOICE_TEXT, media: null }), VOICE_TEXT)
  assert.equal(previewText({ kind: 'gif', text: GIF_TEXT }), GIF_TEXT)
  assert.equal(previewText({ text: 'Lunch at 1' }), 'Lunch at 1')
})

test('only a real GIF up to 8 MB may be picked', () => {
  assert.equal(gifPickProblem({ uri: 'file:///a.gif', mimeType: 'image/gif', fileSize: 1_000 }), null)
  assert.equal(gifPickProblem({ uri: 'file:///a', fileName: 'party.GIF', fileSize: 1_000 }), null) // no type reported
  assert.match(gifPickProblem({ uri: 'file:///a.jpg', mimeType: 'image/jpeg' }) ?? '', /not a GIF/)
  assert.match(gifPickProblem({ uri: 'file:///a.gif', mimeType: 'image/png' }) ?? '', /not a GIF/) // the type wins
  assert.match(gifPickProblem({ uri: 'file:///a.gif', mimeType: 'image/gif', fileSize: GIF_MAX_BYTES + 1 }) ?? '', /larger than 8 MB/)
  assert.equal(gifPickProblem({ uri: 'file:///a.gif', mimeType: 'image/gif', fileSize: GIF_MAX_BYTES }), null)
  assert.equal(gifPickProblem(null), 'No picture was chosen.')
})

test('loudness readings become 0..1 levels', () => {
  assert.equal(meteringToLevel(0), 1)
  assert.equal(meteringToLevel(5), 1)
  assert.equal(meteringToLevel(-160), 0)
  assert.equal(meteringToLevel(-55), 0)
  assert.equal(meteringToLevel(undefined), 0)
  assert.equal(meteringToLevel(Number.NaN), 0)
  const mid = meteringToLevel(-20)
  assert.ok(mid > 0.2 && mid < 0.8, String(mid))
  assert.ok(meteringToLevel(-10) > meteringToLevel(-30))
})

test('bars are squeezed keeping peaks, or stretched, to an exact count', () => {
  assert.deepEqual(resampleBars([0.1, 0.9, 0.2, 0.3], 2), [0.9, 0.3])
  assert.deepEqual(resampleBars([0.5], 3), [0.5, 0.5, 0.5])
  assert.equal(resampleBars([], 4).length, 4)
  assert.deepEqual(resampleBars([0.2, 2, -1], 3), [0.2, 1, 0])
  const sent = waveformForUpload(Array.from({ length: 500 }, (_, i) => (i % 10) / 10))
  assert.equal(sent.length, WAVEFORM_UPLOAD_BARS)
  assert.ok(sent.every((v) => Number.isInteger(v) && v >= 0 && v <= 100))
})

test('a voice message draws its own waveform, or a steady made-up one', () => {
  const own = barsForMessage([0, 50, 100], 1, 3)
  assert.deepEqual(own, [0.08, 0.5, 1]) // never invisibly flat
  const a = barsForMessage(null, 42, 20)
  assert.deepEqual(a, barsForMessage(null, 42, 20)) // the same every time for the same message
  assert.notDeepEqual(a, barsForMessage(null, 43, 20))
  assert.ok(a.every((v) => v >= 0.18 && v <= 0.78))
})

test('tapping the waveform seeks to that point', () => {
  assert.equal(seekPosition(50, 200, 12_000), 3_000)
  assert.equal(seekPosition(-10, 200, 12_000), 0)
  assert.equal(seekPosition(400, 200, 12_000), 12_000)
  assert.equal(seekPosition(10, 0, 12_000), 0)
})

test('the phone keeps its copy under a name with the right extension', () => {
  assert.equal(mediaCacheFileName(5, 'gif', 'image/gif'), 'chat-5.gif')
  assert.equal(mediaCacheFileName(5, 'gif', 'image/png'), 'chat-5.png') // a one-frame GIF the server stored as PNG
  assert.equal(mediaCacheFileName(6, 'voice', 'audio/mp4'), 'chat-6.m4a')
  assert.equal(mediaCacheFileName(6, 'voice', 'audio/aac'), 'chat-6.aac')
  assert.equal(mediaCacheFileName(6, 'voice', null), 'chat-6.m4a')
})

test('an upload failure says the server’s reason, or plain words', () => {
  assert.equal(uploadErrorMessage({ response: { status: 400, data: { error: 'That GIF is larger than 8 MB.' } } }, 'gif'), 'That GIF is larger than 8 MB.')
  assert.match(uploadErrorMessage({ message: 'Network Error' }, 'voice'), /No internet/)
  assert.match(uploadErrorMessage({ response: { status: 500, data: {} } }, 'voice'), /voice message wasn’t sent/)
  assert.match(uploadErrorMessage({ response: { status: 500 } }, 'gif'), /GIF wasn’t sent/)
})
