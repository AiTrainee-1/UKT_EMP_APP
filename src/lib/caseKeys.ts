// The two key-case conversions the app's axios client applies (src/lib/api.ts), in one pure file so they can be tested:
//   * a RESPONSE body goes snake_case -> camelCase (Django speaks snake_case),
//   * a JSON REQUEST body goes camelCase -> snake_case, at every depth (FormData is never touched).
// Anything that builds a request body must therefore be readable by the server in BOTH cases (see the geo-tracking batch
// in src/tracking/sync.ts), because this is what actually goes over the wire.

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

export function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, (l) => `_${l.toLowerCase()}`);
}

export function camelizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [snakeToCamel(k), camelizeKeys(v)]));
  }
  return obj;
}

export function decamelizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(decamelizeKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [camelToSnake(k), decamelizeKeys(v)]));
  }
  return obj;
}
