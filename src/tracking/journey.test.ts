// Run with `npm test`. "My journey": the server's list / detail shapes read defensively, the merged timeline, the map payload
// (route, numbered stops, gaps, events), the page that draws it, and the wording helpers.
/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  endReasonLabel,
  eventLabel,
  formatAgo,
  formatDistance,
  formatDuration,
  gapCauseLabel,
  isProblemEvent,
} from './format.ts';
import { journeyMapHtml, pagePayload, safeJson } from './journeyHtml.ts';
import {
  buildMapPayload,
  buildTimeline,
  normalizeJourneyDetail,
  normalizeJourneyList,
  numberedStops,
  summaryCardInputs,
} from './journeyModel.ts';
import { DEFAULT_CONFIG } from './constants.ts';
import { normalizeBatchResponse, normalizeConfig, normalizeTrackingState } from './normalize.ts';

const T0 = Date.parse('2026-10-28T04:30:00Z');
const iso = (min: number) => new Date(T0 + min * 60_000).toISOString();

// GET /tracking/journeys/<id> as the server builds it, after the app's axios client camelized the keys.
const DETAIL = {
  track: {
    id: 77, sessionId: 12, destination: 'ABC Textiles - machine inspection', startedAt: iso(0), endedAt: iso(180),
    endReason: 'manual', status: 'ended', state: 'ended', durationS: 10800, distanceM: 15420, travelS: 5400, stopS: 4500, gapS: 900,
    stopCount: 2, longestStopS: 3000, pointsCount: 640, eventsCount: 5, hasMock: false, approvalStatus: 'active',
    lastPointAt: iso(179), lastLatitude: 11.05, lastLongitude: 77.01, lastBatteryPct: 41, lastNetwork: 'cell',
  },
  summary: { distanceM: 15420, travelS: 5400, stopS: 4500, gapS: 900, stopCount: 2, longestStopS: 3000 },
  segments: [
    { seqNo: 3, kind: 'stop', startedAt: iso(100), endedAt: iso(150), durationS: 3000, centerLat: 11.04, centerLng: 77.0, radiusM: 40, address: 'Tiruppur bus stand', pointCount: 12, polyline: [] },
    { seqNo: 1, kind: 'travel', startedAt: iso(0), endedAt: iso(30), durationS: 1800, distanceM: 7000, polyline: [[11.0, 76.9], [11.02, 76.95], [11.03, 76.99]], avgSpeedKmh: 24, maxSpeedKmh: 48 },
    { seqNo: 2, kind: 'stop', startedAt: iso(30), endedAt: iso(55), durationS: 1500, centerLat: 11.03, centerLng: 76.99, radiusM: 30, address: '', polyline: [] },
    { seqNo: 4, kind: 'gap', startedAt: iso(150), endedAt: iso(165), durationS: 900, startLat: 11.04, startLng: 77.0, endLat: 11.05, endLng: 77.01, cause: 'network_lost', polyline: [] },
  ],
  events: [
    { kind: 'NETWORK_LOST', source: 'device', startedAt: iso(150), endedAt: iso(165), latitude: 11.04, longitude: 77.0 },
    { kind: 'TRACKING_STARTED', source: 'server', startedAt: iso(0), endedAt: null },
    { kind: 'LOW_BATTERY', source: 'device', startedAt: iso(120), latitude: 11.04, longitude: 77.0 },
  ],
  path: [[11.0, 76.9, 1], [11.02, 76.95, 2], [11.03, 76.99, 3], [11.04, 77.0, 4]],
  device: { model: 'Redmi Note 12', osVersion: '14', appVersion: '5.0.0', permissionLevel: 'always' },
};

test('the list is read from {results, total}, tolerating missing fields and junk rows', () => {
  const out = normalizeJourneyList({
    results: [DETAIL.track, { id: 5 }, { nope: true }, null],
    page: 1, pageSize: 20, total: 2,
  });
  assert.equal(out.results.length, 2);
  assert.equal(out.total, 2);
  assert.equal(out.results[0].destination, 'ABC Textiles - machine inspection');
  assert.equal(out.results[1].id, 5);
  assert.equal(out.results[1].destination, '');
  assert.equal(out.results[1].status, 'active');
  assert.equal(out.results[1].durationS, 0);
});

test('a missing durationS is worked out from the start and the end (or the last point)', () => {
  const a = normalizeJourneyList({ results: [{ id: 1, startedAt: iso(0), endedAt: iso(30) }] }).results[0];
  assert.equal(a.durationS, 1800);
  const b = normalizeJourneyList({ results: [{ id: 2, startedAt: iso(0), lastPointAt: iso(10) }] }).results[0];
  assert.equal(b.durationS, 600);
  assert.equal(b.status, 'active');
});

test('the detail has its segments in time order, typed, with the stops numbered by that order', () => {
  const d = normalizeJourneyDetail(DETAIL);
  assert.ok(d);
  assert.deepEqual(d.segments.map((s) => `${s.kind}:${s.seqNo}`), ['travel:1', 'stop:2', 'stop:3', 'gap:4']);
  assert.deepEqual(numberedStops(d.segments).map((s) => [s.n, s.seqNo]), [[1, 2], [2, 3]]);
  assert.equal(d.track.lastBatteryPct, 41);
  assert.equal(d.device?.model, 'Redmi Note 12');
  assert.equal(d.path.length, 4);
  assert.deepEqual(d.path[0], [11.0, 76.9], 'the time column of [lat, lng, t] is dropped');
});

test('the detail tolerates a thin response', () => {
  const d = normalizeJourneyDetail({ track: { id: 3 } });
  assert.ok(d);
  assert.deepEqual(d.segments, []);
  assert.deepEqual(d.events, []);
  assert.equal(d.device, null);
  assert.equal(normalizeJourneyDetail({}), null);
  assert.equal(normalizeJourneyDetail(null), null);
});

test('totals come from the track block, or from the summary block when the track has none', () => {
  const d = normalizeJourneyDetail({ track: { id: 1 }, summary: { distanceM: 900, stopCount: 3 } });
  assert.equal(d?.track.distanceM, 900);
  assert.equal(d?.track.stopCount, 3);
});

test('the summary cards: time, distance, travelling, stopped, stops, longest stop, no signal, locations', () => {
  const d = normalizeJourneyDetail(DETAIL)!;
  const cards = summaryCardInputs(d.track);
  assert.deepEqual(cards.map((c) => c.key), ['duration', 'distance', 'travel', 'stopped', 'stops', 'longest', 'gaps', 'points']);
  assert.equal((cards[0] as any).seconds, 10800);
  assert.equal((cards[1] as any).meters, 15420);
  assert.equal((cards[4] as any).count, 2);
});

test('the timeline merges segments and events in time order: stops are numbered, gaps say why, problems are flagged', () => {
  const d = normalizeJourneyDetail(DETAIL)!;
  const t = buildTimeline(d);
  const titles = t.map((x) => x.title);
  assert.equal(titles[0], 'Travelled');
  assert.equal(titles[1], 'Tracking started');
  assert.ok(titles.indexOf('Stop 1') < titles.indexOf('Stop 2'));
  assert.ok(titles.indexOf('Low battery') > titles.indexOf('Stop 2'));
  const gap = t.find((x) => x.type === 'segment' && x.seg.kind === 'gap');
  assert.ok(gap && gap.type === 'segment');
  assert.equal(gap.detail, 'No internet connection');
  const lost = t.find((x) => x.type === 'event' && x.event.kind === 'NETWORK_LOST');
  assert.ok(lost && lost.type === 'event' && lost.problem === true);
  const started = t.find((x) => x.type === 'event' && x.event.kind === 'TRACKING_STARTED');
  assert.ok(started && started.type === 'event' && started.problem === false);
  assert.deepEqual(t.map((x) => x.at), [...t.map((x) => x.at)].sort((a, b) => a - b));
});

test('the map payload: the server path, numbered stops at their centres, dashed gaps, only events that have a place', () => {
  const d = normalizeJourneyDetail(DETAIL)!;
  const p = buildMapPayload(d);
  assert.equal(p.route.length, 4);
  assert.deepEqual(p.start, [11.0, 76.9]);
  assert.deepEqual(p.end, [11.04, 77.0]);
  assert.deepEqual(p.stops.map((s) => [s.n, s.lat, s.lng, s.address]), [[1, 11.03, 76.99, ''], [2, 11.04, 77.0, 'Tiruppur bus stand']]);
  assert.equal(p.gaps.length, 1);
  assert.deepEqual(p.gaps[0].from, [11.04, 77.0]);
  assert.equal(p.gaps[0].cause, 'No internet connection');
  assert.deepEqual(p.events.map((e) => e.kind), ['NETWORK_LOST', 'LOW_BATTERY'], 'TRACKING_STARTED has no place');
});

test('with no server path the route is stitched from the travel segments', () => {
  const d = normalizeJourneyDetail({ ...DETAIL, path: [] })!;
  assert.equal(buildMapPayload(d).route.length, 3);
});

test('a journey with no place data at all still builds an empty payload (the page then shows its empty state)', () => {
  const d = normalizeJourneyDetail({ track: { id: 1 } })!;
  const p = buildMapPayload(d);
  assert.deepEqual([p.route, p.stops, p.gaps, p.events, p.start, p.end], [[], [], [], [], null, null]);
});

test('the map page embeds the data safely, pins Leaflet, and has an SVG fallback', () => {
  const d = normalizeJourneyDetail({
    ...DETAIL,
    segments: [{ ...DETAIL.segments[0], address: '</script><b>x</b>' }],
  })!;
  const html = journeyMapHtml(buildMapPayload(d));
  assert.match(html, /unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js/);
  assert.match(html, /tile\.openstreetmap\.org/);
  assert.match(html, /function drawSvg/);
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1, 'only the page itself closes its script: the address cannot break out');
  assert.ok(html.includes('\\u003c/script>'));
  assert.equal(safeJson({ a: '<' }), '{"a":"\\u003c"}');
  const payload = pagePayload(buildMapPayload(d));
  assert.equal(payload.stops[0].title, 'Stop 1');
  assert.equal(payload.stops[0].dur, '50 min');
});

// ------------------------------------------------------------------------------------------------ wording

test('durations and distances read the way the HR portal does', () => {
  assert.equal(formatDuration(0), '0 s');
  assert.equal(formatDuration(45), '45 s');
  assert.equal(formatDuration(60), '1 min');
  assert.equal(formatDuration(3599), '59 min');
  assert.equal(formatDuration(3600), '1 h');
  assert.equal(formatDuration(3900), '1 h 05 min');
  assert.equal(formatDuration(-5), '0 s');
  assert.equal(formatDuration(null), '0 s');
  assert.equal(formatDistance(850), '850 m');
  assert.equal(formatDistance(12_400), '12.4 km');
  assert.equal(formatDistance(150_000), '150 km');
  assert.equal(formatDistance(undefined), '0 m');
});

test('ago, causes, end reasons and events', () => {
  const now = 1_000_000_000_000;
  assert.equal(formatAgo(null, now), 'never');
  assert.equal(formatAgo(now - 3000, now), 'just now');
  assert.equal(formatAgo(now - 30_000, now), '30 s ago');
  assert.equal(formatAgo(now - 5 * 60_000, now), '5 min ago');
  assert.equal(formatAgo(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(gapCauseLabel('gps_off'), 'Location was switched off');
  assert.equal(gapCauseLabel('???'), 'No location received');
  assert.equal(endReasonLabel('auto_4th_punch'), 'All 4 punches were recorded');
  assert.equal(endReasonLabel('rejected'), 'The request was rejected');
  assert.equal(endReasonLabel(''), '');
  assert.equal(eventLabel('GPS_OFF'), 'Location switched off');
  assert.equal(eventLabel('SOMETHING_NEW'), 'Something new');
  assert.equal(isProblemEvent('GPS_OFF'), true);
  assert.equal(isProblemEvent('TRACKING_STARTED'), false);
});

// ------------------------------------------------------------------------------------------------ server shapes

test('GET /tracking/state is normalised: defaults, clamped config, photos 1 or 2', () => {
  const s = normalizeTrackingState({
    enabled: true, active: true, consentRequired: true, noticeVersion: 3, noticeText: 'We record your route.',
    serverTime: '2026-10-28T05:00:00+05:30',
    track: { id: 9, sessionId: 4, startedAt: '2026-10-28T09:00:00+05:30', endsAt: '2026-10-28T23:50:00+05:30', state: 'moving' },
    config: { sampleMovingSeconds: 1, sampleStillSeconds: 120, distanceFilterM: 15, uploadBatchPoints: 5000, uploadIntervalSeconds: 30, maxAccuracyM: 80 },
    punchPhotos: 2,
  });
  assert.equal(s.supported, true);
  assert.equal(s.consentRequired, true);
  assert.equal(s.noticeVersion, 3);
  assert.equal(s.track?.id, 9);
  assert.equal(s.config.sampleMovingSeconds, 2, 'clamped to the engine\'s minimum');
  assert.equal(s.config.uploadBatchPoints, 500, 'clamped to the contract maximum');
  assert.equal(s.config.sampleStillSeconds, 120);
  assert.equal(s.punchPhotos, 2);
});

test('an empty or partial /tracking/state still gives the engine usable values', () => {
  const s = normalizeTrackingState({});
  assert.equal(s.active, false);
  assert.equal(s.track, null);
  assert.equal(s.consentRequired, false);
  assert.deepEqual(s.config, DEFAULT_CONFIG);
  assert.equal(s.punchPhotos, 1);
  assert.equal(normalizeTrackingState({ track: { id: 2 } }).active, true, 'a track means active when `active` is missing');
  assert.equal(normalizeTrackingState({ track: { trackId: 7 } }).track?.id, 7, 'trackId is read as an alias of id');
  assert.equal(normalizeConfig({ sampleMovingSeconds: 'abc' }).sampleMovingSeconds, DEFAULT_CONFIG.sampleMovingSeconds);
});

test('the batch response is normalised: counts, ackSeq, trackActive, endReason, config', () => {
  const r = normalizeBatchResponse({
    ok: true, ackSeq: 1_800_000_040, accepted: 28, duplicates: 2, rejected: 0, trackActive: false, endReason: 'rejected',
    serverTime: '2026-10-28T05:00:00Z', config: { uploadBatchPoints: 10 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.ackSeq, 1_800_000_040);
  assert.equal(r.accepted, 28);
  assert.equal(r.trackActive, false);
  assert.equal(r.endReason, 'rejected');
  assert.equal(r.config?.uploadBatchPoints, 10);
  const bad = normalizeBatchResponse('nonsense');
  assert.equal(bad.ok, false);
  assert.equal(bad.trackActive, null);
  assert.equal(bad.ackSeq, null);
});
