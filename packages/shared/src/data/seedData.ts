import { Timestamp } from 'firebase/firestore';

import type { Budget, Category, Income, Profile, Transaction } from '../types.js';
import { defaultAlerts } from '../lib/queries.js';
import { dateInMonth, monthsOfYear, toYear, toYearMonth } from '../lib/dates.js';
import { DEFAULT_CATEGORIES } from './defaultCategories.js';

/**
 * Demo dataset, in the real schema shape — correct category ids, correct
 * denormalized `yearMonth` / `year`. It backs the app when no Firebase config
 * is present, and doubles as the fixture the derived-value logic is checked
 * against.
 */

export const SEED_YEAR = '2026';
export const SEED_TODAY = '2026-08-26';
export const SEED_INCOME = 9_095_079;

export const seedCategories = (): Category[] =>
  DEFAULT_CATEGORIES.map((c, i) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    color: c.color,
    icon: c.icon,
    order: i,
    archived: false,
  }));

/**
 * The demo account's income sources.
 *
 * A month always keeps at least one source — that is the rule the store
 * enforces — but the demo carries a spread of cadences and one paused source
 * so the Income panel's composition, stability split and expected-next list
 * all have something real to show. `SEED_INCOME` stays the salary alone, so
 * the legacy `income` field on each budget still matches what a pre-`incomes`
 * account would have held.
 */
export const seedIncomes = (): Income[] => [
  {
    id: 'income-salary',
    name: 'Salary',
    amount: SEED_INCOME,
    cadence: 'monthly',
    kind: 'fixed',
    day: 25,
    received: true,
    paused: false,
    note: 'PT Nusantara Digital',
  },
  {
    id: 'income-kos',
    name: 'Kos rental',
    amount: 2_500_000,
    cadence: 'monthly',
    kind: 'fixed',
    day: 5,
    received: true,
    paused: false,
    note: 'Two rooms, Jl. Kaliurang',
  },
  {
    id: 'income-freelance',
    name: 'Freelance design',
    amount: 3_200_000,
    cadence: 'monthly',
    kind: 'variable',
    day: 20,
    received: false,
    paused: false,
    note: 'Averaged over six months',
  },
  {
    id: 'income-dividends',
    name: 'Dividends',
    amount: 3_450_000,
    cadence: 'quarterly',
    kind: 'variable',
    day: 15,
    received: false,
    paused: false,
    note: 'Reksa dana · paid Mar, Jun, Sep, Dec',
  },
  {
    id: 'income-royalties',
    name: 'Course royalties',
    amount: 480_000,
    cadence: 'monthly',
    kind: 'variable',
    day: 10,
    received: false,
    paused: true,
    note: 'Platform payout, on hold',
  },
];

export const seedBudgets = (): Record<string, Budget> => {
  const categoryBudgets: Record<string, number> = {};
  for (const c of DEFAULT_CATEGORIES) categoryBudgets[c.id] = c.allocation;

  const budgets: Record<string, Budget> = {};
  for (const yearMonth of monthsOfYear(SEED_YEAR)) {
    budgets[yearMonth] = {
      id: yearMonth,
      // Written as the legacy field too, so the demo dataset exercises the
      // same document shape a pre-`incomes` account has on disk.
      income: SEED_INCOME,
      incomes: seedIncomes(),
      categoryBudgets: { ...categoryBudgets },
    };
  }
  return budgets;
};

export const seedProfile = (): Profile => ({
  displayName: 'Demo',
  currency: 'IDR',
  locale: 'id-ID',
  alerts: defaultAlerts(),
  // Calendar months. Demo mode is the control the cycle behaviour is checked
  // against, so this stays 1 — set it here to eyeball a cycle on seed data.
  cycleStartDay: 1,
});

interface Charge {
  item: string;
  categoryId: string;
  amount: number;
  day: number;
  /** shared by every month of a repeating run; one-offs get null on write */
  seriesId?: string;
}

/**
 * Repeats every month — written out as independent documents, one per month,
 * all carrying the same `seriesId`. This is what `createTransactionSeries`
 * produces against Firestore.
 */
const MONTHLY: Charge[] = [
  { item: 'Kost', categoryId: 'bills', amount: 2_100_000, day: 1, seriesId: 'series-kost' },
  { item: 'Katering', categoryId: 'bills', amount: 1_440_000, day: 5, seriesId: 'series-katering' },
  { item: 'CC BRI', categoryId: 'bills', amount: 1_500_000, day: 5, seriesId: 'series-cc-bri' },
  {
    item: 'Youtube Sharing',
    categoryId: 'subscription',
    amount: 109_000,
    day: 14,
    seriesId: 'series-youtube',
  },
  {
    item: 'Internet byU',
    categoryId: 'subscription',
    amount: 75_000,
    day: 14,
    seriesId: 'series-internet',
  },
];

/** August 2026 — the open month, including entries logged without a price. */
const CURRENT_MONTH_CHARGES: Charge[] = [
  { item: 'KPR BNI', categoryId: 'bills', amount: 0, day: 1 },
  { item: 'Gojek PP Kantor 2x', categoryId: 'transportation', amount: 400_000, day: 12 },
  { item: 'Token Listrik', categoryId: 'utilities', amount: 200_000, day: 18 },
  { item: 'Obat', categoryId: 'health-insurance', amount: 0, day: 8 },
  { item: 'Vitamin D-3', categoryId: 'health-insurance', amount: 0, day: 8 },
  { item: 'Magnesium Zinc', categoryId: 'health-insurance', amount: 0, day: 8 },
  { item: 'Tiktok Shop', categoryId: 'entertainment', amount: 0, day: 20 },
  { item: 'Janji Iman', categoryId: 'others', amount: 0, day: 21 },
  { item: 'Kado Anak PMegi', categoryId: 'others', amount: 0, day: 21 },
  { item: 'Kado Anak PAinan', categoryId: 'others', amount: 0, day: 21 },
  { item: 'GoTrade', categoryId: 'savings', amount: 0, day: 24 },
  { item: 'Pluang', categoryId: 'savings', amount: 0, day: 24 },
];

export function seedTransactions(): Transaction[] {
  const currentMonth = toYearMonth(SEED_TODAY);
  const out: Transaction[] = [];
  let n = 0;

  const push = (yearMonth: string, charge: Charge): void => {
    const date = dateInMonth(yearMonth, charge.day);
    out.push({
      id: `seed-${String(++n).padStart(4, '0')}`,
      categoryId: charge.categoryId,
      item: charge.item,
      amount: charge.amount,
      date,
      yearMonth: toYearMonth(date),
      year: toYear(date),
      seriesId: charge.seriesId ?? null,
      createdAt: Timestamp.fromDate(new Date(`${date}T09:00:00.000Z`)),
    });
  };

  for (const yearMonth of monthsOfYear(SEED_YEAR)) {
    if (yearMonth > currentMonth) break;
    for (const charge of MONTHLY) push(yearMonth, charge);

    if (yearMonth < currentMonth) {
      const i = Number(yearMonth.slice(5, 7)) - 1;
      push(yearMonth, {
        item: 'Token Listrik',
        categoryId: 'utilities',
        amount: 200_000 + (i % 3) * 15_000,
        day: 18,
      });
      push(yearMonth, {
        item: 'Gojek PP Kantor 2x',
        categoryId: 'transportation',
        amount: 400_000,
        day: 12,
      });
      if (i % 2 === 0) {
        push(yearMonth, {
          item: 'Makan luar',
          categoryId: 'food-and-beverages',
          amount: 180_000 + (i % 4) * 40_000,
          day: 22,
        });
      }
    } else {
      for (const charge of CURRENT_MONTH_CHARGES) push(yearMonth, charge);
    }
  }

  return out;
}
