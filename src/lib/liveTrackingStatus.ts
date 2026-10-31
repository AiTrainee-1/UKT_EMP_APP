// The Live Tracking screen as pure functions: "is my location being monitored right now?", "is it being shared right now?",
// the phone checks that keep tracking working, and the plain-language rules of WHEN tracking runs. Read-only by design: the
// owner's rule is that an employee can see the status but can never stop location sharing from this screen. Nothing here
// starts or stops anything; the lifecycle stays where it is (src/tracking/controller.ts, app/_layout.tsx).
//
// Two systems can watch an employee's location, and this screen reports both:
//
//   On-Duty route   src/tracking/*. The SERVER decides: a track starts when the On-Duty request is submitted (before any
//                   approval) and ends only on Done / the 4th On-Duty punch / a rejection / the day-end job (23:50 IST unless
//                   HR set another time). Background service, keeps running with the screen off. Points are queued in SQLite
//                   and uploaded later when offline.
//   Live sharing    the older 45 s foreground ping (useGeoAttendance.ts startLiveTracking) for employees HR flagged
//                   `locationTrackingEnabled` (drivers, field staff), and for On-Duty on an older server without /tracking.
//                   Runs only while the app is open; a ping that fails is not kept.
import { formatAgo, formatClock, formatDateTime } from '../tracking/format.ts';
import { parseTime } from '../tracking/geo.ts';
import type { NetworkKind, PermissionLevel, TrackingMode } from '../tracking/types.ts';

export type StatusPlatform = 'android' | 'ios' | 'web';
export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

/** The legacy ping loop's interval (useGeoAttendance.ts PING_INTERVAL_MS). */
export const LIVE_SHARING_INTERVAL_S = 45;
/** No new On-Duty location for this long, while the service says it is running, is "quiet". The still heartbeat is 60 s. */
export const QUIET_AFTER_MS = 5 * 60_000;
/** The day-end close when HR has not changed it (GeoTrackingSettings.day_end_time). */
export const DEFAULT_DAY_END = '11:50 PM';

export const READ_ONLY_NOTE =
  'This page only shows the status. Tracking starts and stops by itself, as explained below. It cannot be switched off here.';

// ------------------------------------------------------------------------------------------------------------- input

export interface ServerTrackingInput {
  /** false = a server without /tracking (the older ping loop then covers On-Duty). */
  supported: boolean;
  /** HR's master switch for On-Duty route tracking. */
  enabled: boolean;
  /** A track is active for this employee right now. */
  active: boolean;
  consentRequired: boolean;
  track: {
    id: number;
    sessionId: number | null;
    startedAt: string | null;
    endsAt: string | null;
    /** moving / stationary / offline / location_off / waiting_first_fix, as the server sees it. */
    state: string | null;
  } | null;
}

export interface PhoneInput {
  engineRunning: boolean;
  engineMode: TrackingMode | null;
  queuedPoints: number;
  queuedEvents: number;
  droppedPoints: number;
  lastPointAt: number | null;
  lastUploadAt: number | null;
  uploadError: string | null;
  permission: PermissionLevel;
  locationEnabled: boolean | null;
  batteryOptimised: boolean | null;
  powerSave: boolean | null;
  batteryPct: number | null;
  network: NetworkKind;
  notificationsGranted: boolean | null;
}

export type SessionStatus = 'pending_hod' | 'pending_hr' | 'active' | 'completed' | 'rejected';

export interface SessionInput {
  id: number;
  destination: string;
  /** As the app presents it: a submitted-but-unapproved session reads "active". */
  status: SessionStatus;
  /** The real HRMS state, for display only. */
  approvalStatus: SessionStatus;
  startedAt: string | null;
  completedAt: string | null;
  completionReason: 'manual' | 'auto_4th_punch' | 'auto_day_end' | null;
}

export interface HrSharingInput {
  /** HR's per-employee "live location" flag; null while the profile has not loaded. */
  enabledByHr: boolean | null;
  /** The 45 s ping loop is running in this app. */
  loopRunning: boolean;
  lastPingAt: number | null;
  /** null = no ping attempted since this screen opened. */
  lastPingOk: boolean | null;
}

export interface LiveStatusInput {
  now: number;
  platform: StatusPlatform;
  /** GET /tracking/state; null = not known (still loading, or the server could not be reached). */
  server: ServerTrackingInput | null;
  /** What the phone itself reads (runtime snapshot); null until the first read, and always in a browser. */
  phone: PhoneInput | null;
  /** Today's On-Duty session (GET /attendance/geo-punch/status). */
  session: SessionInput | null;
  hr: HrSharingInput;
  /** A first load is still running (server state or profile). */
  pending: boolean;
}

// ------------------------------------------------------------------------------------------------------------ sources

/** Why the location is being watched: the On-Duty route, HR's live sharing, or On-Duty on an older server (ping loop). */
export type MonitorSource = 'on_duty' | 'on_duty_legacy' | 'hr_sharing';

export function monitorSources(i: LiveStatusInput): MonitorSource[] {
  const out: MonitorSource[] = [];
  const s = i.server;
  if (s && s.supported && s.enabled && s.active) out.push('on_duty');
  // The server could not be asked but the phone is still recording a track: being offline never stops it.
  else if (!s && i.phone?.engineRunning) out.push('on_duty');
  if (s && !s.supported && i.session?.status === 'active') out.push('on_duty_legacy');
  if (i.hr.enabledByHr) out.push('hr_sharing');
  return out;
}

// -------------------------------------------------------------------------------------------------------- monitored?

export interface MonitorAnswer {
  state: 'yes' | 'no' | 'checking';
  title: string;
  detail: string;
  sources: MonitorSource[];
}

const SOURCE_LABEL: Record<MonitorSource, string> = {
  on_duty: 'On-Duty route',
  on_duty_legacy: 'On-Duty location',
  hr_sharing: 'Live sharing (set by HR)',
};

export const sourceLabel = (s: MonitorSource): string => SOURCE_LABEL[s];

/** "ends automatically at 11:50 PM" from the track's endsAt, or the default day-end. */
export function dayEndText(endsAt: string | null | undefined): string {
  const t = formatClock(endsAt ?? null);
  return t ? `automatically at ${t}` : `automatically at the end of the day (${DEFAULT_DAY_END} unless HR set another time)`;
}

export function monitorAnswer(i: LiveStatusInput): MonitorAnswer {
  const sources = monitorSources(i);
  if (sources.length === 0 && i.pending) {
    return { state: 'checking', title: 'Checking...', detail: 'Asking the office whether your location should be tracked.', sources };
  }
  if (sources.length === 0) {
    const s = i.server;
    let detail = 'You have no active On-Duty right now, so nothing is recorded.';
    if (i.session?.status === 'active' && s && s.supported && !s.enabled) {
      detail = 'HR has switched On-Duty route tracking off, so your route is not recorded.';
    } else if (i.session?.status === 'completed') {
      detail = "Today's On-Duty has ended, so recording has stopped.";
    } else if (i.session?.status === 'rejected') {
      detail = "Today's On-Duty request was rejected, so recording has stopped.";
    }
    if (!s && !i.pending) detail += ' (The office could not be reached; this is what the phone knows.)';
    return { state: 'no', title: 'No, your location is not being monitored', detail, sources };
  }

  const parts: string[] = [];
  if (sources.includes('on_duty')) {
    const started = formatDateTime(i.server?.track?.startedAt ?? null);
    parts.push(
      `Your On-Duty route is being recorded${started ? ` since ${started}` : ''}. It ends when you mark the duty Done, after your 4th On-Duty punch, if the request is rejected, or ${dayEndText(i.server?.track?.endsAt)}.`,
    );
  }
  if (sources.includes('on_duty_legacy')) {
    parts.push('You are On-Duty, so your location is sent to the office while the app is open.');
  }
  if (sources.includes('hr_sharing')) {
    parts.push(`HR has turned on live location sharing for your account: your position is sent every ${LIVE_SHARING_INTERVAL_S} seconds while the app is open.`);
  }
  return { state: 'yes', title: 'Yes, your location is being monitored', detail: parts.join(' '), sources };
}

// ----------------------------------------------------------------------------------------------------------- shared?

export type ShareState = 'live' | 'saved' | 'quiet' | 'retrying' | 'blocked' | 'finishing' | 'off' | 'checking' | 'unknown';

export type BlockerId = 'consent' | 'permission' | 'gps' | 'engine' | 'sharing_not_started';

export interface ChannelStatus {
  source: MonitorSource;
  label: string;
  state: ShareState;
  tone: Tone;
  text: string;
  blocker: BlockerId | null;
}

export interface ShareAnswer {
  state: ShareState;
  tone: Tone;
  title: string;
  detail: string;
  /** Show the calm "live" pulse (location is leaving the phone, or being recorded for later). */
  pulse: boolean;
  channels: ChannelStatus[];
  blockers: BlockerId[];
}

const RANK: Record<ShareState, number> = {
  live: 8,
  saved: 7,
  quiet: 6,
  retrying: 6,
  finishing: 5,
  blocked: 4,
  checking: 3,
  unknown: 2,
  off: 1,
};

const TONE_OF: Record<ShareState, Tone> = {
  live: 'good',
  saved: 'warn',
  quiet: 'warn',
  retrying: 'warn',
  finishing: 'neutral',
  blocked: 'bad',
  checking: 'neutral',
  unknown: 'neutral',
  off: 'neutral',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function onDutyChannel(i: LiveStatusInput): ChannelStatus {
  const base = { source: 'on_duty' as const, label: SOURCE_LABEL.on_duty };
  const mk = (state: ShareState, text: string, blocker: BlockerId | null = null): ChannelStatus => ({ ...base, state, tone: TONE_OF[state], text, blocker });
  if (i.platform === 'web') return mk('unknown', 'Only the phone app can show this.');
  const p = i.phone;
  if (i.server?.consentRequired) return mk('blocked', 'Not recording: you have not accepted the tracking notice yet.', 'consent');
  if (!p) return mk('checking', 'Reading the phone...');
  if (p.permission === 'denied') return mk('blocked', 'Not recording: location permission is off for UKTextiles.', 'permission');
  if (p.locationEnabled === false) return mk('blocked', "Not recording: your phone's location (GPS) is switched off.", 'gps');
  if (!p.engineRunning) {
    return mk('blocked', 'Not recording on this phone right now. Keep the app open for a moment: it restarts by itself.', 'engine');
  }
  const waiting = p.queuedPoints > 0 ? ` ${plural(p.queuedPoints, 'location is', 'locations are')} saved on the phone.` : '';
  if (p.network === 'none') {
    return mk('saved', `Recording, but you are offline. Your route is saved on the phone and sent when you are back online.${waiting}`);
  }
  if (p.lastPointAt != null && i.now - p.lastPointAt > QUIET_AFTER_MS) {
    return mk('quiet', `Running, but no new location for ${formatAgo(p.lastPointAt, i.now).replace(' ago', '')}. Opening the app helps it restart.`);
  }
  if (p.lastPointAt == null) return mk('live', 'Recording. Waiting for the first location.');
  return mk('live', `Recording and sending. Last location ${formatAgo(p.lastPointAt, i.now)}, last sent ${formatAgo(p.lastUploadAt, i.now)}.`);
}

function pingChannel(i: LiveStatusInput, source: 'hr_sharing' | 'on_duty_legacy'): ChannelStatus {
  const base = { source, label: SOURCE_LABEL[source] };
  const mk = (state: ShareState, text: string, blocker: BlockerId | null = null): ChannelStatus => ({ ...base, state, tone: TONE_OF[state], text, blocker });
  if (i.platform === 'web') return mk('unknown', 'Only the phone app can show this.');
  const p = i.phone;
  if (p?.permission === 'denied') return mk('blocked', 'Not sending: location permission is off for UKTextiles.', 'permission');
  if (p?.locationEnabled === false) return mk('blocked', "Not sending: your phone's location (GPS) is switched off.", 'gps');
  if (!i.hr.loopRunning) {
    return mk('blocked', 'Not sending yet. Tap "Start live sharing" below once; after that it starts by itself whenever the app is open.', 'sharing_not_started');
  }
  if (i.hr.lastPingOk === false) {
    return mk('retrying', `The last update did not reach the office. It tries again every ${LIVE_SHARING_INTERVAL_S} seconds.`);
  }
  const last = i.hr.lastPingAt != null ? ` Last sent ${formatAgo(i.hr.lastPingAt, i.now)}.` : '';
  return mk('live', `Sent every ${LIVE_SHARING_INTERVAL_S} seconds while the app is open.${last}`);
}

export function shareAnswer(i: LiveStatusInput, monitor: MonitorAnswer = monitorAnswer(i)): ShareAnswer {
  const channels: ChannelStatus[] = monitor.sources.map((s) => (s === 'on_duty' ? onDutyChannel(i) : pingChannel(i, s)));
  const blockers = channels.map((c) => c.blocker).filter((b): b is BlockerId => b != null);

  if (monitor.state === 'checking') {
    return { state: 'checking', tone: 'neutral', title: 'Checking...', detail: 'Reading the phone and the office.', pulse: false, channels, blockers };
  }
  if (channels.length === 0) {
    const p = i.phone;
    if (p?.engineRunning) {
      return {
        state: 'finishing',
        tone: 'neutral',
        title: 'Finishing up',
        detail: 'Your On-Duty has ended. The phone is sending its last saved locations and then stops recording by itself.',
        pulse: false,
        channels,
        blockers,
      };
    }
    const left = p && p.queuedPoints > 0
      ? ` ${plural(p.queuedPoints, 'location', 'locations')} from your last On-Duty ${p.queuedPoints === 1 ? 'is' : 'are'} still waiting to be sent.`
      : '';
    return {
      state: 'off',
      tone: 'neutral',
      title: 'No, your location is not being shared',
      detail: `Nothing is being sent from your phone.${left}`,
      pulse: false,
      channels,
      blockers,
    };
  }

  const best = channels.reduce((a, b) => (RANK[b.state] > RANK[a.state] ? b : a));
  const TITLE: Record<ShareState, string> = {
    live: 'Yes, your location is being shared',
    saved: 'Recording, saved on your phone',
    quiet: 'Sharing, but no recent update',
    retrying: 'Sharing, but the last update failed',
    blocked: "Your location should be shared, but it can't be right now",
    finishing: 'Finishing up',
    checking: 'Checking...',
    unknown: 'Open the UKTextiles phone app to see this',
    off: 'No, your location is not being shared',
  };
  let detail = best.text;
  // Something else is wrong on another channel (e.g. the route is blocked while live sharing works): say so.
  const otherProblem = channels.find((c) => c !== best && c.state === 'blocked');
  if (otherProblem && best.state !== 'blocked') detail += ` ${otherProblem.label}: ${otherProblem.text}`;
  return {
    state: best.state,
    tone: best.tone,
    title: TITLE[best.state],
    detail,
    pulse: best.state === 'live' || best.state === 'saved',
    channels,
    blockers,
  };
}

/** The short answer on the "Shared right now?" tile. */
export const SHARE_CHIP: Record<ShareState, string> = {
  live: 'Yes, live',
  saved: 'Saved on phone',
  quiet: 'No recent update',
  retrying: 'Retrying',
  blocked: 'Not sharing',
  finishing: 'Finishing',
  off: 'No',
  checking: 'Checking',
  unknown: 'Phone app only',
};

/** The short answer on the "Monitored right now?" tile. */
export const MONITOR_CHIP: Record<MonitorAnswer['state'], string> = { yes: 'Yes', no: 'No', checking: 'Checking' };

// ------------------------------------------------------------------------------------------------------ phone checks

/** What a fix button does. Every one of them HELPS tracking work; none stops it. */
export type FixAction = 'consent' | 'allow_location' | 'allow_always' | 'location_settings' | 'battery' | 'notifications';

export interface CheckRow {
  id: 'consent' | 'permission' | 'gps' | 'battery_opt' | 'battery_saver' | 'internet' | 'notifications';
  label: string;
  value: string;
  tone: Tone;
  hint: string | null;
  fix: FixAction | null;
  fixLabel: string | null;
}

const PERMISSION_TEXT: Record<PermissionLevel, string> = {
  always: 'Allowed all the time',
  while_using: 'Only while the app is open',
  denied: 'Not allowed',
  unknown: 'Unknown',
};

const NETWORK_TEXT: Record<NetworkKind, string> = { wifi: 'Wi-Fi', cell: 'Mobile data', none: 'Offline', unknown: 'Unknown' };

/**
 * The phone's state that decides whether tracking CAN work. A problem is red ('bad') only while something should be
 * recording; on a day without On-Duty it is amber, worded as "needed on On-Duty days". Empty in a browser.
 */
export function phoneChecks(i: LiveStatusInput, monitor: MonitorAnswer = monitorAnswer(i)): CheckRow[] {
  if (i.platform === 'web' || !i.phone) return [];
  const p = i.phone;
  const live = monitor.state === 'yes';
  const bad: Tone = live ? 'bad' : 'warn';
  const rows: CheckRow[] = [];

  if (i.server?.supported) {
    rows.push(
      i.server.consentRequired
        ? {
            id: 'consent',
            label: 'Tracking notice',
            value: 'Not accepted yet',
            tone: monitor.sources.includes('on_duty') ? 'bad' : 'warn',
            hint: 'Your On-Duty route cannot be recorded until you accept it.',
            fix: 'consent',
            fixLabel: 'Review notice',
          }
        : { id: 'consent', label: 'Tracking notice', value: 'Accepted', tone: 'good', hint: null, fix: null, fixLabel: null },
    );
  }

  rows.push({
    id: 'permission',
    label: 'Location permission',
    value: PERMISSION_TEXT[p.permission],
    tone: p.permission === 'always' ? 'good' : p.permission === 'while_using' ? 'warn' : p.permission === 'denied' ? bad : 'neutral',
    hint:
      p.permission === 'while_using'
        ? 'Choose "Allow all the time" so your On-Duty route keeps recording with the screen off.'
        : p.permission === 'denied'
          ? live
            ? 'Your location cannot be recorded without it.'
            : 'Needed on On-Duty days.'
          : null,
    fix: p.permission === 'denied' ? 'allow_location' : p.permission === 'while_using' ? 'allow_always' : null,
    fixLabel: p.permission === 'denied' ? 'Allow location' : p.permission === 'while_using' ? 'Allow all the time' : null,
  });

  rows.push({
    id: 'gps',
    label: 'Phone location (GPS)',
    value: p.locationEnabled == null ? 'Unknown' : p.locationEnabled ? 'On' : 'Off',
    tone: p.locationEnabled === false ? bad : p.locationEnabled ? 'good' : 'neutral',
    hint: p.locationEnabled === false ? (live ? 'Nothing is recorded while it is off, and HR sees the gap.' : 'Needed on On-Duty days.') : null,
    fix: p.locationEnabled === false ? 'location_settings' : null,
    fixLabel: p.locationEnabled === false ? 'Turn on' : null,
  });

  if (i.platform === 'android') {
    rows.push({
      id: 'battery_opt',
      label: 'Battery optimisation',
      value: p.batteryOptimised == null ? 'Unknown' : p.batteryOptimised ? 'On (may stop the app)' : 'Unrestricted',
      tone: p.batteryOptimised ? 'warn' : p.batteryOptimised === false ? 'good' : 'neutral',
      hint: p.batteryOptimised ? 'Let UKTextiles run in the background so the phone does not shut tracking down.' : null,
      fix: p.batteryOptimised ? 'battery' : null,
      fixLabel: p.batteryOptimised ? 'Fix' : null,
    });
  }

  const pct = p.batteryPct != null ? ` · battery ${p.batteryPct}%` : '';
  rows.push({
    id: 'battery_saver',
    label: 'Battery saver',
    value: p.powerSave == null ? `Unknown${pct}` : `${p.powerSave ? 'On' : 'Off'}${pct}`,
    tone: p.powerSave ? 'warn' : p.powerSave === false ? 'good' : 'neutral',
    hint: p.powerSave ? 'Battery saver can delay location updates. Switch it off while you are on duty.' : null,
    fix: null,
    fixLabel: null,
  });

  rows.push({
    id: 'internet',
    label: 'Internet',
    value: NETWORK_TEXT[p.network],
    tone: p.network === 'none' ? 'warn' : p.network === 'unknown' ? 'neutral' : 'good',
    hint: p.network === 'none' ? 'Your On-Duty route is still recorded and saved on the phone. It is sent when you are back online.' : null,
    fix: null,
    fixLabel: null,
  });

  rows.push({
    id: 'notifications',
    label: 'Notifications',
    value: p.notificationsGranted == null ? 'Unknown' : p.notificationsGranted ? 'Allowed' : 'Off',
    tone: p.notificationsGranted === false ? 'warn' : p.notificationsGranted ? 'good' : 'neutral',
    hint: p.notificationsGranted === false ? 'The "On-duty tracking is on" notice is hidden. Tracking still runs.' : null,
    fix: p.notificationsGranted === false ? 'notifications' : null,
    fixLabel: p.notificationsGranted === false ? 'Allow' : null,
  });

  return rows;
}

// --------------------------------------------------------------------------------------------------------- the numbers

export interface StatTile {
  id: 'last_location' | 'last_sent' | 'waiting' | 'last_ping';
  label: string;
  value: string;
  hint: string | null;
}

export function statTiles(i: LiveStatusInput, monitor: MonitorAnswer = monitorAnswer(i)): StatTile[] {
  if (i.platform === 'web') return [];
  const p = i.phone;
  const pingOk = i.hr.lastPingOk !== false ? i.hr.lastPingAt : null;
  const sent = [p?.lastUploadAt ?? null, pingOk].filter((x): x is number => x != null);
  const lastSent = sent.length ? Math.max(...sent) : null;
  const tiles: StatTile[] = [
    {
      id: 'last_location',
      label: 'Last location recorded',
      value: p ? formatAgo(p.lastPointAt, i.now) : '...',
      hint: p?.lastPointAt ? formatDateTime(p.lastPointAt) : null,
    },
    {
      id: 'last_sent',
      label: 'Last sent to the office',
      value: p || i.hr.lastPingAt ? formatAgo(lastSent, i.now) : '...',
      hint: p?.uploadError ? `Last upload problem: ${p.uploadError.replace(/_/g, ' ')}` : lastSent ? formatDateTime(lastSent) : null,
    },
    {
      id: 'waiting',
      label: 'Waiting on the phone',
      value: p ? plural(p.queuedPoints, 'location', 'locations') : '...',
      hint: p
        ? p.droppedPoints > 0
          ? `${p.droppedPoints} oldest dropped (offline too long)`
          : p.queuedEvents > 0
            ? plural(p.queuedEvents, 'status note', 'status notes')
            : p.queuedPoints > 0
              ? 'Sent automatically'
              : 'Nothing waiting'
        : null,
    },
  ];
  if (monitor.sources.includes('hr_sharing') || monitor.sources.includes('on_duty_legacy')) {
    tiles.push({
      id: 'last_ping',
      label: 'Live sharing update',
      value: i.hr.lastPingAt != null ? formatAgo(i.hr.lastPingAt, i.now) : i.hr.loopRunning ? 'Starting' : 'Not running',
      hint: i.hr.lastPingOk === false ? 'Last attempt failed, retrying' : `Every ${LIVE_SHARING_INTERVAL_S} s while the app is open`,
    });
  }
  return tiles;
}

// ---------------------------------------------------------------------------------------------------- On-Duty session

export interface SessionCard {
  destination: string;
  /** Where the request is: "Waiting for your department head" ... "Completed". */
  approvalText: string;
  approvalTone: Tone;
  startedText: string | null;
  /** "Ends automatically at 11:50 PM ..." while active; how it ended otherwise. */
  endText: string;
  /** What the server sees right now (Moving / Still / Offline ...), null when not recording. */
  liveText: string | null;
  liveTone: Tone;
  open: boolean;
}

const APPROVAL: Record<SessionStatus, { text: string; tone: Tone }> = {
  pending_hod: { text: 'Waiting for your department head', tone: 'warn' },
  pending_hr: { text: 'Waiting for HR approval', tone: 'warn' },
  active: { text: 'Approved', tone: 'good' },
  completed: { text: 'Completed', tone: 'neutral' },
  rejected: { text: 'Rejected', tone: 'bad' },
};

const ENDED: Record<string, string> = {
  manual: 'Ended: you marked it Done. Recording stopped.',
  auto_4th_punch: 'Ended: all 4 On-Duty punches were recorded. Recording stopped.',
  auto_day_end: 'Ended automatically at the end of the day. Recording stopped.',
};

const LIVE: Record<string, { text: string; tone: Tone }> = {
  moving: { text: 'Moving', tone: 'good' },
  stationary: { text: 'Staying in one place', tone: 'neutral' },
  offline: { text: 'No location reaching the office', tone: 'warn' },
  location_off: { text: 'Location switched off', tone: 'bad' },
  waiting_first_fix: { text: 'Waiting for the first location', tone: 'neutral' },
};

export function sessionCard(i: LiveStatusInput): SessionCard | null {
  const s = i.session;
  if (!s) return null;
  const open = s.status === 'active';
  const approval = APPROVAL[s.approvalStatus] ?? APPROVAL[s.status];
  const startedMs = parseTime(s.startedAt);
  let endText: string;
  if (open) {
    endText = `Recording ends when you mark it Done, after your 4th On-Duty punch, if it is rejected, or ${dayEndText(i.server?.track?.endsAt)}.`;
  } else if (s.status === 'rejected') {
    endText = 'Ended: the request was rejected. Recording stopped.';
  } else {
    endText = ENDED[s.completionReason ?? ''] ?? 'Ended. Recording stopped.';
  }
  const live = open && i.server?.active && i.server.track?.state ? LIVE[i.server.track.state] ?? null : null;
  return {
    destination: s.destination || 'On-Duty',
    approvalText: approval.text,
    approvalTone: approval.tone,
    startedText: startedMs != null ? `Started ${formatDateTime(startedMs)}` : null,
    endText,
    liveText: live?.text ?? null,
    liveTone: live?.tone ?? 'neutral',
    open,
  };
}

// ------------------------------------------------------------------------------------------------------------ the rules

export interface RuleSection {
  id: 'active' | 'not_active' | 'offline' | 'hr_sees';
  title: string;
  icon: string;
  items: string[];
}

/** WHEN tracking runs and when it does not, in plain words, from the rules in src/tracking/controller.ts and the server. */
export function trackingRules(i: Pick<LiveStatusInput, 'server' | 'hr'>): RuleSection[] {
  const hrOn = i.hr.enabledByHr === true;
  const ends = dayEndText(i.server?.track?.endsAt);
  return [
    {
      id: 'active',
      title: 'When your location IS tracked',
      icon: 'map-marker-radius-outline',
      items: [
        'From the moment you submit an On-Duty request, even before it is approved.',
        `Until that On-Duty ends: when you mark it Done, when your 4th On-Duty punch is recorded, when the request is rejected, or ${ends}.`,
        'While it runs, it keeps working with the screen off or the app closed from Recent apps. The notice "On-duty tracking is on" stays in your notification bar the whole time.',
        hrOn
          ? `HR has turned on live location sharing for your account: your position is also sent every ${LIVE_SHARING_INTERVAL_S} seconds while the UKTextiles app is open.`
          : `Live location sharing, only if HR turns it on for your account (for example drivers): your position is then sent every ${LIVE_SHARING_INTERVAL_S} seconds while the app is open.`,
      ],
    },
    {
      id: 'not_active',
      title: 'When it is NOT tracked',
      icon: 'map-marker-off-outline',
      items: [
        'On days without an On-Duty request. Nothing is recorded, even if location is set to "Allow all the time".',
        'After your On-Duty has ended (Done, 4th punch, rejected or the end of the day).',
        'An office geo punch reads your location once, at the moment you punch. It does not track you.',
        hrOn ? 'Live location sharing does not run while the app is closed.' : 'Live location sharing is off for your account.',
      ],
    },
    {
      id: 'offline',
      title: 'No internet?',
      icon: 'wifi-off',
      items: [
        'Your On-Duty route keeps being recorded and is saved on your phone.',
        'It is sent automatically as soon as you are back online, so nothing is lost.',
        ...(hrOn ? ['Live sharing updates are not saved while offline. The next one is sent when the connection is back.'] : []),
      ],
    },
    {
      id: 'hr_sees',
      title: 'What HR sees',
      icon: 'eye-outline',
      items: [
        'Your On-Duty route on a map: where you started and finished, every stop longer than about 3 minutes (where and for how long), travel time and distance.',
        'Your On-Duty punches with their photos and places.',
        'Any gap in the route and its reason: location switched off, no internet, permission removed, battery saver, the phone closing the app, or a fake-location app.',
        ...(hrOn ? ["Your latest position on HR's live map (kept for 3 days)."] : []),
      ],
    },
  ];
}

// ------------------------------------------------------------------------------------------------------------ all of it

export interface LiveStatusView {
  monitor: MonitorAnswer;
  share: ShareAnswer;
  checks: CheckRow[];
  stats: StatTile[];
  session: SessionCard | null;
  rules: RuleSection[];
  /** The checks that need attention (a fix exists, or the tone is bad), for the "fix this" emphasis. */
  needsAttention: number;
}

export function buildLiveStatus(i: LiveStatusInput): LiveStatusView {
  const monitor = monitorAnswer(i);
  const share = shareAnswer(i, monitor);
  const checks = phoneChecks(i, monitor);
  return {
    monitor,
    share,
    checks,
    stats: statTiles(i, monitor),
    session: sessionCard(i),
    rules: trackingRules(i),
    needsAttention: checks.filter((c) => c.tone === 'bad' || (c.fix != null && c.tone === 'warn')).length,
  };
}
