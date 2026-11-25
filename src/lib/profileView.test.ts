// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calcAge,
  capitalize,
  displayDate,
  employmentTypeLabel,
  extractPhone,
  initialsOf,
  maskAccount,
  passwordAgeLabel,
  serviceLength,
} from './profileView.ts'

// Local times throughout, so the tests pass in any time zone.
const NOW = new Date(2026, 10, 25, 10, 0)

test('bank account: only the last four digits show', () => {
  assert.equal(maskAccount('123456789012'), '********9012')
  assert.equal(maskAccount('123'), '123')
  assert.equal(maskAccount(''), '—')
  assert.equal(maskAccount(null), '—')
})

test('age in whole years, the birthday counted on the day', () => {
  assert.equal(calcAge('1990-11-25', NOW), 36)
  assert.equal(calcAge('1990-11-26', NOW), 35)
  assert.equal(calcAge('1990-12-01', NOW), 35)
  assert.equal(calcAge('nope', NOW), null)
  assert.equal(calcAge(null, NOW), null)
})

test('password age', () => {
  assert.equal(passwordAgeLabel(null, NOW), 'Never changed')
  assert.equal(passwordAgeLabel('garbage', NOW), 'Never changed')
  assert.equal(passwordAgeLabel(new Date(2026, 10, 25, 8).toISOString(), NOW), 'Updated today')
  assert.equal(passwordAgeLabel(new Date(2026, 10, 24, 9).toISOString(), NOW), 'Last updated 1 day ago')
  assert.equal(passwordAgeLabel(new Date(2026, 10, 13, 9).toISOString(), NOW), 'Last updated 12 days ago')
})

test('phone number out of a free-text contact', () => {
  assert.equal(extractPhone('Ravi (brother) 98765 43210'), '9876543210')
  assert.equal(extractPhone('+91-98765-43210 mother'), '+919876543210')
  assert.equal(extractPhone('call Ravi'), null)
  assert.equal(extractPhone(null), null)
})

test('dates read the day as written, never shifted by time zone', () => {
  assert.equal(displayDate('2020-01-15'), '15 Jan 2020')
  assert.equal(displayDate('2020-01-15T00:00:00Z'), '15 Jan 2020')
  assert.equal(displayDate('15/01/2020'), '15/01/2020')
  assert.equal(displayDate(null), '—')
})

test('length of service', () => {
  assert.equal(serviceLength('2023-09-10', NOW), '3 yrs 2 mos')
  assert.equal(serviceLength('2025-11-25', NOW), '1 yr')
  assert.equal(serviceLength('2026-03-30', NOW), '7 mos')
  assert.equal(serviceLength('2026-10-26', NOW), 'New this month')
  assert.equal(serviceLength('2026-11-02', NOW), 'New this month')
  assert.equal(serviceLength('2027-01-01', NOW), null)
  assert.equal(serviceLength(undefined, NOW), null)
})

test('labels', () => {
  assert.equal(capitalize('male'), 'Male')
  assert.equal(capitalize('on_leave'), 'On leave')
  assert.equal(capitalize(''), null)
  assert.equal(employmentTypeLabel('production'), 'Production')
  assert.equal(initialsOf('Anitha Kumar Raj'), 'AK')
  assert.equal(initialsOf(null), '')
})
