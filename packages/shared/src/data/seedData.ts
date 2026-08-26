import { Timestamp } from 'firebase/firestore';

import type { Budget, Category, Profile, Transaction } from '../types.js';
import { dateInMonth, monthsOfYear, toYear, toYearMonth } from '../lib/dates.js';

/**
 * Demo dataset, in the real schema shape — correct category ids, correct
 * denormalized `yearMonth` / `year`. It backs the app when no Firebase config
 * is present, and doubles as the fixture the derived-value logic is checked
 * against.
 */

export const SEED_YEAR = '2026';
export const SEED_TODAY = '2026-08-26';
export const SEED_INCOME = 9_095_079;

/** Cycled through the categories — the design system's ink/blue/slate ramp. */
const PALETTE = ['#1157d9', '#182338', '#5f6c85', '#c9d6ee', '#8b98ae'];

interface CategorySeed {
  id: string;
  name: string;
  type: Category['type'];
  icon: string;
  allocation: number;
}

const CATEGORY_SEEDS: CategorySeed[] = [
  { id: 'groceries', name: 'Groceries', type: 'fixed', icon: '🛒', allocation: 800_000 },
  { id: 'bills', name: 'Bills', type: 'fixed', icon: '🧾', allocation: 5_100_000 },
  { id: 'transportation', name: 'Transportation', type: 'fixed', icon: '🛵', allocation: 600_000 },
  { id: 'health-insurance', name: 'Health & Insurance', type: 'fixed', icon: '💊', allocation: 300_000 },
  { id: 'utilities', name: 'Utilities', type: 'fixed', icon: '💡', allocation: 250_000 },
  { id: 'subscription', name: 'Subscription', type: 'fixed', icon: '📺', allocation: 200_000 },
  { id: 'food-and-beverages', name: 'Food and Beverages', type: 'variable', icon: '🍜', allocation: 900_000 },
  { id: 'entertainment', name: 'Entertainment', type: 'variable', icon: '🎬', allocation: 300_000 },
  { id: 'apparell', name: 'Apparell', type: 'variable', icon: '👕', allocation: 300_000 },
  { id: 'others', name: 'Others', type: 'variable', icon: '📦', allocation: 400_000 },
  { id: 'savings', name: 'Savings', type: 'savings', icon: '🏦', allocation: 1_000_000 },
];

export const seedCategories = (): Category[] =>
  CATEGORY_SEEDS.map((c, i) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    color: PALETTE[i % PALETTE.length] as string,
    icon: c.icon,
    order: i,
    archived: false,
  }));

export const seedBudgets = (): Record<string, Budget> => {
  const categoryBudgets: Record<string, number> = {};
  for (const c of CATEGORY_SEEDS) categoryBudgets[c.id] = c.allocation;

  const budgets: Record<string, Budget> = {};
  for (const yearMonth of monthsOfYear(SEED_YEAR)) {
    budgets[yearMonth] = { id: yearMonth, income: SEED_INCOME, categoryBudgets: { ...categoryBudgets } };
  }
  return budgets;
};

export const seedProfile = (): Profile => ({
  displayName: 'Demo',
  currency: 'IDR',
  locale: 'id-ID',
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
