// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_CONTACT_NOTE,
  approvalMark,
  approvalSummary,
  mailUrl,
  normalizeHod,
  phoneDial,
  resolvePhotoUrl,
  telUrl,
  unassignedMessage,
} from './hodAssignment.ts'

const HR = { label: 'HR Desk', phone: '0421 430 0800', phoneDial: '04214300800', whatsapp: '', whatsappNumber: '', email: 'hr@uktex.net', hours: '', hasContact: true, usesHrFallback: false }

// exactly as backend/api/employee_compensation_views.py::employee_hod builds it
const ASSIGNED = {
  assigned: true, employeeId: 77, employeeCode: 'HWB', name: 'Suresh Raj', phone: '9000000001', photoUrl: '/media/boss.jpg',
  designation: 'Cutting Manager', department: 'Cutting', branch: 'Head Office', email: 'boss@example.com',
  approvals: [
    { key: 'leave', label: 'Leave', canApprove: true, reason: null, requestedBy: 'Employee', path: 'Employee → HOD or HR' },
    { key: 'permission', label: 'Permission', canApprove: true, reason: null, requestedBy: 'Employee', path: 'Employee → HOD' },
    { key: 'resignation', label: 'Resignation', canApprove: false, reason: 'HR decides this one.', requestedBy: 'Employee', path: 'Employee → HR' },
    { key: 'on_duty', label: 'On-Duty', canApprove: false, reason: 'Not enabled for your Department Head.', requestedBy: 'Employee', path: 'Employee → HOD' },
    { key: 'holiday_work', label: 'Holiday / Sunday work compensation', canApprove: false, reason: 'Switched off by HR.', requestedBy: 'HR', path: 'HR → HOD' },
  ],
  hrContact: HR, contactNote: 'For any question about approvals, contact HR.', message: null,
}

test('an assigned Department Head as the server sends it', () => {
  const h = normalizeHod(ASSIGNED)!
  assert.equal(h.assigned, true)
  assert.equal(h.isSelf, false)
  assert.equal(h.name, 'Suresh Raj')
  assert.equal(h.phone, '9000000001')
  assert.equal(h.photoUrl, '/media/boss.jpg')
  assert.equal(h.designation, 'Cutting Manager')
  assert.equal(h.department, 'Cutting')
  assert.equal(h.branch, 'Head Office')
  assert.equal(h.email, 'boss@example.com')
  assert.equal(h.employeeId, 77)
  assert.equal(h.approvals.length, 5)
  assert.deepEqual(h.approvals[2], { key: 'resignation', label: 'Resignation', canApprove: false, reason: 'HR decides this one.', requestedBy: 'Employee', path: 'Employee → HR' })
  assert.equal(h.approvals[0].reason, null)
  assert.equal(h.hrContact?.phoneDial, '04214300800')
  assert.equal(h.hrContact?.hasContact, true)
  assert.equal(h.contactNote, 'For any question about approvals, contact HR.')
  assert.equal(unassignedMessage(h), null)
})

test('no Department Head assigned: the server message, no approvals, no person', () => {
  const h = normalizeHod({
    assigned: false, name: null, phone: null, photoUrl: null, designation: null, department: null, branch: null, email: null, approvals: [],
    hrContact: HR, contactNote: 'For any question about approvals, contact HR.',
    message: 'You do not have a Department Head assigned yet. Please contact HR to have one assigned.',
  })!
  assert.equal(h.assigned, false)
  assert.equal(h.name, null)
  assert.deepEqual(h.approvals, [])
  assert.equal(unassignedMessage(h), 'You do not have a Department Head assigned yet. Please contact HR to have one assigned.')
})

test('the employee is a Department Head: isSelf and the server message', () => {
  const h = normalizeHod({ assigned: false, isSelf: true, message: 'You are a Department Head yourself, so HR decides your own requests.', hrContact: HR })!
  assert.equal(h.isSelf, true)
  assert.equal(h.assigned, false)
  assert.equal(unassignedMessage(h), 'You are a Department Head yourself, so HR decides your own requests.')
  // an older or terse reply still says something sensible
  assert.equal(unassignedMessage({ assigned: false, isSelf: true, message: null }), 'You are a Department Head yourself, so HR decides your own requests.')
  assert.equal(unassignedMessage({ assigned: false, isSelf: false, message: null }), 'You do not have a Department Head assigned yet. Please contact HR to have one assigned.')
})

test('an "assigned" reply without a name is not drawn as a blank card', () => {
  const h = normalizeHod({ assigned: true, name: '   ', approvals: [{ key: 'leave', label: 'Leave', canApprove: true }] })!
  assert.equal(h.assigned, false)
  assert.deepEqual(h.approvals, [])
})

test('malformed replies never crash: not an object is null, odd fields read as not sent', () => {
  for (const bad of [null, undefined, 'x', 3, [], '<html>']) assert.equal(normalizeHod(bad), null, String(bad))
  const h = normalizeHod({ assigned: true, name: 'Asha', phone: 9000000001, photoUrl: {}, email: 5, approvals: [null, 'x', { canApprove: true }, { key: 'leave' }, { key: 'k', label: 'K', canApprove: 'yes', reason: 'r' }], hrContact: 'x' })!
  assert.equal(h.assigned, true)
  assert.equal(h.phone, null)
  assert.equal(h.photoUrl, null)
  assert.equal(h.email, null)
  assert.equal(h.hrContact, null)
  assert.equal(h.contactNote, DEFAULT_CONTACT_NOTE)
  // an approval with neither key nor label is dropped; a non-boolean canApprove is NOT a yes
  assert.deepEqual(h.approvals.map((a) => [a.key, a.label, a.canApprove]), [['leave', 'leave', false], ['k', 'K', false]])
  assert.equal(h.approvals[1].reason, 'r')
})

test('a kind of approval added after this app was built is listed under its own words', () => {
  const h = normalizeHod({ assigned: true, name: 'A', approvals: [{ key: 'transfer', label: 'Transfer', canApprove: true }] })!
  assert.equal(h.approvals[0].label, 'Transfer')
  assert.equal(approvalMark(h.approvals[0]), 'Can approve')
})

test('the Can / Cannot mark and the line above the list', () => {
  const h = normalizeHod(ASSIGNED)!
  assert.equal(approvalMark(h.approvals[0]), 'Can approve')
  assert.equal(approvalMark(h.approvals[2]), 'Cannot approve')
  assert.equal(approvalSummary(h.approvals), 'Can approve 2 of 5 kinds of request')
  assert.equal(approvalSummary([]), '')
})

test('a relative photo path is joined to the API address; full URLs and inline images are left alone', () => {
  assert.equal(resolvePhotoUrl('/media/boss.jpg', 'https://api.uktextiles.in/api'), 'https://api.uktextiles.in/media/boss.jpg')
  assert.equal(resolvePhotoUrl('/media/boss.jpg', 'http://192.168.0.56:8000/api'), 'http://192.168.0.56:8000/media/boss.jpg')
  assert.equal(resolvePhotoUrl('/media/boss.jpg', 'https://api.uktextiles.in/api/'), 'https://api.uktextiles.in/media/boss.jpg')
  assert.equal(resolvePhotoUrl('media/boss.jpg', 'https://api.uktextiles.in/api'), 'https://api.uktextiles.in/media/boss.jpg')
  assert.equal(resolvePhotoUrl('https://cdn.example.com/a.png', 'https://api.uktextiles.in/api'), 'https://cdn.example.com/a.png')
  assert.equal(resolvePhotoUrl('http://x/y.png', undefined), 'http://x/y.png')
  assert.equal(resolvePhotoUrl('data:image/png;base64,AAAA', 'https://api.uktextiles.in/api'), 'data:image/png;base64,AAAA')
  assert.equal(resolvePhotoUrl('//cdn.example.com/a.png', 'https://api.uktextiles.in/api'), 'https://cdn.example.com/a.png')
})

test('no photo, or a path with no API address to join it to, gives no URL (the card shows initials)', () => {
  for (const none of [null, undefined, '', '   ']) assert.equal(resolvePhotoUrl(none, 'https://api.uktextiles.in/api'), null, String(none))
  assert.equal(resolvePhotoUrl('/media/boss.jpg', undefined), null)
  assert.equal(resolvePhotoUrl('/media/boss.jpg', ''), null)
  assert.equal(resolvePhotoUrl('/media/boss.jpg', 'api.uktextiles.in/api'), null)
})

test('the phone number is dialled as digits (and a leading +); the email only when it looks like one', () => {
  assert.equal(phoneDial('90000 00001'), '9000000001')
  assert.equal(phoneDial('+91 90000-00001'), '+919000000001')
  assert.equal(phoneDial('(0421) 430 0800'), '04214300800')
  assert.equal(phoneDial('ext 5'), '')
  assert.equal(phoneDial(null), '')
  assert.equal(telUrl('+91 90000 00001'), 'tel:+919000000001')
  assert.equal(telUrl(''), '')
  assert.equal(mailUrl('boss@example.com'), 'mailto:boss@example.com')
  assert.equal(mailUrl(' boss@example.com '), 'mailto:boss@example.com')
  assert.equal(mailUrl('not an email'), '')
  assert.equal(mailUrl(null), '')
})
