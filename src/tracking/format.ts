// Wording helpers for the tracking screens (pure). The HR portal words the same things; keep them alike.
import type { EventKind } from './types.ts';

/** 45 s / 12 min / 1 h 05 min / 2 h. Whole seconds in, never negative. */
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}

/** 850 m / 12.4 km. */
export function formatDistance(meters: number | null | undefined): string {
  const m = Math.max(0, Number(meters) || 0);
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${km < 100 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatSpeedKmh(kmh: number | null | undefined): string {
  const v = Number(kmh);
  return Number.isFinite(v) ? `${Math.round(v)} km/h` : '-';
}

/** "10:42 AM" in the phone's local time zone (the factory's). Empty for no / invalid input. */
export function formatClock(iso: string | number | null | undefined): string {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** "28 Oct, 10:42 AM". */
export function formatDateTime(iso: string | number | null | undefined): string {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${formatClock(d.getTime())}`;
}

/** "3 min ago" / "just now" / "never". */
export function formatAgo(ms: number | null | undefined, now: number = Date.now()): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return 'never';
  const secs = Math.max(0, Math.round((now - ms) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs} s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

const GAP_CAUSE: Record<string, string> = {
  gps_off: 'Location was switched off',
  network_lost: 'No internet connection',
  app_killed: 'The app was closed by the phone',
  device_shutdown: 'The phone was off',
  permission: 'Location permission was removed',
  power_save: 'Battery saver',
  signal_lost: 'No signal from the phone',
  unknown: 'No location received',
};

export function gapCauseLabel(cause: string | null | undefined): string {
  return GAP_CAUSE[String(cause ?? '').toLowerCase()] ?? GAP_CAUSE.unknown;
}

const END_REASON: Record<string, string> = {
  manual: 'You marked it Done',
  auto_4th_punch: 'All 4 punches were recorded',
  auto_day_end: 'Closed automatically at the end of the day',
  rejected: 'The request was rejected',
  admin: 'Closed by HR',
};

export function endReasonLabel(reason: string | null | undefined): string {
  return END_REASON[String(reason ?? '')] ?? '';
}

const EVENT_LABEL: Record<string, string> = {
  TRACKING_STARTED: 'Tracking started',
  TRACKING_STOPPED: 'Tracking stopped',
  GPS_OFF: 'Location switched off',
  GPS_ON: 'Location switched on',
  NETWORK_LOST: 'Internet lost',
  NETWORK_RESTORED: 'Internet back',
  AIRPLANE_ON: 'Airplane mode on',
  AIRPLANE_OFF: 'Airplane mode off',
  POWER_SAVE_ON: 'Battery saver on',
  POWER_SAVE_OFF: 'Battery saver off',
  PERMISSION_CHANGED: 'Location permission changed',
  LOW_BATTERY: 'Low battery',
  MOCK_LOCATION: 'Fake location detected',
  CLOCK_CHANGED: 'Phone clock differs from the server',
  APP_RESTARTED: 'App restarted',
  APP_KILLED: 'App was closed by the phone',
  DEVICE_SHUTDOWN: 'Phone switched off',
  DEVICE_BOOT: 'Phone restarted',
  BACKGROUND_RESTRICTED: 'Background use restricted',
  SIGNAL_LOST: 'No signal from the phone',
  SERVER_NOTE: 'Note',
};

export function eventLabel(kind: EventKind | string | null | undefined): string {
  const k = String(kind ?? '').toUpperCase();
  return EVENT_LABEL[k] ?? k.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Events that mean the route may have been affected: drawn as a warning, not as a neutral note. */
export function isProblemEvent(kind: string | null | undefined): boolean {
  return /^(GPS_OFF|NETWORK_LOST|AIRPLANE_ON|APP_KILLED|DEVICE_SHUTDOWN|DEVICE_BOOT|PERMISSION_CHANGED|MOCK_LOCATION|SIGNAL_LOST|BACKGROUND_RESTRICTED|CLOCK_CHANGED)$/.test(
    String(kind ?? '').toUpperCase(),
  );
}
