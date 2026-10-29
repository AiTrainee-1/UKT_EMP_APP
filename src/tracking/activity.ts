// The journey as the employee reads it on the "On-Duty Journey" detail screen (pure, no React): the activity timeline in the
// order things happened ("Journey started" -> "Break taken" -> "Journey resumed" -> ... -> "On-duty completed"), the break
// summary, the summary tiles, and the colours. The HR portal reads a journey with the same words and the same colours
// (frontend/src/pages/hr/geo-tracking/mapIcons.ts): start / end green, a break amber (< 15 min) or purple (>= 15 min),
// travelling blue, a stretch with no location grey (dashed on the map), a fake location red.
//
// A "break" is one of the pipeline's `stop` segments (the phone stayed in one place for the server's stop time, 3 min by
// default). "Journey resumed" is the moment travel starts again after a break.
import {
  endReasonLabel,
  eventLabel,
  formatAgo,
  formatClock,
  formatDistance,
  formatDuration,
  formatSpeedKmh,
  gapCauseLabel,
  isProblemEvent,
} from './format.ts';
import { parseTime } from './geo.ts';
import { isLongBreak } from './journeyModel.ts';
import type { JourneyDetail, JourneyPunch, JourneySegment, LatLng } from './journeyModel.ts';

export type Tone = 'green' | 'amber' | 'purple' | 'blue' | 'grey' | 'red';

/** The one table of journey colours, shared with the map page (journeyHtml.ts) and the HR portal. */
export const TONE_COLOR: Record<Tone, string> = {
  green: '#16a34a',
  amber: '#d97706',
  purple: '#7c3aed',
  blue: '#006496',
  grey: '#6b7280',
  red: '#dc2626',
};

export const breakTone = (durationS: number): 'amber' | 'purple' => (isLongBreak(durationS) ? 'purple' : 'amber');

/** "11.1085, 77.3411": a place with no street name (reverse geocoding is off by default on the server). */
export function coordsText(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/** The street name when the server has one, else the coordinates. */
export function placeText(place: LatLng | null, address?: string | null): string {
  if (address && address.trim()) return address.trim();
  return place ? coordsText(place[0], place[1]) : '';
}

// ------------------------------------------------------------------------------------------------ breaks

export interface BreakSummary {
  count: number;
  totalS: number;
  longestS: number;
  /** Breaks of 15 min or more. */
  longCount: number;
}

/** Number and total length of the breaks. Counted from the stop segments (what the timeline and the map draw); the track's
 *  own totals only when there are no segments yet. */
export function breakSummary(detail: Pick<JourneyDetail, 'segments' | 'track'>): BreakSummary {
  const stops = detail.segments.filter((s) => s.kind === 'stop');
  if (stops.length === 0) {
    const t = detail.track;
    return { count: t.stopCount, totalS: t.stopS, longestS: t.longestStopS, longCount: isLongBreak(t.longestStopS) ? 1 : 0 };
  }
  return {
    count: stops.length,
    totalS: stops.reduce((n, s) => n + s.durationS, 0),
    longestS: stops.reduce((n, s) => Math.max(n, s.durationS), 0),
    longCount: stops.filter((s) => isLongBreak(s.durationS)).length,
  };
}

export interface Tile {
  key: string;
  label: string;
  value: string;
  hint: string | null;
  tone: Tone | 'neutral';
}

/** The summary tiles above the map: total time, travelling, break time, breaks, distance (and no-signal time when there was any). */
export function journeyTiles(detail: JourneyDetail): Tile[] {
  const t = detail.track;
  const b = breakSummary(detail);
  const tiles: Tile[] = [
    { key: 'duration', label: 'Total time', value: formatDuration(t.durationS), hint: null, tone: 'neutral' },
    { key: 'travel', label: 'Travelling', value: formatDuration(t.travelS), hint: null, tone: 'blue' },
    { key: 'breakTime', label: 'Break time', value: formatDuration(b.totalS), hint: null, tone: b.longCount > 0 ? 'purple' : 'amber' },
    {
      key: 'breaks',
      label: 'Breaks',
      value: String(b.count),
      hint: b.longCount > 0 ? `${b.longCount} of 15 min or more` : null,
      tone: b.longCount > 0 ? 'purple' : 'amber',
    },
    { key: 'distance', label: 'Distance', value: formatDistance(t.distanceM), hint: null, tone: 'neutral' },
  ];
  if (t.gapS >= 60) tiles.push({ key: 'gaps', label: 'No signal', value: formatDuration(t.gapS), hint: null, tone: 'grey' });
  return tiles;
}

// ------------------------------------------------------------------------------------------------ the activity timeline

export type ActivityKind = 'start' | 'break' | 'resume' | 'travel' | 'gap' | 'punch' | 'event' | 'complete' | 'live';

export interface ActivityRow {
  key: string;
  kind: ActivityKind;
  tone: Tone;
  /** Epoch ms the row is placed at. */
  at: number;
  title: string;
  /** "09:06 AM - 09:09 AM", or one time. */
  when: string;
  /** The line under the title. */
  summary: string;
  /** What the row shows when it is opened. */
  details: { label: string; value: string }[];
  /** Where it happened (the map can fly there). */
  place: LatLng | null;
  /** The pin number on the map, for a break. */
  stopNumber: number | null;
  chip: { label: string; tone: Tone } | null;
  /** A slim connector (travel, a gap, an event) rather than a milestone. */
  minor: boolean;
}

const PUNCH_CHIP: Record<JourneyPunch['status'], { label: string; tone: Tone }> = {
  approved: { label: 'Approved', tone: 'green' },
  pending: { label: 'Pending', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'red' },
};

export const punchChip = (status: JourneyPunch['status']) => PUNCH_CHIP[status] ?? PUNCH_CHIP.pending;

export const punchTypeLabel = (type: 'IN' | 'OUT'): string => (type === 'IN' ? 'Check-In' : 'Check-Out');

const range = (a: string | null, b: string | null): string => [formatClock(a), formatClock(b)].filter(Boolean).join(' - ');

function segmentPlace(seg: JourneySegment): LatLng | null {
  const pairs: [number | null, number | null][] =
    seg.kind === 'stop'
      ? [[seg.centerLat, seg.centerLng], [seg.startLat, seg.startLng]]
      : [[seg.startLat, seg.startLng], [seg.endLat, seg.endLng]];
  for (const [lat, lng] of pairs) if (lat != null && lng != null) return [lat, lng];
  return seg.polyline[0] ?? null;
}

const detailRow = (label: string, value: string | null | undefined) => (value ? [{ label, value }] : []);

type Draft = ActivityRow & { rank: number };

/**
 * Everything the employee did, in the order it happened. Break rows are numbered like the pins on the map. A phone-side event
 * (location switched off, no internet ...) that falls inside a "no location" stretch is shown inside that stretch, not twice;
 * a fake-location event is always its own red row. The geo-punches of the journey's session are rows at their own time.
 */
export function buildActivity(detail: JourneyDetail, now: number = Date.now()): ActivityRow[] {
  const track = detail.track;
  const drafts: Draft[] = [];
  let idx = 0;
  const add = (row: Omit<ActivityRow, 'key'>, rank: number) => drafts.push({ ...row, key: `${row.kind}-${idx++}`, rank });

  const segments = detail.segments;
  const firstSeg = segments[0];
  const startedAt = parseTime(track.startedAt) ?? parseTime(firstSeg?.startedAt) ?? 0;
  const startPlace: LatLng | null = detail.path[0] ?? (firstSeg ? segmentPlace(firstSeg) : null);

  add(
    {
      kind: 'start',
      tone: 'green',
      at: startedAt,
      title: 'Journey started',
      when: formatClock(startedAt),
      summary: track.destination || 'On-Duty',
      details: [
        ...detailRow('Started at', formatClock(startedAt)),
        ...detailRow('Destination', track.destination),
        ...detailRow('Place', placeText(startPlace)),
        ...detailRow('Recorded on', detail.device?.model || ''),
      ],
      place: startPlace,
      stopNumber: null,
      chip: null,
      minor: false,
    },
    0,
  );

  const gaps = segments.filter((s) => s.kind === 'gap');
  const inGap = (ms: number | null) =>
    ms != null &&
    gaps.some((g) => {
      const a = parseTime(g.startedAt);
      const b = parseTime(g.endedAt);
      return a != null && b != null && ms >= a - 60_000 && ms <= b + 60_000;
    });

  let stopNo = 0;
  let afterBreak = false;
  for (const seg of segments) {
    const at = parseTime(seg.startedAt) ?? 0;
    const place = segmentPlace(seg);
    if (seg.kind === 'stop') {
      stopNo += 1;
      const long = isLongBreak(seg.durationS);
      add(
        {
          kind: 'break',
          tone: breakTone(seg.durationS),
          at,
          title: 'Break taken',
          when: range(seg.startedAt, seg.endedAt),
          summary: [formatDuration(seg.durationS), placeText(place, seg.address)].filter(Boolean).join(' · '),
          details: [
            { label: 'Pin on the map', value: `Stop ${stopNo}` },
            { label: 'From', value: formatClock(seg.startedAt) },
            { label: 'To', value: formatClock(seg.endedAt) },
            { label: 'Time spent', value: formatDuration(seg.durationS) },
            ...detailRow('Place', placeText(place, seg.address)),
            { label: 'Break length', value: long ? '15 min or longer (purple pin)' : 'Under 15 min (amber pin)' },
            ...(seg.radiusM != null ? [{ label: 'Stayed within', value: `${Math.round(seg.radiusM)} m` }] : []),
            ...(seg.estimated ? [{ label: 'Note', value: 'Estimated from limited location data' }] : []),
          ],
          place,
          stopNumber: stopNo,
          chip: long ? { label: 'Long break', tone: 'purple' } : null,
          minor: false,
        },
        1,
      );
      afterBreak = true;
    } else if (seg.kind === 'travel') {
      const leg = [formatDistance(seg.distanceM), formatDuration(seg.durationS)].join(' · ');
      const details = [
        { label: 'From', value: formatClock(seg.startedAt) },
        { label: 'To', value: formatClock(seg.endedAt) },
        { label: 'Travelled', value: formatDistance(seg.distanceM) },
        { label: 'Time', value: formatDuration(seg.durationS) },
        ...(seg.avgSpeedKmh != null ? [{ label: 'Average speed', value: formatSpeedKmh(seg.avgSpeedKmh) }] : []),
        ...(seg.maxSpeedKmh != null ? [{ label: 'Top speed', value: formatSpeedKmh(seg.maxSpeedKmh) }] : []),
      ];
      if (afterBreak) {
        afterBreak = false;
        add(
          {
            kind: 'resume',
            tone: 'blue',
            at,
            title: 'Journey resumed',
            when: formatClock(seg.startedAt),
            summary: `Travelled ${leg}`,
            details,
            place,
            stopNumber: null,
            chip: null,
            minor: false,
          },
          1,
        );
      } else {
        add(
          {
            kind: 'travel',
            tone: 'blue',
            at,
            title: 'Travelling',
            when: range(seg.startedAt, seg.endedAt),
            summary: leg,
            details,
            place,
            stopNumber: null,
            chip: null,
            minor: true,
          },
          1,
        );
      }
    } else {
      const a = parseTime(seg.startedAt);
      const b = parseTime(seg.endedAt);
      const phoneSaid = detail.events
        .filter((e) => {
          const ms = parseTime(e.startedAt);
          return !!ms && a != null && b != null && ms >= a - 60_000 && ms <= b + 60_000 && isProblemEvent(e.kind);
        })
        .map((e) => ({ label: eventLabel(e.kind), value: range(e.startedAt, e.endedAt) || formatClock(e.startedAt) }));
      add(
        {
          kind: 'gap',
          tone: 'grey',
          at,
          title: 'No location',
          when: range(seg.startedAt, seg.endedAt),
          summary: [formatDuration(seg.durationS), gapCauseLabel(seg.cause)].join(' · '),
          details: [
            { label: 'Why', value: gapCauseLabel(seg.cause) },
            { label: 'From', value: formatClock(seg.startedAt) },
            { label: 'To', value: formatClock(seg.endedAt) },
            { label: 'Time', value: formatDuration(seg.durationS) },
            ...phoneSaid,
          ],
          place,
          stopNumber: null,
          chip: null,
          minor: true,
        },
        1,
      );
    }
  }

  for (const e of detail.events) {
    const kind = e.kind.toUpperCase();
    if (kind === 'TRACKING_STARTED' || kind === 'TRACKING_STOPPED') continue; // the start and the end rows say it
    const ms = parseTime(e.startedAt) ?? 0;
    const mock = kind === 'MOCK_LOCATION';
    if (!mock && (!isProblemEvent(kind) || inGap(ms))) continue;
    const place: LatLng | null = e.latitude != null && e.longitude != null ? [e.latitude, e.longitude] : null;
    add(
      {
        kind: 'event',
        tone: mock ? 'red' : 'grey',
        at: ms,
        title: eventLabel(kind),
        when: range(e.startedAt, e.endedAt) || formatClock(e.startedAt),
        summary: mock ? 'A simulated location was reported' : '',
        details: [...detailRow('Time', range(e.startedAt, e.endedAt) || formatClock(e.startedAt)), ...detailRow('Place', placeText(place))],
        place,
        stopNumber: null,
        chip: null,
        minor: true,
      },
      2,
    );
  }

  for (const p of detail.punches) {
    const at = p.at ?? 0;
    const place: LatLng | null = p.latitude != null && p.longitude != null ? [p.latitude, p.longitude] : null;
    const photos = (p.hasPhoto ? 1 : 0) + (p.hasPhoto2 ? 1 : 0);
    add(
      {
        kind: 'punch',
        tone: p.isMocked ? 'red' : p.status === 'rejected' ? 'red' : p.status === 'approved' ? 'green' : 'amber',
        at,
        title: `Geo-punch ${p.punchNumber} recorded`,
        when: formatClock(at),
        summary: punchTypeLabel(p.punchType), // the chip says Approved / Pending / Rejected
        details: [
          { label: 'Punch', value: `${p.punchNumber} of 4 · ${punchTypeLabel(p.punchType)}` },
          { label: 'Time', value: formatClock(at) },
          { label: 'Status', value: PUNCH_CHIP[p.status].label },
          ...detailRow('Place', placeText(place)),
          ...(p.accuracyM != null ? [{ label: 'Accuracy', value: `${Math.round(p.accuracyM)} m` }] : []),
          ...(photos ? [{ label: 'Photos', value: String(photos) }] : []),
          ...(p.isMocked ? [{ label: 'Warning', value: 'A simulated location was reported' }] : []),
          ...detailRow('HR note', p.reviewComment),
        ],
        place,
        stopNumber: null,
        chip: PUNCH_CHIP[p.status],
        minor: false,
      },
      2,
    );
  }

  const endedAt = parseTime(track.endedAt);
  const last = detail.path.length ? detail.path[detail.path.length - 1] : null;
  const endPlace: LatLng | null = last ?? (track.lastLatitude != null && track.lastLongitude != null ? [track.lastLatitude, track.lastLongitude] : null);
  if (track.status === 'ended') {
    const b = breakSummary(detail);
    const rejected = track.endReason === 'rejected';
    add(
      {
        kind: 'complete',
        tone: rejected ? 'grey' : 'green',
        at: endedAt ?? parseTime(track.lastPointAt) ?? startedAt,
        title: rejected ? 'On-duty ended' : 'On-duty completed',
        when: formatClock(endedAt),
        summary: endReasonLabel(track.endReason),
        details: [
          ...detailRow('Ended at', formatClock(endedAt)),
          ...detailRow('Why it ended', endReasonLabel(track.endReason)),
          { label: 'Total time', value: formatDuration(track.durationS) },
          { label: 'Distance', value: formatDistance(track.distanceM) },
          { label: 'Breaks', value: b.count ? `${b.count} · ${formatDuration(b.totalS)}` : 'None' },
          ...detailRow('Last place', placeText(endPlace)),
        ],
        place: endPlace,
        stopNumber: null,
        chip: null,
        minor: false,
      },
      9,
    );
  } else {
    const lastAt = parseTime(track.lastPointAt);
    add(
      {
        kind: 'live',
        tone: 'blue',
        at: now,
        title: 'On-duty in progress',
        when: 'Now',
        summary: lastAt ? `Last position ${formatAgo(lastAt, now)}` : 'Waiting for the first location',
        details: [
          ...(lastAt ? [{ label: 'Last position', value: `${formatClock(lastAt)} (${formatAgo(lastAt, now)})` }] : []),
          ...detailRow('Place', placeText(endPlace)),
        ],
        place: endPlace,
        stopNumber: null,
        chip: null,
        minor: false,
      },
      9,
    );
  }

  // The start always opens the list and the end always closes it; everything else is by time (a stable tie-break by kind).
  const order = (d: Draft) => (d.kind === 'start' ? -1 : d.kind === 'complete' || d.kind === 'live' ? 1 : 0);
  drafts.sort((a, b) => order(a) - order(b) || a.at - b.at || a.rank - b.rank);
  return drafts.map(({ rank: _rank, ...row }) => row);
}
