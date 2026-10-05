import { Timestamp } from 'firebase/firestore';

import { seriesDates } from '../lib/queries.js';
import { normalizeDashboardCards } from '../lib/dashboardCards.js';
import { cycleRange, toYear, toYearMonth, yearMonthOf, yearOfMonth } from '../lib/dates.js';
import type {
  Account,
  AccountInput,
  AccountPatch,
  AlertSettings,
  Budget,
  Category,
  CategoryInput,
  Income,
  Transaction,
  TransactionInput,
  TransactionPatch,
  TransactionSeriesKey,
} from '../types.js';
import {
  seedAccounts,
  seedBudgets,
  seedCategories,
  seedIncomes,
  seedProfile,
  seedTransactions,
  SEED_INCOME,
} from './seedData.js';
import type { ExpenseDataSource, MonthSnapshot, Unsubscribe } from './source.js';

/**
 * In-memory stand-in for Firestore. Same interface, same denormalization
 * rules, same equality-query semantics — it just holds the rows in an array
 * so the apps run before a Firebase project exists. State lives for the
 * lifetime of the page.
 */
export function createSeedDataSource(userId = 'demo-user'): ExpenseDataSource {
  let accounts = seedAccounts();
  let categories = seedCategories();
  let transactions = seedTransactions();
  const budgets = seedBudgets();
  let profile = seedProfile();
  let nextId = transactions.length + 1;

  const newId = (): string => `seed-${String(++nextId).padStart(4, '0')}`;
  let nextCategory = 0;
  /* Monotonic, like `newId`. A clock-based id collides when several
     categories are created in the same millisecond — which bulk-adding the
     defaults does every time, silently giving them all one id. */
  const newCategoryId = (): string => `cat-${String(++nextCategory).padStart(3, '0')}`;
  let nextAccount = 0;
  const newAccountId = (): string => `acct-${String(++nextAccount).padStart(3, '0')}`;
  let nextSeries = 0;
  const newSeriesId = (): string => `seed-series-${String(++nextSeries).padStart(3, '0')}`;
  const clone = <T>(rows: T[]): T[] => rows.map((r) => ({ ...r }));
  const byDateDesc = (a: Transaction, b: Transaction): number => b.date.localeCompare(a.date);

  const build = (input: TransactionInput, seriesId: string | null = null): Transaction => ({
    id: newId(),
    categoryId: input.categoryId,
    item: input.item,
    amount: input.amount,
    date: input.date,
    yearMonth: toYearMonth(input.date),
    year: toYear(input.date),
    ...(input.note ? { note: input.note } : {}),
    // Mirrors `denormalize` in lib/queries.ts — omitted when unset, and never
    // derived from `categoryId`. Kept in step with it or the field vanishes in
    // seed mode only.
    ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    // Third axis, same mirror, same warning: this line and its twin in
    // `denormalize` change together or the field vanishes in seed mode only.
    ...(input.accountId ? { accountId: input.accountId } : {}),
    seriesId,
    createdAt: Timestamp.now(),
  });

  /* The reads, as plain closures. The interface methods and the watch
     snapshot both go through these, so a live subscriber and a one-shot
     caller can never disagree about what the month contains. */
  const readCategories = (): Category[] => clone(categories).sort((a, b) => a.order - b.order);
  /* Windowed on `date`, mirroring the range query the Firestore path runs —
     filtering on the denormalized `yearMonth`/`year` would be a calendar month
     whatever the start day said, and demo mode would disagree with live. */
  const readRange = (from: string, to: string): Transaction[] =>
    clone(transactions.filter((t) => t.date >= from && t.date <= to)).sort(byDateDesc);
  const readPeriod = (yearMonth: string, cycleStartDay: number): Transaction[] => {
    const { start, end } = cycleRange(yearMonth, cycleStartDay);
    return readRange(start, end);
  };
  const readYear = (yearMonth: string, cycleStartDay: number): Transaction[] => {
    const year = Number(yearOfMonth(yearMonth));
    return readRange(
      cycleRange(yearMonthOf(year, 1), cycleStartDay).start,
      cycleRange(yearMonthOf(year, 12), cycleStartDay).end,
    );
  };
  const readBudget = (yearMonth: string): Budget => {
    const budget = budgets[yearMonth];
    return budget
      ? { ...budget, incomes: budget.incomes.map((i) => ({ ...i })), categoryBudgets: { ...budget.categoryBudgets } }
      : { id: yearMonth, income: SEED_INCOME, incomes: seedIncomes(), categoryBudgets: {} };
  };
  const readAccounts = (): Account[] => clone(accounts).sort((a, b) => a.order - b.order);
  const monthSnapshot = (yearMonth: string, cycleStartDay: number): MonthSnapshot => ({
    accounts: readAccounts(),
    categories: readCategories(),
    monthTransactions: readPeriod(yearMonth, cycleStartDay),
    yearTransactions: readYear(yearMonth, cycleStartDay),
    budget: readBudget(yearMonth),
    profile: { ...profile },
  });

  /* Live subscribers. The seed source is the only thing that mutates these
     arrays, so it can notify precisely: every write re-emits to everyone
     watching, which is what makes demo mode behave like the Firestore path
     instead of quietly going stale after the first paint. */
  interface Watcher {
    yearMonth: string;
    cycleStartDay: number;
    onChange: (snapshot: MonthSnapshot) => void;
    live: boolean;
  }
  const watchers = new Set<Watcher>();
  const notify = (): void => {
    for (const watcher of watchers) {
      if (watcher.live) watcher.onChange(monthSnapshot(watcher.yearMonth, watcher.cycleStartDay));
    }
  };

  return {
    kind: 'seed',
    userId,

    /**
     * Emits the month now and again after every write, for as long as the
     * subscription lives. The first emit is deferred to a microtask so
     * subscribers see the same "never fires during subscribe" ordering
     * Firestore gives them — a callback that ran synchronously here would
     * reach the store before it had finished wiring the subscription up.
     */
    watchMonth(yearMonth, cycleStartDay, onChange): Unsubscribe {
      const watcher: Watcher = { yearMonth, cycleStartDay, onChange, live: true };
      watchers.add(watcher);
      void Promise.resolve().then(() => {
        if (watcher.live) watcher.onChange(monthSnapshot(yearMonth, cycleStartDay));
      });
      return () => {
        watcher.live = false;
        watchers.delete(watcher);
      };
    },

    async createAccount(input: AccountInput): Promise<Account> {
      // Twin of `createAccount` in lib/queries.ts, and kept in step with it
      // the way `build` is with `denormalize`: `color` is omitted when unset
      // rather than stored undefined, so `accountColor` falls back to the
      // `order` ramp here exactly as it does on the live path.
      const { color, ...rest } = input;
      const account: Account = { ...rest, ...(color ? { color } : {}), id: newAccountId() };
      accounts = [...accounts, account];
      notify();
      return { ...account };
    },

    async updateAccount(accountId: string, patch: AccountPatch): Promise<void> {
      accounts = accounts.map((a) => {
        if (a.id !== accountId) return a;
        const next: Account = { ...a, ...patch };
        // Mirrors the `deleteField()` branch on the live path: the key present
        // with no value means unset, so the property goes rather than sitting
        // there as undefined.
        if ('color' in patch && !patch.color) delete next.color;
        return next;
      });
      notify();
    },

    async reconcileAccount(accountId: string, balance: number, asOf: string): Promise<void> {
      accounts = accounts.map((a) =>
        a.id === accountId ? { ...a, balance, balanceAsOf: asOf } : a,
      );
      notify();
    },

    async deleteAccount(accountId: string): Promise<void> {
      // The transactions that named it are deliberately left alone; a stale
      // `accountId` reads as unattributed and moves no balance, so rewriting
      // them would be the riskier of the two. Mirrors the Firestore path.
      accounts = accounts.filter((a) => a.id !== accountId);
      notify();
    },

    async createCategory(input: CategoryInput): Promise<Category> {
      const category: Category = { ...input, id: newCategoryId() };
      categories = [...categories, category];
      notify();
      return { ...category };
    },

    async deleteCategory(categoryId: string): Promise<number> {
      const removed = transactions.filter((t) => t.categoryId === categoryId).length;
      transactions = transactions.filter((t) => t.categoryId !== categoryId);
      categories = categories.filter((c) => c.id !== categoryId);
      notify();
      return removed;
    },

    async createTransaction(input: TransactionInput): Promise<Transaction> {
      const created = build(input);
      transactions = [...transactions, created];
      notify();
      return { ...created };
    },

    async createTransactionSeries(
      input: TransactionInput,
      throughYearMonth: string,
    ): Promise<Transaction[]> {
      const seriesId = newSeriesId();
      const created = seriesDates(input.date, throughYearMonth).map((date) =>
        build({ ...input, date }, seriesId),
      );
      transactions = [...transactions, ...created];
      notify();
      return clone(created);
    },

    async updateTransaction(transactionId: string, patch: TransactionPatch): Promise<void> {
      transactions = transactions.map((t) => {
        if (t.id !== transactionId) return t;
        const next: Transaction = { ...t, ...patch };
        // The seed twin of `deleteField()`: an explicit clear removes the key
        // rather than leaving it present-but-undefined, so a round trip here
        // looks exactly like one through Firestore.
        if ('paymentMethod' in patch && !patch.paymentMethod) delete next.paymentMethod;
        if ('accountId' in patch && !patch.accountId) delete next.accountId;
        if (patch.date !== undefined) {
          next.yearMonth = toYearMonth(patch.date);
          next.year = toYear(patch.date);
        }
        return next;
      });
      notify();
    },

    async deleteTransaction(transactionId: string): Promise<void> {
      transactions = transactions.filter((t) => t.id !== transactionId);
      notify();
    },

    async deleteTransactionSeries(key: TransactionSeriesKey): Promise<number> {
      const matches = (t: Transaction): boolean =>
        t.seriesId === key.seriesId && t.date >= key.fromDate;
      const removed = transactions.filter(matches).length;
      transactions = transactions.filter((t) => !matches(t));
      notify();
      return removed;
    },

    async saveBudget(budget: Budget): Promise<void> {
      budgets[budget.id] = {
        ...budget,
        incomes: budget.incomes.map((i) => ({ ...i })),
        categoryBudgets: { ...budget.categoryBudgets },
      };
      notify();
    },

    async setIncomes(yearMonth: string, incomes: Income[]): Promise<void> {
      await this.saveBudget({ ...readBudget(yearMonth), incomes });
    },

    async setAlerts(alerts: AlertSettings): Promise<void> {
      // Replaced whole, matching the Firestore path — a cleared category cap
      // has to disappear rather than linger from the previous settings.
      profile = { ...profile, alerts: { ...alerts, categoryLimits: { ...alerts.categoryLimits } } };
      notify();
    },

    async setCycleStartDay(cycleStartDay: number): Promise<void> {
      profile = { ...profile, cycleStartDay };
      notify();
    },

    async setDashboardCards(cards: readonly string[]): Promise<void> {
      // Narrowed here as well as on the Firestore path, so demo mode cannot
      // hold a selection the live one would have rejected.
      profile = { ...profile, dashboardCards: normalizeDashboardCards(cards) };
      notify();
    },

    async setCategoryBudget(yearMonth: string, categoryId: string, amount: number): Promise<void> {
      const current = readBudget(yearMonth);
      await this.saveBudget({
        ...current,
        categoryBudgets: { ...current.categoryBudgets, [categoryId]: amount },
      });
    },

  };
}
