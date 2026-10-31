// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appliedOn,
  clock12,
  empCode,
  empDepartment,
  empInitial,
  empName,
  itemBadge,
  itemDateLabel,
  itemTypeLabel,
  onDutyPunchLine,
  onDutyPunches,
} from './approvalsItems.ts'

test('employee name and code, flat or nested', () => {
  assert.equal(empName({ employeeName: 'Asha Kumar' }), 'Asha Kumar')
  assert.equal(empName({ employee: { name: 'Bala' } }), 'Bala')
  assert.equal(empName({}), '—')
  assert.equal(empCode({ employee: { employeeCode: 'E2' } }), 'E2')
  assert.equal(empCode({}), '—')
  assert.equal(empInitial({ employeeName: 'asha' }), 'A')
  assert.equal(empInitial({}), '?')
  assert.equal(empDepartment({ departmentName: 'Sewing' }), 'Sewing')
  assert.equal(empDepartment({ employee: { department: 'Cutting' } }), 'Cutting')
  assert.equal(empDepartment({ department: '  ' }), null)
})

test('what the request is: the wording the tab always used', () => {
  assert.equal(itemTypeLabel('leave', { reasonCategoryLabel: 'Sick Leave', type: 'casual' }), 'Leave · Sick Leave')
  assert.equal(itemTypeLabel('leave', { leaveType: 'Earned Leave' }), 'Earned Leave')
  assert.equal(itemTypeLabel('leave', {}), '—')
  assert.equal(
    itemTypeLabel('casualLeave', { portion: 'first_half', portionLabel: 'Half day (morning)' }),
    'Casual Leave · Half day (morning)',
  )
  assert.equal(itemTypeLabel('casualLeave', { portion: 'full', portionLabel: 'Full day' }), 'Casual Leave')
  assert.equal(itemTypeLabel('casualLeave', {}), 'Casual Leave')
  assert.equal(itemTypeLabel('attendance', { requestedStatus: 'Present' }), 'Mark as Present')
  assert.equal(itemTypeLabel('attendance', {}), 'Attendance Override')
  assert.equal(itemTypeLabel('missingPunch', { punchSlot: 'lunch_out', punchType: 'OUT' }), 'Lunch Check-Out')
  assert.equal(itemTypeLabel('missingPunch', { punchType: 'IN' }), 'Check-In')
  assert.equal(itemTypeLabel('missingPunch', { punchType: 'OUT' }), 'Check-Out')
  assert.equal(itemTypeLabel('outpass', { destination: 'Bank' }), 'Bank')
  assert.equal(itemTypeLabel('holidayWork', { dayKind: 'sunday' }), 'Sunday work')
  assert.equal(itemTypeLabel('resignation', {}), 'Resignation')
  assert.equal(itemTypeLabel('permission', { typeKey: 'morning_late_in' }), 'Morning Late-In')
})

test('when it is for', () => {
  assert.equal(
    itemDateLabel('leave', { startDate: '2026-10-06', endDate: '2026-10-08', totalDays: 3 }),
    '06 Oct → 08 Oct 2026 · 3 day(s)',
  )
  assert.equal(itemDateLabel('leave', { startDate: '2026-10-06', endDate: '2026-10-06', totalDays: 1 }), '06 Oct 2026 · 1 day(s)')
  assert.equal(itemDateLabel('permission', { date: '2026-10-10', permissionTime: '09:30' }), '10 Oct 2026 · 09:30')
  assert.equal(itemDateLabel('missingPunch', { date: '2026-10-01', punchTime: '09:00' }), '01 Oct 2026 · 09:00')
  assert.equal(itemDateLabel('casualLeave', { date: '2026-10-20' }), '20 Oct 2026')
  assert.equal(itemDateLabel('attendance', {}), '—')
  assert.equal(itemDateLabel('outpass', { createdAt: '2026-10-05' }), '05 Oct 2026')
  assert.equal(
    itemDateLabel('resignation', { createdAt: '2026-10-05', lastWorkingDate: '2026-11-04' }),
    'Submitted 05 Oct 2026 · Last day 04 Nov 2026',
  )
  assert.equal(appliedOn({ appliedOn: '2026-10-02' }), '02 Oct 2026')
  assert.equal(appliedOn({}), '—')
})

test('the badge on a card follows the list and the outcome', () => {
  assert.deepEqual(itemBadge('leave', 'pending', {}), { label: 'Pending', variant: 'pending' })
  assert.deepEqual(itemBadge('leave', 'approved', { outcome: { state: 'approved' } }), { label: 'Approved', variant: 'approved' })
  assert.deepEqual(itemBadge('missingPunch', 'approved', { outcome: { state: 'in_progress' } }), { label: 'With HR', variant: 'onleave' })
  assert.deepEqual(itemBadge('leave', 'rejected', {}), { label: 'Rejected', variant: 'rejected' })
  // A permission keeps its own outcome wording (the monthly-limit rules).
  assert.equal(itemBadge('permission', 'approved', { status: 'approved', capStatus: 'excess' }).label, 'Overdue / Excess')
  assert.equal(itemBadge('permission', 'pending', { status: 'pending' }).label, 'Pending')
})

test('On-Duty: where, which day, the punches', () => {
  const item = {
    destination: 'Client site',
    date: '2026-10-30',
    punches: [
      { id: 1, punchTime: '09:05', punchType: 'IN' },
      { id: 2, punchTime: '13:00', punchType: 'OUT' },
      null,
      { punchTime: '14:00' },
    ],
  }
  assert.equal(itemTypeLabel('onDuty', item), 'On-Duty · Client site')
  assert.equal(itemTypeLabel('onDuty', {}), 'On-Duty')
  assert.equal(itemDateLabel('onDuty', item), '30 Oct 2026 · 2 punches')
  assert.equal(itemDateLabel('onDuty', { createdAt: '2026-10-29' }), '29 Oct 2026 · No punches yet')
  assert.equal(onDutyPunches(item).length, 2)
  assert.equal(onDutyPunchLine(item), 'In 9:05 AM · Out 1:00 PM')
  assert.equal(onDutyPunchLine({}), null)
  assert.equal(clock12('00:30'), '12:30 AM')
  assert.equal(clock12('12:00'), '12:00 PM')
  assert.equal(clock12(null), '—')
})
