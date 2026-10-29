// Run with `npm test`. "On-Duty Journey": the activity timeline in the order things happened (start, break, resumed, ... completed),
// the break summary and tiles, the geo-punch records of a journey, the colours, and the list (chip, live status, day groups).
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';

import { TONE_COLOR, breakSummary, breakTone, buildActivity, coordsText, journeyTiles, placeText, punchChip } from './activity.ts';
import { istWallClockMs } from './geo.ts';
import { groupPins, journeyMapHtml, pagePayload } from './journeyHtml.ts';
import {
  breakParts,
  breaksText,
  dayKey,
  dayLabel,
  dayParts,
  endNote,
  journeyChip,
  lastUpdateText,
  liveStatus,
  punchText,
  runningS,
  splitJourneys,
  timeRange,
} from './journeyList.ts';
import { buildMapPayload, isLongBreak, normalizeJourneyDetail, normalizeJourneyList } from './journeyModel.ts';
import type { JourneyDetail } from './journeyModel.ts';

// A journey like the demo's DM01 one: start wait, drive, a long break, drive, GPS off, a break, 24 m hop, a break, drive, final wait.
const T0 = Date.parse('2026-10-28T03:34:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
// punchDate/punchTime are the factory's wall clock (IST = UTC + 5:30): 03:37 UTC is 09:07 IST.
const ist = (min: number) => {
  const d = new Date(T0 + min * 60_000 + 330 * 60_000);
  return [d.toISOString().slice(0, 10), d.toISOString().slice(11, 19)] as const;
};

const stop = (seqNo: number, from: number, to: number, lat: number, lng: number, extra = {}) => ({
  seqNo, kind: 'stop', startedAt: at(from), endedAt: at(to), durationS: (to - from) * 60, centerLat: lat, centerLng: lng, radiusM: 50, address: '', polyline: [], ...extra,
});
const travel = (seqNo: number, from: number, to: number, km: number) => ({
  seqNo, kind: 'travel', startedAt: at(from), endedAt: at(to), durationS: (to - from) * 60, distanceM: km * 1000,
  polyline: [[11.1, 77.3], [11.2, 77.4]], avgSpeedKmh: 38, maxSpeedKmh: 61,
});
const punch = (id: number, n: number, min: number, status: string, extra = {}) => ({
  id, punchNumber: n, punchType: n % 2 ? 'IN' : 'OUT', punchDate: ist(min)[0], punchTime: ist(min)[1], latitude: 11.1085, longitude: 77.3411,
  accuracyM: 14.5, isMocked: false, hasPhoto: true, hasPhoto2: true, status, hrReviewComment: null, ...extra,
});

const RAW = {
  track: {
    id: 10, sessionId: 10, destination: 'Avinashi buyer visit', startedAt: at(0), endedAt: at(112), endReason: 'auto_4th_punch', status: 'ended',
    state: 'ended', durationS: 6720, distanceM: 20497, travelS: 2014, stopS: 3940, gapS: 600, stopCount: 5, longestStopS: 1560, pointsCount: 407,
    approvalStatus: 'completed', lastPointAt: at(111), lastLatitude: 11.1085, lastLongitude: 77.3411, punchCount: 4,
  },
  segments: [
    stop(1, 2, 5, 11.1085, 77.3411),
    travel(2, 5, 24, 12.2),
    stop(3, 24, 50, 11.193, 77.269),
    travel(4, 50, 57, 4.1),
    { seqNo: 5, kind: 'gap', startedAt: at(57), endedAt: at(67), durationS: 600, startLat: 11.18, startLng: 77.3, endLat: 11.14, endLng: 77.32, cause: 'gps_off', polyline: [] },
    stop(6, 67, 81, 11.137, 77.317),
    travel(7, 81, 81.27, 0.024),
    stop(8, 81.27, 95, 11.1376, 77.3174),
    travel(9, 95, 102, 4.1),
    stop(10, 102, 111, 11.1085, 77.3411),
  ],
  events: [
    { kind: 'TRACKING_STARTED', source: 'device', startedAt: at(0) },
    { kind: 'GPS_OFF', source: 'device', startedAt: at(57), endedAt: at(66), latitude: 11.18, longitude: 77.3 },
    { kind: 'TRACKING_STOPPED', source: 'device', startedAt: at(112) },
  ],
  punches: [punch(24, 1, 3, 'approved'), punch(25, 2, 26, 'approved'), punch(26, 3, 68, 'approved'), punch(27, 4, 84, 'pending')],
  path: [[11.1085, 77.3411, 1], [11.15, 77.3, 2], [11.1085, 77.3411, 3]],
  device: { model: 'Redmi Note 12', osVersion: '14', appVersion: '5.0.0', permissionLevel: 'always' },
};

const detail = (over: Record<string, unknown> = {}): JourneyDetail => normalizeJourneyDetail({ ...RAW, ...over })!;

// ------------------------------------------------------------------------------------------------ model

test('a punch time is the factory wall clock (IST), whatever zone the phone is in', () => {
  assert.equal(istWallClockMs('2026-10-28', '09:07:00'), Date.parse('2026-10-28T03:37:00Z'));
  assert.equal(istWallClockMs('2026-10-28', '09:07'), Date.parse('2026-10-28T03:37:00Z'));
  assert.equal(istWallClockMs('2026-10-28', 'later'), null);
  assert.equal(istWallClockMs(undefined, '09:07:00'), null);
});

test('the detail reads the punches in slot order, and an older server without them gives none', () => {
  const d = detail({ punches: [punch(2, 2, 26, 'rejected'), punch(1, 1, 3, 'approved'), punch(3, 2, 30, 'pending'), { nope: true }] });
  assert.deepEqual(d.punches.map((p) => [p.punchNumber, p.status]), [[1, 'approved'], [2, 'rejected'], [2, 'pending']]);
  assert.equal(d.punches[0].at, Date.parse('2026-10-28T03:37:00Z'));
  assert.equal(d.punches[0].punchType, 'IN');
  assert.equal(d.punches[0].hasPhoto2, true);
  assert.deepEqual(normalizeJourneyDetail({ track: { id: 1 } })!.punches, []);
});

test('the list item carries the punch count, or null from a server that does not send it', () => {
  const list = normalizeJourneyList({ results: [{ id: 1, punchCount: 3 }, { id: 2 }] }).results;
  assert.equal(list[0].punchCount, 3);
  assert.equal(list[1].punchCount, null);
});

// ------------------------------------------------------------------------------------------------ breaks, tiles, colours

test('a break is purple from 15 minutes, amber below; the colours are the shared journey palette', () => {
  assert.equal(isLongBreak(899), false);
  assert.equal(isLongBreak(900), true);
  assert.equal(breakTone(120), 'amber');
  assert.equal(breakTone(900), 'purple');
  assert.deepEqual(TONE_COLOR, {
    green: '#16a34a', amber: '#d97706', purple: '#7c3aed', blue: '#006496', grey: '#6b7280', red: '#dc2626',
  });
});

test('the break summary counts the stop segments: number, total, longest, how many were long', () => {
  const b = breakSummary(detail());
  assert.equal(b.count, 5);
  assert.equal(Math.round(b.totalS), 3944, '3 + 26 + 14 + 13.7 + 9 minutes');
  assert.equal(b.longestS, 26 * 60);
  assert.equal(b.longCount, 1, 'only the 26 min break is long (the 14 min one is just under)');
  // no segments yet: the track's own totals
  const thin = breakSummary(normalizeJourneyDetail({ track: { id: 1, stopCount: 2, stopS: 1000, longestStopS: 950 } })!);
  assert.deepEqual(thin, { count: 2, totalS: 1000, longestS: 950, longCount: 1 });
});

test('the summary tiles: total time, travelling, break time, breaks, distance; no-signal time only when there was some', () => {
  const tiles = journeyTiles(detail());
  assert.deepEqual(tiles.map((t) => t.key), ['duration', 'travel', 'breakTime', 'breaks', 'distance', 'gaps']);
  assert.equal(tiles.find((t) => t.key === 'breaks')!.value, '5');
  assert.equal(tiles.find((t) => t.key === 'breaks')!.hint, '1 of 15 min or more');
  assert.equal(tiles.find((t) => t.key === 'distance')!.value, '20.5 km');
  const quiet = journeyTiles(detail({ track: { ...RAW.track, gapS: 0 } }));
  assert.ok(!quiet.some((t) => t.key === 'gaps'));
});

test('a place with no street name reads as coordinates', () => {
  assert.equal(coordsText(11.10851, 77.34112), '11.1085, 77.3411');
  assert.equal(placeText([11.1, 77.3], ''), '11.1000, 77.3000');
  assert.equal(placeText([11.1, 77.3], ' Tiruppur bus stand '), 'Tiruppur bus stand');
  assert.equal(placeText(null, ''), '');
});

// ------------------------------------------------------------------------------------------------ the activity timeline

test('the activity timeline reads in the order things happened, from "Journey started" to "On-duty completed"', () => {
  const rows = buildActivity(detail(), T0 + 200 * 60_000);
  assert.deepEqual(
    rows.map((r) => r.title),
    [
      'Journey started',
      'Break taken', 'Geo-punch 1 recorded', // the punch at 09:07 is inside break 1
      'Journey resumed',
      'Break taken', 'Geo-punch 2 recorded',
      'Journey resumed',
      'No location',
      'Break taken', 'Geo-punch 3 recorded',
      'Journey resumed',
      'Break taken', 'Geo-punch 4 recorded',
      'Journey resumed',
      'Break taken',
      'On-duty completed',
    ],
  );
  assert.equal(rows[0].kind, 'start');
  assert.equal(rows[rows.length - 1].kind, 'complete');
  assert.deepEqual(rows.map((r) => r.at), [...rows.map((r) => r.at)].sort((a, b) => a - b), 'strictly chronological');
});

test('breaks are numbered like the map pins; amber under 15 min and purple from 15, long ones are marked', () => {
  const breaks = buildActivity(detail()).filter((r) => r.kind === 'break');
  assert.deepEqual(breaks.map((r) => r.stopNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(breaks.map((r) => r.tone), ['amber', 'purple', 'amber', 'amber', 'amber']);
  assert.equal(breaks[1].chip?.label, 'Long break');
  assert.equal(breaks[0].chip, null);
  assert.match(breaks[1].summary, /26 min/);
  assert.match(breaks[1].summary, /11\.1930, 77\.2690/, 'no street name: the coordinates');
  assert.ok(breaks[1].details.some((d) => d.label === 'Break length' && /purple/.test(d.value)));
  assert.ok(breaks[0].details.some((d) => d.label === 'Pin on the map' && d.value === 'Stop 1'));
});

test('"Journey resumed" is the moment travel starts again after a break; the first leg is plain "Travelling"', () => {
  const travelFirst = detail({ segments: [travel(1, 0, 10, 5), stop(2, 10, 20, 11.2, 77.3), travel(3, 20, 30, 4)], events: [], punches: [] });
  assert.deepEqual(buildActivity(travelFirst).map((r) => r.title), [
    'Journey started', 'Travelling', 'Break taken', 'Journey resumed', 'On-duty completed',
  ]);
  const resumed = buildActivity(detail()).filter((r) => r.kind === 'resume');
  assert.equal(resumed.length, 4);
  assert.match(resumed[0].summary, /^Travelled 12\.2 km/);
  assert.ok(resumed[0].details.some((d) => d.label === 'Average speed' && d.value === '38 km/h'));
});

test('a break followed by a gap and then travel still resumes at the travel', () => {
  const d = detail({
    segments: [stop(1, 0, 10, 11.1, 77.3), { seqNo: 2, kind: 'gap', startedAt: at(10), endedAt: at(20), durationS: 600, cause: 'network_lost', polyline: [] }, travel(3, 20, 30, 3)],
    events: [],
    punches: [],
  });
  assert.deepEqual(buildActivity(d).map((r) => r.title), ['Journey started', 'Break taken', 'No location', 'Journey resumed', 'On-duty completed']);
});

test('a stretch with no location says why, and the phone-side event inside it is shown there, not as a second row', () => {
  const rows = buildActivity(detail());
  const gap = rows.find((r) => r.kind === 'gap')!;
  assert.equal(gap.tone, 'grey');
  assert.equal(gap.summary, '10 min · Location was switched off');
  assert.ok(gap.details.some((d) => d.label === 'Location switched off'), 'GPS_OFF is listed inside the gap');
  assert.equal(rows.filter((r) => r.kind === 'event').length, 0);
});

test('a problem event outside any gap is its own row; a fake location is red; neutral events are left out', () => {
  const d = detail({
    events: [
      { kind: 'TRACKING_STARTED', source: 'device', startedAt: at(0) },
      { kind: 'MOCK_LOCATION', source: 'device', startedAt: at(30), latitude: 11.2, longitude: 77.2 },
      { kind: 'NETWORK_LOST', source: 'device', startedAt: at(40), endedAt: at(45) },
      { kind: 'POWER_SAVE_ON', source: 'device', startedAt: at(41) },
      { kind: 'TRACKING_STOPPED', source: 'device', startedAt: at(112) },
    ],
  });
  const ev = buildActivity(d).filter((r) => r.kind === 'event');
  assert.deepEqual(ev.map((r) => [r.title, r.tone]), [['Fake location detected', 'red'], ['Internet lost', 'grey']]);
});

test('the geo-punch rows carry number, status, place and photos; a rejected one is red and shows the HR note', () => {
  const d = detail({
    punches: [punch(1, 1, 3, 'approved'), punch(2, 2, 26, 'rejected', { hrReviewComment: 'Photo was blurry', hasPhoto2: false }), punch(3, 2, 40, 'pending', { isMocked: true })],
  });
  const rows = buildActivity(d).filter((r) => r.kind === 'punch');
  assert.deepEqual(rows.map((r) => [r.title, r.chip?.label, r.tone]), [
    ['Geo-punch 1 recorded', 'Approved', 'green'],
    ['Geo-punch 2 recorded', 'Rejected', 'red'],
    ['Geo-punch 2 recorded', 'Pending', 'red'], // a simulated location is red whatever the status
  ]);
  assert.ok(rows[1].details.some((x) => x.label === 'HR note' && x.value === 'Photo was blurry'));
  assert.ok(rows[1].details.some((x) => x.label === 'Photos' && x.value === '1'));
  assert.ok(rows[2].details.some((x) => x.label === 'Warning'));
  assert.deepEqual(rows[0].place, [11.1085, 77.3411]);
  assert.equal(punchChip('pending').tone, 'amber');
});

test('a journey in progress ends with "On-duty in progress" and when the last position arrived', () => {
  const now = T0 + 30 * 60_000;
  const d = detail({
    track: { ...RAW.track, status: 'active', endedAt: null, endReason: '', state: 'moving', lastPointAt: new Date(now - 4 * 60_000).toISOString() },
    segments: [travel(1, 0, 10, 5)],
    events: [],
    punches: [],
  });
  const rows = buildActivity(d, now);
  const last = rows[rows.length - 1];
  assert.equal(last.kind, 'live');
  assert.equal(last.title, 'On-duty in progress');
  assert.equal(last.summary, 'Last position 4 min ago');
  assert.ok(!rows.some((r) => r.kind === 'complete'));
});

test('a rejected request ends the journey with "On-duty ended" (grey), not "completed"', () => {
  const rows = buildActivity(detail({ track: { ...RAW.track, endReason: 'rejected' }, segments: [], events: [], punches: [] }));
  const last = rows[rows.length - 1];
  assert.deepEqual([last.title, last.tone, last.summary], ['On-duty ended', 'grey', 'The request was rejected']);
});

test('a journey with nothing recorded still reads: started and completed', () => {
  const d = normalizeJourneyDetail({ track: { id: 1, startedAt: at(0), endedAt: at(5), status: 'ended' } })!;
  assert.deepEqual(buildActivity(d).map((r) => r.title), ['Journey started', 'On-duty completed']);
});

// ------------------------------------------------------------------------------------------------ the list

const item = (over: Record<string, unknown> = {}) => normalizeJourneyList({ results: [{ ...RAW.track, ...over }] }).results[0];

test('the status chip: In progress, Completed, Ended by day-end, Rejected, Closed by HR', () => {
  assert.deepEqual(journeyChip(item({ status: 'active', endedAt: null, endReason: '' })), { label: 'In progress', tone: 'blue' });
  assert.deepEqual(journeyChip(item()), { label: 'Completed', tone: 'green' });
  assert.deepEqual(journeyChip(item({ endReason: 'manual' })), { label: 'Completed', tone: 'green' });
  assert.deepEqual(journeyChip(item({ endReason: 'auto_day_end' })), { label: 'Ended by day-end', tone: 'amber' });
  assert.deepEqual(journeyChip(item({ endReason: 'admin' })), { label: 'Closed by HR', tone: 'grey' });
  assert.deepEqual(journeyChip(item({ endReason: 'rejected' })), { label: 'Rejected', tone: 'red' });
  assert.equal(endNote(item({ endReason: 'auto_4th_punch' })), 'All 4 punches were recorded');
  assert.equal(endNote(item({ status: 'active', endedAt: null })), '');
});

test('the live status of a journey in progress', () => {
  assert.deepEqual([liveStatus('moving').label, liveStatus('moving').tone], ['Moving', 'green']);
  assert.deepEqual([liveStatus('stationary').label, liveStatus('stationary').tone], ['Still', 'amber']);
  assert.deepEqual([liveStatus('offline').label, liveStatus('offline').tone], ['Offline', 'grey']);
  assert.deepEqual([liveStatus('location_off').label, liveStatus('location_off').tone], ['Location off', 'red']);
  assert.equal(liveStatus('waiting_first_fix').label, 'Starting');
  assert.equal(liveStatus('???').label, 'Recording');
  assert.match(liveStatus('location_off').hint, /quick settings/);
});

test('time running: the clock while it runs, the recorded total once it has ended', () => {
  const running = item({ status: 'active', endedAt: null, startedAt: at(0), durationS: 5 });
  assert.equal(runningS(running, T0 + 90 * 60_000), 5400);
  assert.equal(runningS(item(), T0 + 999 * 60_000), 6720);
  assert.match(timeRange(running), / - now$/);
  assert.doesNotMatch(timeRange(item()), /now/);
  assert.equal(lastUpdateText(item({ lastPointAt: null })), 'Waiting for the first location');
  assert.equal(lastUpdateText(item({ lastPointAt: at(10) }), T0 + 12 * 60_000), 'Last position 2 min ago');
});

test('card numbers: punches 4/4 (never more), breaks with their total, none when the server does not say', () => {
  assert.equal(punchText(item({ punchCount: 4 })), '4/4');
  assert.equal(punchText(item({ punchCount: 9 })), '4/4');
  assert.equal(punchText(item({ punchCount: null })), '');
  assert.equal(breaksText({ stopCount: 0, stopS: 0 }), 'No breaks');
  assert.equal(breaksText({ stopCount: 1, stopS: 720 }), '1 break · 12 min');
  assert.equal(breaksText({ stopCount: 5, stopS: 3940 }), '5 breaks · 1 h 05 min');
});

test('the breaks metric of a card: count with its caption, or "None"; the date tile reads day / month / weekday', () => {
  assert.deepEqual(breakParts({ stopCount: 5, stopS: 3940 }), { value: '5 breaks', label: '1 h 05 min in total' });
  assert.deepEqual(breakParts({ stopCount: 1, stopS: 120 }), { value: '1 break', label: '2 min in total' });
  assert.deepEqual(breakParts({ stopCount: 0, stopS: 0 }), { value: 'None', label: 'No breaks' });
  assert.deepEqual(dayParts(new Date(2026, 9, 28, 9, 4).getTime()), { day: '28', month: 'Oct', weekday: 'Wed' });
});

// ------------------------------------------------------------------------------------------------ the map page

const stopAt = (n: number, lat: number, lng: number, min: number, from = 0) => ({
  n, lat, lng, from: at(from), to: at(from + min), durationS: min * 60, address: '', long: min >= 15,
});

test('breaks within 15 m share one pin ("1 · 3"), purple if any of them is long; the rest keep their own pin', () => {
  const pins = groupPins([
    stopAt(1, 11.1085, 77.3411, 3),
    stopAt(2, 11.193, 77.269, 26),
    stopAt(3, 11.10851, 77.34111, 20), // about 1 m from stop 1
    stopAt(4, 11.1376, 77.3174, 13),
  ]);
  assert.deepEqual(pins.map((p) => [p.label, p.long, p.items.length]), [['1 · 3', true, 2], ['2', true, 1], ['4', false, 1]]);
  assert.deepEqual(pins[0].items.map((i) => i.title), ['Stop 1', 'Stop 3']);
  assert.match(pins[1].items[0].dur, /15 min or longer/);
  assert.deepEqual(groupPins([stopAt(1, 11.1, 77.3, 3), stopAt(2, 11.1006, 77.3, 3)]).map((p) => p.label), ['1', '2'], '67 m apart: two pins (two breaks 65 m apart are two places)');
});

test('the map page uses the shared colours: one green for start and end, amber / purple breaks, blue route, grey gaps, red for fake', () => {
  const html = journeyMapHtml(buildMapPayload(detail()));
  for (const hex of ['#16a34a', '#d97706', '#7c3aed', '#006496', '#6b7280', '#dc2626']) assert.ok(html.includes(hex), `${hex} is in the page`);
  assert.ok(!html.includes('#DC2626') && !html.includes('#059669') && !html.includes('#1E3A8A'), 'the old red end pin / green start pin / blue stops are gone');
  const payload = pagePayload(buildMapPayload(detail()));
  assert.equal(payload.startInfo.title, 'Journey started');
  assert.equal(payload.endInfo.title, 'On-duty completed');
  assert.equal(pagePayload(buildMapPayload(detail({ track: { ...RAW.track, status: 'active', endedAt: null } }))).endInfo.title, 'Last position');
  assert.equal(payload.pins.length <= payload.stops.length, true);
  assert.equal(buildMapPayload(detail({ events: [{ kind: 'MOCK_LOCATION', startedAt: at(5), latitude: 11.1, longitude: 77.3 }] })).events[0].mock, true);
});

test('the list groups finished journeys by day (Today / Yesterday / date) and lifts the running one out', () => {
  const now = new Date(2026, 9, 28, 15, 0).getTime(); // 28 Oct 2026, local noon-ish
  const day = (d: number, h: number) => new Date(2026, 9, d, h, 0).toISOString();
  const list = normalizeJourneyList({
    results: [
      { id: 1, startedAt: day(25, 9), endedAt: day(25, 11), status: 'ended' },
      { id: 2, startedAt: day(28, 9), endedAt: day(28, 10), status: 'ended' },
      { id: 3, startedAt: day(27, 9), endedAt: day(27, 10), status: 'ended' },
      { id: 4, startedAt: day(28, 12), status: 'active' },
      { id: 5, startedAt: day(27, 14), endedAt: day(27, 15), status: 'ended' },
      { id: 6, startedAt: new Date(2025, 11, 30, 9).toISOString(), endedAt: new Date(2025, 11, 30, 10).toISOString(), status: 'ended' },
    ],
  }).results;
  const { current, days } = splitJourneys(list, now);
  assert.deepEqual(current.map((j) => j.id), [4]);
  assert.deepEqual(days.map((g) => [g.label, g.items.map((j) => j.id)]), [
    ['Today', [2]],
    ['Yesterday', [5, 3]],
    ['Sun, 25 Oct', [1]],
    ['Tue, 30 Dec 2025', [6]],
  ]);
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
  assert.equal(dayLabel(now, now), 'Today');
  assert.deepEqual(splitJourneys([], now), { current: [], days: [] });
});
