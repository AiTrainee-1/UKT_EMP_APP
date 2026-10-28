import { createContext, useContext } from 'react';
import type { Href } from 'expo-router';
import api from '../lib/api';
import { setToken, setEmployeeId, setEmployeeName, clearAuth, getToken, getEmployeeId, getEmployeeName } from '../lib/auth';

export interface AuthUser {
  employeeId: number;
  name: string;
  role: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Sign out and leave for `to` instead of the Login screen (a deactivated account). */
  logoutTo: (to: Href) => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  logoutTo: async () => {},
  setUser: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

async function saveSession(data: { token: string; employeeId: number; name: string; role: string }) {
  const { token, employeeId, name, role } = data;
  await setToken(token);
  await setEmployeeId(employeeId);
  await setEmployeeName(name);
  return { token, employeeId, name, role };
}

export async function loginRequest(identifier: string, password: string) {
  const res = await api.post('/auth/employee-login', { identifier, password });
  return saveSession(res.data);
}

/** Which sign-in methods HR has switched on (Settings → WhatsApp Control / SMS Control). */
export interface LoginOptions {
  otpLogin: boolean;
  otpReset: boolean;
  /** A new employee must confirm a code (by SMS or WhatsApp) before choosing a first password. */
  otpActivate: boolean;
  passwordLogin: boolean;
  /**
   * How the one-time code is delivered: 'sms' or 'whatsapp'. Absent on a server from before the SMS channel existed;
   * the screens then say "a code" instead of naming one (see src/lib/otp.ts).
   */
  otpChannel?: string;
  /**
   * How many digits the one-time code has: 4 when the channel is 'sms', 6 for 'whatsapp'. Absent on an older server; the
   * screens then take the length from the channel (see otpLength in src/lib/otp.ts).
   */
  codeLength?: number;
}

export interface OtpRequestResult {
  /** Last digits of the mobile number the code went to, e.g. "••••••1234". */
  maskedPhone: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  /** 'sms' or 'whatsapp': where the code actually went. Absent on a server from before the SMS channel existed. */
  channel?: string;
  /** Digits in the code that was sent (4 by SMS, 6 on WhatsApp). Absent on an older server. */
  codeLength?: number;
  /** The server's own "We've sent a code by SMS to …" sentence. The screens compose their own wording instead. */
  message?: string;
}

export type OtpPurpose = 'login' | 'reset' | 'activate';

export async function loginOptionsRequest(): Promise<LoginOptions> {
  const res = await api.get('/auth/login-options');
  return res.data;
}

/** Asks the server to send a one-time code (by SMS or WhatsApp, as HR chose) to the number registered for this employee.
 * The body says `identifier` (not `employeeCode`) because `api` snake_cases request keys and
 * the server reads `identifier` as-is. */
export async function requestOtp(identifier: string, purpose: OtpPurpose): Promise<OtpRequestResult> {
  const res = await api.post('/auth/otp/request', { identifier, purpose });
  return res.data;
}

export async function otpLoginRequest(identifier: string, otp: string) {
  const res = await api.post('/auth/otp/login', { identifier, otp });
  return saveSession(res.data);
}

/** Forgot password: the one-time code proves who is asking, then sets the new password. */
export async function otpResetPasswordRequest(identifier: string, otp: string, password: string) {
  const res = await api.post('/auth/otp/reset-password', { identifier, otp, password });
  return res.data;
}

/** First-time password for a new employee: the one-time code proves the number HR registered is theirs. */
export async function otpActivateRequest(identifier: string, otp: string, password: string) {
  const res = await api.post('/auth/otp/activate', { identifier, otp, password });
  return res.data;
}

/** The server's own message (`{ error }`), a fixed line when it was unreachable, else `fallback`. */
export function authErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data;
  if (data?.error || data?.detail || data?.message) return data.error || data.detail || data.message;
  if (err?.message === 'Network Error') return 'Could not reach the server. Check your connection and try again.';
  return fallback;
}

/** Shared by first-time password setup (app/(auth)/set-password.tsx) and the
 * change-password flow (app/(tabs)/profile.tsx) — both hit the same
 * endpoint with the same payload, so neither should call `api.post` directly. */
export async function setPasswordRequest(identifier: string, password: string) {
  const res = await api.post('/auth/set-password', { identifier, password });
  return res.data;
}

export async function checkAuth(): Promise<AuthUser | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await api.get('/auth/me');
    const employeeId = await getEmployeeId();
    const name = await getEmployeeName();
    return { employeeId: employeeId!, name: name || '', role: res.data.role };
  } catch {
    await clearAuth();
    return null;
  }
}
