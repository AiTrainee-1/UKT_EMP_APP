/**
 * The pure rules behind the one-time-code screens (sign in with a code, forgot password, first-time activation).
 *
 * The server delivers the code by SMS or by WhatsApp - HR chooses (Settings -> SMS Control) - and tells the app which:
 * `otpChannel` on GET /auth/login-options and `channel` on POST /auth/otp/request. Everything an employee reads about
 * that choice comes from here, so the wording is in one place and is tested without a phone:
 *
 *  - 'sms'      -> "by SMS"
 *  - 'whatsapp' -> "on WhatsApp"
 *  - anything else (a backend from before the SMS channel sent no key at all, or an unknown value): a neutral "a code",
 *    never a guess.
 *
 * The code's length follows the channel too: 4 digits by SMS (the approved template says XXXX), 6 on WhatsApp. The
 * server says which with `codeLength` (next to `otpChannel` / `channel`); an older server sends none, then the channel
 * decides (sms 4, whatsapp 6, unknown 6). See `otpLength`.
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
