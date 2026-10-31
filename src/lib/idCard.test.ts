// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import { employeeStatusInfo, idCardHeight, idCardWidth, scaledSize, shareMessage, verifyUrl } from './idCard.ts'

test('status: ended statuses stamp the card; still-employed ones do not', () => {
  assert.deepEqual(employeeStatusInfo('active'), { kind: 'active', isActive: true, label: 'Active', unknown: false })
  assert.equal(employeeStatusInfo(' Active ').kind, 'active')
  assert.deepEqual(employeeStatusInfo('inactive'), { kind: 'ended', isActive: false, label: 'Inactive', unknown: false })
  assert.deepEqual(employeeStatusInfo('resigned'), { kind: 'ended', isActive: false, label: 'Resigned', unknown: false })
  assert.equal(employeeStatusInfo('Terminated').isActive, false)
  assert.equal(employeeStatusInfo('suspended').isActive, false)
  // still employed: on probation / on leave / serving notice keep a valid card
  assert.deepEqual(employeeStatusInfo('probation'), { kind: 'working', isActive: true, label: 'On probation', unknown: false })
  assert.deepEqual(employeeStatusInfo('ON_LEAVE'), { kind: 'working', isActive: true, label: 'On leave', unknown: false })
  assert.equal(employeeStatusInfo('on_notice').kind, 'working')
  // something else HR typed is shown as it is, without a stamp
  assert.deepEqual(employeeStatusInfo('trainee'), { kind: 'other', isActive: true, label: 'Trainee', unknown: false })
  // an older server that sends no status keeps the old behaviour
  assert.deepEqual(employeeStatusInfo(undefined), { kind: 'unknown', isActive: true, label: '', unknown: true })
  assert.equal(employeeStatusInfo('').kind, 'unknown')
})

test('card width follows the window and stays within sensible bounds', () => {
  assert.equal(idCardWidth(360, false), 288)
  assert.equal(idCardWidth(800, false), 320)
  assert.equal(idCardWidth(250, false), 220)
  assert.equal(idCardWidth(360, true), 328)
  assert.equal(idCardWidth(1200, true), 420)
  assert.equal(idCardWidth(NaN, false), 288)
  assert.equal(idCardHeight(240, false), 380)
  assert.equal(idCardHeight(380, true), 240)
})

test('verify link: web app address first, else the API address without port and /api', () => {
  assert.equal(verifyUrl('https://hrms.uktextiles.in', 'https://api.x/api', 'EMP 01'), 'https://hrms.uktextiles.in/verify/EMP%2001')
  assert.equal(verifyUrl('https://hrms.uktextiles.in/', null, '1570'), 'https://hrms.uktextiles.in/verify/1570')
  assert.equal(verifyUrl(undefined, 'http://192.168.1.5:8000/api', '1570'), 'http://192.168.1.5/verify/1570')
  assert.equal(verifyUrl('', 'https://backend.example.com/api/', '7'), 'https://backend.example.com/verify/7')
  assert.equal(verifyUrl('https://hrms.uktextiles.in', null, ''), '')
  assert.equal(verifyUrl(null, null, '1570'), '')
})

test('share text includes the status only when it is not active', () => {
  const card = { name: 'Priya R', designation: 'Merchandiser', code: '1570', company: { name: 'UK Textiles' } }
  assert.equal(
    shareMessage(card, 'https://hrms.uktextiles.in/verify/1570', employeeStatusInfo('active')),
    'Priya R · Merchandiser\nUK Textiles\nEmployee Code: 1570\nVerify: https://hrms.uktextiles.in/verify/1570',
  )
  assert.ok(shareMessage(card, '', employeeStatusInfo('inactive')).includes('Status: Inactive'))
  assert.equal(shareMessage({ name: 'A' }, '', employeeStatusInfo(undefined)), 'A')
})

test('scaled font sizes', () => {
  assert.equal(scaledSize(10, 300, 300), 10)
  assert.equal(scaledSize(10, 330, 300), 11)
  assert.equal(scaledSize(10, 100, 300), 8)
  assert.equal(scaledSize(10, 900, 300), 13.5)
})
