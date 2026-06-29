import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
const EMPLOYEE_ID_KEY = 'employee_id';
const EMPLOYEE_NAME_KEY = 'employee_name';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getEmployeeId(): Promise<number | null> {
  const value = await SecureStore.getItemAsync(EMPLOYEE_ID_KEY);
  return value ? parseInt(value, 10) : null;
}

export async function setEmployeeId(id: number): Promise<void> {
  await SecureStore.setItemAsync(EMPLOYEE_ID_KEY, String(id));
}

export async function getEmployeeName(): Promise<string | null> {
  return SecureStore.getItemAsync(EMPLOYEE_NAME_KEY);
}

export async function setEmployeeName(name: string): Promise<void> {
  await SecureStore.setItemAsync(EMPLOYEE_NAME_KEY, name);
}

export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(EMPLOYEE_ID_KEY);
  await SecureStore.deleteItemAsync(EMPLOYEE_NAME_KEY);
}
