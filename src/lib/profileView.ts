// How the Profile page words the employee's own record (owner 2026-11-25 redesign). Pure (no React Native), unit-tested
// in profileView.test.ts. Every value comes from GET /employees/:id (src/hooks/useEmployee.ts); a missing one reads as
// null and the page prints "—".

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A "yyyy-MM-dd..." value as a local date, or null. */
function localDate(value?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "123456789012" -> "********9012": only the last four digits of a bank account are shown. */
export function maskAccount(acc?: string | null): string {
  if (!acc || acc.length < 4) return acc || '—';
  return '*'.repeat(acc.length - 4) + acc.slice(-4);
}

/** Whole years since the date of birth, or null. */
export function calcAge(dob: string | null | undefined, now: Date = new Date()): number | null {
  const d = localDate(dob);
  if (!d) return null;
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years -= 1;
  return years >= 0 ? years : null;
}

/** "Never changed" / "Updated today" / "Last updated 1 day ago" / "Last updated 12 days ago". */
export function passwordAgeLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'Never changed';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never changed';
  const days = Math.floor((now.getTime() - then) / (24 * 3600 * 1000));
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Last updated 1 day ago';
  return `Last updated ${days} days ago`;
}

/** The first phone number in a free-text contact ("Ravi (brother) 98765 43210" -> "9876543210"), or null. */
export function extractPhone(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/[+\d][\d\s-]{6,}/);
  if (!match) return null;
  return match[0].replace(/[\s-]/g, '');
}

/** "15 Jan 2020" for a "2020-01-15" date; anything else is shown as it came, "—" when empty. */
export function displayDate(value?: string | null): string {
  const d = localDate(value);
  if (!d) return value ? String(value) : '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** How long since joining: "3 yrs 2 mos", "1 yr", "8 mos", "New this month"; null without a join date. */
export function serviceLength(joinDate: string | null | undefined, now: Date = new Date()): string | null {
  const d = localDate(joinDate);
  if (!d || d.getTime() > now.getTime()) return null;
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  if (months <= 0) return 'New this month';
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y) parts.push(`${y} ${y === 1 ? 'yr' : 'yrs'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'mo' : 'mos'}`);
  return parts.join(' ');
}

/** "male" -> "Male", "on_leave" -> "On leave"; null for empty. */
export function capitalize(value?: string | null): string | null {
  const v = String(value ?? '').trim().replace(/_/g, ' ');
  if (!v) return null;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** 'staff' -> 'Staff', 'production' -> 'Production', anything else capitalised. */
export function employmentTypeLabel(value?: string | null): string | null {
  return capitalize(value);
}

/** Up to two initials of a name ("Anitha Kumar" -> "AK"). */
export function initialsOf(name?: string | null): string {
  return String(name ?? '')
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
