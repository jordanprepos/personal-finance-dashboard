import type { Budget, Category, Transaction } from '../types.js';
import { dayLabel, daysInYearMonth, monthsOfYear, parseISODate, shortMonthLabel } from './dates.js';

/**
 * Every value the dashboard shows — Budget Left, Expense Per Bulan, category
 * totals, envelope fill — is computed here from `transactions` + `budgets`.
 * None of it is a stored field, and none of it lives in either app.
 */

export const sumAmounts = (transactions: readonly Transaction[]): number =>
  transactions.reduce((total, t) => total + t.amount, 0);

const safeDiv = (a: number, b: number): number => (b > 0 ? a / b : 0);

/* ----------------------------------------------------------- month summary */

export interface MonthSummary {
  yearMonth: string;
  income: number;
  /** false when budgets/{yearMonth}.income has not been set yet */
  hasIncome: boolean;
  /** total spent across every category */
  spent: number;
  /** income - spent — "Budget Left" */
  left: number;
  /** 0-1 */
  spentShare: number;
  /** 0-1 */
  leftShare: number;
  /** entries logged with amount 0 */
  unpricedCount: number;
  entryCount: number;
}

export function monthSummary(
  yearMonth: string,
  transactions: readonly Transaction[],
  budget: Budget | null,
): MonthSummary {
  const income = budget?.income ?? 0;
  const hasIncome = income > 0;
  const spent = sumAmounts(transactions);
  // With no income set there is nothing to take a share of — reporting
  // "100% remaining" against a negative balance would be worse than zero.
  const spentShare = hasIncome ? Math.min(1, spent / income) : 0;
  return {
    yearMonth,
    income,
    hasIncome,
    spent,
    left: income - spent,
    spentShare,
    leftShare: hasIncome ? 1 - spentShare : 0,
    unpricedCount: transactions.filter((t) => t.amount === 0).length,
    entryCount: transactions.length,
  };
}

/* --------------------------------------------------------- category totals */

export interface CategoryTotal {
  categoryId: string;
  name: string;
  color: string;
  type: Category['type'];
  total: number;
  count: number;
  /** of the period's total spend, 0-1 */
  share: number;
}

const UNKNOWN_CATEGORY: Omit<Category, 'id'> = {
  name: 'Uncategorised',
  type: 'variable',
  color: '#8b98ae',
  icon: '',
  order: 9999,
  archived: false,
};

export function indexCategories(categories: readonly Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]));
}

export function categoryOf(categories: Map<string, Category>, categoryId: string): Category {
  return categories.get(categoryId) ?? { ...UNKNOWN_CATEGORY, id: categoryId };
}

/** Totals per category, biggest first. Categories with no spend are included. */
export function categoryTotals(
  transactions: readonly Transaction[],
  categories: readonly Category[],
): CategoryTotal[] {
  const index = indexCategories(categories);
  const buckets = new Map<string, { total: number; count: number }>();

  for (const c of categories) buckets.set(c.id, { total: 0, count: 0 });
  for (const t of transactions) {
    const bucket = buckets.get(t.categoryId) ?? { total: 0, count: 0 };
    bucket.total += t.amount;
    bucket.count += 1;
    buckets.set(t.categoryId, bucket);
  }

  const grand = sumAmounts(transactions);
  return [...buckets.entries()]
    .map(([categoryId, { total, count }]) => {
      const category = categoryOf(index, categoryId);
      return {
        categoryId,
        name: category.name,
        color: category.color,
        type: category.type,
        total,
        count,
        share: safeDiv(total, grand),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export interface TypeSplit {
  fixed: number;
  variable: number;
  savings: number;
  total: number;
  /** fixed / total, 0-1 */
  fixedShare: number;
}

export function splitByType(
  transactions: readonly Transaction[],
  categories: readonly Category[],
): TypeSplit {
  const index = indexCategories(categories);
  const split = { fixed: 0, variable: 0, savings: 0 };
  for (const t of transactions) split[categoryOf(index, t.categoryId).type] += t.amount;
  const total = split.fixed + split.variable + split.savings;
  return { ...split, total, fixedShare: safeDiv(split.fixed, total) };
}

/* ---------------------------------------------------------------- envelopes */

export interface EnvelopeItem {
  id: string;
  item: string;
  amount: number;
  /** logged without a price */
  unpriced: boolean;
}

export interface Envelope {
  categoryId: string;
  name: string;
  color: string;
  type: Category['type'];
  total: number;
  /** from budgets/{yearMonth}.categoryBudgets — 0 when unset */
  allocation: number;
  /** 0-1, capped at 1 for the bar width */
  fill: number;
  over: boolean;
  overBy: number;
  count: number;
  empty: boolean;
  items: EnvelopeItem[];
}

export function envelopeFor(
  category: Category,
  transactions: readonly Transaction[],
  budget: Budget | null,
  maxItems = 4,
): Envelope {
  const rows = transactions.filter((t) => t.categoryId === category.id);
  const total = sumAmounts(rows);
  const allocation = budget?.categoryBudgets[category.id] ?? 0;
  return {
    categoryId: category.id,
    name: category.name,
    color: category.color,
    type: category.type,
    total,
    allocation,
    fill: allocation > 0 ? Math.min(1, total / allocation) : 0,
    over: allocation > 0 && total > allocation,
    overBy: allocation > 0 ? Math.max(0, total - allocation) : 0,
    count: rows.length,
    empty: rows.length === 0,
    items: rows.slice(0, maxItems).map((t) => ({
      id: t.id,
      item: t.item,
      amount: t.amount,
      unpriced: t.amount === 0,
    })),
  };
}

/** Envelopes for every non-archived category of one type, in `order`. */
export function envelopesByType(
  type: Category['type'],
  categories: readonly Category[],
  transactions: readonly Transaction[],
  budget: Budget | null,
): Envelope[] {
  return categories
    .filter((c) => c.type === type && !c.archived)
    .sort((a, b) => a.order - b.order)
    .map((c) => envelopeFor(c, transactions, budget));
}

/* ------------------------------------------------------------------- donut */

export interface DonutSegment {
  categoryId: string;
  name: string;
  color: string;
  amount: number;
  share: number;
  /** stroke-dasharray for a circle of the given radius */
  dash: string;
  /** stroke-dashoffset */
  offset: string;
}

export interface DonutOptions {
  radius: number;
  /** visual gap between segments, in path units */
  gap?: number;
  /** how many categories get their own slice */
  max?: number;
}

export function donutSegments(
  totals: readonly CategoryTotal[],
  { radius, gap = 2, max = 5 }: DonutOptions,
): DonutSegment[] {
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;

  return totals
    .filter((t) => t.total > 0)
    .slice(0, max)
    .map((t) => {
      const length = Math.max(0, t.share * circumference - gap);
      const segment: DonutSegment = {
        categoryId: t.categoryId,
        name: t.name,
        color: t.color,
        amount: t.total,
        share: t.share,
        dash: `${length.toFixed(1)} ${(circumference - length).toFixed(1)}`,
        offset: (-consumed).toFixed(1),
      };
      consumed += t.share * circumference;
      return segment;
    });
}

export interface StackSegment {
  categoryId: string;
  color: string;
  /** percent of the track */
  x: number;
  width: number;
}

/** Flat stacked bar (mobile) — widths are a share of `denominator`, not of spend. */
export function stackSegments(
  totals: readonly CategoryTotal[],
  denominator: number,
  max = 5,
): StackSegment[] {
  let x = 0;
  return totals
    .filter((t) => t.total > 0)
    .slice(0, max)
    .map((t) => {
      const width = safeDiv(t.total, denominator) * 100;
      const segment = { categoryId: t.categoryId, color: t.color, x, width };
      x += width;
      return segment;
    });
}

/* --------------------------------------------------------------- day groups */

export interface DayGroup {
  date: string;
  label: string;
  total: number;
  transactions: Transaction[];
}

/** Groups a month's transactions by day, most recent first. */
export function groupByDate(transactions: readonly Transaction[], locale = 'en-US'): DayGroup[] {
  const byDate = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const bucket = byDate.get(t.date);
    if (bucket) bucket.push(t);
    else byDate.set(t.date, [t]);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rows]) => ({
      date,
      label: dayLabel(date, locale),
      total: sumAmounts(rows),
      transactions: rows,
    }));
}

export interface SearchFilter {
  /** category id, or null for "All" */
  categoryId: string | null;
  query: string;
}

export function filterTransactions(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  { categoryId, query }: SearchFilter,
): Transaction[] {
  const index = indexCategories(categories);
  const q = query.trim().toLowerCase();
  return transactions.filter((t) => {
    if (categoryId && t.categoryId !== categoryId) return false;
    if (!q) return true;
    return (
      t.item.toLowerCase().includes(q) ||
      categoryOf(index, t.categoryId).name.toLowerCase().includes(q) ||
      (t.note ?? '').toLowerCase().includes(q)
    );
  });
}

/* --------------------------------------------------------------------- pace */

export interface Pace {
  /** what an even burn would have spent by `throughDay` */
  target: number;
  /** positive = under an even pace */
  delta: number;
  under: boolean;
  /** the month has already ended */
  closed: boolean;
  throughDay: number;
}

export function pace(summary: MonthSummary, today: string): Pace {
  const closed = summary.yearMonth !== today.slice(0, 7);
  const throughDay = closed ? daysInYearMonth(summary.yearMonth) : parseISODate(today).day;
  const target = closed
    ? summary.income
    : Math.round((summary.income * throughDay) / daysInYearMonth(summary.yearMonth));
  const delta = target - summary.spent;
  return { target, delta: Math.abs(delta), under: delta >= 0, closed, throughDay };
}

/* --------------------------------------------------------------- year view */

export interface MonthBucket {
  yearMonth: string;
  label: string;
  total: number;
  transactions: Transaction[];
}

/** Twelve buckets, January first, whether or not a month has entries. */
export function bucketByMonth(
  year: string,
  transactions: readonly Transaction[],
  locale = 'en-US',
): MonthBucket[] {
  const byMonth = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const bucket = byMonth.get(t.yearMonth);
    if (bucket) bucket.push(t);
    else byMonth.set(t.yearMonth, [t]);
  }
  return monthsOfYear(year).map((yearMonth) => {
    const rows = byMonth.get(yearMonth) ?? [];
    return {
      yearMonth,
      label: shortMonthLabel(yearMonth, locale),
      total: sumAmounts(rows),
      transactions: rows,
    };
  });
}

export interface YearSummary {
  year: string;
  total: number;
  /** mean across months that have any spend */
  average: number;
  peak: number;
  peakMonth: string;
  activeMonths: number;
}

export function yearSummary(year: string, buckets: readonly MonthBucket[]): YearSummary {
  const active = buckets.filter((b) => b.total > 0);
  const peak = active.reduce<MonthBucket | null>(
    (best, b) => (best === null || b.total > best.total ? b : best),
    null,
  );
  const total = buckets.reduce((sum, b) => sum + b.total, 0);
  return {
    year,
    total,
    average: active.length > 0 ? total / active.length : 0,
    peak: peak?.total ?? 0,
    peakMonth: peak?.yearMonth ?? `${year}-01`,
    activeMonths: active.length,
  };
}

export interface YearBar extends MonthBucket {
  x: number;
  y: number;
  width: number;
  height: number;
  current: boolean;
  empty: boolean;
}

export interface YearBarOptions {
  chartWidth: number;
  chartHeight: number;
  barWidth: number;
  /** drawn as the reference line, usually the month income */
  ceiling: number;
  currentYearMonth: string;
}

/** Bar geometry for the yearly chart, plus the y of the income reference line. */
export function yearBars(
  buckets: readonly MonthBucket[],
  opts: YearBarOptions,
): { bars: YearBar[]; ceilingY: number; peak: number } {
  const peak = Math.max(opts.ceiling, ...buckets.map((b) => b.total), 1);
  const usable = opts.chartHeight - 10;
  const slot = opts.chartWidth / buckets.length;
  const scale = (value: number): number => Math.round((value / peak) * usable);

  const bars = buckets.map((bucket, i) => {
    const height = Math.max(3, scale(bucket.total));
    return {
      ...bucket,
      x: Math.round(i * slot + (slot - opts.barWidth) / 2),
      y: opts.chartHeight - height,
      width: opts.barWidth,
      height,
      current: bucket.yearMonth === opts.currentYearMonth,
      empty: bucket.total === 0,
    };
  });

  return { bars, ceilingY: opts.chartHeight - scale(opts.ceiling), peak };
}

/* ---------------------------------------------------------------- recurring */

/**
 * Recurrence is explicit: a transaction written as part of a repeating run
 * carries that run's `seriesId`, and a one-off carries `null`. Nothing is
 * inferred from the item name.
 */
export const isRecurring = (t: Transaction): boolean => t.seriesId !== null;

export interface RecurringSeries {
  seriesId: string;
  categoryId: string;
  item: string;
  /** the amount as most recently written in this run */
  amount: number;
  /** every "YYYY-MM" the run touches, in order */
  months: string[];
}

/** Groups a year of transactions into the recurring runs they belong to. */
export function seriesInYear(
  yearTransactions: readonly Transaction[],
): Map<string, RecurringSeries> {
  const runs = new Map<string, RecurringSeries>();

  for (const t of yearTransactions) {
    if (t.seriesId === null) continue;
    const run = runs.get(t.seriesId);
    if (run) {
      if (!run.months.includes(t.yearMonth)) run.months.push(t.yearMonth);
      run.amount = t.amount;
    } else {
      runs.set(t.seriesId, {
        seriesId: t.seriesId,
        categoryId: t.categoryId,
        item: t.item,
        amount: t.amount,
        months: [t.yearMonth],
      });
    }
  }

  for (const run of runs.values()) run.months.sort();
  return runs;
}

/** The recurring charges that actually landed in one month, priced only. */
export function recurringThisMonth(monthTransactions: readonly Transaction[]): {
  transactions: Transaction[];
  total: number;
} {
  const rows = monthTransactions.filter((t) => t.amount > 0 && isRecurring(t));
  return { transactions: rows, total: sumAmounts(rows) };
}
