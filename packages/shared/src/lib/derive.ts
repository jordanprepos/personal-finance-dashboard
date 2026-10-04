import type { AlertSettings, Budget, Category, Income, Transaction } from '../types.js';
import { normalizeCategoryName } from '../data/defaultCategories.js';
import {
  clampCycleStartDay,
  cycleLength,
  cycleOf,
  dateInCycle,
  dayInCycle,
  dayLabel,
  monthNameLabel,
  monthsOfYear,
  shortDayLabel,
  shortMonthLabel,
} from './dates.js';
import { formatMoney, IDR, type MoneyFormat } from './format.js';

/**
 * Every value the dashboard shows — Budget Left, Expense Per Bulan, category
 * totals, envelope fill — is computed here from `transactions` + `budgets`.
 * None of it is a stored field, and none of it lives in either app.
 */

export const sumAmounts = (transactions: readonly Transaction[]): number =>
  transactions.reduce((total, t) => total + t.amount, 0);

const safeDiv = (a: number, b: number): number => (b > 0 ? a / b : 0);

/* ------------------------------------------------------------------ income */

/**
 * What one source contributes to a single month.
 *
 * `Income.amount` is per *payment*, so a quarterly cheque counts for a third
 * of itself each month; monthly and one-off sources count in full. Rounded,
 * because every other amount in the app is a whole minor unit and a third of
 * an odd number is not.
 *
 * This is the only place the cadence is turned into money. Everything that
 * needs a per-month figure — the total, the shares, the stability split —
 * goes through here.
 */
export const monthlyAmount = (income: Income): number =>
  income.cadence === 'quarterly' ? Math.round(income.amount / 3) : income.amount;

/** The sources actually funding the month: everything not paused. */
export const activeIncomes = (budget: Budget | null): Income[] =>
  (budget?.incomes ?? []).filter((i) => !i.paused);

/**
 * The month's income: what its active sources contribute.
 *
 * Every consumer of income goes through here — Budget Left, spent %, the
 * envelope bars, the recurring share, the yearly reference line, the pace
 * target. Summing the list in each view instead would be the same expression
 * written six times, and one of them would drift.
 *
 * Pausing a source therefore moves Budget Left, which is the point: a paused
 * source is money that is not coming this month, and budgeting against it
 * would be budgeting against nothing.
 */
export const totalIncome = (budget: Budget | null): number =>
  activeIncomes(budget).reduce((sum, i) => sum + monthlyAmount(i), 0);

/**
 * The colour ramp for income sources, by rank — biggest source first.
 *
 * Ranked rather than stored: unlike a category, a source has no identity
 * beyond the month's list, so a colour keyed to it would be arbitrary. Reading
 * it off the composition bar's own order is what makes bar, legend and row
 * agree with no field to keep in step.
 */
export const INCOME_COLORS: readonly string[] = [
  '#182338',
  '#2f6df6',
  '#7093dd',
  '#a3b9e6',
  '#c9d6ee',
];

/** The same ramp for the dark card, where the ink shade would disappear. */
export const INCOME_COLORS_ON_DARK: readonly string[] = [
  '#ffffff',
  '#8fb2ff',
  '#6b8ed6',
  '#4d6aa8',
  '#33486f',
];

export interface IncomeShare extends Income {
  /** what it contributes to this month — `monthlyAmount` */
  monthly: number;
  /** of total income, 0-1 — 0 when paused, or when there is no income at all */
  share: number;
  /** rank among active sources, biggest first; -1 when paused */
  rank: number;
  color: string;
  colorOnDark: string;
}

/**
 * Each source with what it contributes, in the order the list holds them.
 *
 * Paused sources are included — the panel still has to draw their row — but
 * take no share and no ramp colour, since they fund nothing.
 */
export function incomeShares(budget: Budget | null): IncomeShare[] {
  const total = totalIncome(budget);
  const incomes = budget?.incomes ?? [];
  const ranked = incomes
    .filter((i) => !i.paused)
    .slice()
    .sort((a, b) => monthlyAmount(b) - monthlyAmount(a))
    .map((i) => i.id);

  return incomes.map((i) => {
    const monthly = monthlyAmount(i);
    const rank = i.paused ? -1 : ranked.indexOf(i.id);
    return {
      ...i,
      monthly,
      share: i.paused ? 0 : safeDiv(monthly, total),
      rank,
      color: rank < 0 ? 'var(--cf-border-strong)' : (INCOME_COLORS[rank % INCOME_COLORS.length] as string),
      colorOnDark:
        rank < 0
          ? 'var(--cf-border-strong)'
          : (INCOME_COLORS_ON_DARK[rank % INCOME_COLORS_ON_DARK.length] as string),
    };
  });
}

export interface IncomeBreakdown {
  /** every source, in list order, paused ones included */
  sources: IncomeShare[];
  /** the active ones, biggest first — the composition bar's order */
  composition: IncomeShare[];
  total: number;
  activeCount: number;
  pausedCount: number;
  /** of the active sources, what has already landed */
  received: number;
  /** 0-1 */
  receivedShare: number;
  /** active, `kind: 'fixed'` */
  fixed: number;
  /** active, `kind: 'variable'` */
  variable: number;
  /** what the paused sources would have contributed */
  paused: number;
  /** fixed / total, 0-1 */
  fixedShare: number;
}

/**
 * Everything the Income panel shows, derived in one pass so the two apps
 * cannot disagree about the split.
 */
export function incomeBreakdown(budget: Budget | null): IncomeBreakdown {
  const sources = incomeShares(budget);
  const active = sources.filter((s) => !s.paused);
  const total = totalIncome(budget);
  const sum = (list: readonly IncomeShare[]): number => list.reduce((t, s) => t + s.monthly, 0);
  const fixed = sum(active.filter((s) => s.kind === 'fixed'));
  const received = sum(active.filter((s) => s.received));

  return {
    sources,
    composition: active.slice().sort((a, b) => b.monthly - a.monthly),
    total,
    activeCount: active.length,
    pausedCount: sources.length - active.length,
    received,
    receivedShare: safeDiv(received, total),
    fixed,
    variable: total - fixed,
    paused: sum(sources.filter((s) => s.paused)),
    fixedShare: safeDiv(fixed, total),
  };
}

/** The three states a source's row can be in — paused, landed, still to come. */
export type IncomeStatusTone = 'paused' | 'received' | 'expected';

export interface IncomeStatus {
  tone: IncomeStatusTone;
  label: string;
}

/**
 * A source's status pill. Derived here rather than in each panel so the two
 * apps cannot end up wording the same state differently; the tone maps to a
 * `.cf-status--*` modifier, so no colour is decided here either.
 */
export function incomeStatus(income: Income): IncomeStatus {
  if (income.paused) return { tone: 'paused', label: 'Paused' };
  if (income.received) return { tone: 'received', label: 'Received' };
  return { tone: 'expected', label: `Expected day ${income.day}` };
}

export interface UpcomingIncome {
  id: string;
  name: string;
  /** e.g. "25 Aug" — inside the period in view, since that is what is planned */
  dateLabel: string;
  /** the whole payment, which is what actually lands */
  amount: number;
}

/**
 * What is still expected in the month in view: the active sources that have
 * not been marked received, soonest first.
 *
 * Scoped to the month in view on purpose. Nothing stored says *which* months a
 * quarterly source pays — only how big the cheque is — so projecting the next
 * payment into a future month would be a guess. A source is expected in the
 * month you are looking at until you mark it received there.
 */
export function upcomingIncome(
  budget: Budget | null,
  yearMonth: string,
  cycleStartDay = 1,
): UpcomingIncome[] {
  const start = clampCycleStartDay(cycleStartDay);
  // Soonest first means soonest *in the window*, which under a cycle is not
  // the lowest day number: a 27th-start period runs 27, 28 ... 31, 1, 2 ... 26.
  const position = (day: number): number => dayInCycle(dateInCycle(yearMonth, day, start), yearMonth, start);
  return activeIncomes(budget)
    .filter((i) => !i.received)
    .slice()
    .sort((a, b) => position(a.day) - position(b.day))
    .map((i) => ({
      id: i.id,
      name: i.name,
      // `dateInCycle` names the right month for a pay day below the start day,
      // which falls in the second half of the window.
      dateLabel: shortDayLabel(dateInCycle(yearMonth, i.day, start)),
      amount: i.amount,
    }));
}

/** The sum of what `upcomingIncome` lists — "still to land". */
export const upcomingIncomeTotal = (budget: Budget | null): number =>
  activeIncomes(budget)
    .filter((i) => !i.received)
    .reduce((sum, i) => sum + i.amount, 0);

/* ----------------------------------------------------------- month summary */

export interface MonthSummary {
  yearMonth: string;
  income: number;
  /** false when the month has no income sources, or they sum to zero */
  hasIncome: boolean;
  /**
   * Total spent across every category, over the **whole** window — including
   * rows dated later in the period that have not been paid yet.
   *
   * That is deliberate for everything that answers "how much may I still
   * spend": a scheduled bill is money that is committed, and a Budget Left
   * that ignored it would read *high*, which is the one direction that
   * recreates the problem this app exists to solve.
   */
  spent: number;
  /**
   * Spent up to and including `today` — the same figure with rows dated in the
   * future dropped.
   *
   * Only `pace` and `evaluateAlerts` read this, and both need it for the same
   * reason: they compare spending against **elapsed time**, so the two sides of
   * the comparison have to be measured over the same window. Counting a bill
   * due on the 25th against the target for day 2 reports an overspend before a
   * rupiah has moved — every period, from its first day, which teaches the
   * reader to ignore the one signal in the app that speaks unprompted.
   *
   * On a closed period every row is on or before `today`, so this equals
   * `spent` and nothing changes for history.
   */
  spentToDate: number;
  /** income - spent — "Budget Left" */
  left: number;
  /** 0-1 */
  spentShare: number;
  /** 0-1, from `spentToDate` — the share to pair with a `pace` figure */
  spentShareToDate: number;
  /** 0-1 */
  leftShare: number;
  /** entries logged with amount 0 */
  unpricedCount: number;
  entryCount: number;
}

/**
 * `today` is **required**, and deliberately so: it is the only thing that can
 * separate what has been spent from what is merely scheduled, and a caller
 * that omitted it would silently get the whole-window figure everywhere —
 * exactly the failure `accountBalances` makes `windowEnd` required to prevent.
 */
export function monthSummary(
  yearMonth: string,
  transactions: readonly Transaction[],
  budget: Budget | null,
  today: string,
): MonthSummary {
  const income = totalIncome(budget);
  const hasIncome = income > 0;
  const spent = sumAmounts(transactions);
  // `<=`, so a row dated today counts — matching `accountBalances`, which
  // skips only `t.date < balanceAsOf`. A day is spent or it is not; the two
  // surfaces must not disagree about which side of it "today" falls on.
  const spentToDate = sumAmounts(transactions.filter((t) => t.date <= today));
  // With no income set there is nothing to take a share of — reporting
  // "100% remaining" against a negative balance would be worse than zero.
  const spentShare = hasIncome ? Math.min(1, spent / income) : 0;
  return {
    yearMonth,
    income,
    hasIncome,
    spent,
    spentToDate,
    left: income - spent,
    spentShare,
    spentShareToDate: hasIncome ? Math.min(1, spentToDate / income) : 0,
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
  /** the period has already ended */
  closed: boolean;
  throughDay: number;
}

/**
 * `cycleStartDay` is what makes "how far into the period are we" answerable:
 * under a salary cycle both the elapsed days and the length of the period are
 * counted from the window, not from the calendar month it is named after. At
 * `1` every term below collapses to the calendar-month arithmetic this had
 * before cycles existed.
 *
 * Both sides of the comparison are measured to the same instant: the target is
 * prorated by the days elapsed, so the actual is `spentToDate`, not `spent`.
 * Mixing them in reads a bill scheduled for the 25th as money already burnt on
 * day 2 — the card then says "over" for the first third of every period while
 * nothing at all has been paid. On a closed period the two are equal, so
 * history is untouched.
 */
export function pace(summary: MonthSummary, today: string, cycleStartDay = 1): Pace {
  const start = clampCycleStartDay(cycleStartDay);
  const closed = summary.yearMonth !== cycleOf(today, start);
  const length = cycleLength(summary.yearMonth, start);
  const throughDay = closed ? length : dayInCycle(today, summary.yearMonth, start);
  const target = closed ? summary.income : Math.round((summary.income * throughDay) / length);
  const delta = target - summary.spentToDate;
  return { target, delta: Math.abs(delta), under: delta >= 0, closed, throughDay };
}

/* --------------------------------------------------------------- year view */

export interface MonthBucket {
  yearMonth: string;
  label: string;
  total: number;
  transactions: Transaction[];
}

/**
 * Twelve buckets, January first, whether or not a period has entries.
 *
 * Rows are assigned by the period their `date` falls in, not by the stored
 * `yearMonth` — that field is the calendar month, which is a different thing
 * as soon as `cycleStartDay` is above 1. At `1` the two agree exactly.
 */
export function bucketByMonth(
  year: string,
  transactions: readonly Transaction[],
  locale = 'en-US',
  cycleStartDay = 1,
): MonthBucket[] {
  const start = clampCycleStartDay(cycleStartDay);
  const byMonth = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = cycleOf(t.date, start);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(t);
    else byMonth.set(key, [t]);
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

/* ------------------------------------------------------------------ alerts */

/**
 * Spending alerts, evaluated against the month in view.
 *
 * Two rules, applied identically to the monthly cap and to each per-category
 * cap: over the limit is a breach, at or past `warnPct` of it is a warning.
 * Nothing at all is evaluated when alerts are off or the limit is 0, so an
 * unset cap is silent rather than permanently breached.
 *
 * The copy is built here rather than in the views because both front ends
 * must word an alert the same way, and the numbers in the sentence
 * ("Rp350.000 above the Rp8.000.000 cap for August") are the same ones the
 * rule just compared.
 */

export type AlertLevel = 'breach' | 'warning';
export type AlertScope = 'month' | 'category';

export interface SpendAlert {
  /** stable across renders — the scope, plus the category for a category cap */
  id: string;
  level: AlertLevel;
  scope: AlertScope;
  /** the category this is about, or null for the monthly cap */
  categoryName: string | null;
  title: string;
  body: string;
  spent: number;
  limit: number;
  /** spent / limit — above 1 on a breach */
  used: number;
}

export interface AlertInput {
  yearMonth: string;
  /** the month in view; the day rows and the yearly tab derive from these too */
  transactions: readonly Transaction[];
  categories: readonly Category[];
  alerts: AlertSettings;
  /**
   * Spending is counted up to and including this day, never past it.
   *
   * Required, and filtered *inside* rather than by the caller: both call sites
   * hand over `state.monthTransactions` whole, so anywhere else would be a
   * place to forget. A cap measures what has been spent against it — a bill
   * scheduled for the 25th has not been spent on the 2nd, and a banner that
   * fired on it every period from day one would be trained away long before
   * the period it mattered in.
   */
  today: string;
  /** money formatting — the profile's currency and locale */
  fmt?: MoneyFormat;
  /**
   * Locale for the month *name* only, and deliberately not the money locale:
   * every other month label in both apps (`monthLabel`, `shortMonthLabel`,
   * `dayLabel`) defaults to en-US while amounts render as id-ID, so passing
   * "id-ID" here would put "for Agustus" under a header reading "August 2026".
   */
  locale?: string;
}

interface RuleInput {
  id: string;
  scope: AlertScope;
  categoryName: string | null;
  spent: number;
  limit: number;
  warnPct: number;
  monthName: string;
  fmt: MoneyFormat;
  breachTitle: string;
  /** takes the percent actually used, which is not `warnPct` */
  warnTitle: (usedPct: number) => string;
}

/** The two thresholds, in one place so month and category can't diverge. */
function applyRule(input: RuleInput): SpendAlert | null {
  const { spent, limit, fmt } = input;
  // An unset cap (0) is not a cap that everything breaches.
  if (limit <= 0) return null;

  const base = {
    id: input.id,
    scope: input.scope,
    categoryName: input.categoryName,
    spent,
    limit,
    used: spent / limit,
  };

  if (spent > limit) {
    return {
      ...base,
      level: 'breach',
      title: input.breachTitle,
      body: `${formatMoney(spent - limit, fmt)} above the ${formatMoney(limit, fmt)} cap for ${input.monthName}.`,
    };
  }

  if (spent >= (limit * input.warnPct) / 100) {
    return {
      ...base,
      level: 'warning',
      // The headline percent is how much is actually used, not the threshold
      // that tripped it — at an 80% setting this reads "84%", not "80%".
      title: input.warnTitle(Math.round(base.used * 100)),
      body: `${formatMoney(limit - spent, fmt)} left before the ${formatMoney(limit, fmt)} cap.`,
    };
  }

  return null;
}

/**
 * Spend in the categories whose name matches `name`.
 *
 * Matched with `normalizeCategoryName` for the same reason every other name
 * comparison in this codebase is: a cap set on "Groceries" has to keep
 * matching after the category is re-saved as " groceries".
 */
export function spendForCategoryName(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  name: string,
): number {
  const wanted = normalizeCategoryName(name);
  const ids = new Set(
    categories.filter((c) => normalizeCategoryName(c.name) === wanted).map((c) => c.id),
  );
  return sumAmounts(transactions.filter((t) => ids.has(t.categoryId)));
}

const SEVERITY: Record<AlertLevel, number> = { breach: 0, warning: 1 };

/** Every alert the month currently trips, breaches first. */
export function evaluateAlerts({
  yearMonth,
  transactions,
  categories,
  alerts,
  today,
  fmt = IDR,
  locale = 'en-US',
}: AlertInput): SpendAlert[] {
  if (!alerts.enabled) return [];

  const monthName = monthNameLabel(yearMonth, locale);
  const out: SpendAlert[] = [];
  // Bounded once, so the monthly cap and every category cap are measured over
  // the same window — `<=`, matching `monthSummary.spentToDate`.
  const sofar = transactions.filter((t) => t.date <= today);

  const monthly = applyRule({
    id: 'month',
    scope: 'month',
    categoryName: null,
    spent: sumAmounts(sofar),
    limit: alerts.monthlyLimit,
    warnPct: alerts.warnPct,
    monthName,
    fmt,
    breachTitle: 'Over the monthly limit',
    warnTitle: (used) => `${used}% of the monthly limit`,
  });
  if (monthly) out.push(monthly);

  for (const [name, limit] of Object.entries(alerts.categoryLimits)) {
    const alert = applyRule({
      id: `category:${name}`,
      scope: 'category',
      categoryName: name,
      spent: spendForCategoryName(sofar, categories, name),
      limit,
      warnPct: alerts.warnPct,
      monthName,
      fmt,
      breachTitle: `${name} is over its limit`,
      warnTitle: () => `${name} is close to its limit`,
    });
    if (alert) out.push(alert);
  }

  // Breaches above warnings, and within each the one furthest along first.
  return out.sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level] || b.used - a.used);
}

export interface CategoryLimitRow {
  /** the key as stored — what the settings row shows */
  name: string;
  limit: number;
  spent: number;
  /** spent / limit; null when there is no limit to take a share of */
  used: number | null;
  /** the cap names a category that no longer exists, so it can never fire */
  orphan: boolean;
}

/**
 * The per-category caps as the settings list renders them. Orphans are kept
 * rather than hidden — a cap nothing can clear is worse than a stale row.
 *
 * `today` bounds the spend exactly as `evaluateAlerts` does, and for the same
 * reason twice over: this list is where someone reads *why* a banner did or
 * did not fire, so a row counting a scheduled bill the banner ignored would
 * make the two contradict each other on one screen.
 */
export function categoryLimitRows(
  alerts: AlertSettings,
  transactions: readonly Transaction[],
  categories: readonly Category[],
  today: string,
): CategoryLimitRow[] {
  const known = new Set(categories.map((c) => normalizeCategoryName(c.name)));
  const sofar = transactions.filter((t) => t.date <= today);
  return Object.entries(alerts.categoryLimits)
    .map(([name, limit]) => {
      const spent = spendForCategoryName(sofar, categories, name);
      return {
        name,
        limit,
        spent,
        used: limit > 0 ? spent / limit : null,
        orphan: !known.has(normalizeCategoryName(name)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * How many entries each category has, keyed by category id.
 *
 * The category surfaces show a count per row and nothing else about the
 * transactions, so they take this map rather than the list itself. One pass
 * rather than a filter per category, and — like every other derived value —
 * it lives here rather than in a view.
 */
export function entryCountsByCategory(
  transactions: readonly Transaction[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of transactions) counts[t.categoryId] = (counts[t.categoryId] ?? 0) + 1;
  return counts;
}

/** The three things a fresh account needs before the dashboard means anything. */
export interface SetupProgress {
  categories: boolean;
  income: boolean;
  expense: boolean;
  /** whether the getting-started panel should render at all */
  show: boolean;
}

/**
 * Where a new account is in setting itself up: categories, then income, then
 * a first expense. Both apps render it as the getting-started panel, which is
 * what an empty account sees in place of a page of blank envelopes.
 *
 * `show` is deliberately narrower than "something is missing". Income is
 * per period and does not carry over, so every account starts each month with
 * none — the income hint on the summary card covers that, and the panel stays
 * out of it. A missing expense only counts on the period containing `today`:
 * stepping into next January (recurring runs stop at the year's last period)
 * or a year before the app was used is empty for an established account too,
 * and greeting that with "log your first expense" would be wrong. A missing
 * category list is a fresh account on any period.
 */
export function setupProgress({
  categories,
  transactions,
  budget,
  yearMonth,
  today,
  cycleStartDay = 1,
}: {
  categories: readonly Category[];
  /** the widest window the snapshot carries — `yearTransactions` */
  transactions: readonly Transaction[];
  budget: Budget | null;
  yearMonth: string;
  today: string;
  cycleStartDay?: number;
}): SetupProgress {
  const hasCategories = categories.length > 0;
  const hasExpense = transactions.length > 0;
  const onCurrentPeriod = cycleOf(today, cycleStartDay) === yearMonth;
  return {
    categories: hasCategories,
    income: totalIncome(budget) > 0,
    expense: hasExpense,
    show: !hasCategories || (onCurrentPeriod && !hasExpense),
  };
}
