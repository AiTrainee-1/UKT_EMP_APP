// Run with `npm test`. The manga cards' burst shape and colour helpers.
import assert from 'node:assert/strict'
import test from 'node:test'

import { burstPath, mixHex, parseHex, percent, withAlpha } from './mangaShapes.ts'

test('a burst has two corners per spike, starts straight up and is closed', () => {
  const d = burstPath(50, 50, 40, 30, 12)
  assert.match(d, /^M50 10 /)
  assert.match(d, / Z$/)
  assert.equal(d.split(/[ML]/).filter((s) => s.trim()).length, 24)
  assert.doesNotMatch(d, /-0(?![.\d])/)
})

test('a burst never has fewer than 3 spikes', () => {
  assert.equal(burstPath(0, 0, 10, 5, 1).split(/[ML]/).filter((s) => s.trim()).length, 6)
})

test('hex colours are read in both lengths, other formats are not', () => {
  assert.deepEqual(parseHex('#2563EB'), [37, 99, 235])
  assert.deepEqual(parseHex('#fff'), [255, 255, 255])
  assert.equal(parseHex('rgba(0,0,0,0.5)'), null)
  assert.equal(parseHex('red'), null)
})

test('mixing goes from the base colour (0) to the accent (1)', () => {
  assert.equal(mixHex('#000000', '#FFFFFF', 0), '#FFFFFF')
  assert.equal(mixHex('#000000', '#FFFFFF', 1), '#000000')
  assert.equal(mixHex('#000000', '#FFFFFF', 0.5), '#808080')
  assert.equal(mixHex('#2563EB', '#FFFFFF', 2), '#2563EB')
})

test('mixing with something that is not a hex colour keeps the base', () => {
  assert.equal(mixHex('rgba(1,2,3,1)', '#111827', 0.3), '#111827')
})

test('alpha turns a hex colour into rgba and leaves others alone', () => {
  assert.equal(withAlpha('#2563EB', 0.14), 'rgba(37,99,235,0.14)')
  assert.equal(withAlpha('transparent', 0.5), 'transparent')
})

test('percentages are clamped and safe for an empty box', () => {
  assert.equal(percent(30, 120), '25%')
  assert.equal(percent(-5, 100), '0%')
  assert.equal(percent(500, 100), '100%')
  assert.equal(percent(10, 0), '50%')
})
