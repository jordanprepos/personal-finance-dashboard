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

/* --------------------------------------------------------------- cycles */

/*
 * A tracking cycle is a salary-to-salary window: it opens on `startDay` of one
 * month and closes the day before `startDay` of the next. Its id keeps the
 * "YYYY-MM" shape and names the month the window *ends* in, so 27 Aug - 26 Sep
 * is "2026-09". That keeps every id-shaped thing below unchanged — budget
 * document ids, `shiftMonth` month nav, `monthLabel`, `assertYearMonth`.
 *
 * `startDay === 1` means calendar months, and is a documented special case
 * rather than a value the general formula happens to handle: end-labelling is
 * discontinuous there (the formula would call calendar August "September").
 * Every helper here collapses to its calendar-month twin at 1, which is the
 * control the cycle behaviour is tested against.
 */

/**
 * The highest day a cycle can start on. Every month has 28 days, so a cycle
 * that opens here opens in every month of the year — the same reasoning as
 * `MAX_INCOME_DAY`.
 */
export const MAX_CYCLE_START_DAY = 28;

/** Narrows a stored or entered start day into 1-`MAX_CYCLE_START_DAY`. */
export function clampCycleStartDay(day: number): number {
  const value = Math.trunc(Number(day));
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(MAX_CYCLE_START_DAY, value);
}

const utcMs = (date: string): number => {
  const { year, month, day } = parseISODate(date);
  return Date.UTC(year, month - 1, day);
};

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / 86_400_000);
}

/** The cycle a date falls in. "2026-08-28" at 27 -> "2026-09". */
export function cycleOf(date: string, startDay: number): string {
  const start = clampCycleStartDay(startDay);
  const yearMonth = toYearMonth(date);
  if (start === 1) return yearMonth;
  return parseISODate(date).day >= start ? shiftMonth(yearMonth, 1) : yearMonth;
}

export interface CycleRange {
  /** first day of the window, "YYYY-MM-DD" */
  start: string;
  /** last day of the window, inclusive */
  end: string;
}

/** The inclusive date window a cycle covers. */
export function cycleRange(cycleId: string, startDay: number): CycleRange {
  assertYearMonth(cycleId);
  const start = clampCycleStartDay(startDay);
  if (start === 1) {
    return { start: `${cycleId}-01`, end: dateInMonth(cycleId, daysInYearMonth(cycleId)) };
  }
  // `start` is never above 28, so the opening day exists in every month.
  return {
    start: dateInMonth(shiftMonth(cycleId, -1), start),
    end: dateInMonth(cycleId, start - 1),
  };
}

/** Days in the window, inclusive — the denominator for an even-burn pace. */
export function cycleLength(cycleId: string, startDay: number): number {
  const { start, end } = cycleRange(cycleId, startDay);
  return daysBetween(start, end) + 1;
}

/** 1-based position of a date within its cycle. Day 1 is the day it opens. */
export function dayInCycle(date: string, cycleId: string, startDay: number): number {
  return daysBetween(cycleRange(cycleId, startDay).start, date) + 1;
}

/**
 * Builds a valid ISO date inside a cycle from a day-of-month.
 *
 * Each day-of-month occurs at most once per window — 27, 28 ... 31, 1, 2 ...
 * 26 for a 27th start — which is what lets the expense form keep a plain "Day"
 * number instead of growing a date picker. A day the window has no room for
 * (31, in a window opening in a 30-day month) clamps rather than producing an
 * impossible date.
 */
export function dateInCycle(cycleId: string, day: number, startDay: number): string {
  const start = clampCycleStartDay(startDay);
  if (start === 1) return dateInMonth(cycleId, day);
  const wanted = Math.trunc(day) || 1;
  if (wanted >= start) return dateInMonth(shiftMonth(cycleId, -1), wanted);
  return dateInMonth(cycleId, Math.max(1, Math.min(wanted, start - 1)));
}

/** The day-of-month `dateInCycle` would actually land on. */
export function clampDayInCycle(cycleId: string, day: number, startDay: number): number {
  return parseISODate(dateInCycle(cycleId, day, startDay)).day;
}

/** The cycle containing today. */
export function currentCycle(startDay: number, now: Date = new Date()): string {
  return cycleOf(todayISO(now), startDay);
}

/** "26 Aug" — a date without its year, for a range that carries one already. */
export function shortDayLabel(date: string, locale = 'en-US'): string {
  const { year, month, day } = parseISODate(date);
  const short = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${day} ${short}`;
}

/**
 * "27 Aug – 26 Sep", or the empty string on calendar months — where the month
 * label already says everything the range would.
 */
export function cycleRangeLabel(cycleId: string, startDay: number, locale = 'en-US'): string {
  if (clampCycleStartDay(startDay) === 1) return '';
  const { start, end } = cycleRange(cycleId, startDay);
  return `${shortDayLabel(start, locale)} – ${shortDayLabel(end, locale)}`;
}
