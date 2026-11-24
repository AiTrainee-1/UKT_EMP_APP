/**
 * The pure rules behind the one-time-code screens (sign in with a code, forgot password, first-time activation).
 *
 * The server delivers the code by WhatsApp or by SMS. HR switches the two on SEPARATELY (WhatsApp Control -> OTP, SMS
 * Control -> OTP Switches), per purpose: either one alone is enough, and with both on the employee picks. The server
 * says which are on in GET /auth/login-options (`otpChannels` per purpose + `channels` with each one's code length, see
 * "Which ways a code can be sent" below) and names the one a code really went out on in POST /auth/otp/request
 * (`channel`, plus `otherChannels` to offer "Send by SMS instead"). A server from before that only sends ONE
 * `otpChannel` for everything, and one from before the SMS channel sends no channel at all. Everything an employee reads
 * about the channel comes from here, so the wording is in one place and is tested without a phone:
 *
 *  - 'sms'      -> "by SMS"
 *  - 'whatsapp' -> "on WhatsApp"
 *  - anything else (a backend from before the SMS channel sent no key at all, or an unknown value), or two channels to
 *    pick from: a neutral "a code", never a guess.
 *
 * The code's length follows the channel too: 4 digits by SMS (the approved template says XXXX), 6 on WhatsApp. The
 * server says which with `codeLength` (per channel in `channels`, next to `otpChannel` / `channel` on an older one);
 * without it the channel decides (sms 4, whatsapp 6, unknown 6). See `otpLength`.
 *
 * Nothing here imports React, axios or Expo, so `npm test` (node --test) can run it.
 */

export type OtpChannel = 'sms' | 'whatsapp';

/** 'sms' / 'whatsapp' (any case, spaces ignored); null for a missing, empty or unknown value. */
export function normalizeOtpChannel(value: unknown): OtpChannel | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v === 'sms' || v === 'whatsapp' ? v : null;
}

/** The channel the request's answer names, else the one the sign-in options named, else null (neutral wording). */
export function resolveOtpChannel(fromRequest: unknown, fromOptions: unknown): OtpChannel | null {
  return normalizeOtpChannel(fromRequest) ?? normalizeOtpChannel(fromOptions);
}

// ---------------------------------------------------------------------------
// Which ways a code can be sent
// ---------------------------------------------------------------------------
//
// GET /auth/login-options (a server with independent WhatsApp / SMS codes):
//   otpChannels: { login: ['whatsapp', 'sms'], reset: [...], activate: [...] }   what works NOW, WhatsApp first
//   channels:    { whatsapp: { name: 'WhatsApp', codeLength: 6 }, sms: { name: 'SMS', codeLength: 4 } }
// and POST /auth/otp/request takes an optional `channel`; a channel switched off meanwhile is refused with
// 400 { code: 'channel_unavailable', availableChannels, message }.
// An older server sends neither key: only `otpLogin` / `otpReset` / `otpActivate` and ONE `otpChannel` + `codeLength`
// for everything. It would ignore a `channel` in the request, so the app never sends it one.

/** Every channel, in the order the server lists them. */
export const OTP_CHANNELS: readonly OtpChannel[] = ['whatsapp', 'sms'];

/** 'WhatsApp' / 'SMS'. */
export function channelName(channel: OtpChannel): string {
  return channel === 'sms' ? 'SMS' : 'WhatsApp';
}

/** The known channels of a list from the server, in its order, each once; [] for anything that is not a list. */
export function normalizeChannelList(value: unknown): OtpChannel[] {
  if (!Array.isArray(value)) return [];
  const out: OtpChannel[] = [];
  for (const item of value) {
    const channel = normalizeOtpChannel(item);
    if (channel && !out.includes(channel)) out.push(channel);
  }
  return out;
}

/** The keys of GET /auth/login-options the code screens read. All optional: an older server sends fewer. */
export interface CodeOptionsSource {
  otpLogin?: unknown;
  otpReset?: unknown;
  otpActivate?: unknown;
  passwordLogin?: unknown;
  otpChannel?: unknown;
  codeLength?: unknown;
  otpChannels?: unknown;
  channels?: unknown;
}

/** What one screen (sign-in, forgot password, activation) can offer. */
export interface PurposeCodes {
  /** A code can be asked for at all. False = no code option (sign-in by password, HR resets, plain activation). */
  available: boolean;
  /**
   * The channels the employee can get it by, WhatsApp first. Two = the employee picks. Empty while `available` = the
   * server did not name one (an older server, or it could not be asked): neutral wording, no `channel` sent.
   */
  channels: OtpChannel[];
  /** The server takes a `channel` on POST /auth/otp/request (it sent `otpChannels`). */
  choosable: boolean;
  /** Digits of a code by each channel. */
  lengths: Record<OtpChannel, number>;
  /** Digits when the channel is not known. */
  neutralLength: number;
}

const PURPOSE_FLAG: Record<OtpPurposeName, 'otpLogin' | 'otpReset' | 'otpActivate'> = {
  login: 'otpLogin',
  reset: 'otpReset',
  activate: 'otpActivate',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Each channel's code length: its own `channels[ch].codeLength`, else an older server's `codeLength` for its one channel, else the channel's. */
function channelLengths(options: CodeOptionsSource | null | undefined): Record<OtpChannel, number> {
  const info = asRecord(options?.channels);
  const legacy = normalizeOtpChannel(options?.otpChannel);
  const lengths = { ...OTP_LENGTH_BY_CHANNEL };
  for (const channel of OTP_CHANNELS) {
    const own = asRecord(info?.[channel])?.codeLength;
    lengths[channel] = otpLength(own !== undefined ? own : legacy === channel ? options?.codeLength : undefined, channel);
  }
  return lengths;
}

/**
 * What GET /auth/login-options offers for one purpose. A new server: the purpose's list in `otpChannels` (empty = no
 * code). An older one: its `otpLogin` / `otpReset` / `otpActivate` switch, with its one `otpChannel` (or none named).
 */
export function purposeCodes(options: CodeOptionsSource | null | undefined, purpose: OtpPurposeName): PurposeCodes {
  const lengths = channelLengths(options);
  const neutralLength = otpLength(options?.codeLength, options?.otpChannel);
  const lists = asRecord(options?.otpChannels);
  if (lists && Array.isArray(lists[purpose])) {
    const channels = normalizeChannelList(lists[purpose]);
    return { available: channels.length > 0, channels, choosable: true, lengths, neutralLength };
  }
  const available = options?.[PURPOSE_FLAG[purpose]] === true;
  const legacy = normalizeOtpChannel(options?.otpChannel);
  return { available, channels: available && legacy ? [legacy] : [], choosable: false, lengths, neutralLength };
}

/** The server could not be asked (offline, an error): offer a code anyway with neutral words; the request will say what is wrong. */
export function unknownCodes(): PurposeCodes {
  return {
    available: true,
    channels: [],
    choosable: false,
    lengths: { ...OTP_LENGTH_BY_CHANNEL },
    neutralLength: DEFAULT_OTP_LENGTH,
  };
}

/** The channel a screen's wording can name: the only one on offer; null with two (the employee picks) or none known. */
export function singleChannel(codes: PurposeCodes): OtpChannel | null {
  return codes.channels.length === 1 ? codes.channels[0] : null;
}

/** Digits of a code sent by `channel` (null = not known). */
export function codeLengthFor(codes: PurposeCodes, channel: OtpChannel | null): number {
  return channel ? codes.lengths[channel] : codes.neutralLength;
}

/** The channel the main button sends by: the one remembered from last time when it is still on offer, else the server's first. */
export function preferredChannel(channels: readonly OtpChannel[], remembered: unknown): OtpChannel | null {
  const mine = normalizeOtpChannel(remembered);
  if (mine && channels.includes(mine)) return mine;
  return channels[0] ?? null;
}

/** The send buttons in order: the preferred channel first (the main button), then the rest in the server's order. */
export function channelChoices(channels: readonly OtpChannel[], remembered: unknown): OtpChannel[] {
  const first = preferredChannel(channels, remembered);
  return first ? [first, ...channels.filter((c) => c !== first)] : [];
}

/** A send button while the employee picks: "Send code by WhatsApp" / "Send code by SMS". */
export function chooseButtonLabel(channel: OtpChannel): string {
  return `Send code by ${channelName(channel)}`;
}

/** The line under the Employee Code field while the employee picks: each way with its digits. */
export function chooseHint(codes: PurposeCodes): string {
  const ways = codes.channels.map((c) => `${channelName(c)} (${codes.lengths[c]} digits)`).join(' or ');
  return `Choose how to get your code: ${ways}. It goes to the mobile number registered with HR.`;
}

/** The `channel` to put in POST /auth/otp/request: only to a server that takes one, and only a known channel. */
export function requestChannel(codes: PurposeCodes, channel: OtpChannel | null): OtpChannel | undefined {
  return codes.choosable && channel ? channel : undefined;
}

/**
 * The ways to offer after a code went out ("Didn't get it? Send by SMS instead"): the answer's `otherChannels` without
 * the one just used, and - when the sign-in options are known (`onOffer`) - only those still on offer.
 */
export function fallbackChannels(otherChannels: unknown, used: unknown, onOffer?: readonly OtpChannel[]): OtpChannel[] {
  const usedChannel = normalizeOtpChannel(used);
  return normalizeChannelList(otherChannels).filter((c) => c !== usedChannel && (!onOffer || onOffer.includes(c)));
}

export interface FallbackOffer {
  /** Plain text. */
  prefix: string;
  /** The tappable part. */
  action: string;
}

/** "Didn't get it? " + "Send by SMS instead". */
export function fallbackOffer(channel: OtpChannel): FallbackOffer {
  return { prefix: "Didn't get it? ", action: `Send by ${channelName(channel)} instead` };
}

export interface ChannelUnavailable {
  /** The channels the server still offers for this purpose (may be empty). */
  available: OtpChannel[];
  /** What the employee reads. */
  message: string;
}

/**
 * POST /auth/otp/request refused the channel asked for because HR switched it off meanwhile (400 with
 * `code: 'channel_unavailable'`). The screen then reloads the sign-in options. null for any other failure. Reads an
 * axios error (`response.status` / `response.data`) or a plain `{ status, data }`.
 */
export function channelUnavailable(err: unknown): ChannelUnavailable | null {
  const e = (err ?? {}) as { status?: unknown; data?: unknown; response?: { status?: unknown; data?: unknown } };
  const status = e.response ? e.response.status : e.status;
  const body = asRecord(e.response ? e.response.data : e.data);
  if (status !== 400 || !body || body.code !== 'channel_unavailable') return null;
  const available = normalizeChannelList(body.availableChannels ?? body.available_channels);
  const fallback = available.length
    ? `That way of sending codes is not available right now. Use ${available.map(channelName).join(' or ')} instead.`
    : 'Codes cannot be sent right now.';
  return { available, message: sentenceOf(body) || fallback };
}

export type LoginMode = 'otp' | 'password';

/**
 * Which form the sign-in screen shows once the sign-in options (re)load. `before` = whether codes worked on the last
 * load (null on the first), `now` = whether they work now. The first load opens the code form when codes work; a reload
 * (the screen came back into view, the app came to the front) keeps what the employee chose, except: no code -> the
 * password form; codes just came on -> the code form; password sign-in off -> the code form (there is no other way in).
 */
export function nextLoginMode(mode: LoginMode, before: boolean | null, now: boolean, passwordLogin: unknown): LoginMode {
  if (!now) return 'password';
  if (before !== true) return 'otp';
  if (passwordLogin === false) return 'otp';
  return mode;
}

export type OtpIcon = 'message-text-outline' | 'whatsapp' | 'send-outline';

export interface OtpCopy {
  /** 'SMS', 'WhatsApp' or '' (unknown). */
  channelName: string;
  icon: OtpIcon;
  /** Under the Employee Code field, before a code is asked for (filled in by `otpCopy`, which knows the length). */
  askHint: string;
  askButton: string;
  /** The link on the sign-in screen that switches from the password to a code. */
  loginSwitchLink: string;
  /** Forgot-password screen. */
  resetPill: string;
  resetIntro: string;
  resetUnavailable: string;
  /** First-time activation screen. */
  activateIntro: string;
  activateStepTitle: string;
  activateFootnote: string;
}

const SMS_COPY: OtpCopy = {
  channelName: 'SMS',
  icon: 'message-text-outline',
  askHint: '',
  askButton: 'Send code by SMS',
  loginSwitchLink: 'Sign in with an SMS code',
  resetPill: 'RESET WITH SMS',
  resetIntro:
    'Enter your employee code and we will send you a code by SMS. Enter it here to choose a new password.',
  resetUnavailable:
    'Resetting with an SMS code is not available right now. Please ask HR to reset your password, or set one up if you have never had one.',
  activateIntro: 'Confirm your mobile number, then choose your password.',
  activateStepTitle: 'Verify your mobile number',
  activateFootnote: 'The code is sent by SMS to the mobile number HR has registered for you.',
};

const WHATSAPP_COPY: OtpCopy = {
  channelName: 'WhatsApp',
  icon: 'whatsapp',
  askHint: '',
  askButton: 'Send code on WhatsApp',
  loginSwitchLink: 'Sign in with a WhatsApp code',
  resetPill: 'RESET WITH WHATSAPP',
  resetIntro:
    'Enter your employee code and we will WhatsApp you a code. Enter it here to choose a new password.',
  resetUnavailable:
    'Resetting with WhatsApp is not available right now. Please ask HR to reset your password, or set one up if you have never had one.',
  activateIntro: 'Confirm your WhatsApp number, then choose your password.',
  activateStepTitle: 'Verify your WhatsApp number',
  activateFootnote: 'The code goes to the WhatsApp number HR has registered for you.',
};

const NEUTRAL_COPY: OtpCopy = {
  channelName: '',
  icon: 'send-outline',
  askHint: '',
  askButton: 'Send code',
  loginSwitchLink: 'Sign in with a code',
  resetPill: 'RESET WITH A CODE',
  resetIntro: 'Enter your employee code and we will send you a code. Enter it here to choose a new password.',
  resetUnavailable:
    'Resetting with a code is not available right now. Please ask HR to reset your password, or set one up if you have never had one.',
  activateIntro: 'Confirm your mobile number, then choose your password.',
  activateStepTitle: 'Verify your mobile number',
  activateFootnote: 'The code goes to the mobile number HR has registered for you.',
};

/**
 * Every channel-dependent string for the screens. Accepts the raw server values; `codeLength` is the server's
 * `codeLength` (when it sent one), the hint under the Employee Code field names the digits of the code.
 */
export function otpCopy(channel: unknown, codeLength?: unknown): OtpCopy {
  const n = otpLength(codeLength, channel);
  switch (normalizeOtpChannel(channel)) {
    case 'sms':
      return { ...SMS_COPY, askHint: `We will send a ${n}-digit code by SMS to the mobile number registered with HR.` };
    case 'whatsapp':
      return {
        ...WHATSAPP_COPY,
        askHint: `We will send a ${n}-digit code on WhatsApp to the number registered with HR.`,
      };
    default:
      return { ...NEUTRAL_COPY, askHint: `We will send a ${n}-digit code to the mobile number registered with HR.` };
  }
}

// ---------------------------------------------------------------------------
// The code field
// ---------------------------------------------------------------------------

/** Digits of a code by channel: SMS 4 (the template says XXXX), WhatsApp 6. */
export const OTP_LENGTH_BY_CHANNEL: Record<OtpChannel, number> = { sms: 4, whatsapp: 6 };

/** What to assume when the server named neither a length nor a channel: the length codes had before the SMS channel. */
export const DEFAULT_OTP_LENGTH = 6;

/** The longest / shortest code length the field accepts from the server (a nonsense number is ignored). */
const MIN_OTP_LENGTH = 4;
const MAX_OTP_LENGTH = 8;

/**
 * How many digits the code has: the server's `codeLength` when it is a whole number in a sane range, else what the
 * channel implies (sms 4, whatsapp 6), else 6.
 */
export function otpLength(codeLength: unknown, channel?: unknown): number {
  const n = typeof codeLength === 'string' && codeLength.trim() !== '' ? Number(codeLength) : codeLength;
  if (typeof n === 'number' && Number.isInteger(n) && n >= MIN_OTP_LENGTH && n <= MAX_OTP_LENGTH) return n;
  const ch = normalizeOtpChannel(channel);
  return ch ? OTP_LENGTH_BY_CHANNEL[ch] : DEFAULT_OTP_LENGTH;
}

/** What the code field keeps of what was typed or pasted: digits only, at most `length` ("123 456" -> "123456"). */
export function otpDigits(text: string, length: number = DEFAULT_OTP_LENGTH): string {
  return String(text ?? '')
    .replace(/\D/g, '')
    .slice(0, length);
}

/** Exactly `length` digits. */
export function isCompleteOtp(code: string, length: number = DEFAULT_OTP_LENGTH): boolean {
  return new RegExp(`^\\d{${length}}$`).test(code);
}

/** The label of the code field: "4-digit code". */
export function codeLabel(length: number): string {
  return `${length}-digit code`;
}

/** What the screen says when the code typed is not complete: "Enter the 4-digit code." */
export function enterCodeMessage(length: number): string {
  return `Enter the ${length}-digit code.`;
}

// ---------------------------------------------------------------------------
// "Code sent" notice and timing
// ---------------------------------------------------------------------------

/** A number of seconds from the server as a whole, positive number; 0 for anything missing or unusable. */
export function positiveSeconds(value: unknown, max = 3600): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.ceil(n), max);
}

/** Seconds still to wait for a deadline (ms since epoch), rounded up, never below 0. Clock-based, so time spent in
 *  another app (reading the SMS) still counts. */
export function secondsLeft(deadlineMs: number, nowMs: number): number {
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/** "5 minutes", "1 minute". */
export function minutesPhrase(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export interface SentNotice {
  /** Plain text before the masked number. */
  lead: string;
  /** The masked number, shown bold; '' when the server did not send one. */
  masked: string;
  /** Plain text after it, starting with the full stop. */
  tail: string;
}

/**
 * "Code sent by SMS to ••••••1234. It expires in 5 minutes." The masked number and the expiry are each left out when
 * the server did not send them, and the channel is only named when the server did.
 */
export function sentNotice(channel: unknown, maskedPhone: unknown, expiresInSeconds: unknown): SentNotice {
  const ch = normalizeOtpChannel(channel);
  const masked = typeof maskedPhone === 'string' ? maskedPhone.trim() : '';
  const expiry = positiveSeconds(expiresInSeconds);
  let lead: string;
  if (ch === 'sms') lead = masked ? 'Code sent by SMS to ' : 'Code sent by SMS';
  else if (ch === 'whatsapp') lead = masked ? 'Code sent to WhatsApp number ' : 'Code sent on WhatsApp';
  else lead = masked ? 'Code sent to ' : 'Code sent';
  const tail = expiry ? `. It expires in ${minutesPhrase(expiry)}.` : '.';
  return { lead, masked, tail };
}

export function sentNoticeText(notice: SentNotice): string {
  return `${notice.lead}${notice.masked}${notice.tail}`;
}

/** Shown when the employee says they already have a code (asking again was too soon). */
export function haveCodeNotice(channel: unknown, codeLength?: unknown): string {
  const ch = normalizeOtpChannel(channel);
  const how = ch === 'sms' ? ' by SMS' : ch === 'whatsapp' ? ' on WhatsApp' : '';
  return `Enter the ${otpLength(codeLength, channel)}-digit code we sent you${how}.`;
}

export type OtpPurposeName = 'login' | 'reset' | 'activate';

/**
 * The line above the HR contact when a code could not be asked for: where to go next. Sign-in can fall back on the
 * password (when the screen has that button); a reset or an activation can only be helped along by HR.
 */
export function otpHelpLine(purpose: OtpPurposeName, canUsePassword: boolean): string {
  if (purpose === 'reset') return 'HR can reset your password for you:';
  if (purpose === 'activate') return 'HR can help you activate your account:';
  return canUsePassword
    ? 'You can sign in with your password instead, or contact HR:'
    : 'Please contact HR for help:';
}

/** Shown once the code's lifetime has run out. */
export const CODE_EXPIRED_NOTICE = 'This code has expired. Please ask for a new one.';

/** The label of the resend / ask-again button while the server's wait is running. */
export function resendLabel(seconds: number): string {
  return seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code';
}

export function askAgainLabel(askButton: string, seconds: number): string {
  return seconds > 0 ? `Send code again in ${seconds}s` : askButton;
}

// ---------------------------------------------------------------------------
// What went wrong when a code was asked for
// ---------------------------------------------------------------------------

export type OtpRequestErrorKind =
  /** Asked again too soon: the server says how long to wait. */
  | 'cooldown'
  /** Too many codes (per hour / per number): no short wait to offer. */
  | 'limit'
  /** The method is switched off, or the account is not active. */
  | 'turned_off'
  /** The provider could not deliver the code (502). */
  | 'send_failed'
  /** The channel is temporarily unavailable (503), e.g. SMS paused. */
  | 'unavailable'
  /** No answer from the server at all. */
  | 'network'
  /** A 5xx that is not one of the server's own sentences (a gateway page, a crash). */
  | 'server'
  /** Anything else the server refused with a sentence: unknown code, no mobile number on file, already has a password. */
  | 'rejected';

export interface OtpRequestProblem {
  kind: OtpRequestErrorKind;
  /** What the employee reads: the server's own sentence when it sent one. */
  message: string;
  /** Seconds before another code can be asked for (0 when the server named no wait). */
  waitSeconds: number;
  /** The server itself is not answering: offer the software-support contact. */
  serverDown: boolean;
  /** Offer the HR contact (and, where the screen has one, the password way in). False for a plain "wait a few seconds". */
  offerHr: boolean;
}

interface ErrorShape {
  message?: string;
  response?: { status?: number; data?: unknown; headers?: Record<string, unknown> | { get?: (name: string) => unknown } };
}

function sentenceOf(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const d = data as Record<string, unknown>;
  for (const key of ['error', 'detail', 'message']) {
    const v = d[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

function retryAfterHeader(headers: unknown): number {
  if (typeof headers !== 'object' || headers === null) return 0;
  const h = headers as Record<string, unknown> & { get?: (name: string) => unknown };
  const raw = h['retry-after'] ?? h['Retry-After'] ?? (typeof h.get === 'function' ? h.get('retry-after') : undefined);
  return positiveSeconds(raw);
}

/**
 * Sorts a failed "send me a code" call into what to show. `err` is an axios-style error; the server's JSON body is
 * `{ error: "<sentence>", retryAfterSeconds? }` (the sentence already names SMS or WhatsApp).
 */
export function describeOtpRequestError(err: unknown, fallback: string): OtpRequestProblem {
  const e = (err ?? {}) as ErrorShape;
  const res = e.response;
  if (!res) {
    return {
      kind: 'network',
      message: 'Could not reach the server. Check your connection and try again.',
      waitSeconds: 0,
      serverDown: true,
      offerHr: false,
    };
  }
  const status = typeof res.status === 'number' ? res.status : 0;
  const data = res.data;
  const body = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
  const sentence = sentenceOf(data);
  // The server's own refusal has an `error` sentence; a gateway page or a crash does not.
  const ownSentence = body !== null && typeof body.error === 'string' && body.error.trim() !== '';

  if (status >= 500 && !ownSentence) {
    // A gateway page or a crash: nothing the employee should read word for word.
    return { kind: 'server', message: fallback, waitSeconds: 0, serverDown: true, offerHr: false };
  }
  if (status === 429) {
    const wait = positiveSeconds(body?.retryAfterSeconds) || retryAfterHeader(res.headers);
    const message = ownSentence ? sentence : 'Too many requests. Please wait a moment and try again.';
    return wait
      ? { kind: 'cooldown', message, waitSeconds: wait, serverDown: false, offerHr: false }
      : { kind: 'limit', message, waitSeconds: 0, serverDown: false, offerHr: true };
  }
  const message = sentence || fallback;
  if (status === 502) return { kind: 'send_failed', message, waitSeconds: 0, serverDown: false, offerHr: true };
  if (status === 503) return { kind: 'unavailable', message, waitSeconds: 0, serverDown: false, offerHr: true };
  if (status === 403) return { kind: 'turned_off', message, waitSeconds: 0, serverDown: false, offerHr: true };
  return { kind: 'rejected', message, waitSeconds: 0, serverDown: false, offerHr: true };
}

// ── The sign-in methods on the login page (owner 2026-11-24) ───────────────────────────────────────────────────────────
// Employee Code + Password is the default and always works. "Continue with SMS OTP" and "Continue with WhatsApp OTP" sit
// under it: a channel HR switched on is open; one that is off (or cannot send right now) stays on screen, LOCKED.

export interface LoginChannelState {
  channel: OtpChannel;
  /** "SMS OTP" / "WhatsApp OTP". */
  label: string;
  enabled: boolean;
  /** Under a locked option: why it cannot be used. */
  lockedReason: string | null;
}

/**
 * One row per channel (WhatsApp first). `options` null = the server could not be asked yet: both are shown locked with
 * "Checking..." words (password sign-in still works). An older server that does not name its channel: the one code it
 * offers is open for both (the server picks the channel).
 */
export function loginChannelStates(options: CodeOptionsSource | null | undefined, loaded = true): LoginChannelState[] {
  const codes = purposeCodes(options, 'login');
  const unnamed = codes.available && codes.channels.length === 0;
  return OTP_CHANNELS.map((channel) => {
    const enabled = !!options && (unnamed || codes.channels.includes(channel));
    return {
      channel,
      label: `${channelName(channel)} OTP`,
      enabled,
      lockedReason: enabled
        ? null
        : !loaded || !options
          ? 'Checking if it is available...'
          : `Not enabled. ${channelName(channel)} sign-in codes are switched off by HR right now.`,
    };
  });
}

/** The sign-in options restricted to one channel (the employee chose "Continue with SMS OTP" / "... WhatsApp OTP"). */
export function codesForChannel(codes: PurposeCodes, channel: OtpChannel): PurposeCodes {
  if (codes.channels.length === 0) return codes; // an older server picks the channel itself
  return { ...codes, channels: codes.channels.includes(channel) ? [channel] : [], available: codes.channels.includes(channel) };
}
