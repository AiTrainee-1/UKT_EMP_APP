// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  daysBetween,
  factoryDay,
  factoryParts,
  leadTime,
  requestTiming,
  requestedDay,
  requestedLabel,
  submittedLabel,
} from './requestLeadTime.ts'

test('a timestamp is read as the factory (IST) day and clock, whatever its offset', () => {
  assert.deepEqual(factoryParts('2026-11-20T04:35:00Z'), { day: '2026-11-20', time: '10:05' })
  assert.deepEqual(factoryParts('2026-11-20T10:05:00+05:30'), { day: '2026-11-20', time: '10:05' })
  // 20:00 UTC on the 19th is 01:30 on the 20th in the factory
  assert.equal(factoryDay('2026-11-19T20:00:00.123456+00:00'), '2026-11-20')
  assert.deepEqual(factoryParts('2026-11-20'), { day: '2026-11-20', time: null })
  assert.equal(factoryParts(''), null)
  assert.equal(factoryParts('not a date'), null)
  assert.equal(factoryParts(null), null)
})

test('the submission reads as day and time', () => {
  assert.equal(submittedLabel('2026-11-20T04:35:00Z'), '20 Nov 2026, 10:05 AM')
  assert.equal(submittedLabel('2026-10-05T12:30:00+00:00'), '05 Oct 2026, 6:00 PM')
  assert.equal(submittedLabel('2026-10-05'), '05 Oct 2026')
  assert.equal(submittedLabel(undefined), null)
})

test('days between two calendar days', () => {
  assert.equal(daysBetween('2026-11-20', '2026-11-23'), 3)
  assert.equal(daysBetween('2026-11-23', '2026-11-20'), -3)
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1)
  assert.equal(daysBetween('2026-03-01', '2026-03-31'), 30)
  assert.equal(daysBetween('x', '2026-03-31'), null)
})

test('the lead-time hint: before, on the same day, after', () => {
  assert.deepEqual(leadTime('2026-11-23', '2026-11-20T04:35:00Z'), {
    days: 3,
    tone: 'early',
    text: 'Applied 3 days before',
    short: '3 days before',
  })
  assert.equal(leadTime('2026-11-21', '2026-11-20T04:35:00Z')?.text, 'Applied 1 day before')
  assert.deepEqual(leadTime('2026-11-20', '2026-11-20T04:35:00Z'), {
    days: 0,
    tone: 'sameDay',
    text: 'Applied on the same day',
    short: 'Same day',
  })
  assert.deepEqual(leadTime('2026-11-18', '2026-11-20T04:35:00Z'), {
    days: -2,
    tone: 'late',
    text: 'Applied 2 days after',
    short: '2 days after',
  })
  assert.equal(leadTime('2026-11-19', '2026-11-20T04:35:00Z')?.text, 'Applied 1 day after')
  // late in the evening in UTC is already the next day in the factory
  assert.equal(leadTime('2026-11-20', '2026-11-19T20:00:00Z')?.tone, 'sameDay')
  assert.equal(leadTime(null, '2026-11-20T04:35:00Z'), null)
  assert.equal(leadTime('2026-11-20', null), null)
})

test('the day each category is for', () => {
  assert.equal(requestedDay('leave', { startDate: '2026-11-23', endDate: '2026-11-25' }), '2026-11-23')
  assert.equal(requestedDay('permission', { date: '2026-11-21' }), '2026-11-21')
  assert.equal(requestedDay('casualLeave', { date: '2026-11-21' }), '2026-11-21')
  assert.equal(requestedDay('attendance', { date: '2026-11-02' }), '2026-11-02')
  assert.equal(requestedDay('missingPunch', { date: '2026-11-02' }), '2026-11-02')
  assert.equal(requestedDay('onDuty', { date: '2026-11-24' }), '2026-11-24')
  assert.equal(requestedDay('onDuty', { createdAt: '2026-11-24T03:00:00Z' }), '2026-11-24')
  assert.equal(requestedDay('outpass', { createdAt: '2026-11-24T19:00:00Z' }), '2026-11-25')
  assert.equal(requestedDay('holidayWork', { workDate: '2026-11-15' }), '2026-11-15')
  assert.equal(requestedDay('holidayWork', { kind: 'use_balance', workDate: '2026-11-30', useDate: '2026-11-30' }), '2026-11-30')
  assert.equal(requestedDay('resignation', { lastWorkingDate: '2026-12-31' }), '2026-12-31')
  assert.equal(requestedDay('resignation', { lastWorkingDate: null }), null)
  assert.equal(requestedDay('leave', null), null)
})

test('what it is for, with the time where it matters', () => {
  assert.equal(
    requestedLabel('leave', { startDate: '2026-10-06', endDate: '2026-10-08', totalDays: 3 }),
    '06 Oct → 08 Oct 2026 · 3 day(s)',
  )
  assert.equal(requestedLabel('permission', { date: '2026-10-10', permissionTime: '09:30' }), '10 Oct 2026 · 9:30 AM')
  assert.equal(requestedLabel('missingPunch', { date: '2026-10-01', punchTime: '18:05' }), '01 Oct 2026 · 6:05 PM')
  assert.equal(
    requestedLabel('outpass', { createdAt: '2026-10-05T05:00:00Z', expectedReturnAt: '2026-10-05T12:00:00Z' }),
    '05 Oct 2026 · back by 5:30 PM',
  )
  assert.equal(requestedLabel('outpass', { createdAt: '2026-10-05T05:00:00Z' }), '05 Oct 2026')
  assert.equal(requestedLabel('resignation', { lastWorkingDate: '2026-11-04' }), '04 Nov 2026')
  assert.equal(requestedLabel('resignation', {}), 'Not given')
})

test('a card gets all three at once', () => {
  const t = requestTiming('leave', {
    startDate: '2026-11-30',
    endDate: '2026-11-30',
    totalDays: 1,
    createdAt: '2026-11-25T04:35:00Z',
  })
  assert.deepEqual(t, {
    requested: '30 Nov 2026 · 1 day(s)',
    submitted: '25 Nov 2026, 10:05 AM',
    lead: { days: 5, tone: 'early', text: 'Applied 5 days before', short: '5 days before' },
  })
  const missing = requestTiming('missingPunch', { date: '2026-11-20', punchTime: '09:00', createdAt: '2026-11-25T04:35:00Z' })
  assert.equal(missing.lead?.text, 'Applied 5 days after')
  const unknown = requestTiming('attendance', {})
  assert.equal(unknown.submitted, null)
  assert.equal(unknown.lead, null)
})
