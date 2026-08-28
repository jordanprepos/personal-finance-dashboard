/** Date helpers. Everything is string-first: "YYYY-MM-DD" / "YYYY-MM" / "YYYY". */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

export function assertISODate(date: string): void {
  if (!ISO_DATE.test(date)) {
    throw new Error(`Expected an ISO date "YYYY-MM-DD", received "${date}"`);
  }
}

export function assertYearMonth(yearMonth: string): void {
  if (!ISO_MONTH.test(yearMonth)) {
    throw new Error(`Expected a year-month "YYYY-MM", received "${yearMonth}"`);
  }
}

/** "2026-08-26" -> "2026-08". Denormalized onto every transaction. */
export function toYearMonth(date: string): string {
  assertISODate(date);
  return date.slice(0, 7);
}

/** "2026-08-26" -> "2026". Denormalized onto every transaction. */
export function toYear(date: string): string {
  assertISODate(date);
  return date.slice(0, 4);
}

/** "2026-08" -> "2026" */
export function yearOfMonth(yearMonth: string): string {
  assertYearMonth(yearMonth);
  return yearMonth.slice(0, 4);
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** month is 1-12. */
export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** month is 1-12. */
export function yearMonthOf(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export interface DateParts {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

export function parseISODate(date: string): DateParts {
  assertISODate(date);
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

export function parseYearMonth(yearMonth: string): { year: number; month: number } {
  assertYearMonth(yearMonth);
  return { year: Number(yearMonth.slice(0, 4)), month: Number(yearMonth.slice(5, 7)) };
}

/** month is 1-12. Leap-year correct — never hardcode a [31,28,...] table. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function daysInYearMonth(yearMonth: string): number {
  const { year, month } = parseYearMonth(yearMonth);
  return daysInMonth(year, month);
}

/** Clamps a day-of-month into a month that may be shorter (31 Jan -> 28/29 Feb). */
export function clampDay(yearMonth: string, day: number): number {
  const max = daysInYearMonth(yearMonth);
  return Math.min(Math.max(Math.trunc(day) || 1, 1), max);
}

/** Builds a valid ISO date inside `yearMonth`, clamping the day. */
export function dateInMonth(yearMonth: string, day: number): string {
  const { year, month } = parseYearMonth(yearMonth);
  return isoDate(year, month, clampDay(yearMonth, day));
}

export function shiftMonth(yearMonth: string, delta: number): string {
  const { year, month } = parseYearMonth(yearMonth);
  const zero = year * 12 + (month - 1) + delta;
  return yearMonthOf(Math.floor(zero / 12), (zero % 12) + 1);
}

/** The twelve "YYYY-MM" ids of a calendar year, January first. */
export function monthsOfYear(year: string): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
}

export function todayISO(now: Date = new Date()): string {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function currentYearMonth(now: Date = new Date()): string {
  return toYearMonth(todayISO(now));
}

export function monthLabel(yearMonth: string, locale = 'en-US'): string {
  const { year, month } = parseYearMonth(yearMonth);
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${name} ${year}`;
}

/** "2026-08" -> "August" — the month on its own, for prose. */
export function monthNameLabel(yearMonth: string, locale = 'en-US'): string {
  const { year, month } = parseYearMonth(yearMonth);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    timeZone: 'UTC',
  });
}

export function shortMonthLabel(yearMonth: string, locale = 'en-US'): string {
  const { year, month } = parseYearMonth(yearMonth);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: 'short',
    timeZone: 'UTC',
  });
}

export function dayLabel(date: string, locale = 'en-US'): string {
  const { year, month, day } = parseISODate(date);
  const short = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${day} ${short} ${year}`;
}
