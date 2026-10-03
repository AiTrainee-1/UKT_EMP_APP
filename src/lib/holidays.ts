// The holiday list as the screens use it. Pure (unit-tested in holidays.test.ts).

export type HolidayType = 'National' | 'Regional' | 'Company';

export interface Holiday {
  id: number;
  name: string;
  date: string;
  type: HolidayType;
}

/** The server sends `holidayType` in lower case ("national" / "regional" / "company"); anything else reads as Company. */
export function holidayTypeOf(raw: unknown): HolidayType {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'national' ? 'National' : v === 'regional' ? 'Regional' : 'Company';
}

/**
 * One holiday as the screens use it, or null when it has no usable date. The Holidays screen used to read a `type` key
 * the server never sends (it sends `holidayType`), so every row crashed on `undefined`.
 */
export function toHoliday(raw: any): Holiday | null {
  const date = typeof raw?.date === 'string' ? raw.date.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    id: Number(raw.id),
    name: String(raw.name ?? 'Holiday'),
    date,
    type: holidayTypeOf(raw.holidayType ?? raw.type),
  };
}

export function toHolidays(raw: unknown): Holiday[] {
  return (Array.isArray(raw) ? raw : []).map(toHoliday).filter((h): h is Holiday => h !== null);
}
