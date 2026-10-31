// Run with `npm test` (Node's built-in test runner).
/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APPROVALS_ROUTE,
  ASK_HR_FALLBACK_TEXT,
  ASK_HR_TITLE,
  EARLIER_RECORD_LABEL,
  GROUPS,
  addDaysIso,
  allowanceView,
  askHrOf,
  balanceView,
  claimCreditedMessage,
  claimDateLabel,
  claimDayLabel,
  claimTypeLabel,
  earlierRecordLabel,
  formatDayMonthYear,
  formatLongDate,
  groupItems,
  itemFacts,
  kindTone,
  minutesText,
  normalizeCompensation,
  notificationHint,
  notificationRoute,
  parseIsoDate,
  prettify,
  pushNotificationType,
  readContact,
  shiftsLabel,
  shiftsText,
  shiftsUnit,
  statusTone,
} from './compensation.ts'
import { COMPENSATION_TONES } from './attendanceVisual.ts'

// A reply exactly as backend/api/employee_compensation_views.py builds it (keys are camelCase already: the app's axios
// instance camelizes every response).
const REPLY = {
  isStaff: true,
  enabled: { master: true, allowance: true, shift: true, relaxation: true, pay: false, windows: true, holidayWork: true, birthday: true, any: true },
  balanceShifts: 1.25,
  items: [
    { key: 'ot-3625', kind: 'ot_allowance', group: 'detected', date: '2026-10-12', title: 'Late-in allowance earned: 30 minutes', detail: 'You worked until 18:45.', status: 'used', statusLabel: 'Used', shifts: null, minutes: 30, minutesUsed: 18, used: true },
    { key: 'ot-3630', kind: 'ot_shift', group: 'detected', date: '2026-10-09', title: 'Extra hours detected: ask HR for compensation', detail: '...', status: 'detected', statusLabel: 'Detected: ask HR to claim it', shifts: 0.5, minutes: 220, minutesUsed: null, used: null },
    { key: 'ot-3600', kind: 'ot_shift_relaxation', group: 'assigned', date: '2026-10-14', title: 'Compensation day assigned by HR: 0.50 shift', detail: '...', status: 'scheduled', statusLabel: 'Scheduled', shifts: 0.5, minutes: 200, minutesUsed: null, used: null, legacy: false, workDate: '2026-10-08' },
    { key: 'hw-2421', kind: 'holiday_work', group: 'assigned', date: '2026-10-11', title: 'Sunday work: 0.50 shift', detail: 'HR raised this claim.', status: 'pending_hod', statusLabel: 'Waiting for your Department Head', shifts: 0.5, minutes: null, minutesUsed: null, used: null, workDate: '2026-10-11' },
    { key: 'win-959', kind: 'window_late_in', group: 'company', date: '2026-10-15', title: 'Company late-in window: arrive by 10:30', detail: '...', status: 'upcoming', statusLabel: 'Upcoming', shifts: null, minutes: null, minutesUsed: null, used: null, time: '10:30' },
    { key: 'bd-2026-10-20', kind: 'birthday', group: 'birthday', date: '2026-10-20', title: 'Birthday leave (paid)', detail: '...', status: 'upcoming', statusLabel: 'Upcoming', shifts: null, minutes: null, minutesUsed: null, used: null },
    { key: 'rd-9', kind: 'redemption', group: 'balance', date: '2026-10-05', title: 'Compensation day taken: 0.25 shift', detail: '...', status: 'taken', statusLabel: 'Taken', shifts: 0.25, minutes: null, minutesUsed: null, used: null },
  ],
  todayAllowance: null,
  tomorrowAllowance: { date: '2026-10-15', minutes: 60, workDate: '2026-10-14', onTimeUntil: '10:15', note: 'You worked late on Wed, 14 Oct 2026: you can arrive up to 60 minutes later without being marked late.' },
  askHr: {
    title: 'Ask Request for Compensation',
    text: 'The system detects when you work extra hours ... contact HR.',
    points: ['Working a little past your shift end earns a late-in allowance ...', '', 'You get paid leave on your birthday automatically.'],
    contact: { label: 'HR Desk', phone: '0421 430 0800', phoneDial: '04214300800', whatsapp: '', whatsappNumber: '', email: '', hours: '', hasContact: true, usesHrFallback: false },
  },
  message: null,
}

test('a reply exactly as the server sends it becomes the screen model', () => {
  const c = normalizeCompensation(REPLY)!
  assert.equal(c.isStaff, true)
  assert.equal(c.balanceShifts, 1.25)
  assert.equal(c.items.length, 7)
  assert.equal(c.enabled.pay, false)
  assert.equal(c.enabled.any, true)
  assert.equal(c.todayAllowance, null)
  assert.deepEqual(c.tomorrowAllowance, { date: '2026-10-15', minutes: 60, workDate: '2026-10-14', onTimeUntil: '10:15', note: REPLY.tomorrowAllowance.note })
  assert.equal(c.askHr?.title, 'Ask Request for Compensation')
  assert.deepEqual(c.askHr?.points, ['Working a little past your shift end earns a late-in allowance ...', 'You get paid leave on your birthday automatically.'])
  assert.equal(c.askHr?.contact?.phoneDial, '04214300800')
  assert.equal(c.askHr?.contact?.hasContact, true)
  const first = c.items[0]
  assert.deepEqual({ key: first.key, kind: first.kind, group: first.group, date: first.date, status: first.status, minutes: first.minutes, used: first.used }, { key: 'ot-3625', kind: 'ot_allowance', group: 'detected', date: '2026-10-12', status: 'used', minutes: 30, used: true })
})

test('a production employee gets the staff-only message and nothing to list', () => {
  const c = normalizeCompensation({
    isStaff: false,
    enabled: { master: false, allowance: false, shift: false, relaxation: false, pay: false, windows: false, holidayWork: false, birthday: false, any: false },
    balanceShifts: 0, items: [], todayAllowance: null, tomorrowAllowance: null, askHr: null, message: 'Compensation is for staff employees only.',
  })!
  assert.equal(c.isStaff, false)
  assert.equal(c.items.length, 0)
  assert.equal(c.askHr, null)
  assert.equal(c.message, 'Compensation is for staff employees only.')
  assert.equal(askHrOf(c).title, ASK_HR_TITLE)
  assert.equal(askHrOf(c).text, ASK_HR_FALLBACK_TEXT)
})

test('a reply that is not an object is null (the hook turns it into a Retry state), never a crash', () => {
  for (const bad of [null, undefined, 'Not Found', 404, [], '<html>proxy error</html>']) assert.equal(normalizeCompensation(bad), null, String(bad))
})

test('missing and malformed fields read as "not sent": an empty, harmless model', () => {
  const c = normalizeCompensation({})!
  assert.equal(c.isStaff, true)
  assert.deepEqual(c.items, [])
  assert.equal(c.balanceShifts, 0)
  assert.equal(c.enabled.any, false)
  assert.equal(c.todayAllowance, null)
  assert.equal(c.askHr, null)
  const odd = normalizeCompensation({
    items: 'oops', balanceShifts: 'lots', enabled: 'yes', todayAllowance: { date: 'soon', minutes: 30 }, tomorrowAllowance: { date: '2026-10-15', minutes: 0 }, askHr: 'x',
  })!
  assert.deepEqual(odd.items, [])
  assert.equal(odd.balanceShifts, 0)
  assert.equal(odd.todayAllowance, null)
  assert.equal(odd.tomorrowAllowance, null)
  assert.equal(odd.askHr, null)
})

test('the balance is a number of shifts, never negative, and may arrive as a string', () => {
  assert.equal(normalizeCompensation({ balanceShifts: '0.75' })!.balanceShifts, 0.75)
  assert.equal(normalizeCompensation({ balanceShifts: -1 })!.balanceShifts, 0)
  assert.equal(normalizeCompensation({ balanceShifts: null })!.balanceShifts, 0)
})

test('"any" is worked out when the server leaves it out', () => {
  assert.equal(normalizeCompensation({ enabled: { master: true, birthday: true } })!.enabled.any, true)
  assert.equal(normalizeCompensation({ enabled: { master: true } })!.enabled.any, false)
})

test('an item with no usable fields still renders: its own kind as the title, a pretty status, a unique key', () => {
  const c = normalizeCompensation({ items: [{ kind: 'night_bonus', status: 'pending_review' }, { kind: 'night_bonus', status: 'x' }, null, 'junk', { key: 'k', kind: 'birthday', key2: 1 }] })!
  assert.equal(c.items.length, 3)
  assert.equal(c.items[0].title, 'Night bonus')
  assert.equal(c.items[0].statusLabel, 'Pending review')
  assert.equal(c.items[0].group, 'other')
  assert.equal(new Set(c.items.map((i) => i.key)).size, 3)
  assert.equal(c.items[2].key, 'k')
})

test('repeated keys from the server are made unique instead of dropping a row', () => {
  const c = normalizeCompensation({ items: [{ key: 'a', kind: 'birthday' }, { key: 'a', kind: 'birthday' }, { key: 'a', kind: 'birthday' }] })!
  assert.deepEqual(c.items.map((i) => i.key), ['a', 'a#1', 'a#2'])
})

test('a date that does not exist is dropped to null instead of reaching the screen as "Invalid Date"', () => {
  const c = normalizeCompensation({ items: [{ key: 'a', kind: 'birthday', date: '2026-02-31', workDate: 'tomorrow' }, { key: 'b', kind: 'birthday', date: '2026-10-12T00:00:00+05:30' }] })!
  assert.equal(c.items[0].date, null)
  assert.equal(c.items[0].workDate, null)
  assert.equal(c.items[1].date, '2026-10-12')
})

test('sections follow the server group, in the order the screen shows them, newest first, none empty', () => {
  const sections = groupItems(normalizeCompensation(REPLY)!.items)
  assert.deepEqual(sections.map((s) => s.group), ['detected', 'assigned', 'company', 'birthday', 'balance'])
  assert.deepEqual(sections.map((s) => s.title), GROUPS.map((g) => g.title))
  assert.deepEqual(sections[0].items.map((i) => i.key), ['ot-3625', 'ot-3630']) // 12 Oct before 9 Oct
  assert.deepEqual(sections[1].items.map((i) => i.key), ['ot-3600', 'hw-2421']) // 14 Oct before 11 Oct
  assert.deepEqual(groupItems([]), [])
})

test('a group added after this app was built is shown after the known ones, named after itself', () => {
  const sections = groupItems(normalizeCompensation({ items: [{ key: 'z', kind: 'x', group: 'special_bonus', date: '2026-10-01' }, { key: 'y', kind: 'birthday', group: 'birthday', date: '2026-10-02' }, { key: 'x', kind: 'x' }] })!.items)
  assert.deepEqual(sections.map((s) => s.group), ['birthday', 'special_bonus', 'other'])
  assert.equal(sections[1].title, 'Special bonus')
})

test('kinds the calendar draws use the calendar colours; a new kind is neutral and named after itself', () => {
  assert.equal(kindTone('birthday'), COMPENSATION_TONES.birthday)
  assert.equal(kindTone('ot_allowance'), COMPENSATION_TONES.ot_allowance)
  assert.equal(kindTone('window_late_in'), COMPENSATION_TONES.window_late_in)
  assert.equal(kindTone('window_early_out'), COMPENSATION_TONES.window_early_out)
  assert.equal(kindTone('ot_shift_relaxation').solid, COMPENSATION_TONES.relaxation.solid)
  const kinds = ['ot_allowance', 'ot_shift', 'ot_shift_relaxation', 'ot_shift_pay', 'holiday_work', 'redemption', 'window_late_in', 'window_early_out', 'birthday']
  for (const k of kinds) {
    const t = kindTone(k)
    assert.ok(t.label && t.icon && t.solid.startsWith('#'), k)
  }
  assert.equal(new Set(kinds.map((k) => kindTone(k).label)).size, kinds.length, 'every kind has its own label')
  const unknown = kindTone('shift_swap')
  assert.equal(unknown.label, 'Shift swap')
  assert.ok(unknown.icon.length > 0)
  assert.equal(kindTone('').label, 'Compensation')
})

// WCAG contrast of the ink of every kind chip on its tint, on a light card and on the dark card (#111827).
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
/** '#RRGGBBAA' laid over an opaque '#RRGGBB'. */
const over = (fg: string, bg: string) => {
  const a = fg.length === 9 ? parseInt(fg.slice(7, 9), 16) / 255 : 1
  const f = rgb(fg)
  const b = rgb(bg)
  return f.map((v, i) => Math.round(v * a + b[i] * (1 - a)))
}

test('every kind chip is readable: ink on tint, light and dark (WCAG AA, 4.5:1)', () => {
  const kinds = ['ot_allowance', 'ot_shift', 'ot_shift_relaxation', 'ot_shift_pay', 'holiday_work', 'redemption', 'window_late_in', 'window_early_out', 'birthday', 'something_new']
  for (const k of kinds) {
    const t = kindTone(k)
    const light = ratio(rgb(t.inkLight), over(t.softLight, '#FFFFFF'))
    const dark = ratio(rgb(t.inkDark), over(t.softDark, '#111827'))
    assert.ok(light >= 4.5, `${k} light ${light.toFixed(2)}`)
    assert.ok(dark >= 4.5, `${k} dark ${dark.toFixed(2)}`)
  }
})

test('status colours: done is green, waiting is amber, refused is red, unknown is neutral', () => {
  for (const s of ['used', 'applied', 'approved', 'paid']) assert.equal(statusTone(s), 'good', s)
  for (const s of ['pending', 'pending_hod', 'detected', 'today']) assert.equal(statusTone(s), 'warn', s)
  for (const s of ['assigned', 'scheduled', 'upcoming', 'taken']) assert.equal(statusTone(s), 'info', s)
  assert.equal(statusTone('rejected'), 'bad')
  for (const s of ['not_used', 'not_applied', 'not_applicable', 'who_knows', '']) assert.equal(statusTone(s), 'neutral', s)
})

test('shifts and minutes read the way the owner writes them', () => {
  assert.equal(shiftsText(0.25), '0.25')
  assert.equal(shiftsText(0.5), '0.50')
  assert.equal(shiftsText(1), '1.00')
  assert.equal(shiftsText(1.1 + 0.15), '1.25')
  assert.equal(shiftsLabel(0.25), '0.25 shift')
  assert.equal(shiftsLabel(0.5), '0.50 shift')
  assert.equal(shiftsLabel(1), '1.00 shift')
  assert.equal(shiftsLabel(1.5), '1.50 shifts')
  assert.equal(shiftsLabel(null), null)
  assert.equal(shiftsLabel(undefined), null)
  assert.equal(shiftsLabel(NaN), null)
  assert.equal(minutesText(30), '30 min')
  assert.equal(minutesText(60), '1 h')
  assert.equal(minutesText(90), '1 h 30 min')
  assert.equal(minutesText(150), '2 h 30 min')
  assert.equal(minutesText(0), null)
  assert.equal(minutesText(-5), null)
  assert.equal(minutesText(null), null)
  assert.deepEqual(balanceView(0), { value: '0.00', unit: 'shift' })
  assert.deepEqual(balanceView(1), { value: '1.00', unit: 'shift' })
  assert.deepEqual(balanceView(1.25), { value: '1.25', unit: 'shifts' })
  assert.deepEqual(balanceView(0.5), { value: '0.50', unit: 'shift' })
})

// The web app (src/lib/compensation.ts::formatShifts) and the server (compensation_shared.py::shifts_text) write shifts as
// two decimals and say "shift" up to and including 1, "shifts" above it. The phone must read exactly the same, in titles,
// facts, the claim toast and the balance card, so one card never says "0.50" in one place and "0.5" in another.
test('shifts are written exactly like the web app: two decimals, "shift" up to 1, "shifts" above it', () => {
  const web = (v: number) => `${v.toFixed(2)} ${v > 1 ? 'shifts' : 'shift'}`
  for (const v of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 10]) {
    assert.equal(shiftsLabel(v), web(v), String(v))
    // the balance card prints the same figure and the same unit as the item chip does
    assert.equal(`${balanceView(v).value} ${balanceView(v).unit}`, web(v), `balance ${v}`)
  }
  // 0.5 is "shift" (one word, like the server's "0.50 shift"), not "shifts" and not "0.5"
  assert.equal(balanceView(0.5).unit, 'shift')
  assert.equal(shiftsUnit(0.5), 'shift')
  assert.equal(shiftsUnit(1), 'shift')
  assert.equal(shiftsUnit(1.25), 'shifts')
  // the unit follows the printed figure: 1.004 prints "1.00", so it is still one shift
  assert.equal(shiftsLabel(1.004), '1.00 shift')
  assert.equal(shiftsLabel(0.1 + 0.2), '0.30 shift')
})

test('calendar dates are read without a time zone and invalid ones are refused', () => {
  assert.equal(formatLongDate('2026-10-12'), 'Mon, 12 Oct 2026')
  assert.equal(formatLongDate('2026-10-12T23:59:59+05:30'), 'Mon, 12 Oct 2026')
  assert.equal(formatLongDate('2024-02-29'), 'Thu, 29 Feb 2024')
  assert.equal(formatDayMonthYear('2026-01-05'), '5 Jan 2026')
  for (const bad of ['2026-02-30', '2026-13-01', 'soon', '', null, undefined, 20261012]) {
    assert.equal(parseIsoDate(bad), null, String(bad))
    assert.equal(formatLongDate(bad), '', String(bad))
  }
  assert.equal(addDaysIso('2026-10-31', 1), '2026-11-01')
  assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01')
  assert.equal(addDaysIso('2026-03-01', -1), '2026-02-28')
  assert.equal(addDaysIso('nope', 1), '')
})

test('the facts under an item: shifts, allowance minutes and what was used, the announced time, the day worked', () => {
  const c = normalizeCompensation(REPLY)!
  const by = (key: string) => itemFacts(c.items.find((i) => i.key === key)!).map((f) => f.text)
  assert.deepEqual(by('ot-3625'), ['30 min allowance', 'Used 18 min'])
  assert.deepEqual(by('ot-3630'), ['0.50 shift', '3 h 40 min past shift end'])
  assert.deepEqual(by('ot-3600'), ['0.50 shift', '3 h 20 min past shift end', 'Worked Thu, 8 Oct 2026'])
  assert.deepEqual(by('hw-2421'), ['0.50 shift']) // worked on the same day it is filed under: not repeated
  assert.deepEqual(by('win-959'), ['At 10:30'])
  assert.deepEqual(by('bd-2026-10-20'), [])
  assert.deepEqual(by('rd-9'), ['0.25 shift'])
})

test('a fact chip says the same figure as the server\'s title of that card ("0.50 shift", not "0.5")', () => {
  const c = normalizeCompensation(REPLY)!
  const card = c.items.find((i) => i.key === 'hw-2421')!
  assert.match(card.title, /0\.50 shift$/)
  assert.ok(itemFacts(card).some((f) => card.title.endsWith(f.text)), 'the chip repeats the title\'s figure exactly')
})

test('a record from before the overhaul is marked "Earlier record", like the web card', () => {
  const legacy = normalizeCompensation({
    ...REPLY,
    items: [
      { key: 'old-1', kind: 'ot_shift_relaxation', group: 'assigned', date: '2026-03-02', title: 'Alternative day credit', status: 'taken', statusLabel: 'Taken', shifts: null, legacy: true },
      { key: 'new-1', kind: 'ot_shift', group: 'detected', date: '2026-10-09', title: 'Extra hours', status: 'detected', statusLabel: 'Detected', shifts: 0.5, legacy: false },
      { key: 'nokey-1', kind: 'ot_shift', group: 'detected', date: '2026-10-09', title: 'Extra hours', status: 'detected', statusLabel: 'Detected', shifts: 0.5 },
      { key: 'odd-1', kind: 'ot_shift', group: 'detected', date: '2026-10-09', title: 'Extra hours', status: 'detected', statusLabel: 'Detected', shifts: 0.5, legacy: 'yes' },
    ],
  })!
  const label = (key: string) => earlierRecordLabel(legacy.items.find((i) => i.key === key)!)
  assert.equal(label('old-1'), 'Earlier record')
  assert.equal(EARLIER_RECORD_LABEL, 'Earlier record')
  assert.equal(label('new-1'), null)
  assert.equal(label('nokey-1'), null) // an older backend sends no `legacy` at all
  assert.equal(label('odd-1'), null)   // only the boolean true counts, exactly as on the web
})

test('the allowance banner: today, tomorrow, and a Monday that follows a Sunday', () => {
  const notice = { date: '2026-10-15', minutes: 60, workDate: '2026-10-14', onTimeUntil: '10:15', note: '' }
  const today = allowanceView({ ...notice, date: '2026-10-14' }, 'today', '2026-10-14')
  assert.equal(today.title, 'Late-in allowance today: 1 h')
  assert.equal(today.until, '10:15')
  assert.match(today.body, /You worked late on Wed, 14 Oct 2026/)
  assert.match(today.body, /arrive up to 1 h later than usual without being marked late/)
  assert.equal(allowanceView(notice, 'tomorrow', '2026-10-14').title, 'Late-in allowance tomorrow: 1 h')
  // the next working day after a Saturday OT day is a Monday: say the date, not "tomorrow"
  const monday = allowanceView({ ...notice, date: '2026-10-19', workDate: '2026-10-17', minutes: 30 }, 'tomorrow', '2026-10-17')
  assert.equal(monday.title, 'Late-in allowance on Mon, 19 Oct 2026: 30 min')
  // the server's own sentence wins when it sends one
  assert.equal(allowanceView({ ...notice, note: 'Server words.' }, 'tomorrow', '2026-10-14').body, 'Server words.')
  assert.equal(allowanceView({ ...notice, onTimeUntil: null, workDate: null }, 'today', '2026-10-15').until, null)
})

test('the HR contact block is read with the same rules as the support contact, and a broken one is null', () => {
  assert.equal(readContact(null), null)
  assert.equal(readContact('0421'), null)
  const empty = readContact({})!
  assert.equal(empty.hasContact, false)
  assert.equal(empty.label, 'HR Department')
  const c = readContact({ label: ' HR Desk ', phone: 123456, email: 'hr@uktex.net', hasContact: false, usesHrFallback: true })!
  assert.equal(c.label, 'HR Desk')
  assert.equal(c.hasContact, true) // recomputed: a wrong flag can never hide a number
  assert.equal(c.phone, '')        // a number is not a string: not sent
  assert.equal(c.email, 'hr@uktex.net')
  assert.equal(c.usesHrFallback, true)
})

test('prettify', () => {
  assert.equal(prettify('pending_hod'), 'Pending hod')
  assert.equal(prettify('not-used'), 'Not used')
  assert.equal(prettify(''), '')
})

// ── the Department Head's claims ────────────────────────────────────────────

test('a claim is worded by its day kind, the holiday name, the date and the shifts', () => {
  const sunday = { dayKind: 'sunday', holidayName: null, shifts: 0.5, workDate: '2026-10-11' }
  const holiday = { dayKind: 'holiday', holidayName: 'Gandhi Jayanti', shifts: 1, workDate: '2026-10-02' }
  assert.equal(claimTypeLabel(sunday), 'Sunday work')
  assert.equal(claimTypeLabel(holiday), 'Holiday work')
  assert.equal(claimTypeLabel({}), 'Holiday work')
  assert.equal(claimDayLabel(sunday), 'Sunday')
  assert.equal(claimDayLabel(holiday), 'Holiday: Gandhi Jayanti')
  assert.equal(claimDayLabel({ dayKind: 'holiday' }), 'Holiday')
  assert.equal(claimDateLabel(sunday), '11 Oct 2026 · 0.50 shift')
  assert.equal(claimDateLabel(holiday), '2 Oct 2026 · 1.00 shift')
  assert.equal(claimDateLabel({ workDate: '2026-10-11' }), '11 Oct 2026')
  assert.equal(claimDateLabel({}), '—')
  assert.equal(claimCreditedMessage({ ...sunday, employeeName: 'Asha Kumar' }), "Approved. 0.50 shift added to Asha Kumar's compensation balance.")
  assert.equal(claimCreditedMessage({ shifts: null }), "Approved. Added to the employee's compensation balance.")
})

// ── notifications ───────────────────────────────────────────────────────────

test('a compensation notification opens the Compensation screen; every other type stays on the list', () => {
  assert.equal(notificationRoute('compensation'), '/compensation')
  assert.equal(notificationRoute(' Compensation '), '/compensation')
  for (const other of ['leave', 'general', '', null, undefined, 5, {}]) assert.equal(notificationRoute(other), null, String(other))
})

// `compensation` is sent to the EMPLOYEE whose claim was decided (holiday_work_views.py::decide_claim), so it opens their own
// Compensation screen even when that employee is a Department Head; only `holiday_work` (sent to the head by
// approval_workflow.notify_hod_of_request) opens Approvals.
test('a "claim waits for you" notification opens the Approvals tab for a head, and nobody else is sent there', () => {
  assert.equal(APPROVALS_ROUTE, '/(tabs)/approvals')
  assert.equal(notificationRoute('holiday_work'), APPROVALS_ROUTE) // profile not loaded yet (a cold start): only heads get this type
  assert.equal(notificationRoute(' Holiday_Work '), APPROVALS_ROUTE)
  assert.equal(notificationRoute('holiday_work', { isManager: true }), APPROVALS_ROUTE)
  assert.equal(notificationRoute('holiday_work', {}), APPROVALS_ROUTE)
  // the profile says this person is no longer a head: there is no Approvals tab for them
  assert.equal(notificationRoute('holiday_work', { isManager: false }), null)
  assert.equal(notificationRoute('holiday_work', { isManager: null }), APPROVALS_ROUTE)
  // the employee's own "your claim was decided" notice never goes to Approvals, head or not
  assert.equal(notificationRoute('compensation', { isManager: true }), '/compensation')
  assert.equal(notificationRoute('compensation', { isManager: false }), '/compensation')
})

test('the screen reader hint says where a notification leads', () => {
  assert.equal(notificationHint('compensation'), 'Opens your compensation')
  assert.equal(notificationHint('holiday_work'), 'Opens approvals')
  assert.equal(notificationHint('holiday_work', { isManager: false }), undefined)
  for (const other of ['leave', 'general', '', null, undefined]) assert.equal(notificationHint(other), undefined, String(other))
})

test('a tapped holiday_work push routes to Approvals', () => {
  const push = { request: { content: { title: 'UKTextiles', body: 'x', data: { type: 'holiday_work' } } } }
  assert.equal(pushNotificationType(push), 'holiday_work')
  assert.equal(notificationRoute(pushNotificationType(push), { isManager: true }), APPROVALS_ROUTE)
})

test('the type of a tapped push is read from the notification object, defensively', () => {
  const push = { request: { content: { title: 'UKTextiles', body: 'x', data: { type: 'compensation' } } } }
  assert.equal(pushNotificationType(push), 'compensation')
  assert.equal(pushNotificationType({ request: { content: { data: {} } } }), null)
  assert.equal(pushNotificationType({ request: { content: {} } }), null)
  assert.equal(pushNotificationType({ request: { content: { data: { type: 3 } } } }), null)
  assert.equal(pushNotificationType({ request: { content: { data: { type: '' } } } }), null)
  for (const bad of [null, undefined, 'push', 7, []]) assert.equal(pushNotificationType(bad), null, String(bad))
})

test('an employee reminder sent to a Department Head opens Approvals; a non-head is never sent there', () => {
  assert.equal(notificationRoute('approval_reminder'), APPROVALS_ROUTE)
  assert.equal(notificationRoute('approval_reminder', { isManager: true }), APPROVALS_ROUTE)
  assert.equal(notificationRoute('approval_reminder', { isManager: false }), null)
  assert.equal(notificationHint('approval_reminder', { isManager: true }), 'Opens approvals')
})
