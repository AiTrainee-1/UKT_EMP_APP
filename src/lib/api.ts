import axios from 'axios';
import { getToken, clearAuth } from './auth';
import { router } from 'expo-router';

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
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Convert request body keys to snake_case so Django can read them
  if (config.data && typeof config.data === 'object') {
    config.data = decamelizeKeys(config.data);
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.data) response.data = camelizeKeys(response.data);
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      await clearAuth();
      router.replace('/(auth)/login');
    }
    return Promise.reject(error);
  }
);

export default api;
