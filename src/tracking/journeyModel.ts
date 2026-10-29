// The employee's own journeys (GET /tracking/my-journeys, GET /tracking/journeys/<id>) as typed, defensively read data:
// a list item, the detail (summary, segments, events, simplified path) and what the map and the timeline draw from it.
// The server shapes are camelCase after src/lib/api.ts; every field may be missing on an older or newer backend.
import { eventLabel, gapCauseLabel, isProblemEvent } from './format.ts';
import { istWallClockMs, parseTime } from './geo.ts';

export type LatLng = [number, number];

export interface JourneyListItem {
  id: number;
  sessionId: number | null;
  destination: string;
  startedAt: string | null;
  endedAt: string | null;
  endReason: string;
  status: 'active' | 'ended';
  state: string;
  durationS: number;
  distanceM: number;
  travelS: number;
  stopS: number;
  gapS: number;
  stopCount: number;
  longestStopS: number;
  pointsCount: number;
  eventsCount: number;
  hasMock: boolean;
  approvalStatus: string;
  lastPointAt: string | null;
  /** Geo-punches (of the 4) recorded under this journey; null when the server does not say (an older backend). */
  punchCount: number | null;
}

export interface JourneySegment {
  seqNo: number;
  kind: 'travel' | 'stop' | 'gap';
  startedAt: string | null;
  endedAt: string | null;
  durationS: number;
  distanceM: number;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  centerLat: number | null;
  centerLng: number | null;
  radiusM: number | null;
  pointCount: number;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  polyline: LatLng[];
  address: string;
  cause: string;
  estimated: boolean;
}

export interface JourneyEvent {
  kind: string;
  source: string;
  startedAt: string | null;
  endedAt: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** One geo-punch of the journey's On-Duty session (`punches` of the journey detail). Several rows can share a punchNumber: a
 *  rejected punch that was recorded again. */
export interface JourneyPunch {
  id: number;
  punchNumber: number;
  punchType: 'IN' | 'OUT';
  /** The factory's wall clock, as the server stores it: "2026-10-28" / "09:07:00". */
  punchDate: string;
  punchTime: string;
  /** The same instant as epoch milliseconds (null if the date or time was unreadable). */
  at: number | null;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  isMocked: boolean;
  hasPhoto: boolean;
  hasPhoto2: boolean;
  status: 'pending' | 'approved' | 'rejected';
  reviewComment: string | null;
}

export interface JourneyDetail {
  track: JourneyListItem & {
    lastLatitude: number | null;
    lastLongitude: number | null;
    lastBatteryPct: number | null;
    lastNetwork: string;
  };
  segments: JourneySegment[];
  events: JourneyEvent[];
  /** Geo-punches under the journey's session, in slot order. Empty on a backend that does not send them. */
  punches: JourneyPunch[];
  /** [lat, lng, epochMs?] simplified by the server. */
  path: LatLng[];
  device: { model: string; osVersion: string; appVersion: string; permissionLevel: string } | null;
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' ? (v as Record<string, any>) : {});

export function normalizeListItem(raw: unknown): JourneyListItem | null {
  const r = obj(raw);
  const id = numOrNull(r.id);
  if (id == null) return null;
  const startedAt = strOrNull(r.startedAt);
  const endedAt = strOrNull(r.endedAt);
  let durationS = num(r.durationS, -1);
  if (durationS < 0) {
    const a = parseTime(startedAt);
    const b = parseTime(endedAt) ?? parseTime(r.lastPointAt);
    durationS = a != null && b != null && b > a ? Math.round((b - a) / 1000) : 0;
  }
  return {
    id,
    sessionId: numOrNull(r.sessionId),
    destination: str(r.destination),
    startedAt,
    endedAt,
    endReason: str(r.endReason),
    status: r.status === 'ended' || endedAt ? 'ended' : 'active',
    state: str(r.state),
    durationS,
    distanceM: num(r.distanceM),
    travelS: num(r.travelS),
    stopS: num(r.stopS),
    gapS: num(r.gapS),
    stopCount: Math.round(num(r.stopCount)),
    longestStopS: num(r.longestStopS),
    pointsCount: Math.round(num(r.pointsCount)),
    eventsCount: Math.round(num(r.eventsCount)),
    hasMock: r.hasMock === true,
    approvalStatus: str(r.approvalStatus),
    lastPointAt: strOrNull(r.lastPointAt),
    punchCount: numOrNull(r.punchCount) == null ? null : Math.round(num(r.punchCount)),
  };
}

export function normalizeJourneyList(raw: unknown): { results: JourneyListItem[]; total: number } {
  const r = obj(raw);
  const list = Array.isArray(r.results) ? r.results : Array.isArray(raw) ? (raw as unknown[]) : [];
  const results = list.map(normalizeListItem).filter((x): x is JourneyListItem => x != null);
  return { results, total: num(r.total, results.length) };
}

function normalizePolyline(v: unknown): LatLng[] {
  if (!Array.isArray(v)) return [];
  const out: LatLng[] = [];
  for (const p of v) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') out.push([p[0], p[1]]);
  }
  return out;
}

function normalizeSegment(raw: unknown, index: number): JourneySegment | null {
  const r = obj(raw);
  const kind = r.kind === 'stop' || r.kind === 'gap' || r.kind === 'travel' ? r.kind : null;
  if (!kind) return null;
  return {
    seqNo: Math.round(num(r.seqNo, index + 1)),
    kind,
    startedAt: strOrNull(r.startedAt),
    endedAt: strOrNull(r.endedAt),
    durationS: num(r.durationS),
    distanceM: num(r.distanceM),
    startLat: numOrNull(r.startLat),
    startLng: numOrNull(r.startLng),
    endLat: numOrNull(r.endLat),
    endLng: numOrNull(r.endLng),
    centerLat: numOrNull(r.centerLat),
    centerLng: numOrNull(r.centerLng),
    radiusM: numOrNull(r.radiusM),
    pointCount: Math.round(num(r.pointCount)),
    avgSpeedKmh: numOrNull(r.avgSpeedKmh),
    maxSpeedKmh: numOrNull(r.maxSpeedKmh),
    polyline: normalizePolyline(r.polyline),
    address: str(r.address),
    cause: str(r.cause),
    estimated: r.estimated === true,
  };
}

function normalizeEvent(raw: unknown): JourneyEvent | null {
  const r = obj(raw);
  const kind = str(r.kind);
  if (!kind) return null;
  return {
    kind,
    source: str(r.source),
    startedAt: strOrNull(r.startedAt),
    endedAt: strOrNull(r.endedAt),
    latitude: numOrNull(r.latitude),
    longitude: numOrNull(r.longitude),
  };
}

function normalizePunch(raw: unknown): JourneyPunch | null {
  const r = obj(raw);
  const id = numOrNull(r.id);
  const punchNumber = numOrNull(r.punchNumber);
  if (id == null || punchNumber == null) return null;
  return {
    id,
    punchNumber: Math.round(punchNumber),
    punchType: r.punchType === 'OUT' ? 'OUT' : 'IN',
    punchDate: str(r.punchDate),
    punchTime: str(r.punchTime),
    at: istWallClockMs(r.punchDate, r.punchTime),
    latitude: numOrNull(r.latitude),
    longitude: numOrNull(r.longitude),
    accuracyM: numOrNull(r.accuracyM),
    isMocked: r.isMocked === true,
    hasPhoto: r.hasPhoto === true,
    hasPhoto2: r.hasPhoto2 === true,
    status: r.status === 'approved' || r.status === 'rejected' ? r.status : 'pending',
    reviewComment: strOrNull(r.hrReviewComment),
  };
}

export function normalizeJourneyDetail(raw: unknown): JourneyDetail | null {
  const r = obj(raw);
  const trackRaw = obj(r.track);
  const item = normalizeListItem({ ...obj(r.summary), ...trackRaw });
  if (!item) return null;
  // The track block is the source of truth for identity; the summary block carries the totals when the list item has none.
  const summary = obj(r.summary);
  const merged: JourneyListItem = {
    ...item,
    durationS: item.durationS || num(summary.durationS),
    distanceM: item.distanceM || num(summary.distanceM),
    travelS: item.travelS || num(summary.travelS),
    stopS: item.stopS || num(summary.stopS),
    gapS: item.gapS || num(summary.gapS),
    stopCount: item.stopCount || Math.round(num(summary.stopCount)),
    longestStopS: item.longestStopS || num(summary.longestStopS),
  };
  const device = obj(r.device);
  return {
    track: {
      ...merged,
      lastLatitude: numOrNull(trackRaw.lastLatitude),
      lastLongitude: numOrNull(trackRaw.lastLongitude),
      lastBatteryPct: numOrNull(trackRaw.lastBatteryPct),
      lastNetwork: str(trackRaw.lastNetwork),
    },
    segments: (Array.isArray(r.segments) ? r.segments : [])
      .map(normalizeSegment)
      .filter((x): x is JourneySegment => x != null)
      .sort((a, b) => (parseTime(a.startedAt) ?? 0) - (parseTime(b.startedAt) ?? 0) || a.seqNo - b.seqNo),
    events: (Array.isArray(r.events) ? r.events : []).map(normalizeEvent).filter((x): x is JourneyEvent => x != null),
    punches: (Array.isArray(r.punches) ? r.punches : [])
      .map(normalizePunch)
      .filter((x): x is JourneyPunch => x != null)
      .sort((a, b) => a.punchNumber - b.punchNumber || (a.at ?? 0) - (b.at ?? 0) || a.id - b.id),
    path: normalizePolyline(r.path),
    device: Object.keys(device).length
      ? {
          model: str(device.model),
          osVersion: str(device.osVersion),
          appVersion: str(device.appVersion),
          permissionLevel: str(device.permissionLevel),
        }
      : null,
  };
}

// ------------------------------------------------------------------------------------------------ cards and timeline

export interface SummaryCard {
  key: string;
  label: string;
  value: string;
}

/** The numbers above the map, as [label, raw value] so the screen formats them. */
export function summaryCardInputs(item: JourneyListItem) {
  return [
    { key: 'duration', label: 'Total time', seconds: item.durationS },
    { key: 'distance', label: 'Distance', meters: item.distanceM },
    { key: 'travel', label: 'Travelling', seconds: item.travelS },
    { key: 'stopped', label: 'Stopped', seconds: item.stopS },
    { key: 'stops', label: 'Stops', count: item.stopCount },
    { key: 'longest', label: 'Longest stop', seconds: item.longestStopS },
    { key: 'gaps', label: 'No signal', seconds: item.gapS },
    { key: 'points', label: 'Locations', count: item.pointsCount },
  ] as const;
}

export type TimelineItem =
  | { type: 'segment'; at: number; seg: JourneySegment; stopNumber: number | null; title: string; detail: string }
  | { type: 'event'; at: number; event: JourneyEvent; title: string; problem: boolean };

/** A stop of this long or longer is a "long break" (purple on the map and in the timeline, amber below it). The HR portal's rule. */
export const LONG_BREAK_S = 15 * 60;
export const isLongBreak = (durationS: number): boolean => durationS >= LONG_BREAK_S;

/** Stop segments, numbered 1..n in time order (the numbers on the map). */
export function numberedStops(segments: JourneySegment[]): (JourneySegment & { n: number })[] {
  return segments.filter((s) => s.kind === 'stop').map((s, i) => ({ ...s, n: i + 1 }));
}

/** Segments and events merged into one time-ordered list. Movement is "Travelled", a stop is "Stop n", a gap says why. */
export function buildTimeline(detail: Pick<JourneyDetail, 'segments' | 'events'>): TimelineItem[] {
  let stopNo = 0;
  const items: TimelineItem[] = [];
  for (const seg of detail.segments) {
    const at = parseTime(seg.startedAt) ?? 0;
    if (seg.kind === 'stop') {
      stopNo += 1;
      items.push({ type: 'segment', at, seg, stopNumber: stopNo, title: `Stop ${stopNo}`, detail: seg.address });
    } else if (seg.kind === 'gap') {
      items.push({ type: 'segment', at, seg, stopNumber: null, title: 'No location', detail: gapCauseLabel(seg.cause) });
    } else {
      items.push({ type: 'segment', at, seg, stopNumber: null, title: 'Travelled', detail: '' });
    }
  }
  for (const event of detail.events) {
    items.push({
      type: 'event',
      at: parseTime(event.startedAt) ?? 0,
      event,
      title: eventLabel(event.kind),
      problem: isProblemEvent(event.kind),
    });
  }
  // Same instant: the segment first (an event inside a stop reads after the stop began).
  return items.sort((a, b) => a.at - b.at || (a.type === b.type ? 0 : a.type === 'segment' ? -1 : 1));
}

// ------------------------------------------------------------------------------------------------ map payload

export interface MapPayload {
  route: LatLng[];
  stops: {
    n: number;
    lat: number;
    lng: number;
    from: string | null;
    to: string | null;
    durationS: number;
    address: string;
    /** A break of LONG_BREAK_S or more: drawn purple, a shorter one amber. */
    long: boolean;
  }[];
  gaps: { from: LatLng; to: LatLng; cause: string; durationS: number; startedAt: string | null }[];
  events: { kind: string; label: string; lat: number; lng: number; at: string | null; problem: boolean; mock: boolean }[];
  start: LatLng | null;
  end: LatLng | null;
  /** The start pin's time, the end pin's time (the last position while it still runs), and whether it still runs. */
  startedAt: string | null;
  endedAt: string | null;
  active: boolean;
}

/** Everything the Leaflet page draws. The route is the server's simplified path, else the travel segments' polylines. */
export function buildMapPayload(detail: Pick<JourneyDetail, 'segments' | 'events' | 'path' | 'track'>): MapPayload {
  let route = detail.path;
  if (route.length < 2) {
    route = detail.segments.filter((s) => s.kind === 'travel').flatMap((s) => s.polyline);
  }
  const stops = numberedStops(detail.segments)
    .filter((s) => s.centerLat != null && s.centerLng != null)
    .map((s) => ({
      n: s.n,
      lat: s.centerLat as number,
      lng: s.centerLng as number,
      from: s.startedAt,
      to: s.endedAt,
      durationS: s.durationS,
      address: s.address,
      long: isLongBreak(s.durationS),
    }));
  const gaps = detail.segments
    .filter((s) => s.kind === 'gap' && s.startLat != null && s.startLng != null && s.endLat != null && s.endLng != null)
    .map((s) => ({
      from: [s.startLat as number, s.startLng as number] as LatLng,
      to: [s.endLat as number, s.endLng as number] as LatLng,
      cause: gapCauseLabel(s.cause),
      durationS: s.durationS,
      startedAt: s.startedAt,
    }));
  const events = detail.events
    .filter((e) => e.latitude != null && e.longitude != null)
    .map((e) => ({
      kind: e.kind,
      label: eventLabel(e.kind),
      lat: e.latitude as number,
      lng: e.longitude as number,
      at: e.startedAt,
      problem: isProblemEvent(e.kind),
      mock: e.kind.toUpperCase() === 'MOCK_LOCATION',
    }));
  const first = route[0] ?? null;
  const last = route.length ? route[route.length - 1] : null;
  const end: LatLng | null =
    last ?? (detail.track.lastLatitude != null && detail.track.lastLongitude != null ? [detail.track.lastLatitude, detail.track.lastLongitude] : null);
  const active = detail.track.status === 'active';
  return {
    route,
    stops,
    gaps,
    events,
    start: first,
    end,
    startedAt: detail.track.startedAt,
    endedAt: detail.track.endedAt ?? detail.track.lastPointAt,
    active,
  };
}
