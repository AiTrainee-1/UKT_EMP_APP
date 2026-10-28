// The tracking set-up as a small state machine (pure): which steps the employee still has to do, in what order, and which of
// them are required before tracking can run at all versus recommended for it to survive. The same snapshot feeds the red
// "tracking needs attention" banner on the On-Duty page and the Tracking health screen (trackingIssues).
//
//   consent -> foreground location -> "Allow all the time" -> notifications -> battery optimisation
//
// Required: consent (while the server says the notice has not been accepted) and foreground location. Without either the
// engine cannot start. The others only decide how reliably it keeps running with the screen off, so they can be skipped.
import type { NetworkKind, PermissionLevel } from './types.ts';

export type SetupPlatform = 'android' | 'ios' | 'web';
export type SetupStepId = 'consent' | 'foreground' | 'background' | 'notifications' | 'battery';
export type StepStatus = 'done' | 'todo' | 'skipped' | 'not_applicable';

export const SETUP_ORDER: SetupStepId[] = ['consent', 'foreground', 'background', 'notifications', 'battery'];

export interface SetupSnapshot {
  platform: SetupPlatform;
  /** The server says the notice (current version) has not been accepted by this employee. null = not known yet. */
  consentRequired: boolean | null;
  permission: PermissionLevel;
  /** null = could not be read. */
  notificationsGranted: boolean | null;
  /** true = the OS still optimises (may stop) the app; null = could not be read. */
  batteryOptimised: boolean | null;
  skipped: SetupStepId[];
}

export interface SetupStep {
  id: SetupStepId;
  status: StepStatus;
  required: boolean;
}

export function computeSetupSteps(s: SetupSnapshot): SetupStep[] {
  const skipped = new Set(s.skipped);
  const web = s.platform === 'web';
  const android = s.platform === 'android';
  const fg = s.permission === 'always' || s.permission === 'while_using';

  const optional = (id: SetupStepId, done: boolean, applicable: boolean): SetupStep => ({
    id,
    required: false,
    status: !applicable ? 'not_applicable' : done ? 'done' : skipped.has(id) ? 'skipped' : 'todo',
  });

  return [
    // The notice can be accepted anywhere (a browser too); the rest of the set-up is about the phone.
    { id: 'consent', required: true, status: s.consentRequired === false ? 'done' : 'todo' },
    { id: 'foreground', required: true, status: web ? 'not_applicable' : fg ? 'done' : 'todo' },
    optional('background', s.permission === 'always', !web),
    optional('notifications', s.notificationsGranted === true, !web),
    optional('battery', s.batteryOptimised === false, android),
  ];
}

/** The step to show next: the first one still to do, in SETUP_ORDER; null when nothing is left. */
export function nextSetupStep(steps: SetupStep[]): SetupStepId | null {
  for (const id of SETUP_ORDER) {
    const step = steps.find((x) => x.id === id);
    if (step && step.status === 'todo') return id;
  }
  return null;
}

/** Everything the engine needs to start is in place. */
export function isReadyToTrack(steps: SetupStep[]): boolean {
  return steps.filter((x) => x.required).every((x) => x.status === 'done' || x.status === 'not_applicable');
}

/** Nothing left to ask: every applicable step is done or skipped. */
export function isSetupComplete(steps: SetupStep[]): boolean {
  return steps.every((x) => x.status !== 'todo');
}

// ---------------------------------------------------------------------------------------------------------- issues

export type IssueId =
  | 'consent'
  | 'permission_denied'
  | 'location_off'
  | 'engine_stopped'
  | 'sync_stuck'
  | 'permission_while_using'
  | 'battery_optimised'
  | 'notifications_off'
  | 'power_save'
  | 'offline'
  | 'backlog';

export type IssueFix = 'consent' | 'permission' | 'location_services' | 'battery' | 'notifications' | 'restart' | 'sync' | null;

export interface TrackingIssue {
  id: IssueId;
  /** error = the route is not being recorded (red banner); warning = it may stop or is delayed. */
  severity: 'error' | 'warning';
  title: string;
  message: string;
  fix: IssueFix;
}

export interface HealthInput {
  platform: SetupPlatform;
  /** The server says a track is active for this employee (tracking should be running). */
  trackActive: boolean;
  consentRequired: boolean;
  permission: PermissionLevel;
  locationEnabled: boolean | null;
  notificationsGranted: boolean | null;
  batteryOptimised: boolean | null;
  powerSave: boolean | null;
  network: NetworkKind;
  engineRunning: boolean;
  queuedPoints: number;
  /** Milliseconds since the last upload the server acknowledged; null = never. */
  sinceLastSyncMs: number | null;
  syncError: string | null;
}

/** Longer than this without an acknowledged upload, while online, is "not syncing". */
export const SYNC_STUCK_AFTER_MS = 15 * 60_000;
export const BACKLOG_POINTS = 300;

/** Everything wrong or fragile right now, errors first. Only meaningful while a track is active (otherwise only permissions). */
export function trackingIssues(i: HealthInput): TrackingIssue[] {
  if (i.platform === 'web') return [];
  const out: TrackingIssue[] = [];
  const hasFg = i.permission === 'always' || i.permission === 'while_using';

  if (i.trackActive && i.consentRequired) {
    out.push({
      id: 'consent',
      severity: 'error',
      title: 'Tracking notice not accepted',
      message: 'Your route is not recorded until you accept the tracking notice.',
      fix: 'consent',
    });
  }
  if (i.trackActive && !hasFg) {
    out.push({
      id: 'permission_denied',
      severity: 'error',
      title: 'Location permission is off',
      message: 'Allow location for UKTextiles, otherwise your on-duty route cannot be recorded.',
      fix: 'permission',
    });
  }
  if (i.trackActive && hasFg && i.locationEnabled === false) {
    out.push({
      id: 'location_off',
      severity: 'error',
      title: 'Phone location is switched off',
      message: 'Turn on Location in your phone\'s quick settings. Nothing is recorded while it is off.',
      fix: 'location_services',
    });
  }
  if (i.trackActive && hasFg && i.locationEnabled !== false && !i.consentRequired && !i.engineRunning) {
    out.push({
      id: 'engine_stopped',
      severity: 'error',
      title: 'Tracking is not running',
      message: 'Open this screen to restart it. Your route is not being recorded right now.',
      fix: 'restart',
    });
  }
  const online = i.network !== 'none';
  if (
    i.trackActive &&
    online &&
    i.queuedPoints > 0 &&
    i.sinceLastSyncMs != null &&
    i.sinceLastSyncMs > SYNC_STUCK_AFTER_MS &&
    i.syncError !== 'consent_required'
  ) {
    out.push({
      id: 'sync_stuck',
      severity: 'warning',
      title: 'Route is not reaching the office',
      message: 'Your route is saved on the phone and will upload as soon as the connection allows.',
      fix: 'sync',
    });
  }

  if (i.trackActive && hasFg && i.permission === 'while_using') {
    out.push({
      id: 'permission_while_using',
      severity: 'warning',
      title: 'Location is "only while using the app"',
      message: 'Choose "Allow all the time" so tracking keeps working when the screen is off.',
      fix: 'permission',
    });
  }
  if (i.trackActive && i.platform === 'android' && i.batteryOptimised === true) {
    out.push({
      id: 'battery_optimised',
      severity: 'warning',
      title: 'Battery optimisation may stop tracking',
      message: 'Let UKTextiles run in the background so the phone does not shut it down.',
      fix: 'battery',
    });
  }
  if (i.trackActive && i.notificationsGranted === false) {
    out.push({
      id: 'notifications_off',
      severity: 'warning',
      title: 'Notifications are off',
      message: 'The "recording your route" notice is hidden. Tracking still runs, but allow notifications to see it.',
      fix: 'notifications',
    });
  }
  if (i.trackActive && i.powerSave === true) {
    out.push({
      id: 'power_save',
      severity: 'warning',
      title: 'Battery saver is on',
      message: 'Battery saver can delay location updates. Switch it off while you are on duty.',
      fix: null,
    });
  }
  if (i.trackActive && i.network === 'none') {
    out.push({
      id: 'offline',
      severity: 'warning',
      title: 'No internet',
      message: 'Your route keeps being recorded and uploads when you are back online.',
      fix: null,
    });
  }
  if (i.queuedPoints >= BACKLOG_POINTS && i.network !== 'none') {
    out.push({
      id: 'backlog',
      severity: 'warning',
      title: 'Large backlog waiting to upload',
      message: `${i.queuedPoints} points are waiting on the phone.`,
      fix: 'sync',
    });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

/** The banner on the On-Duty page shows only what stops the route from being recorded. */
export function bannerIssues(issues: TrackingIssue[]): TrackingIssue[] {
  return issues.filter((x) => x.severity === 'error');
}
