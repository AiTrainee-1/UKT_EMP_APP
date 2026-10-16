// Who sees a staff-only entry (pure functions, no React Native, unit-tested in employmentType.test.ts).
//
// Compensation is for STAFF employees only: a production employee never gets a day marker, a balance or a claim. Its
// entries (the Compensation tile on Home, the drawer entry, the Compensation days in the attendance legend) must not
// show for a production employee, and must not flash up while the profile is still loading and nobody knows yet.
// So they are shown only once the employee's own profile (GET /employees/:id) has said `employmentType: 'staff'`: the
// same approach as the web app's hooks/useEmploymentType.ts.

/** True only once the profile has said 'staff'. Loading (undefined), an unknown value, or 'production' is false. */
export function isStaffEmployee(employmentType: unknown): boolean {
  return employmentType === 'staff';
}

/** How a navigation entry or tile is gated on the employment type. */
export interface EmploymentGate {
  /** Hidden from a production employee, but shown while the profile is still loading (the older rule). */
  staffOnly?: boolean;
  /** Shown only once the profile says 'staff': hidden while loading and from a production employee. */
  staffProfileOnly?: boolean;
}

/** Whether an entry with this gate is shown to an employee of this `employmentType` (undefined while loading). */
export function showsForEmployee(gate: EmploymentGate, employmentType: unknown): boolean {
  if (gate.staffProfileOnly) return isStaffEmployee(employmentType);
  if (gate.staffOnly) return employmentType !== 'production';
  return true;
}
