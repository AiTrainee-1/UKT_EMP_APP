/**
 * GIFs and voice messages in Team Chat (owner 2026-11-25) — the pure rules, no React and no network, so `npm test`
 * covers them:
 *  - which picked file may be sent as a GIF (a real GIF, at most 8 MB — the server checks again),
 *  - when a GIF / voice message has expired (the server's word, or its expiry time has passed on this phone),
 *  - "0:07" style lengths, "Expires in 3 days" labels,
 *  - turning the recorder's loudness readings into the waveform bars that are drawn and sent with the message.
 */

export type ChatKind = 'text' | 'gif' | 'voice';

export interface ChatMediaInfo {
  /** Where the file is served (members of the channel only); null once it has expired. */
  url: string | null;
  mime: string | null;
  size: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  /** Up to 64 loudness bars 0-100, as the sender's phone recorded them. */
  waveform: number[] | null;
  expiresAt: string | null;
  expired: boolean;
}

export interface MediaMessageLike {
  id: number;
  kind?: ChatKind | string | null;
  media?: ChatMediaInfo | null;
}

export const GIF_MAX_BYTES = 8 * 1024 * 1024;
/** A voice message stops by itself at two minutes. */
export const VOICE_MAX_MS = 120_000;
/** Anything shorter than this is treated as a mis-tap and thrown away. */
export const VOICE_MIN_MS = 700;
/** Bars sent to the server (its limit is 64). */
export const WAVEFORM_UPLOAD_BARS = 64;
/** Bars drawn in a bubble. */
export const WAVEFORM_BARS = 36;

export const VOICE_TEXT = '🎤 Voice message';
export const GIF_TEXT = '🖼️ GIF';

export function messageKind(m: { kind?: string | null } | null | undefined): ChatKind {
  const k = m?.kind;
  return k === 'gif' || k === 'voice' ? k : 'text';
}

export function isMediaMessage(m: MediaMessageLike | null | undefined): boolean {
  return messageKind(m) !== 'text';
}

/**
 * True when a GIF / voice message can no longer be seen in the chat: the server said so (no link), or its expiry
 * time has passed on this phone even though the next poll has not said so yet.
 */
export function isMediaExpired(m: MediaMessageLike, now: Date): boolean {
  if (!isMediaMessage(m)) return false;
  const media = m.media;
  if (!media || media.expired || !media.url) return true;
  if (media.expiresAt) {
    const t = new Date(media.expiresAt).getTime();
    if (!Number.isNaN(t) && t <= now.getTime()) return true;
  }
  return false;
}

/** "0:07", "1:05", "2:00" */
export function formatDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** "Expires today", "Expires tomorrow", "Expires in 5 days" — null when there is no expiry or it has passed. */
export function expiryLabel(expiresAt: string | null | undefined, now: Date): string | null {
  if (!expiresAt) return null;
  const t = new Date(expiresAt);
  if (Number.isNaN(t.getTime()) || t.getTime() <= now.getTime()) return null;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(t) - startOf(now)) / 86_400_000);
  if (days <= 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

/** The words a one-line preview (a reply's quote) uses for a message. */
export function previewText(m: { kind?: string | null; text: string; media?: ChatMediaInfo | null }): string {
  const kind = messageKind(m);
  if (kind === 'voice') {
    const ms = m.media?.durationMs;
    return ms ? `${VOICE_TEXT} (${formatDuration(ms)})` : VOICE_TEXT;
  }
  if (kind === 'gif') return GIF_TEXT;
  return m.text;
}

// ---------------------------------------------------------------------------
// Picking a GIF
// ---------------------------------------------------------------------------

export interface PickedFile {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

/** Null when the picked file can be sent as a GIF, otherwise the sentence that says why not. */
export function gifPickProblem(file: PickedFile | null | undefined, maxBytes = GIF_MAX_BYTES): string | null {
  if (!file?.uri) return 'No picture was chosen.';
  const mime = (file.mimeType ?? '').toLowerCase();
  const name = (file.fileName ?? file.uri).toLowerCase().split('?')[0];
  // the type the phone reports wins; only when it reports none does the file name decide
  const looksGif = mime ? mime === 'image/gif' : name.endsWith('.gif');
  if (!looksGif) return 'That picture is not a GIF. Please choose a GIF from your photos.';
  if (typeof file.fileSize === 'number' && file.fileSize > maxBytes) {
    return `That GIF is larger than ${Math.round(maxBytes / (1024 * 1024))} MB. Please choose a smaller one.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Waveforms
// ---------------------------------------------------------------------------

/** The recorder's loudness (decibels, 0 = loudest, about -160 = silence) as 0..1, floor at -55 dB. */
export function meteringToLevel(db: number | null | undefined): number {
  if (typeof db !== 'number' || Number.isNaN(db)) return 0;
  const FLOOR = -55;
  if (db >= 0) return 1;
  if (db <= FLOOR) return 0;
  const linear = (db - FLOOR) / -FLOOR;
  // a gentle curve so quiet speech still shows as bars
  return Math.round(Math.pow(linear, 1.4) * 1000) / 1000;
}

/**
 * Squeezes (keeping each group's peak) or stretches a list of 0..1 levels to exactly `count` bars. An empty list gives
 * low flat bars.
 */
export function resampleBars(levels: readonly number[], count: number): number[] {
  if (count <= 0) return [];
  if (!levels.length) return Array.from({ length: count }, () => 0.08);
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i * levels.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * levels.length) / count));
    let peak = 0;
    for (let j = start; j < end && j < levels.length; j += 1) peak = Math.max(peak, levels[j]);
    out.push(Math.max(0, Math.min(1, peak)));
  }
  return out;
}

/** What is sent with a voice message: 64 whole numbers 0-100. */
export function waveformForUpload(levels: readonly number[]): number[] {
  return resampleBars(levels, WAVEFORM_UPLOAD_BARS).map((v) => Math.round(v * 100));
}

/** Bars (0..1) to draw for a voice message: the sender's own, or a steady made-up pattern for one without. */
export function barsForMessage(waveform: readonly number[] | null | undefined, seed: number, count = WAVEFORM_BARS): number[] {
  if (waveform && waveform.length) {
    return resampleBars(waveform.map((v) => Math.max(0, Math.min(100, v)) / 100), count).map((v) => Math.max(0.08, v));
  }
  let x = (Math.abs(seed) * 2654435761) >>> 0 || 1;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out.push(0.18 + ((x % 1000) / 1000) * 0.6);
  }
  return out;
}

/** Where a tap / drag at `x` of a waveform `width` wide lands, in milliseconds. */
export function seekPosition(x: number, width: number, durationMs: number): number {
  if (!(width > 0) || !(durationMs > 0)) return 0;
  const f = Math.max(0, Math.min(1, x / width));
  return Math.round(f * durationMs);
}

// ---------------------------------------------------------------------------
// The phone's own copy of a file
// ---------------------------------------------------------------------------

/** "chat-123.gif" / "chat-123.m4a" — the name the downloaded copy is kept under on the phone. */
export function mediaCacheFileName(id: number, kind: ChatKind | string | null | undefined, mime: string | null | undefined): string {
  const m = (mime ?? '').toLowerCase();
  let ext = kind === 'gif' ? 'gif' : 'm4a';
  if (m === 'image/png') ext = 'png';
  else if (m === 'image/jpeg') ext = 'jpg';
  else if (m === 'image/webp') ext = 'webp';
  else if (m === 'audio/aac') ext = 'aac';
  else if (m === 'audio/3gpp') ext = '3gp';
  return `chat-${id}.${ext}`;
}

/** The words to show for a failed GIF / voice upload: the server's own sentence when it gave one. */
export function uploadErrorMessage(err: unknown, kind: 'gif' | 'voice'): string {
  const e = (err ?? {}) as { response?: { status?: number; data?: { error?: unknown } }; message?: unknown };
  const server = e.response?.data?.error;
  if (typeof server === 'string' && server.trim()) return server;
  if (!e.response) return 'No internet connection. Please check it and try again.';
  return kind === 'gif' ? 'The GIF wasn’t sent. Please try again.' : 'The voice message wasn’t sent. Please try again.';
}
