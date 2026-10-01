import axios from 'axios';
import { getToken, clearAuth } from './auth';
import { router } from 'expo-router';
import { markServerOffline, markServerOnline } from './serverStatus';
import { isNetworkFailure } from './supportContact';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * A public endpoint (no sign-in needed): no Authorization header is sent, and a 401 from it
     * never signs the employee out. Used by the HR-contact lookup, which must work on the login
     * screen and while a stale token is still on the device.
     */
    isPublic?: boolean;
  }
}

// Response: Django snake_case → frontend camelCase
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

function camelizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [snakeToCamel(k), camelizeKeys(v)])
    );
  }
  return obj;
}

// Request: frontend camelCase → Django snake_case (for POST/PUT/PATCH bodies)
function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, (l) => `_${l.toLowerCase()}`);
}

function decamelizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(decamelizeKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [camelToSnake(k), decamelizeKeys(v)])
    );
  }
  return obj;
}

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = config.isPublic ? null : await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Convert request body keys to snake_case so Django can read them
  // (skip FormData — its fields aren't plain enumerable properties, and
  // decamelizing it would silently collapse the body to `{}`)
  if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
    config.data = decamelizeKeys(config.data);
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    // A successful response means the server is there (see src/lib/serverStatus.ts).
    markServerOnline();
    if (response.data) response.data = camelizeKeys(response.data);
    return response;
  },
  async (error) => {
    // A request the app cancelled itself says nothing about the server either way.
    if (!axios.isCancel(error)) {
      const status = error?.response?.status;
      // No answer (offline, timed out, server down) or a gateway that has lost the server.
      if (isNetworkFailure(error) || status === 502 || status === 503 || status === 504) markServerOffline();
    }
    if (error.response?.status === 401 && !error.config?.isPublic) {
      await clearAuth();
      router.replace('/(auth)/login');
    }
    return Promise.reject(error);
  }
);

export default api;
