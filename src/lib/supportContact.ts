import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * HR / software-support contact details, as HR enters them in the HR portal
 * (Settings -> HR Contact) and the server publishes them at `GET /support-contact`.
 *
 * Everything here is pure except the two storage helpers at the bottom, so the rules
 * (which contact for which situation, how a link is built, what to say when nothing has
 * been entered) live in one place and are identical to the web and mobile-web clients.
 *
 * Which contact for which situation:
 *  - 'hr'     cannot sign in, password / code problems, not registered, account inactive,
 *             problems with the app, questions about your own data.
 *  - 'server' the server is not working / unreachable / 5xx / database offline.
 */

export type ContactSituation = 'hr' | 'server';

export interface ContactBlock {
  label: string;
  /** Shown exactly as HR typed it. */
  phone: string;
  /** What the dialer is given. */
  phoneDial: string;
  /** Shown exactly as HR typed it. */
  whatsapp: string;
  /** Digits only, country code included (for wa.me). */
  whatsappNumber: string;
  email: string;
  hours: string;
  /** At least one of phone / whatsapp / email is set. */
  hasContact: boolean;
  /** The server filled this block in from HR because nothing was entered for it. */
  usesHrFallback: boolean;
}

export interface SupportContact {
  hr: ContactBlock;
  support: ContactBlock;
  note: string;
  companyName: string;
  /** False until HR entered at least one way to reach someone. */
  configured: boolean;
  updatedAt: string;
}

/** Last good copy, kept so the numbers are still there when the server is not. */
export const SUPPORT_CONTACT_STORAGE_KEY = 'uktex_support_contact_v1';

const DEFAULT_LABEL: Record<ContactSituation, string> = {
  hr: 'HR Department',
  server: 'Software Support',
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Any string field; anything else (missing, null, wrong type) reads as "not set". */
function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function toBlock(raw: unknown, defaultLabel: string): ContactBlock | null {
  if (!isPlainObject(raw)) return null;
  const phone = str(raw.phone);
  const whatsapp = str(raw.whatsapp);
  const email = str(raw.email);
  return {
    label: str(raw.label) || defaultLabel,
    phone,
    phoneDial: str(raw.phoneDial),
    whatsapp,
    whatsappNumber: str(raw.whatsappNumber),
    email,
    hours: str(raw.hours),
    // The server's own definition, recomputed so a wrong flag can never show an empty card.
    hasContact: phone !== '' || whatsapp !== '' || email !== '',
    usesHrFallback: raw.usesHrFallback === true,
  };
}

/**
 * The contract check: an object with an `hr` object and a `support` object.
 * Returns a complete, typed copy (every field present, "" when not set) or null when the
 * value does not match, so nothing downstream ever has to defend against a missing field.
 */
export function normalizeSupportContact(value: unknown): SupportContact | null {
  if (!isPlainObject(value)) return null;
  const hr = toBlock(value.hr, DEFAULT_LABEL.hr);
  const support = toBlock(value.support, DEFAULT_LABEL.server);
  if (!hr || !support) return null;
  return {
    hr,
    support,
    note: str(value.note),
    companyName: str(value.companyName),
    configured: typeof value.configured === 'boolean' ? value.configured : hr.hasContact || support.hasContact,
    updatedAt: str(value.updatedAt),
  };
}

/** Whether `value` is a usable /support-contact payload (see `normalizeSupportContact`). */
export function isSupportContact(value: unknown): boolean {
  return normalizeSupportContact(value) !== null;
}

// ---------------------------------------------------------------------------
// Links. Each returns '' when the field is empty (or unusable), so callers can simply
// skip the button.
// ---------------------------------------------------------------------------

export function telLink(block: ContactBlock | null | undefined): string {
  const dial = (block?.phoneDial ?? '').replace(/[^\d+*#]/g, '');
  return /\d/.test(dial) ? `tel:${dial}` : '';
}

export function whatsappLink(block: ContactBlock | null | undefined): string {
  const digits = (block?.whatsappNumber ?? '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

export function emailLink(block: ContactBlock | null | undefined): string {
  const email = (block?.email ?? '').trim();
  return /^[^\s@]+@[^\s@]+$/.test(email) ? `mailto:${email}` : '';
}

export type ContactActionKind = 'call' | 'whatsapp' | 'email';

export interface ContactAction {
  kind: ContactActionKind;
  /** What is shown on the button: "Call", "WhatsApp", "Email". */
  verb: string;
  /** The number / address exactly as entered. */
  value: string;
  /** '' when HR entered something to read out but nothing that can be tapped. */
  url: string;
}

/** Everything that can be shown for this block, in the order call, WhatsApp, email. */
export function contactActions(block: ContactBlock | null | undefined): ContactAction[] {
  if (!block) return [];
  const actions: ContactAction[] = [];
  if (block.phone) actions.push({ kind: 'call', verb: 'Call', value: block.phone, url: telLink(block) });
  if (block.whatsapp) actions.push({ kind: 'whatsapp', verb: 'WhatsApp', value: block.whatsapp, url: whatsappLink(block) });
  if (block.email) actions.push({ kind: 'email', verb: 'Email', value: block.email, url: emailLink(block) });
  return actions;
}

/** What a screen reader says for a contact button, e.g. "Call HR Department on 0421 430 0800". */
export function contactActionAccessibilityLabel(action: ContactAction, label: string): string {
  switch (action.kind) {
    case 'call':
      return `Call ${label} on ${action.value}`;
    case 'whatsapp':
      return `Message ${label} on WhatsApp at ${action.value}`;
    default:
      return `Email ${label} at ${action.value}`;
  }
}

/** The one action to offer where there is room for a single link: the first one that can be tapped. */
export function primaryContactAction(block: ContactBlock | null | undefined): ContactAction | null {
  const actions = contactActions(block);
  return actions.find((a) => a.url !== '') ?? actions[0] ?? null;
}

// ---------------------------------------------------------------------------
// Which contact, and what to say without one
// ---------------------------------------------------------------------------

/**
 * The block to show for a situation, or null when there is nothing to show: nothing has been
 * loaded yet, HR has not entered any details, or that block has no phone / WhatsApp / email.
 */
export function contactFor(data: SupportContact | null | undefined, situation: ContactSituation): ContactBlock | null {
  if (!data || !data.configured) return null;
  const block = situation === 'hr' ? data.hr : data.support;
  return block.hasContact ? block : null;
}

/** What to show when there are no numbers to show. Never contains a number. */
export function fallbackSentence(situation: ContactSituation): string {
  return situation === 'hr' ? 'Please contact your HR department.' : 'Please contact your software support team.';
}

export function defaultContactLabel(situation: ContactSituation): string {
  return DEFAULT_LABEL[situation];
}

// ---------------------------------------------------------------------------
// Error classification (no axios import needed: an axios error is recognised by its shape)
// ---------------------------------------------------------------------------

interface ErrorLike {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: { status?: number };
}

/** The request never got an answer (offline, timed out, server down). A cancelled request is not one. */
export function isNetworkFailure(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as ErrorLike;
  if (e.code === 'ERR_CANCELED') return false;
  if (e.response) return false;
  return e.isAxiosError === true || e.message === 'Network Error';
}

/** "The server is not working": unreachable, or it answered with a 5xx. These belong to the software-support contact. */
export function isServerProblem(err: unknown): boolean {
  if (isNetworkFailure(err)) return true;
  const status = (err as ErrorLike | null | undefined)?.response?.status;
  return typeof status === 'number' && status >= 500;
}

// ---------------------------------------------------------------------------
// The two storage helpers. Every read and write is guarded: a broken store must never
// break a screen, it only means the numbers are not there while the server is down.
// ---------------------------------------------------------------------------

export async function readCachedSupportContact(): Promise<SupportContact | null> {
  try {
    const raw = await AsyncStorage.getItem(SUPPORT_CONTACT_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSupportContact(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeCachedSupportContact(data: SupportContact): Promise<void> {
  try {
    await AsyncStorage.setItem(SUPPORT_CONTACT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Not being able to remember it is not worth failing the screen for.
  }
}
