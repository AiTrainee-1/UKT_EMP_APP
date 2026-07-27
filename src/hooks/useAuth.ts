import { createContext, useContext } from 'react';
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
  setUser: (user: AuthUser | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  setUser: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export async function loginRequest(identifier: string, password: string) {
  const res = await api.post('/auth/employee-login', { identifier, password });
  const { token, employeeId, name, role } = res.data;
  await setToken(token);
  await setEmployeeId(employeeId);
  await setEmployeeName(name);
  return { token, employeeId, name, role };
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
