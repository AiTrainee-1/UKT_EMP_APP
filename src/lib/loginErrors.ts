// What the Login screen says when the server refused a password sign-in (owner 2026-11-25). Pure: no React Native,
// tested in loginErrors.test.ts.
//
// The server answers a refused sign-in with { error: "<sentence>", code: "<reason>" } (backend auth_views.py):
//   wrong_password    -> "Incorrect password"       and the Password field is marked;
//   unknown_employee  -> "Employee code not found"  and the Employee Code field is marked;
//   no_password       -> "Password not set"         (the account still has to be activated);
// anything else, and an older server that sends no `code`, -> "Authentication Failed" with the server's own sentence.

export type LoginFailureKind = 'wrong_password' | 'unknown_employee' | 'no_password' | 'other';

export interface LoginFailure {
  kind: LoginFailureKind;
  /** The dialog's title. */
  title: string;
  /** The server's sentence (or a plain fallback). */
  message: string;
  /** The field to mark red, or null. */
  field: 'identifier' | 'password' | null;
  /** The short note under that field. */
  fieldNote: string | null;
  /** A MaterialCommunityIcons name for the dialog. */
  icon: string;
}

export const GENERIC_LOGIN_TITLE = 'Authentication Failed';
const FALLBACK_MESSAGE = 'Invalid credentials. Please try again.';

function sentence(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Reads a refused sign-in (an axios error with a response). */
export function loginFailure(err: unknown): LoginFailure {
  const data = (err as { response?: { data?: Record<string, unknown> } } | null)?.response?.data ?? {};
  const code = sentence(data.code).toLowerCase();
  const said = sentence(data.error) || sentence(data.detail) || sentence(data.message);
  switch (code) {
    case 'wrong_password':
      return {
        kind: 'wrong_password',
        title: 'Incorrect password',
        message: said || 'Incorrect password.',
        field: 'password',
        fieldNote: 'This password is not correct',
        icon: 'lock-alert-outline',
      };
    case 'unknown_employee':
      return {
        kind: 'unknown_employee',
        title: 'Employee code not found',
        message: said || 'This employee code does not exist in HRMS.',
        field: 'identifier',
        fieldNote: 'Check this employee code',
        icon: 'account-question-outline',
      };
    case 'no_password':
      return {
        kind: 'no_password',
        title: 'Password not set',
        message: said || 'No password set. Please set your password first.',
        field: null,
        fieldNote: null,
        icon: 'key-outline',
      };
    default:
      return {
        kind: 'other',
        title: GENERIC_LOGIN_TITLE,
        message: said || FALLBACK_MESSAGE,
        field: null,
        fieldNote: null,
        icon: 'lock-alert-outline',
      };
  }
}
